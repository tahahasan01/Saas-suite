-- ============================================================================
-- Migration 0101 — Probation reviews and appraisals (wave C, H25/H26, St12)
--
--  * hrms_employees.confirmed_on — when probation was confirmed.
--  * hrms_probation_reviews — each decision: confirmed, extended (to a later
--    end date) or ended. Append-only history.
--  * hrms_appraisal_templates (+ _kras) — KRAs with weights totalling 100
--    (checked by the API); replaced as a whole.
--  * hrms_appraisal_cycles — a review period: draft → open → closed. Opening
--    creates one appraisal per chosen employee (all active when none chosen).
--  * hrms_appraisals — one per employee per cycle, reviewed by the manager
--    they had when it opened: self_review → manager_review → done (or
--    cancelled). The score is Σ manager rating × weight / 100, 0–5.
--  * hrms_appraisal_ratings — the template's KRAs copied in, so editing a
--    template never changes an appraisal under way.
-- ============================================================================

alter table hrms_employees add column if not exists confirmed_on date;

create table if not exists hrms_probation_reviews (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  employee_id   uuid not null references hrms_employees(id) on delete cascade,
  outcome       text not null,
  previous_end  date,
  new_end       date,
  note          text not null default '' check (length(note) <= 1000),
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz not null default now(),
  check ((outcome = 'extended') = (new_end is not null)),
  check (new_end is null or previous_end is null or new_end > previous_end)
);
create index if not exists hrms_probation_reviews_emp_idx on hrms_probation_reviews (employee_id, decided_at desc);

create table if not exists hrms_appraisal_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists hrms_appraisal_templates_name_uq
  on hrms_appraisal_templates (tenant_id, lower(btrim(name)));

create table if not exists hrms_appraisal_template_kras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  template_id  uuid not null references hrms_appraisal_templates(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  description  text not null default '' check (length(description) <= 1000),
  weight       int not null check (weight between 1 and 100),
  sort         int not null default 0
);
create index if not exists hrms_appraisal_template_kras_idx on hrms_appraisal_template_kras (template_id, sort);

create table if not exists hrms_appraisal_cycles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  period_start  date not null,
  period_end    date not null,
  template_id   uuid not null references hrms_appraisal_templates(id),
  self_review   boolean not null default true,
  employee_ids  uuid[],                      -- null = every active employee
  status        text not null default 'draft',
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  opened_at     timestamptz,
  closed_at     timestamptz,
  check (period_end >= period_start)
);
create index if not exists hrms_appraisal_cycles_tenant_idx on hrms_appraisal_cycles (tenant_id, status);

create table if not exists hrms_appraisals (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  cycle_id              uuid not null references hrms_appraisal_cycles(id) on delete cascade,
  employee_id           uuid not null references hrms_employees(id) on delete cascade,
  reviewer_id           uuid references hrms_employees(id) on delete set null,
  status                text not null default 'self_review',
  self_comment          text not null default '' check (length(self_comment) <= 4000),
  self_submitted_at     timestamptz,
  manager_comment       text not null default '' check (length(manager_comment) <= 4000),
  manager_submitted_at  timestamptz,
  reviewed_by           uuid references users(id) on delete set null,
  score                 numeric(4,2) check (score between 0 and 5),
  created_at            timestamptz not null default now(),
  unique (cycle_id, employee_id),
  check (reviewer_id is null or reviewer_id <> employee_id),
  check ((status = 'done') = (score is not null))
);
create index if not exists hrms_appraisals_reviewer_idx on hrms_appraisals (reviewer_id) where status = 'manager_review';
create index if not exists hrms_appraisals_employee_idx on hrms_appraisals (employee_id);

create table if not exists hrms_appraisal_ratings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  appraisal_id    uuid not null references hrms_appraisals(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  weight          int not null check (weight between 1 and 100),
  sort            int not null default 0,
  self_rating     int check (self_rating between 1 and 5),
  self_note       text not null default '' check (length(self_note) <= 1000),
  manager_rating  int check (manager_rating between 1 and 5),
  manager_note    text not null default '' check (length(manager_note) <= 1000)
);
create index if not exists hrms_appraisal_ratings_idx on hrms_appraisal_ratings (appraisal_id, sort);

grant select, insert                 on hrms_probation_reviews       to app_user;   -- append-only
grant select, insert, update         on hrms_appraisal_templates     to app_user;
grant select, insert, delete         on hrms_appraisal_template_kras to app_user;   -- replaced as a whole
grant select, insert, update         on hrms_appraisal_cycles        to app_user;
grant select, insert, update         on hrms_appraisals              to app_user;
grant select, insert, update         on hrms_appraisal_ratings       to app_user;

do $$
declare t text;
begin
  foreach t in array array['hrms_probation_reviews','hrms_appraisal_templates','hrms_appraisal_template_kras',
                           'hrms_appraisal_cycles','hrms_appraisals','hrms_appraisal_ratings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_probation_reviews drop constraint if exists hrms_probation_reviews_outcome_check;
alter table hrms_probation_reviews add constraint hrms_probation_reviews_outcome_check
  check (outcome in ('confirmed', 'extended', 'ended'));
alter table hrms_appraisal_cycles drop constraint if exists hrms_appraisal_cycles_status_check;
alter table hrms_appraisal_cycles add constraint hrms_appraisal_cycles_status_check
  check (status in ('draft', 'open', 'closed'));
alter table hrms_appraisals drop constraint if exists hrms_appraisals_status_check;
alter table hrms_appraisals add constraint hrms_appraisals_status_check
  check (status in ('self_review', 'manager_review', 'done', 'cancelled'));

drop trigger if exists audit_confirm on hrms_employees;
create trigger audit_confirm after update on hrms_employees for each row
  execute function audit_row('confirmed_on');
drop trigger if exists audit on hrms_probation_reviews;
create trigger audit after insert on hrms_probation_reviews for each row
  execute function audit_row('employee_id','outcome','previous_end','new_end');
drop trigger if exists audit on hrms_appraisal_cycles;
create trigger audit after insert or update on hrms_appraisal_cycles for each row
  execute function audit_row('name','status','template_id');
drop trigger if exists audit on hrms_appraisals;
create trigger audit after insert or update on hrms_appraisals for each row
  execute function audit_row('employee_id','reviewer_id','status','score');
