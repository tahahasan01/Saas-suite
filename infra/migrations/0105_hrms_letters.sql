-- ============================================================================
-- Migration 0105 — HR letters and letter requests (wave C, H17/H37, St12)
--
--  * hrms_letter_templates — text with {{placeholders}} from a fixed list
--    (checked by the API), per kind of letter.
--  * hrms_letters — one issued letter: the text exactly as issued and a
--    number (HR-<year>-0001, per company). Never changed afterwards.
--  * hrms_letter_requests — an employee asking for a letter (or an ID card)
--    on /me; HR issues it (linking the letter) or declines with a reason.
-- ============================================================================

create table if not exists hrms_letter_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null,
  name        text not null check (length(btrim(name)) between 1 and 120),
  title       text not null check (length(btrim(title)) between 1 and 160),
  body        text not null check (length(body) between 1 and 20000),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists hrms_letter_templates_name_uq
  on hrms_letter_templates (tenant_id, lower(btrim(name)));

create table if not exists hrms_letter_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  employee_id   uuid not null references hrms_employees(id) on delete cascade,
  kind          text not null,
  purpose       text not null default '' check (length(purpose) <= 500),
  status        text not null default 'pending',
  letter_id     uuid,
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  note          text not null default '' check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  check (status <> 'declined' or length(btrim(note)) > 0)
);
create index if not exists hrms_letter_requests_tenant_idx on hrms_letter_requests (tenant_id, status, created_at desc);

create table if not exists hrms_letters (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  employee_id  uuid not null references hrms_employees(id) on delete cascade,
  template_id  uuid references hrms_letter_templates(id) on delete set null,
  request_id   uuid references hrms_letter_requests(id) on delete set null,
  kind         text not null,
  number       text not null,
  title        text not null,
  body         text not null,
  issued_by    uuid references users(id) on delete set null,
  issued_at    timestamptz not null default now()
);
create unique index if not exists hrms_letters_number_uq on hrms_letters (tenant_id, number);
create index if not exists hrms_letters_employee_idx on hrms_letters (employee_id, issued_at desc);
alter table hrms_letter_requests drop constraint if exists hrms_letter_requests_letter_fk;
alter table hrms_letter_requests add constraint hrms_letter_requests_letter_fk
  foreign key (letter_id) references hrms_letters(id) on delete set null;

grant select, insert, update on hrms_letter_templates to app_user;
grant select, insert, update on hrms_letter_requests  to app_user;   -- answered, never deleted
grant select, insert         on hrms_letters          to app_user;   -- issued letters never change

do $$
declare t text;
begin
  foreach t in array array['hrms_letter_templates','hrms_letter_requests','hrms_letters']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_letter_templates drop constraint if exists hrms_letter_templates_kind_check;
alter table hrms_letter_templates add constraint hrms_letter_templates_kind_check
  check (kind in ('offer', 'appointment', 'experience', 'salary', 'noc', 'employment', 'relieving', 'warning', 'other'));
alter table hrms_letters drop constraint if exists hrms_letters_kind_check;
alter table hrms_letters add constraint hrms_letters_kind_check
  check (kind in ('offer', 'appointment', 'experience', 'salary', 'noc', 'employment', 'relieving', 'warning', 'other'));
alter table hrms_letter_requests drop constraint if exists hrms_letter_requests_kind_check;
alter table hrms_letter_requests add constraint hrms_letter_requests_kind_check
  check (kind in ('experience', 'salary', 'noc', 'employment', 'id_card', 'other'));
alter table hrms_letter_requests drop constraint if exists hrms_letter_requests_status_check;
alter table hrms_letter_requests add constraint hrms_letter_requests_status_check
  check (status in ('pending', 'issued', 'declined'));

drop trigger if exists audit on hrms_letter_templates;
create trigger audit after insert or update on hrms_letter_templates for each row
  execute function audit_row('kind','name','title','active');
drop trigger if exists audit on hrms_letters;
create trigger audit after insert on hrms_letters for each row
  execute function audit_row('employee_id','kind','number','template_id');
drop trigger if exists audit on hrms_letter_requests;
create trigger audit after insert or update on hrms_letter_requests for each row
  execute function audit_row('employee_id','kind','status','letter_id');
