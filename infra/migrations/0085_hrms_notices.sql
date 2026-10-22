-- ============================================================================
-- Migration 0085 — Notice board and policy acknowledgement (wave A, H18/H19, St10)
--
--  * hrms_notices — a notice (title, body, an optional attachment through
--    `files`), for everyone, one department or one location. A notice that
--    `requires_ack` is a policy: each employee in its audience confirms they
--    have read it. Pinned notices stay on top; archiving takes it off the
--    board (rows are kept, so who acknowledged what stays provable).
--  * hrms_notice_acks — who acknowledged which notice, and when. Append-only:
--    an acknowledgement is never edited or removed.
-- ============================================================================

create table if not exists hrms_notices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 160),
  body          text not null default '' check (length(body) <= 10000),
  requires_ack  boolean not null default false,
  audience      text not null default 'all',
  department_id uuid references hrms_departments(id) on delete set null,
  location_id   uuid references hrms_locations(id) on delete set null,
  file_id       uuid,                                   -- claimed through files (entity hrms_notice)
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  archived_at   timestamptz,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (audience <> 'department' or department_id is not null),
  check (audience <> 'location' or location_id is not null)
);
create index if not exists hrms_notices_board_idx on hrms_notices (tenant_id, pinned desc, published_at desc)
  where archived_at is null;

create table if not exists hrms_notice_acks (
  tenant_id       uuid not null references tenants(id) on delete cascade,
  notice_id       uuid not null references hrms_notices(id) on delete cascade,
  employee_id     uuid not null references hrms_employees(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (notice_id, employee_id)
);
create index if not exists hrms_notice_acks_tenant_idx on hrms_notice_acks (tenant_id, employee_id);

-- ── Grants and RLS (0032: nothing is granted by default) ────────────────────
grant select, insert, update on hrms_notices     to app_user;   -- archived, never deleted
grant select, insert         on hrms_notice_acks to app_user;   -- append-only

do $$
declare t text;
begin
  foreach t in array array['hrms_notices','hrms_notice_acks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_notices drop constraint if exists hrms_notices_audience_check;
alter table hrms_notices add constraint hrms_notices_audience_check
  check (audience in ('all', 'department', 'location'));

-- ── Audit: a policy's wording and audience are evidence (what was acknowledged)
drop trigger if exists audit on hrms_notices;
create trigger audit after insert or update on hrms_notices for each row
  execute function audit_row('title','body','requires_ack','audience','department_id','location_id','file_id',
                             'pinned','archived_at');
