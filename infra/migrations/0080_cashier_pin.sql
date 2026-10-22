-- ============================================================================
-- Migration 0080 — Cashier = employee (3C, pos_hrms, D-24, St01 P1)
--
--  * A cashier signs in at a till with their employee PIN (the argon2
--    kiosk_pin_hash, 3F); the cashier token they get (only its hash is kept,
--    12 hours) names the employee on every sale, payment and cash move.
--  * No PIN hash or verifier ever leaves the server: a 4-6 digit PIN cracks
--    offline in seconds and also clocks staff in at the kiosk. An offline
--    till (3D) keeps the cashier token it got while online.
-- ============================================================================

create table pos_cashier_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  employee_id  uuid not null references hrms_employees(id) on delete cascade,
  device_id    uuid,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);
create index pos_cashier_sessions_employee_idx on pos_cashier_sessions (employee_id);

grant select, insert, update on pos_cashier_sessions to app_user;
alter table pos_cashier_sessions enable row level security;
create policy tenant_isolation on pos_cashier_sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pos_sales add column employee_id uuid references hrms_employees(id) on delete set null;
alter table pos_payments add column employee_id uuid references hrms_employees(id) on delete set null;
alter table pos_cash_moves add column employee_id uuid references hrms_employees(id) on delete set null;
