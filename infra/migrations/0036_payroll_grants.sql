-- ============================================================================
-- Migration 0036 — Payroll permissions (D-42, audit P1-6)
--
-- Salary, CNIC and the payroll run now need a `payroll.*` key (app/registry.py);
-- `hrms:read` no longer reveals them. Keys are app-level; grants are still the
-- legacy (section, action) rows, so a role holds payroll.* through a
-- section = 'payroll' row (read | write | admin).
--
-- Backfill: existing Owner roles get payroll admin, as new signups do, so no
-- owner loses sight of their own payroll. Other roles are deliberately NOT
-- backfilled — that HR readers could see pay is the finding being fixed; an
-- owner grants payroll to the roles that should have it.
-- ============================================================================

insert into permissions (tenant_id, role_id, section, action)
select tenant_id, id, 'payroll', 'admin' from roles where name = 'Owner' and is_system
on conflict (role_id, section, action) do nothing;
