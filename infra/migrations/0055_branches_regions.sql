-- ============================================================================
-- Migration 0055 — Branches, Pakistan regions, company profile (D-03, 3A)
--
--  * pk_regions      global reference list: the four provinces, ICT, GB and
--                    AJK, with stable codes (PB SD KP BA ICT GB AJK), the PST
--                    authority and the province name FBR's reference list
--                    uses (`fbr_name`, sent as sellerProvince).
--  * branches        flat, one level (an Odoo "company" is our branch). Every
--                    tenant has exactly one default branch: backfilled here,
--                    and created by a trigger whenever a tenant is inserted.
--  * user_branches   which branches a user may work in; every user gets the
--                    default branch as home (backfill + trigger on users).
--  * tenant_company  the company profile: legal name, NTN/STRN, address and
--                    province. Name, timezone and FY start stay on tenants.
--  * fbr_settings.seller_region_code  links the FBR seller province to
--                    pk_regions; a trigger keeps seller_province (what the
--                    payload sends) equal to that region's fbr_name.
--
-- Branch isolation (D-03). Transactional tables get a required branch_id and
-- a RESTRICTIVE policy `branch_scope` (AND-ed with tenant_isolation) on
-- app_branch_visible(branch_id). db.tenant_conn sets `app.branch_ids` on
-- every transaction: '*' for jobs and branch admins, else the user's branches
-- narrowed by the X-Branch-Ids header (bos_session_branches). A missing or
-- empty setting shows no branch rows: fail closed. Masters get a nullable
-- branch_id (null = shared by every branch, always visible).
--
-- Existing inserts never name a branch, so a BEFORE INSERT trigger fills it:
-- the active branch when exactly one is active, else the tenant's default.
--
-- Reusable helper for tables added later (payroll_runs, contacts, …):
--     call bos_branch_scope('my_table', true);   -- transactional: required
--     call bos_branch_scope('my_table', false);  -- master: nullable, shared
-- It adds branch_id + the (tenant_id, branch_id) FK, backfills and requires
-- it, attaches the fill trigger and the restrictive policy. Idempotent.
-- ============================================================================

-- ── Regions ─────────────────────────────────────────────────────────────────
create table if not exists pk_regions (
  code          text primary key check (code in ('PB', 'SD', 'KP', 'BA', 'ICT', 'GB', 'AJK')),
  name          text not null unique,
  name_ur       text not null default '',
  -- The province as FBR's PRAL reference list spells it (DI API v1.12
  -- provinces endpoint). Unverified against the live list: see the founder
  -- questions in the Phase 3 report.
  fbr_name      text not null unique,
  kind          text not null check (kind in ('province', 'territory')),
  pst_authority text not null default '',
  sort          smallint not null default 0
);

insert into pk_regions (code, name, name_ur, fbr_name, kind, pst_authority, sort) values
  ('PB',  'Punjab',                      'پنجاب',             'PUNJAB',                 'province',  'PRA',     1),
  ('SD',  'Sindh',                       'سندھ',              'SINDH',                  'province',  'SRB',     2),
  ('KP',  'Khyber Pakhtunkhwa',          'خیبر پختونخوا',     'KHYBER PAKHTUNKHWA',     'province',  'KPRA',    3),
  ('BA',  'Balochistan',                 'بلوچستان',          'BALOCHISTAN',            'province',  'BRA',     4),
  ('ICT', 'Islamabad Capital Territory', 'اسلام آباد',        'CAPITAL TERRITORY',      'territory', 'FBR-ICT', 5),
  ('GB',  'Gilgit-Baltistan',            'گلگت بلتستان',      'GILGIT BALTISTAN',       'territory', '',        6),
  ('AJK', 'Azad Jammu and Kashmir',      'آزاد جموں و کشمیر', 'AZAD JAMMU AND KASHMIR', 'territory', '',        7)
on conflict (code) do nothing;

grant select on pk_regions to app_user;   -- global reference data, no RLS

-- ── Branches ────────────────────────────────────────────────────────────────
create table if not exists branches (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  code           text not null check (code ~ '^[A-Z0-9]{2,8}$'),   -- used in document numbers
  name           text not null check (length(btrim(name)) between 1 and 120),
  address        text not null default '',
  phone          text not null default '',
  region_code    text references pk_regions(code),                 -- drives PST
  timezone       text check (timezone is null or is_timezone(timezone)),  -- null = tenant's
  fbr_pos_id     text,                                            -- FBR POS registration is per outlet
  receipt_header text,                                            -- overrides the tenant's
  is_default     boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, code),
  -- target of the (tenant_id, branch_id) FKs: a row can only name a branch of its own tenant
  unique (tenant_id, id),
  constraint branches_default_is_active check (not is_default or active)
);
create unique index if not exists branches_one_default on branches (tenant_id) where is_default;

create table if not exists user_branches (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  branch_id  uuid not null,
  is_home    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create unique index if not exists user_branches_one_home on user_branches (user_id) where is_home;

-- Backfill: one default branch per tenant, home for every user.
insert into branches (tenant_id, code, name, is_default)
select t.id, 'MAIN', 'Main branch', true from tenants t
 where not exists (select 1 from branches b where b.tenant_id = t.id and b.is_default);

insert into user_branches (tenant_id, user_id, branch_id, is_home)
select u.tenant_id, u.id, b.id, true
  from users u join branches b on b.tenant_id = u.tenant_id and b.is_default
on conflict do nothing;

-- New tenants get their default branch, new users their home branch.
create or replace function bos_tenant_default_branch() returns trigger language plpgsql as $$
begin
  insert into public.branches (tenant_id, code, name, is_default)
  values (new.id, 'MAIN', 'Main branch', true)
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists default_branch on tenants;
create trigger default_branch after insert on tenants
  for each row execute function bos_tenant_default_branch();

create or replace function bos_user_home_branch() returns trigger language plpgsql as $$
begin
  insert into public.user_branches (tenant_id, user_id, branch_id, is_home)
  select new.tenant_id, new.id, b.id, true
    from public.branches b where b.tenant_id = new.tenant_id and b.is_default
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists home_branch on users;
create trigger home_branch after insert on users
  for each row execute function bos_user_home_branch();

-- ── Branch visibility (studies/04 §6.2, 12-trd §4.1) ────────────────────────
-- Inlinable STABLE SQL. Null branch = shared master row. Unset or '' = no rows.
-- A CASE, and a text comparison, on purpose: with OR the planner may push
-- `b = any(...::uuid[])` into an index condition and cast '*' to uuid.
create or replace function app_branch_visible(b uuid) returns boolean language sql stable as $$
  select case
           when b is null then true
           when current_setting('app.branch_ids', true) = '*' then true
           else coalesce(b::text = any (string_to_array(nullif(current_setting('app.branch_ids', true), ''), ',')),
                         false)
         end
$$;

-- What `app.branch_ids` should be for a user's request: '*' for a branch
-- admin (legacy settings:admin, i.e. `settings.branches.all`) asking for no
-- particular branch; else the active branches they belong to; narrowed by
-- the X-Branch-Ids request (`p_requested`), falling back to the home branch
-- when the request names none of theirs. Invoker rights: under app_user it
-- only ever sees its own tenant, and p_tenant pins it on owner connections.
create or replace function bos_session_branches(p_tenant uuid, p_user uuid, p_requested text[])
returns text language plpgsql stable as $$
declare
  is_all  boolean;
  allowed uuid[];
  home    uuid;
  picked  uuid[];
begin
  if not exists (select 1 from public.users where id = p_user and tenant_id = p_tenant) then
    return '';
  end if;
  select exists (select 1 from public.users u join public.permissions p on p.role_id = u.role_id
                  where u.id = p_user and p.section = 'settings' and p.action = 'admin')
    into is_all;
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
    return coalesce(home::text, '');
  end if;
  return array_to_string(picked, ',');
end $$;

-- The branch a write lands in when the code doesn't name one: the active
-- branch if exactly one is active, else the tenant's default branch. Used by
-- the fill trigger and by sequences (per-branch numbering).
create or replace function app_current_branch(p_tenant uuid) returns uuid language plpgsql stable as $$
declare
  ids text := nullif(current_setting('app.branch_ids', true), '');
begin
  if ids is not null and ids <> '*' and position(',' in ids) = 0 then
    return ids::uuid;
  end if;
  return (select b.id from public.branches b where b.tenant_id = p_tenant and b.is_default);
end $$;

create or replace function bos_fill_branch() returns trigger language plpgsql as $$
begin
  if new.branch_id is null then
    new.branch_id := public.app_current_branch(new.tenant_id);
  end if;
  return new;
end $$;

-- The reusable helper (see header). Owner/migrations only.
create or replace procedure bos_branch_scope(t regclass, required boolean default true)
language plpgsql as $$
declare
  rel text := (select relname from pg_class where oid = t);
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = t and attname = 'branch_id' and not attisdropped) then
    execute format('alter table %s add column branch_id uuid', t);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = t and conname = rel || '_branch_fk') then
    execute format('alter table %s add constraint %I foreign key (tenant_id, branch_id) '
                   'references branches (tenant_id, id)', t, rel || '_branch_fk');
  end if;
  execute format('create index if not exists %I on %s (tenant_id, branch_id)', rel || '_branch_idx', t);
  if required then
    execute format('update %s x set branch_id = b.id from branches b '
                   'where b.tenant_id = x.tenant_id and b.is_default and x.branch_id is null', t);
    execute format('alter table %s alter column branch_id set not null', t);
    execute format('drop trigger if exists branch_fill on %s', t);
    execute format('create trigger branch_fill before insert on %s '
                   'for each row execute function bos_fill_branch()', t);
  end if;
  execute format('drop policy if exists branch_scope on %s', t);
  execute format('create policy branch_scope on %s as restrictive for all '
                 'using (app_branch_visible(branch_id)) with check (app_branch_visible(branch_id))', t);
end $$;

revoke execute on procedure bos_branch_scope(regclass, boolean) from public;
revoke execute on function bos_session_branches(uuid, uuid, text[]) from public;
grant execute on function bos_session_branches(uuid, uuid, text[]) to app_user;

-- Transactional tables: a branch is required.
call bos_branch_scope('pos_sales', true);
call bos_branch_scope('pos_returns', true);
call bos_branch_scope('pos_drawers', true);
call bos_branch_scope('pos_purchase_orders', true);
call bos_branch_scope('hrms_attendance', true);
call bos_branch_scope('hrms_punches', true);
call bos_branch_scope('crm_invoice_requests', true);
-- Masters: shared unless a branch is named.
call bos_branch_scope('pos_products', false);

-- ── Company profile ─────────────────────────────────────────────────────────
create table if not exists tenant_company (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  legal_name  text not null default '',
  -- NTN: 7 digits with an optional check digit, or a 13-digit CNIC for individuals.
  ntn         text check (ntn ~ '^(\d{7}(-\d)?|\d{13})$'),
  -- STRN: 13 digits, or the NTN for newer registrations.
  strn        text check (strn ~ '^(\d{13}|\d{7}(-\d)?)$'),
  address     text not null default '',
  city        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  region_code text references pk_regions(code),
  updated_at  timestamptz not null default now()
);

-- ── FBR seller province → pk_regions ────────────────────────────────────────
alter table fbr_settings add column if not exists seller_region_code text references pk_regions(code);

update fbr_settings f
   set seller_region_code = r.code, seller_province = r.fbr_name
  from pk_regions r
 where f.seller_province <> ''
   and lower(btrim(f.seller_province)) in (lower(r.name), lower(r.fbr_name), lower(r.code));

-- The region is the source of truth; seller_province follows it. A legacy
-- write of seller_province alone is resolved to a region by name, and an
-- unknown name is refused (check_violation -> 422 in the API).
create or replace function fbr_settings_sync_region() returns trigger language plpgsql as $$
declare
  r public.pk_regions%rowtype;
begin
  if new.seller_region_code is not null
     and (tg_op = 'INSERT' or new.seller_region_code is distinct from old.seller_region_code) then
    select * into r from public.pk_regions where code = new.seller_region_code;
    if found then
      new.seller_province := r.fbr_name;
    end if;
  elsif tg_op = 'INSERT' or new.seller_province is distinct from old.seller_province then
    if coalesce(btrim(new.seller_province), '') = '' then
      new.seller_province := '';
      new.seller_region_code := null;
    else
      select * into r from public.pk_regions
       where lower(btrim(new.seller_province)) in (lower(name), lower(fbr_name), lower(code));
      if not found then
        raise exception 'Unknown province: %', new.seller_province
          using errcode = 'check_violation', constraint = 'fbr_settings_seller_province_check';
      end if;
      new.seller_region_code := r.code;
      new.seller_province := r.fbr_name;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sync_region on fbr_settings;
create trigger sync_region before insert or update on fbr_settings
  for each row execute function fbr_settings_sync_region();

-- ── Grants, RLS, audit ──────────────────────────────────────────────────────
grant select, insert, update on branches       to app_user;   -- deactivate, never delete
grant select, insert         on user_branches  to app_user;   -- home branch for users added by the team screen
grant select, insert, update on tenant_company to app_user;
-- The company screen edits these three tenant columns and nothing else
-- (status, plan and settings stay owner-only). Column grants don't show in
-- the table-level grant matrix, so test_company_settings pins this list.
grant update (name, timezone, fy_start_month, updated_at) on tenants to app_user;

do $$
declare t text;
begin
  foreach t in array array['branches', 'user_branches', 'tenant_company']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

create trigger audit after insert or update or delete on branches for each row
  execute function audit_row('code', 'name', 'address', 'region_code', 'fbr_pos_id', 'is_default', 'active');
create trigger audit after insert or update or delete on tenant_company for each row
  execute function audit_row('legal_name', 'ntn', 'strn', 'address', 'city', 'region_code');
