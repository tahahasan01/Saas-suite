-- ============================================================================
-- Migration 0029 — Tenant clock (decision D-11, audit P1-2)
--
-- Business time is the tenant's local time. db.tenant_conn sets the session
-- TimeZone from tenants.timezone for each transaction, so current_date,
-- now()::date and timestamp-to-date casts in every query are local without
-- touching them one by one. late_after replaces the hard-coded "hour >= 10",
-- which was evaluated in UTC (3 pm in Pakistan).
-- ============================================================================

alter table tenants
  add column if not exists timezone   text not null default 'Asia/Karachi',
  add column if not exists late_after time not null default '10:00';
