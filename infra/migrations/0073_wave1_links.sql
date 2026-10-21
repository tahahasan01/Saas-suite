-- Migration 0073 — Phase 3 Wave 1 integration links
--
-- The six Wave 1 branches were built in parallel; this joins them up:
--  * branch isolation (D-03, 0055's bos_branch_scope) on the new tables:
--    transactional rows need a branch (activities, attendance corrections,
--    payroll runs); org masters are shared unless pinned to a branch
--    (locations, departments, kiosks);
--  * work locations and holiday calendars name their province from
--    pk_regions (0055) instead of a free text code;
--  * an employee document's file_id points at files (0057), tenant-checked.

call bos_branch_scope('activities', true);
call bos_branch_scope('hrms_attendance_corrections', true);
call bos_branch_scope('payroll_runs', true);

call bos_branch_scope('hrms_locations', false);
call bos_branch_scope('hrms_departments', false);
call bos_branch_scope('hrms_kiosks', false);

alter table hrms_locations
  add constraint hrms_locations_province_fk foreign key (province) references pk_regions (code);
alter table hrms_holiday_calendars
  add constraint hrms_holiday_calendars_province_fk foreign key (province) references pk_regions (code);

-- A document row survives its file being garbage-collected or removed:
-- only the link is cleared.
alter table hrms_employee_documents
  add constraint hrms_employee_documents_file_fk
  foreign key (tenant_id, file_id) references files (tenant_id, id) on delete set null (file_id);
