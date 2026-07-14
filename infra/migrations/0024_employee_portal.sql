-- ============================================================================
-- Migration 0024 — Employee self-service portal
--
-- Until now every HR action was performed by an admin on the employee's behalf:
-- an admin literally clicked "check in" for each person, and hrms_employees.
-- user_id existed but was never written or read. This wires that link up.
--
-- A portal login is a normal users row on a zero-permission "Employee" role, so
-- the existing RBAC guards (require(section, action)) 403 it out of every admin
-- endpoint automatically. The /me/* endpoints don't check section permissions —
-- they resolve the caller to their OWN employee record, so scope is structural,
-- not a WHERE clause someone has to remember.
-- ============================================================================

-- An invite can now be tied to an employee record; accepting it links the login.
alter table auth_tokens
  add column if not exists employee_id uuid references hrms_employees(id) on delete cascade;

-- Resolve "which employee is this logged-in user?" on every self-service call.
create unique index if not exists hrms_employees_user_uniq
  on hrms_employees(user_id) where user_id is not null;
