-- ============================================================================
-- Migration 0032 — Database least privilege and the AI read path (audit P0-1,
-- gates S2, S3; TRD §3.1, TR-SEC-01/-03/-12)
--
-- 1. No more default grants. 0001 ran `alter default privileges … grant
--    select, insert, update, delete on tables to app_user`, so every later
--    table — auth_tokens included — was born readable and writable by the
--    runtime role. From here a new table starts with NO privileges; its
--    migration must grant exactly what the app uses, and
--    services/api/tests/core/grant_matrix.py must list it (test_grants.py
--    fails otherwise).
-- 2. app_user is reset to that reviewed matrix: the minimum verbs its SQL
--    uses under tenant_conn. Append-only logs get select + insert only.
-- 3. The AI's SQL runs as `ai_reader` (NOLOGIN; reached only by app_user's
--    `set local role`), which can read the ai_v_* views and nothing else.
--    The views move to `ai_view_owner` (NOLOGIN, not the table owner, no
--    BYPASSRLS) and stop being security_invoker: base-table privileges and
--    RLS are then checked against ai_view_owner with the request's
--    app.tenant_id, so ai_reader needs no table grant at all.
-- 4. Defence in depth for a validator bypass: ai_reader cannot call
--    set_config() (tenant switch, or `role` back to app_user — the session
--    user), pg_sleep(), or run a plpgsql DO block (which could `reset role`).
-- 5. auth_tokens gets RLS like every other table with a tenant_id (gate S4).
--    The runtime role holds no privilege on it (0025) and the owner bypasses
--    RLS, so this changes no behaviour — it closes the last gap in the
--    "every tenant table has a policy" rule.
--
-- Roles are cluster-wide, so they are created only if missing and then
-- normalised. The migrator is assumed superuser (dev, CI); the CURRENT_USER
-- grants below keep a non-superuser migrator working after the revokes.
-- ============================================================================

-- ── 1. Default privileges ───────────────────────────────────────────────────
alter default privileges in schema public revoke all on tables    from app_user;
alter default privileges in schema public revoke all on sequences from app_user;

-- ── 2. app_user: the reviewed matrix (mirrors tests/core/grant_matrix.py) ───
revoke all on all tables    in schema public from app_user;
revoke all on all sequences in schema public from app_user;

-- reference data and rows written only by owner paths (signup, activation)
grant select on tenants, subscriptions, terminology, occasion_calendar to app_user;

-- created, never edited or removed (append-only logs included)
grant select, insert on
  roles, permissions, crm_pipelines, crm_stages,
  pos_sale_items, pos_returns, pos_return_items, pos_suppliers,
  audit_log, ai_interactions
  to app_user;

-- created and edited; upserts (on conflict do update) and select … for update
-- need UPDATE too (entitlements, crm_fulfillment, hrms_attendance, pos_sales)
grant select, insert, update on
  users, entitlements, payment_requests, notifications,
  crm_leads, crm_interactions, crm_fulfillment, crm_invoice_requests,
  pos_products, pos_sales, pos_drawers, pos_purchase_orders, pos_po_items,
  pos_fbr_invoices, fbr_settings,
  hrms_employees, hrms_attendance, hrms_leave_requests, hrms_leave_policies
  to app_user;

-- the only tables the app deletes from
grant select, insert, update, delete on workflows, hrms_holidays to app_user;

-- sessions, auth_tokens, schema_migrations: nothing (owner connection only).
-- ai_v_*: nothing directly; app_user reaches them as ai_reader.

-- ── 3. AI roles ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ai_reader') then
    create role ai_reader nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'ai_view_owner') then
    create role ai_view_owner nologin;
  end if;
end$$;
alter role ai_reader     nologin nosuperuser nocreatedb nocreaterole nobypassrls;
alter role ai_view_owner nologin nosuperuser nocreatedb nocreaterole nobypassrls;

-- SET ROLE only: app_user must not silently carry the view grants.
grant ai_reader to app_user with inherit false, set true;

grant usage on schema public to ai_reader, ai_view_owner;

-- What the views read, and only that. `users` column by column: no view can
-- ever surface a password hash, even if someone edits one carelessly.
grant select on
  crm_leads, crm_stages, crm_pipelines, crm_interactions,
  pos_sales, pos_sale_items, pos_products, pos_returns,
  hrms_employees, hrms_attendance, hrms_leave_requests
  to ai_view_owner;
grant select (id, tenant_id, name) on users to ai_view_owner;

-- Re-own the views. A non-superuser owner change needs CREATE on the schema
-- for the new owner, so it is lent for the duration and taken back.
grant create on schema public to ai_view_owner;
do $$
declare v text;
begin
  for v in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
              and c.relname like 'ai\_v\_%'
  loop
    -- security_barrier: the caller's WHERE can't be pushed beneath the view's
    -- own quals, so a leaky predicate never sees rows the view would hide.
    execute format('alter view %I set (security_invoker = false, security_barrier = true)', v);
    execute format('alter view %I owner to ai_view_owner', v);
    execute format('revoke all on %I from app_user', v);
    execute format('grant select on %I to ai_reader', v);
  end loop;
end$$;
revoke create on schema public from ai_view_owner;

-- ── 4. Functions and languages the AI path must never reach ─────────────────
-- set_config is how the app pins app.tenant_id (db.tenant_conn), so app_user
-- keeps it explicitly; PUBLIC (hence ai_reader) loses it.
revoke execute on function pg_catalog.set_config(text, text, boolean) from public;
grant  execute on function pg_catalog.set_config(text, text, boolean) to app_user, current_user;

revoke execute on function pg_catalog.pg_sleep(double precision)               from public;
revoke execute on function pg_catalog.pg_sleep_for(interval)                   from public;
revoke execute on function pg_catalog.pg_sleep_until(timestamp with time zone) from public;

-- Running existing plpgsql functions and triggers needs no USAGE; only
-- creating them or a DO block does — which is migration work.
revoke usage on language plpgsql from public;
grant  usage on language plpgsql to current_user;

-- ── 5. RLS on auth_tokens ───────────────────────────────────────────────────
alter table auth_tokens enable row level security;
create policy tenant_isolation on auth_tokens
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
