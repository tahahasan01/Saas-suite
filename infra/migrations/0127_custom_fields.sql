-- ============================================================================
-- Migration 0127 — Custom fields on leads and contacts (wave D, C26)
--
--  * custom_fields: what an admin adds to a lead or a contact: a label, a
--    stable key made from it, and a kind (text, number, date, a choice from
--    a list, yes/no). A field is retired, never deleted, so old values keep
--    their meaning; its kind never changes under existing values.
--  * crm_leads.custom / contacts.custom: the values, by key. The API checks
--    every write against the definitions (app/custom_fields.py); the column
--    only insists on an object.
-- ============================================================================

create table custom_fields (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  entity      text not null,
  key         text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label       text not null check (length(btrim(label)) between 1 and 80),
  kind        text not null,
  options     text[] not null default '{}' check (cardinality(options) <= 50),
  position    int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint custom_fields_entity_check check (entity in ('lead', 'contact')),
  constraint custom_fields_kind_check check (kind in ('text', 'number', 'date', 'select', 'checkbox')),
  unique (tenant_id, entity, key)
);

alter table crm_leads add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object');
alter table contacts add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object');

grant select, insert, update on custom_fields to app_user;

alter table custom_fields enable row level security;
create policy tenant_isolation on custom_fields
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
