-- ============================================================================
-- Migration 0071 — EOBI, PESSI and SESSI as effective-dated rules (D-45,
-- St03 §6.6–7, checklist §6.5)
--
-- Statutory rates are law, not tenant settings, so the reference tables are
-- platform-owned (no tenant_id, no RLS): app_user may only read them, and a
-- change ships as a migration that cites its source. Tenants only register
-- for a scheme (tenant_statutory_registrations, RLS) and set per-employee
-- overrides (hrms_employees.eobi_applicable / ss_applicable, 0069).
--
-- EVERY SEEDED FIGURE IS verified = false. The rates are Open (D-45,
-- docs/10-decisions open item 2): the UI shows "rates pending verification"
-- while any rate or minimum wage used by a payslip is unverified. Flipping
-- one to verified needs a new migration naming the official notification.
--
--  * EOBI: employer 5% and employee 1% of a fixed base, not of actual pay
--    [V]. Base PKR 40,000 (PB, SD, KP, ICT) and 37,000 (BA) from 1 Jul 2025
--    [R]. Whether the base follows Sindh's announced PKR 43,000 for FY2026-27
--    is [U], so the base is NOT tied to the minimum-wage table.
--  * PESSI (Punjab), SESSI (Sindh): employer 6%, no employee share [R]. The
--    wage base and coverage ceiling are [U]; seeded as "minimum wage" with
--    no ceiling, and the payslip explain names the choice.
--  * KP ESSI and BESSI: not researched; shipped unavailable.
--  * minimum_wages: drives PESSI/SESSI's base and the "below minimum wage"
--    payslip warning. Sindh's FY2026-27 PKR 43,000 is [R].
-- ============================================================================

create table if not exists statutory_schemes (
  code      text primary key,
  name      text not null,
  authority text not null,
  province  text,                     -- null = federal
  available boolean not null default true,  -- false = not researched; can't be enabled
  constraint statutory_schemes_authority_check
    check (authority in ('federal', 'punjab', 'sindh', 'kp', 'balochistan'))
);

create table if not exists statutory_rates (
  id                          uuid primary key default gen_random_uuid(),
  scheme_code                 text not null references statutory_schemes(code),
  province                    text,             -- null = applies wherever no provincial row exists
  effective_from              date not null,
  effective_to                date,
  base_kind                   text not null,
  base_minor                  bigint,           -- fixed base, or the cap for actual_wage_capped
  employee_rate               numeric(6,4) not null default 0,
  employer_rate               numeric(6,4) not null default 0,
  coverage_wage_ceiling_minor bigint,           -- earning more than this = not covered; null = everyone
  source_ref                  text not null,
  verified                    boolean not null default false,
  verified_note               text not null default '',
  check (effective_to is null or effective_to >= effective_from),
  constraint statutory_rates_base_kind_check
    check (base_kind in ('fixed_base', 'min_wage', 'actual_wage', 'actual_wage_capped'))
);
create unique index if not exists statutory_rates_key
  on statutory_rates (scheme_code, coalesce(province, '*'), effective_from);

create table if not exists minimum_wages (
  province       text not null,
  effective_from date not null,
  monthly_minor  bigint not null check (monthly_minor > 0),
  source_ref     text not null,
  verified       boolean not null default false,
  primary key (province, effective_from)
);

create table if not exists tenant_statutory_registrations (
  tenant_id       uuid not null references tenants(id) on delete cascade,
  scheme_code     text not null references statutory_schemes(code),
  registration_no text not null default '',
  enabled         boolean not null default true,
  effective_from  date not null default '2025-07-01',
  updated_at      timestamptz not null default now(),
  primary key (tenant_id, scheme_code)
);

-- Reference data: read-only for the app. Registrations: upserted by the app.
grant select on statutory_schemes, statutory_rates, minimum_wages to app_user;
grant select, insert, update on tenant_statutory_registrations to app_user;
alter table tenant_statutory_registrations enable row level security;
drop policy if exists tenant_isolation on tenant_statutory_registrations;
create policy tenant_isolation on tenant_statutory_registrations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger audit after insert or update or delete on tenant_statutory_registrations for each row
  execute function audit_row('scheme_code', 'registration_no', 'enabled', 'effective_from');

-- ── Seeds (all unverified) ──────────────────────────────────────────────────
insert into statutory_schemes (code, name, authority, province, available) values
  ('EOBI',    'EOBI',                                'federal',     null, true),
  ('PESSI',   'PESSI (Punjab social security)',      'punjab',      'PB', true),
  ('SESSI',   'SESSI (Sindh social security)',       'sindh',       'SD', true),
  ('KP_ESSI', 'KP employees social security',        'kp',          'KP', false),
  ('BESSI',   'Balochistan employees social security', 'balochistan', 'BA', false)
on conflict (code) do nothing;

insert into statutory_rates (scheme_code, province, effective_from, base_kind, base_minor, employee_rate,
                             employer_rate, source_ref) values
  ('EOBI', null, '2025-07-01', 'fixed_base', 4000000, 0.01, 0.05,
   'EOBI contribution on PKR 40,000 from 1 Jul 2025 per secondary summaries (St03 §7.3); notification not checked'),
  ('EOBI', 'BA', '2025-07-01', 'fixed_base', 3700000, 0.01, 0.05,
   'EOBI contribution on PKR 37,000 (Balochistan) per secondary summaries (St03 §7.3); notification not checked'),
  ('PESSI', 'PB', '2025-07-01', 'min_wage', null, 0, 0.06,
   'PESSI employer 6% (Business Recorder, St03 §7.4); wage base and ceiling disputed, minimum wage assumed'),
  ('SESSI', 'SD', '2025-07-01', 'min_wage', null, 0, 0.06,
   'SESSI employer 6% (St03 §7.4); wage cap in sources looks outdated, minimum wage assumed')
on conflict do nothing;

insert into minimum_wages (province, effective_from, monthly_minor, source_ref) values
  ('PB',  '2025-07-01', 4000000, 'Punjab minimum wage FY2025-26, secondary summaries (St03 §7.5)'),
  ('SD',  '2025-07-01', 4000000, 'Sindh minimum wage FY2025-26, secondary summaries (St03 §7.5)'),
  ('SD',  '2026-07-01', 4300000, 'Sindh budget 2026-27: Rs 43,000 announced (Pakistan Observer, St03 §7.3)'),
  ('KP',  '2025-07-01', 4000000, 'KP minimum wage FY2025-26, secondary summaries (St03 §7.5)'),
  ('ICT', '2025-07-01', 4000000, 'ICT minimum wage FY2025-26, secondary summaries (St03 §7.5)'),
  ('BA',  '2025-07-01', 3700000, 'Balochistan minimum wage FY2025-26, secondary summaries (St03 §7.5)')
on conflict do nothing;
