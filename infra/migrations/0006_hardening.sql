-- ============================================================================
-- Migration 0006 — Production hardening
-- Applies database-reviewer / postgres-patterns guidance:
--   * index every foreign key and RLS-policy column that wasn't covered
--   * global statement + idle-transaction timeouts
--   * least privilege on the public schema
-- ============================================================================

-- ── Missing FK / RLS-column indexes ─────────────────────────────────────────
create index if not exists users_role_idx        on users(role_id);
create index if not exists roles_tenant_idx       on roles(tenant_id);
create index if not exists permissions_tenant_idx on permissions(tenant_id);
create index if not exists crm_leads_owner_idx    on crm_leads(owner_id);
create index if not exists crm_pipelines_tenant_idx on crm_pipelines(tenant_id);
create index if not exists crm_stages_tenant_idx  on crm_stages(tenant_id);
create index if not exists crm_interactions_tenant_idx on crm_interactions(tenant_id);

-- ── Safety timeouts (apply to new connections) ──────────────────────────────
-- On whichever database is being migrated (POSTGRES_DB / DATABASE_URL), not a
-- hardcoded name (P0-6).
do $$
begin
  execute format('alter database %I set statement_timeout = %L', current_database(), '30s');
  execute format('alter database %I set idle_in_transaction_session_timeout = %L',
                 current_database(), '60s');
end$$;

-- ── Least privilege: no implicit rights via the PUBLIC role ─────────────────
-- app_user keeps its explicit grants from earlier migrations.
revoke all on schema public from public;
