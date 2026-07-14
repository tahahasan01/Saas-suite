-- ============================================================================
-- Migration 0018 — Work-from-home requests
--
-- WFH shares the request/approval machinery with leave but is NOT leave: the
-- employee is working. It therefore counts as PRESENT in payroll and must never
-- be deducted. Modelling it as a leave_type would have silently docked pay for
-- every remote day once absence became a real calculation (see 0016).
-- ============================================================================

alter table hrms_leave_requests
  add column if not exists request_type text not null default 'leave';  -- leave | wfh

create index if not exists hrms_leave_type_idx
  on hrms_leave_requests(tenant_id, request_type, status);
