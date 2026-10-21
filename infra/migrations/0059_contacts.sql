-- ============================================================================
-- Migration 0059 — Contacts (D-30, D-33, St02 §6.1/§6.2)
-- One table of people and companies shared by CRM, POS and invoicing. The
-- module is `contacts`; the UI label comes from terminology (Customers,
-- Students, Patients...).
--
--  * kind person|company, one level: a person may belong to one company;
--    companies never nest (no recursive commercial-entity logic).
--  * phone_raw is what was typed; phone_e164 is the matching key from
--    app/phone.py and is deliberately NOT unique (families, shop landlines,
--    one parent for several students). Same for email_normalized.
--  * Never hard-deleted: archived_at hides a contact, merged_into_id points a
--    merged-away contact at the one that won (soft merge, D-33).
--  * created_by_migration marks rows made by the leads backfill, so the
--    rollback in docs §7.1 can find exactly those.
-- ============================================================================

create table contacts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  kind                 text not null default 'person',
  company_id           uuid references contacts(id),
  name                 text not null,
  company_name         text not null default '',    -- free text when no company contact exists
  job_title            text not null default '',
  phone_raw            text not null default '',
  phone_e164           text,
  email                text not null default '',
  email_normalized     text,
  ntn                  text not null default '',
  strn                 text not null default '',
  city                 text not null default '',
  roles                text[] not null default '{}',
  source               text not null default '',
  notes                text not null default '',
  owner_id             uuid references users(id) on delete set null,
  archived_at          timestamptz,
  merged_into_id       uuid references contacts(id),
  merged_at            timestamptz,
  created_by_migration boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint contacts_kind_check check (kind in ('person', 'company')),
  constraint contacts_roles_check check (roles <@ array['customer', 'supplier', 'patient', 'student',
                                                         'parent', 'partner']::text[]),
  constraint contacts_company_is_for_people check (company_id is null or kind = 'person'),
  constraint contacts_not_own_company check (company_id is null or company_id <> id),
  constraint contacts_not_merged_into_self check (merged_into_id is null or merged_into_id <> id),
  constraint contacts_merged_is_archived check (merged_into_id is null or archived_at is not null)
);
-- Match keys: never unique, always per tenant (St02 §6.1 indexes).
create index contacts_phone_idx on contacts (tenant_id, phone_e164) where phone_e164 is not null;
create index contacts_email_idx on contacts (tenant_id, email_normalized) where email_normalized is not null;
create index contacts_ntn_idx on contacts (tenant_id, ntn) where ntn <> '';
create index contacts_company_idx on contacts (company_id) where company_id is not null;
create index contacts_merged_into_idx on contacts (merged_into_id) where merged_into_id is not null;
create index contacts_owner_idx on contacts (owner_id) where owner_id is not null;
create index contacts_list_idx on contacts (tenant_id, name, id) where archived_at is null;
create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);

-- One level: a person's company must be a company that itself has no
-- company. Runs as the caller, so under RLS another tenant's company is
-- simply not found.
create or replace function contacts_check_company() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare parent record;
begin
  if new.company_id is null then
    return new;
  end if;
  select kind, company_id into parent from contacts where id = new.company_id;
  if not found then
    raise exception 'company % not found', new.company_id using errcode = 'foreign_key_violation';
  end if;
  if parent.kind <> 'company' then
    raise exception 'a contact can only belong to a company' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger contacts_company_level before insert or update of company_id on contacts
  for each row execute function contacts_check_company();

create table contact_addresses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  kind        text not null default 'billing',
  line1       text not null default '',
  line2       text not null default '',
  city        text not null default '',
  province    text not null default '',
  postal_code text not null default '',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint contact_addresses_kind_check check (kind in ('billing', 'shipping', 'other'))
);
create index contact_addresses_contact_idx on contact_addresses (contact_id);
create index contact_addresses_tenant_idx on contact_addresses (tenant_id);

-- Tags are shared by records of several kinds; record_tags is the join.
create table tags (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  color      text not null default 'slate',
  created_at timestamptz not null default now(),
  constraint tags_color_check check (color in ('slate', 'teal', 'amber', 'rose', 'violet', 'sky', 'lime'))
);
create unique index tags_name_key on tags (tenant_id, lower(name));

create table record_tags (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (tag_id, entity_type, entity_id),
  constraint record_tags_entity_type_check check (entity_type in ('contact', 'lead'))
);
create index record_tags_entity_idx on record_tags (tenant_id, entity_type, entity_id);

-- Grants: exactly the verbs the app uses (0032 removed default privileges).
-- Contacts are archived, never deleted.
grant select, insert, update on contacts to app_user;
grant select, insert, update, delete on contact_addresses, tags to app_user;
grant select, insert, delete on record_tags to app_user;

do $$
declare t text;
begin
  foreach t in array array['contacts', 'contact_addresses', 'tags', 'record_tags']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- People data: field diffs go to the audit log (D-07, TR-SEC-60).
create trigger audit after insert or update or delete on contacts for each row
  execute function audit_row('kind', 'company_id', 'name', 'phone_raw', 'email', 'ntn', 'strn',
                             'owner_id', 'archived_at', 'merged_into_id');

-- Labels for the module, per industry (scripts/seed.py holds the same rows).
insert into terminology (industry_type, key, locale, label) values
  ('retail', 'contact', 'en', 'Customer'),          ('retail', 'contacts', 'en', 'Customers'),
  ('restaurant', 'contact', 'en', 'Guest'),         ('restaurant', 'contacts', 'en', 'Guests'),
  ('pharmacy', 'contact', 'en', 'Patient'),         ('pharmacy', 'contacts', 'en', 'Patients'),
  ('wholesale', 'contact', 'en', 'Customer'),       ('wholesale', 'contacts', 'en', 'Customers'),
  ('education', 'contact', 'en', 'Student'),        ('education', 'contacts', 'en', 'Students'),
  ('b2b_software', 'contact', 'en', 'Client'),      ('b2b_software', 'contacts', 'en', 'Clients'),
  ('real_estate', 'contact', 'en', 'Client'),       ('real_estate', 'contacts', 'en', 'Clients')
on conflict (industry_type, key, locale) do nothing;
