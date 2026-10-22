-- ============================================================================
-- Migration 0083 — Who works in every branch follows the RBAC mode (D-03, D-04)
--
-- 0055's bos_session_branches(tenant, user, requested) decides '*' (every
-- branch) from the legacy permissions table alone: settings:admin on the
-- user's primary role. Under RBAC v2 that is wrong both ways: a v2 grant of
-- `settings.branches.all` is ignored, and a stale legacy row keeps every
-- branch after v2 took the key away.
--
-- The 4-argument version takes the API's RBAC mode (settings.rbac_mode, sent
-- in the same statement as the tenant context, so no extra round trip) and
-- decides exactly as app/rbac.py's load_principal + Principal.decide do:
--
--   * the legacy grant decides in 'legacy' mode, and in 'shadow' mode for a
--     user holding nothing but their primary role, which is not v2-native;
--   * otherwise the v2 grants decide: `settings.branches.all` (or a pattern
--     covering it: '*', 'settings.*', 'settings.branches.*') at scope 'all'
--     on any role the user holds, inheritance included. The key is not
--     narrowable (scopes.WIRED), so a narrower grant counts for nothing.
--
-- Any other mode value reads as 'shadow', like rbac._mode(). The 3-argument
-- version stays for now (expand/contract); nothing calls it after this.
-- ============================================================================

create or replace function bos_session_branches(p_tenant uuid, p_user uuid, p_requested text[], p_mode text)
returns text language plpgsql stable as $$
declare
  mode         text := case when p_mode in ('legacy', 'shadow', 'v2') then p_mode else 'shadow' end;
  primary_role uuid;
  only_primary boolean;
  v2_native    boolean;
  is_all       boolean;
  allowed      uuid[];
  home         uuid;
  picked       uuid[];
begin
  select role_id into primary_role from public.users where id = p_user and tenant_id = p_tenant;
  if not found then
    return '';
  end if;

  select not exists (select 1 from public.user_roles ur
                      where ur.user_id = p_user and ur.role_id is distinct from primary_role),
         exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                  where ur.user_id = p_user and r.rbac_v2)
    into only_primary, v2_native;

  if mode = 'legacy' or (mode = 'shadow' and only_primary and not v2_native) then
    is_all := primary_role is not null and exists (
      select 1 from public.permissions p
       where p.role_id = primary_role and p.section = 'settings' and p.action = 'admin');
  else
    with recursive reach(role_id) as (
      select ur.role_id from public.user_roles ur where ur.user_id = p_user
      union
      select ri.inherits_id from public.role_inherits ri join reach on ri.role_id = reach.role_id)
    select exists (
      select 1 from public.role_grants g join reach using (role_id)
       where g.scope = 'all'
         and (g.permission_key in ('*', 'settings.branches.all')
              or (right(g.permission_key, 2) = '.*'
                  and starts_with('settings.branches.all', left(g.permission_key, -1)))))
      into is_all;
  end if;

  select branch_id into home from public.user_branches
   where user_id = p_user and tenant_id = p_tenant and is_home;
  if is_all then
    select array_agg(id) into allowed from public.branches where tenant_id = p_tenant;
  else
    select array_agg(ub.branch_id order by ub.is_home desc, ub.branch_id) into allowed
      from public.user_branches ub join public.branches b on b.id = ub.branch_id
     where ub.user_id = p_user and ub.tenant_id = p_tenant and b.active;
  end if;

  if p_requested is null or cardinality(p_requested) = 0 then
    if is_all then
      return '*';
    end if;
    return coalesce(array_to_string(allowed, ','), '');
  end if;

  select array_agg(x order by x) into picked from unnest(allowed) x where x::text = any (p_requested);
  if picked is null then
    -- Fall back to the home branch only while it is one of the user's
    -- allowed branches AND still active (fail closed, as in 0055).
    if home is not null and home = any (allowed)
       and exists (select 1 from public.branches where id = home and active) then
      return home::text;
    end if;
    return '';
  end if;
  return array_to_string(picked, ',');
end $$;

revoke execute on function bos_session_branches(uuid, uuid, text[], text) from public;
grant execute on function bos_session_branches(uuid, uuid, text[], text) to app_user;
