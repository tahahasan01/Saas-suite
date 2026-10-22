-- ============================================================================
-- Migration 0126 — Bulk and recurring invoices: fee vouchers (PRD INV-08;
-- research sweep 2026-10-23)
--
--  * invoice_plans: what to bill (lines), whom (everyone with a tag, or a
--    saved list from 0124), when it falls due (a day of the month) and, if
--    it repeats, on which day of the month the drafts are made.
--  * invoice_runs: one billing of a plan for one month. Making a run creates
--    a draft invoice per contact (the lines priced by the one pricing
--    function, D-21) for review; issuing the run issues every draft that is
--    still a draft, each taking its own gap-free number (D-06). One run per
--    plan and month, so a repeated click or a retried job can't bill twice.
--  * invoices.run_id: which run made the invoice.
--  * The daily job invoicing.recurring_runs makes this month's drafts for
--    plans whose day has come, and tells whoever set the plan up.
-- ============================================================================

create table invoice_plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  lines         jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 50),
  tag_id        uuid references tags(id) on delete set null,
  segment_id    uuid references crm_segments(id) on delete set null,
  due_day       smallint not null default 10 check (due_day between 1 and 28),
  run_day       smallint check (run_day between 1 and 28),       -- null: made by hand only
  notes         text not null default '' check (length(notes) <= 4000),
  active        boolean not null default true,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint invoice_plans_audience_check check ((tag_id is null) <> (segment_id is null) or not active)
);

create table invoice_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  plan_id       uuid not null references invoice_plans(id) on delete cascade,
  period        date not null check (extract(day from period) = 1),
  status        text not null default 'draft',
  invoice_count int not null default 0,
  total_minor   bigint not null default 0,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  issued_by     uuid references users(id) on delete set null,
  issued_at     timestamptz,
  constraint invoice_runs_status_check check (status in ('draft', 'issued')),
  unique (plan_id, period),
  unique (tenant_id, id)
);

alter table invoices add column run_id uuid references invoice_runs(id) on delete set null;
create index invoices_run_idx on invoices (run_id) where run_id is not null;

grant select, insert, update on invoice_plans to app_user;
grant select, insert, update on invoice_runs to app_user;

do $$
declare t text;
begin
  foreach t in array array['invoice_plans', 'invoice_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('invoicing.recurring_runs', 'Make this month''s draft invoices for recurring billing plans',
   interval '1 day', 900, 5, 5)
on conflict (code) do nothing;
