-- ============================================================================
-- Migration 0020 — AI views for POS and HRMS
--
-- The differentiator, made real. The AI could previously only see CRM, so
-- "Ask anything about your business" could not answer anything about sales,
-- stock or staff.
--
-- This is the one thing the category leaders structurally cannot do: Salesforce
-- cannot see your stock, Square cannot see your staff. They are separate
-- products with separate databases. Here it is one schema, so one question can
-- cross all three — "did my best salesperson come in today", "how does revenue
-- compare to payroll".
--
-- Every view is security_invoker so RLS still applies to the AI exactly as it
-- does to a user. Money is exposed in rupees, never minor units, so the model
-- cannot be off by 100x. PII the AI has no business reading (CNIC, salary of
-- individuals) is deliberately excluded.
-- ============================================================================

-- ── POS ─────────────────────────────────────────────────────────────────────
create or replace view ai_v_sales with (security_invoker = true) as
  select s.id,
         (s.total_minor / 100.0)    as total,
         (s.discount_minor / 100.0) as discount,
         (s.tax_minor / 100.0)      as tax,
         s.payment_method, s.item_count,
         u.name as cashier,
         s.created_at,
         s.created_at::date as sale_date
  from pos_sales s
  left join users u on u.id = s.cashier_id;

create or replace view ai_v_sale_items with (security_invoker = true) as
  select i.id, i.name as product, i.qty,
         (i.price_minor / 100.0)      as unit_price,
         (i.line_total_minor / 100.0) as line_total,
         s.created_at::date as sale_date,
         u.name as cashier
  from pos_sale_items i
  join pos_sales s on s.id = i.sale_id
  left join users u on u.id = s.cashier_id;

create or replace view ai_v_products with (security_invoker = true) as
  select p.id, p.name, p.sku, p.barcode, p.category, p.unit,
         (p.price_minor / 100.0) as price,
         p.stock_qty, p.low_stock_at,
         (p.low_stock_at > 0 and p.stock_qty <= p.low_stock_at) as is_low_stock,
         p.active
  from pos_products p;

create or replace view ai_v_returns with (security_invoker = true) as
  select r.id, (r.refund_minor / 100.0) as refund, r.reason,
         r.created_at::date as return_date, u.name as cashier
  from pos_returns r
  left join users u on u.id = r.cashier_id;

-- ── HRMS ────────────────────────────────────────────────────────────────────
-- No CNIC and no individual salary: the AI answers operational questions, and
-- a natural-language interface is the last place personal pay data should leak.
create or replace view ai_v_employees with (security_invoker = true) as
  select e.id, e.name, e.designation, e.department, e.join_date, e.status
  from hrms_employees e;

create or replace view ai_v_attendance with (security_invoker = true) as
  select a.id, e.name as employee, e.department,
         a.work_date, a.check_in, a.check_out, a.status
  from hrms_attendance a
  join hrms_employees e on e.id = a.employee_id;

create or replace view ai_v_leave with (security_invoker = true) as
  select l.id, e.name as employee, e.department,
         l.request_type, l.leave_type, l.from_date, l.to_date, l.status
  from hrms_leave_requests l
  join hrms_employees e on e.id = l.employee_id;

grant select on ai_v_sales, ai_v_sale_items, ai_v_products, ai_v_returns,
                ai_v_employees, ai_v_attendance, ai_v_leave to app_user;
