-- ============================================================================
-- Migration 0088 — Birthdays (wave A, H20, St10)
--
-- An optional date of birth and the employee's own choice whether the team
-- sees their birthday. Celebrations show the day only, never the year (no
-- ages). Work anniversaries come from join_date, which already exists.
-- hrms_employees already grants app_user update (0012).
-- ============================================================================

alter table hrms_employees
  add column if not exists date_of_birth      date check (date_of_birth > date '1900-01-01'),
  add column if not exists celebrate_birthday boolean not null default true;
