-- ============================================================================
-- Migration 0124 — Consent, segments, templates and email campaigns
--                  (wave D, C19/C20/C22; study 12 §5)
--
--  * contact_consents: per contact and channel, opted in or out, with where
--    it came from. No row means we don't know, and a marketing message needs
--    an opt-in; an opt-out always wins. Transactional messages (invoices,
--    reminders) don't read this.
--  * crm_segments: a saved list of contacts as a structured filter from a
--    fixed allow-list (tags, kind, roles, city, has email), compiled to
--    parameterised SQL under RLS; evaluated when used, so it stays current.
--  * crm_templates: a subject and body with merge tokens from a fixed list
--    ({{first_name|Customer}} and friends), checked when saved.
--  * crm_campaigns: a template sent to a segment on a channel (email now;
--    SMS and WhatsApp when their senders exist). Sending snapshots the
--    wording and writes one crm_campaign_recipients row per contact: queued
--    with its outbox row, or skipped with the reason. A contact gets a
--    campaign once.
--  * crm_settings gains the most marketing emails a tenant may queue a day.
-- ============================================================================

create table contact_consents (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  channel     text not null,
  status      text not null,
  source      text not null default '' check (length(source) <= 120),
  updated_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (contact_id, channel),
  constraint contact_consents_channel_check check (channel in ('email', 'sms', 'whatsapp')),
  constraint contact_consents_status_check check (status in ('opted_in', 'opted_out'))
);
create index contact_consents_tenant_idx on contact_consents (tenant_id);

create table crm_segments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  filter      jsonb not null default '{}' check (jsonb_typeof(filter) = 'object'),
  archived_at timestamptz,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table crm_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  channel     text not null default 'email',
  subject     text not null default '' check (length(subject) <= 200),
  body        text not null check (length(body) between 1 and 10000),
  archived_at timestamptz,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_templates_channel_check check (channel in ('email', 'sms', 'whatsapp'))
);

create table crm_campaigns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  channel       text not null default 'email',
  segment_id    uuid not null references crm_segments(id),
  template_id   uuid not null references crm_templates(id),
  status        text not null default 'draft',
  subject       text,                 -- the wording as sent
  body          text,
  queued_count  int not null default 0,
  skipped_count int not null default 0,
  created_by    uuid references users(id) on delete set null,
  sent_by       uuid references users(id) on delete set null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crm_campaigns_channel_check check (channel in ('email', 'sms', 'whatsapp')),
  constraint crm_campaigns_status_check check (status in ('draft', 'sent', 'cancelled')),
  unique (tenant_id, id)
);

create table crm_campaign_recipients (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  campaign_id  uuid not null,
  contact_id   uuid not null references contacts(id) on delete cascade,
  address      text not null default '',
  status       text not null,
  skip_reason  text,
  outbox_id    bigint,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, contact_id),
  foreign key (tenant_id, campaign_id) references crm_campaigns (tenant_id, id) on delete cascade,
  constraint crm_campaign_recipients_status_check check (status in ('queued', 'skipped')),
  constraint crm_campaign_recipients_skip_check
    check (skip_reason is null or skip_reason in ('no_address', 'no_consent', 'opted_out', 'daily_cap'))
);
create index crm_campaign_recipients_contact_idx on crm_campaign_recipients (contact_id);

alter table crm_settings
  add column campaign_daily_cap int not null default 500 check (campaign_daily_cap between 0 and 100000);

grant select, insert, update on contact_consents to app_user;
grant select, insert, update on crm_segments to app_user;
grant select, insert, update on crm_templates to app_user;
grant select, insert, update on crm_campaigns to app_user;
grant select, insert on crm_campaign_recipients to app_user;

do $$
declare t text;
begin
  foreach t in array array['contact_consents', 'crm_segments', 'crm_templates', 'crm_campaigns',
                           'crm_campaign_recipients'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
