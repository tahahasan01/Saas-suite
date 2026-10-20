-- ============================================================================
-- Migration 0042 — Check constraints for enum-like columns (TR-API-05, P1-5)
--
-- The API refuses unknown values with a 422 (Literal types in app/models.py).
-- The database now refuses them too, so a job, a script or a future endpoint
-- that skips the model still can't store one. Each constraint is named
-- <table>_<column>_check and lists exactly the model's values;
-- tests/core/test_enum_checks.py reads them back and compares.
--
-- Added NOT VALID, then validated. A database holding legacy rows outside the
-- list (written before the API checked) keeps the constraint for every new
-- write and reports the table in a NOTICE instead of failing the migration;
-- clean those rows, then `alter table ... validate constraint ...`.
--
-- Deliberately unchecked: crm_leads.source (CSV imports carry the file's own
-- source names) and notifications.kind (a workflow action may name its own).
-- ============================================================================

create or replace function pg_temp.enum_check(tbl text, col text, vals text[], nullable boolean default false)
returns void language plpgsql as
$$
declare
  cname text := tbl || '_' || col || '_check';
  expr  text := format('%I in (%s)', col,
                       (select string_agg(quote_literal(v), ', ') from unnest(vals) v));
begin
  execute format('alter table %I drop constraint if exists %I', tbl, cname);
  if nullable then
    expr := format('%I is null or ', col) || expr;
  end if;
  execute format('alter table %I add constraint %I check (%s) not valid', tbl, cname, expr);
  begin
    execute format('alter table %I validate constraint %I', tbl, cname);
  exception when check_violation then
    raise notice '% left NOT VALID: existing rows hold values outside %', cname, vals;
  end;
end
$$;

select pg_temp.enum_check('pos_sales',            'payment_method', array['cash','card','jazzcash','easypaisa','bank']);
select pg_temp.enum_check('pos_drawers',          'status',         array['open','closed']);
select pg_temp.enum_check('pos_purchase_orders',  'status',         array['ordered','received','cancelled']);
select pg_temp.enum_check('pos_fbr_invoices',     'status',         array['pending','sending','submitted','failed']);
select pg_temp.enum_check('fbr_settings',         'environment',    array['sandbox','production']);

select pg_temp.enum_check('hrms_leave_requests',  'leave_type',     array['annual','sick','casual','unpaid']);
select pg_temp.enum_check('hrms_leave_requests',  'request_type',   array['leave','wfh']);
select pg_temp.enum_check('hrms_leave_requests',  'status',         array['pending','approved','rejected']);
select pg_temp.enum_check('hrms_attendance',      'status',         array['present','late','absent','leave']);
select pg_temp.enum_check('hrms_attendance',      'method',         array['web','mobile','biometric','qr','self']);
select pg_temp.enum_check('hrms_attendance',      'fraud_flag',     array['','mock_gps','vpn','face_mismatch']);
select pg_temp.enum_check('hrms_employees',       'status',         array['active','inactive']);

select pg_temp.enum_check('crm_interactions',     'channel',        array['call','whatsapp','email','note','bot']);
select pg_temp.enum_check('crm_interactions',     'outcome',        array['interested','not_interested','callback','busy'], true);
select pg_temp.enum_check('crm_stages',           'kind',           array['active','won','lost']);
select pg_temp.enum_check('crm_invoice_requests', 'status',         array['pending','approved','rejected']);

select pg_temp.enum_check('users',                'status',         array['active','disabled']);
select pg_temp.enum_check('workflows',            'trigger',        array['lead.created','lead.stage_changed','interaction.logged']);
