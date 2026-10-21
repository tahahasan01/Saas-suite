-- ============================================================================
-- Migration 0057 — Files and tenant branding Level 1 (D-12, D-14, 3A)
--
--  * files            one row per upload; the blob lives in object storage
--                     (app/storage.py) under t/{tenant}/{sha[:2]}/{sha}, so
--                     identical uploads in a tenant share a blob and nothing
--                     is shared across tenants. entity/entity_id/field name
--                     the owning record; null = a draft, deleted by the
--                     daily files.gc job after 24 hours (from draft_since,
--                     else created_at). mime is the sniffed type, never what
--                     the client claimed.
--  * tenant_branding  logo (a file), primary/accent colours, receipt /
--                     invoice / payslip headers and footers, receipt paper
--                     width, document layout. `version` busts caches.
--  * files.gc         registered with the worker (jobs.HANDLERS).
-- ============================================================================

create table if not exists files (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    bigint not null check (size_bytes > 0),
  mime          text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf',
                  'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  original_name text not null default '' check (length(original_name) <= 255),
  storage_key   text not null,
  entity        text,
  entity_id     text,
  field         text,
  visibility    text not null default 'private' check (visibility in ('private', 'public')),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  draft_since   timestamptz,
  unique (tenant_id, id),
  constraint files_owner_complete check ((entity is null) = (entity_id is null))
);
create index if not exists files_storage_key on files (storage_key);
create index if not exists files_tenant_sha on files (tenant_id, sha256);
create index if not exists files_entity on files (tenant_id, entity, entity_id) where entity is not null;
create index if not exists files_drafts on files ((coalesce(draft_since, created_at))) where entity is null;

create table if not exists tenant_branding (
  tenant_id        uuid primary key references tenants(id) on delete cascade,
  logo_file_id     uuid,
  primary_color    text check (primary_color ~ '^#[0-9a-f]{6}$'),
  accent_color     text check (accent_color ~ '^#[0-9a-f]{6}$'),
  receipt_header   text not null default '' check (length(receipt_header) <= 500),
  receipt_footer   text not null default '' check (length(receipt_footer) <= 500),
  invoice_header   text not null default '' check (length(invoice_header) <= 1000),
  invoice_footer   text not null default '' check (length(invoice_footer) <= 1000),
  payslip_header   text not null default '' check (length(payslip_header) <= 500),
  receipt_width_mm smallint not null default 80 check (receipt_width_mm in (58, 80)),
  layout           text not null default 'classic' check (layout in ('classic', 'compact', 'bold')),
  version          int not null default 1,
  updated_at       timestamptz not null default now(),
  -- the logo must be a file of the same tenant; deleting it just clears the logo
  foreign key (tenant_id, logo_file_id) references files (tenant_id, id) on delete set null (logo_file_id)
);

grant select, insert, update on files           to app_user;   -- deletes are the GC's (owner)
grant select, insert, update on tenant_branding to app_user;

do $$
declare t text;
begin
  foreach t in array array['files', 'tenant_branding']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

create trigger audit after insert or update or delete on tenant_branding for each row
  execute function audit_row('logo_file_id', 'primary_color', 'accent_color', 'receipt_header', 'receipt_footer',
                             'invoice_header', 'invoice_footer', 'payslip_header', 'receipt_width_mm', 'layout');

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('files.gc', 'Delete stale draft uploads and blobs no file points at', interval '1 day', 1800, 5, 8)
on conflict (code) do nothing;
