-- ============================================================================
-- Migration 0106 — Promotions and transfers with history (wave C, H30, St12)
--
--  * hrms_job_changes — one change with an effective date: a new job title,
--    department, location, manager and/or salary. The names before and
--    after are kept as text, so renaming a department never rewrites
--    someone's history. scheduled → applied (on the day, by the daily job
--    when it was dated ahead) or cancelled while still scheduled.
--  * scheduled_jobs: hrms.apply_job_changes, daily.
-- ============================================================================

create table if not exists hrms_job_changes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  employee_id      uuid not null references hrms_employees(id) on delete cascade,
  kind             text not null default 'change',
  effective_on     date not null,
  status           text not null default 'scheduled',
  job_title_id     uuid references hrms_job_titles(id) on delete set null,
  department_id    uuid references hrms_departments(id) on delete set null,
  location_id      uuid references hrms_locations(id) on delete set null,
  manager_id       uuid references hrms_employees(id) on delete set null,
  new_base_minor   bigint check (new_base_minor > 0),
  old_base_minor   bigint,
  from_title       text, to_title       text,
  from_department  text, to_department  text,
  from_location    text, to_location    text,
  from_manager     text, to_manager     text,
  note             text not null default '' check (length(note) <= 1000),
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  applied_at       timestamptz,
  check (manager_id is null or manager_id <> employee_id)
);
create index if not exists hrms_job_changes_employee_idx on hrms_job_changes (employee_id, effective_on desc);
create index if not exists hrms_job_changes_due_idx on hrms_job_changes (effective_on) where status = 'scheduled';

grant select, insert, update on hrms_job_changes to app_user;   -- applied or cancelled, never deleted

alter table hrms_job_changes enable row level security;
drop policy if exists tenant_isolation on hrms_job_changes;
create policy tenant_isolation on hrms_job_changes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table hrms_job_changes drop constraint if exists hrms_job_changes_kind_check;
alter table hrms_job_changes add constraint hrms_job_changes_kind_check
  check (kind in ('promotion', 'transfer', 'demotion', 'change'));
alter table hrms_job_changes drop constraint if exists hrms_job_changes_status_check;
alter table hrms_job_changes add constraint hrms_job_changes_status_check
  check (status in ('scheduled', 'applied', 'cancelled'));

drop trigger if exists audit on hrms_job_changes;
create trigger audit after insert or update on hrms_job_changes for each row
  execute function audit_row('employee_id','kind','effective_on','status','job_title_id','department_id',
                             'location_id','manager_id','!new_base_minor');

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('hrms.apply_job_changes', 'Apply promotions and transfers whose day has come', interval '1 day', 600, 5, 6)
on conflict (code) do nothing;
