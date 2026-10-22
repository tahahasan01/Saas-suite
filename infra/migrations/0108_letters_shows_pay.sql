-- ============================================================================
-- Migration 0108 — Letters that show pay stay with pay readers (security review)
--
-- hrms_letters.shows_pay: set at issue when the text printed the salary or
-- the full CNIC (both need payroll.salary.read to issue). Reading such a
-- letter back (the list, the PDF) needs payroll.salary.read too; the
-- employee always sees their own on /me. Salary letters issued before this
-- are marked too.
-- ============================================================================

alter table hrms_letters add column if not exists shows_pay boolean not null default false;
update hrms_letters set shows_pay = true where not shows_pay and kind = 'salary';
