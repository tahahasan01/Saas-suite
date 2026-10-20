-- ============================================================================
-- Migration 0044 — Partitioned audit trail + record timeline (D-07, gate M9,
-- St04 #15 and risk 5, TRD §3.10 / §4.4, checklist 2G)
--
-- 1. `audit_log` becomes an append-only, monthly-partitioned log of FIELD
--    DIFFS: changes = {"price_minor": [12000, 13500]}. Rows come from two
--    places only:
--      * audit_row()   — an AFTER trigger on money, people and billing tables,
--                        so a new endpoint cannot forget to audit;
--      * audit_event() — explicit semantic events (approve, login, export,
--                        module.enable …) that no row change expresses.
--    Both are SECURITY DEFINER, owned by `audit_writer` (nologin, INSERT on
--    audit_log and nothing else) with search_path pinned to
--    pg_catalog, pg_temp and every relation schema-qualified, so a definer
--    function cannot be steered into someone else's table (St04 risk 5).
--    app_user keeps SELECT for reads and loses INSERT: it can only append
--    through audit_event(). Nobody — not even the owner — can UPDATE or
--    TRUNCATE it; retention removes old months by detaching partitions.
-- 2. Who did it comes from transaction-local GUCs set by tenant_conn():
--    app.actor_id, app.request_id, app.actor_kind (user | job | system …).
--    No request and no job (an owner script, signup) reads as 'system'.
-- 3. Guarded fields (CNIC, salary, IBAN, bank account, cost, tokens) are
--    recorded as changed, never with values: ["***","***"] plus their name in
--    `guarded` (D-07, TRD TR-SEC-32). A '!' before a tracked column marks it
--    guarded, and a fixed name list is masked even if the '!' is forgotten.
-- 4. `timeline_events`: the user-facing per-record stream (notes, approvals,
--    stage changes) written by app/audit.py track(). It is not the audit log.
-- 5. Partition helpers for the worker: audit_log_create_partitions(n) keeps
--    this month and n ahead; audit_log_apply_retention() and
--    audit_log_detach_expired() implement retention per plan (TRD TR-NFR-15,
--    13-system-design §7.5). See infra/audit/README.md.
--
-- The old audit_log's rows are copied in (before/after become a diff) and the
-- old table is dropped in the same transaction.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'audit_writer') then
    create role audit_writer nologin;
  end if;
end $$;
grant usage on schema public to audit_writer;

-- ── 1. The partitioned log ─────────────────────────────────────────────────
alter table audit_log rename to audit_log_legacy;
alter index if exists audit_log_tenant_idx rename to audit_log_legacy_tenant_idx;
alter table audit_log_legacy rename constraint audit_log_pkey to audit_log_legacy_pkey;

-- No foreign keys: nothing may block an audit write (a tenant's cascade delete
-- fires the triggers of its own rows), and the actor can be a job or a user
-- long gone. Tenant purge removes a tenant's rows explicitly.
create table audit_log (
  id          bigint generated always as identity,
  tenant_id   uuid not null,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_kind  text not null default 'system'
    check (actor_kind in ('user','job','ai','import','system','platform_admin','webhook','device')),
  request_id  text,
  entity      text not null,               -- table name for diffs, a noun for events
  entity_id   text,
  action      text not null,               -- insert | update | delete | <module.verb>
  changes     jsonb,                       -- {"col": [old, new]}; guarded → ["***","***"]
  guarded     text[] not null default '{}',
  data        jsonb,                       -- a semantic event's payload
  primary key (tenant_id, occurred_at, id)
) partition by range (occurred_at);
create index audit_log_entity_idx on audit_log (tenant_id, entity, entity_id, occurred_at desc);

-- A missed partition job must never fail a sale: rows past the last month
-- wait here, and creating their month later moves them out.
create table audit_log_default partition of audit_log default;
alter table audit_log_default enable row level security;

alter table audit_log enable row level security;
create policy tenant_isolation on audit_log
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- Triggers also fire on owner-connection writes (signup, payment activation,
-- the worker), where no tenant is set; the row being audited supplies it.
-- Only audit_writer, i.e. only the definer functions, can use this.
create policy audit_writer_without_tenant on audit_log for insert to audit_writer
  with check (nullif(current_setting('app.tenant_id', true), '') is null);

grant select on audit_log to app_user;      -- reads; writes go through audit_event()
grant insert on audit_log to audit_writer;

create or replace function audit_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only (%)', tg_op;
end $$;
create trigger audit_log_append_only before update or truncate on audit_log
  for each statement execute function audit_log_append_only();

-- ── Partitions: one per UTC month ──────────────────────────────────────────
create or replace function audit_log_create_partition(p_month date) returns text
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  m    date := date_trunc('month', p_month)::date;
  nm   date := (date_trunc('month', p_month) + interval '1 month')::date;
  lo   timestamptz := make_timestamptz(extract(year from m)::int, extract(month from m)::int, 1, 0, 0, 0, 'UTC');
  hi   timestamptz := make_timestamptz(extract(year from nm)::int, extract(month from nm)::int, 1, 0, 0, 0, 'UTC');
  name text := format('audit_log_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'));
begin
  if to_regclass('public.' || name) is not null then
    return null;
  end if;
  if exists (select 1 from public.audit_log_default where occurred_at >= lo and occurred_at < hi) then
    -- Rows already waiting in default: build the month beside it, move them,
    -- then attach (attaching over rows still in default would fail).
    execute format('create table public.%I (like public.audit_log including defaults including constraints)', name);
    execute format(
      'with moved as (delete from public.audit_log_default where occurred_at >= %L and occurred_at < %L returning *)
       insert into public.%I select * from moved', lo, hi, name);
    execute format('alter table public.audit_log attach partition public.%I for values from (%L) to (%L)',
                   name, lo, hi);
  else
    execute format('create table public.%I partition of public.audit_log for values from (%L) to (%L)',
                   name, lo, hi);
  end if;
  -- Reached only through the parent (whose grants and policies apply);
  -- direct access has no grant and, as a backstop, no policy.
  execute format('alter table public.%I enable row level security', name);
  return name;
end $$;

-- This month and p_months_ahead after it; returns the partitions it created.
create or replace function audit_log_create_partitions(p_months_ahead int default 3) returns setof text
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  first date := date_trunc('month', now() at time zone 'UTC')::date;
  made  text;
begin
  for i in 0 .. greatest(p_months_ahead, 0) loop
    made := public.audit_log_create_partition((first + make_interval(months => i))::date);
    if made is not null then
      return next made;
    end if;
  end loop;
end $$;

-- ── Retention per plan (TRD TR-NFR-15, 13-system-design §7.5) ──────────────
create or replace function audit_retention_months(p_plan text) returns int
language sql immutable as $$
  select case p_plan when 'enterprise' then 84 when 'growth' then 36 else 13 end
$$;

-- Money, tax and payroll history is kept ≥ 6 years whatever the plan.
create or replace function audit_kept_entities() returns text[]
language sql immutable as $$
  select array['pos_sales','pos_returns','pos_fbr_invoices','fbr_settings','crm_invoice_requests',
               'invoice_request','hrms_employees','subscriptions','payment_requests']
$$;

-- Deletes each tenant's rows older than its plan allows; returns the count.
-- Owner-only (the worker's owner connection); the append-only trigger does
-- not stop DELETE, the missing grant does.
create or replace function audit_log_apply_retention(p_now timestamptz default now()) returns bigint
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  n bigint;
begin
  delete from public.audit_log a
   using public.tenants t
   left join public.subscriptions s on s.tenant_id = t.id
   where a.tenant_id = t.id
     and a.occurred_at < p_now - make_interval(months => public.audit_retention_months(coalesce(s.plan, 'starter')))
     and (a.entity <> all (public.audit_kept_entities()) or a.occurred_at < p_now - interval '72 months');
  get diagnostics n = row_count;
  return n;
end $$;

-- Detaches whole months older than every plan's window and returns their
-- names. The caller archives each one (compressed JSONL to object storage)
-- and only then drops it — this function never destroys data itself.
create or replace function audit_log_detach_expired(p_keep_months int default 84,
                                                    p_now timestamptz default now()) returns setof text
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  part record;
  cutoff timestamptz := date_trunc('month', p_now - make_interval(months => p_keep_months));
begin
  for part in
    select c.relname, pg_get_expr(c.relpartbound, c.oid) as bound
      from pg_inherits i join pg_class c on c.oid = i.inhrelid
     where i.inhparent = 'public.audit_log'::regclass and c.relname ~ '^audit_log_y\d{4}m\d{2}$'
  loop
    -- bound reads: FOR VALUES FROM ('…') TO ('…')
    if (substring(part.bound from 'TO \(''([^'']+)''\)'))::timestamptz <= cutoff then
      execute format('alter table public.audit_log detach partition public.%I', part.relname);
      return next part.relname;
    end if;
  end loop;
end $$;

revoke all on function audit_log_create_partition(date), audit_log_create_partitions(int),
                       audit_log_apply_retention(timestamptz), audit_log_detach_expired(int, timestamptz)
  from public;

-- ── Copy the old log in ────────────────────────────────────────────────────
-- Every month the old rows span gets its partition first, so none land in
-- default; then this month and three ahead (TRD TR-SEC-62).
do $$
declare
  m date := date_trunc('month', coalesce((select min(created_at) from audit_log_legacy), now()) at time zone 'UTC')::date;
begin
  while m < date_trunc('month', now() at time zone 'UTC')::date loop
    perform audit_log_create_partition(m);
    m := (m + interval '1 month')::date;
  end loop;
  perform audit_log_create_partitions(3);
end $$;

-- before/after become one diff: {"key": [before, after]} over both key sets.
insert into audit_log (tenant_id, occurred_at, actor_id, actor_kind, entity, entity_id, action, changes)
select l.tenant_id, l.created_at, l.actor_id,
       case when l.actor_id is null then 'system' else 'user' end,
       l.entity, l.entity_id, l.action,
       case
         when coalesce(jsonb_typeof(l.before), 'object') = 'object'
          and coalesce(jsonb_typeof(l.after), 'object') = 'object'
         then (select jsonb_object_agg(k, jsonb_build_array(l.before -> k, l.after -> k))
                 from (select jsonb_object_keys(coalesce(l.before, '{}'))
                       union select jsonb_object_keys(coalesce(l.after, '{}'))) keys(k))
         else jsonb_build_object('before', l.before, 'after', l.after)
       end
  from audit_log_legacy l
 order by l.created_at;

drop table audit_log_legacy;

-- ── 2/3. The writers ───────────────────────────────────────────────────────
-- Trigger: after insert/update/delete, for each row, with the tracked columns
-- as arguments ('!col' = guarded). An update that changes none of them writes
-- nothing, so e.g. stock movements on pos_products don't flood the log.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  -- D-07: never stored as values, whatever a trigger's arguments say.
  always_guarded constant text[] := array['cnic','cnic_enc','salary_minor','basic_minor','iban',
                                          'bank_account','account_number','cost_minor','token',
                                          'password_hash','mfa_totp_enc'];
  o jsonb;
  n jsonb;
  arg text;
  col text;
  diff jsonb := '{}';
  hidden text[] := '{}';
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_nargs > 0 then
    foreach arg in array tg_argv loop
      col := ltrim(arg, '!');
      if coalesce(o -> col, 'null') is distinct from coalesce(n -> col, 'null') then
        if left(arg, 1) = '!' or col = any(always_guarded) then
          diff := diff || jsonb_build_object(col, jsonb_build_array('***', '***'));
          hidden := hidden || col;
        else
          diff := diff || jsonb_build_object(col, jsonb_build_array(o -> col, n -> col));
        end if;
      end if;
    end loop;
  end if;
  if tg_op = 'UPDATE' and diff = '{}' then
    return null;
  end if;
  insert into public.audit_log (tenant_id, actor_id, actor_kind, request_id,
                                entity, entity_id, action, changes, guarded)
  values (coalesce(n ->> 'tenant_id', o ->> 'tenant_id')::uuid,
          nullif(current_setting('app.actor_id', true), '')::uuid,
          coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system'),
          nullif(current_setting('app.request_id', true), ''),
          tg_table_name,
          -- tables keyed by tenant (subscriptions, fbr_settings) have no id
          coalesce(n ->> 'id', o ->> 'id', n ->> 'tenant_id', o ->> 'tenant_id'),
          lower(tg_op), diff, hidden);
  return null;
end $$;

-- Semantic events. The tenant is always the caller's own (app.tenant_id), and
-- the action must look like module.verb, so this can't forge a trigger row.
create or replace function audit_event(p_action text, p_entity text, p_entity_id text default null,
                                       p_changes jsonb default null, p_data jsonb default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  t uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  always_guarded constant text[] := array['cnic','cnic_enc','salary_minor','basic_minor','iban',
                                          'bank_account','account_number','cost_minor','token',
                                          'password_hash','mfa_totp_enc'];
  k text;
  hidden text[] := '{}';
begin
  if t is null then
    raise exception 'audit_event: no tenant in context (app.tenant_id is not set)';
  end if;
  if p_action !~ '^[a-z_]+(\.[a-z_]+)+$' then
    raise exception 'audit_event: % is not a module.verb action', p_action;
  end if;
  if jsonb_typeof(p_changes) = 'object' then
    for k in select jsonb_object_keys(p_changes) loop
      if k = any(always_guarded) then
        p_changes := p_changes || jsonb_build_object(k, jsonb_build_array('***', '***'));
        hidden := hidden || k;
      end if;
    end loop;
  end if;
  insert into public.audit_log (tenant_id, actor_id, actor_kind, request_id,
                                entity, entity_id, action, changes, guarded, data)
  values (t,
          nullif(current_setting('app.actor_id', true), '')::uuid,
          coalesce(nullif(current_setting('app.actor_kind', true), ''), 'system'),
          nullif(current_setting('app.request_id', true), ''),
          p_entity, p_entity_id, p_action, p_changes, hidden, p_data);
end $$;

-- ── The audited tables (TRD TR-SEC-60, as far as they exist today) ─────────
-- Voids: there is no void flow yet; a deleted or (later) voided sale is an
-- audited delete/update of pos_sales.
create trigger audit after insert or update or delete on pos_sales for each row
  execute function audit_row('subtotal_minor','discount_minor','tax_minor','total_minor','rounding_minor',
                             'paid_minor','change_minor','payment_method','cashier_id','item_count');
create trigger audit after insert or update or delete on pos_returns for each row
  execute function audit_row('sale_id','cashier_id','reason','refund_minor','tax_minor');
create trigger audit after insert or update or delete on pos_products for each row
  execute function audit_row('name','price_minor','!cost_minor','tax_rate','hs_code','active');
create trigger audit after insert or update or delete on hrms_employees for each row
  execute function audit_row('user_id','name','!cnic','designation','department','join_date',
                             '!salary_minor','status');
create trigger audit after insert or update or delete on hrms_leave_requests for each row
  execute function audit_row('employee_id','request_type','leave_type','from_date','to_date',
                             'status','decided_by');
create trigger audit after insert or update or delete on crm_invoice_requests for each row
  execute function audit_row('lead_id','requested_by','amount_minor','discount_pct','status',
                             'decided_by','decided_at');
create trigger audit after insert or update or delete on subscriptions for each row
  execute function audit_row('plan','status','trial_ends_at','current_period_end','provider');
create trigger audit after insert or update or delete on payment_requests for each row
  execute function audit_row('plan','amount_minor','method','reference','status');
create trigger audit after insert or update or delete on fbr_settings for each row
  execute function audit_row('enabled','environment','seller_ntn_cnic','seller_business_name',
                             'seller_province','seller_address','prices_include_tax','!token');

-- Ownership last: the triggers above were created while the migrator still
-- held EXECUTE. A trigger function can't be called directly anyway; EXECUTE
-- stays with its owner (and the migrator, for future triggers).
alter function audit_row() owner to audit_writer;
alter function audit_event(text, text, text, jsonb, jsonb) owner to audit_writer;
revoke all on function audit_row() from public;
revoke all on function audit_event(text, text, text, jsonb, jsonb) from public;
do $$ begin
  execute format('grant execute on function audit_row() to %I', current_user);
end $$;
grant execute on function audit_event(text, text, text, jsonb, jsonb) to app_user;

-- ── 4. timeline_events ─────────────────────────────────────────────────────
create table timeline_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  entity_type text not null,                 -- lead, contact, invoice_request, leave_request …
  entity_id   uuid not null,
  contact_id  uuid,                          -- for the Contact 360 merge (Phase 3)
  kind        text not null check (kind in ('note','field_change','stage_change','won','lost','restored',
                                            'activity_done','call','merge','system','attachment',
                                            'approved','rejected')),
  actor_id    uuid references users(id) on delete set null,
  body        text,
  changes     jsonb,
  payload     jsonb,
  source_ref  text,                          -- idempotency for system-generated events
  -- the wall clock, not the transaction's start: two events in one
  -- transaction keep their order (ids are random)
  occurred_at timestamptz not null default clock_timestamp()
);
create index timeline_events_entity_idx
  on timeline_events (tenant_id, entity_type, entity_id, occurred_at desc, id desc);
create index timeline_events_contact_idx
  on timeline_events (tenant_id, contact_id, occurred_at desc) where contact_id is not null;
create unique index timeline_events_source_ref_key
  on timeline_events (tenant_id, source_ref) where source_ref is not null;
create index timeline_events_actor_idx on timeline_events (actor_id) where actor_id is not null;

grant select, insert on timeline_events to app_user;   -- append-only
alter table timeline_events enable row level security;
create policy tenant_isolation on timeline_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
