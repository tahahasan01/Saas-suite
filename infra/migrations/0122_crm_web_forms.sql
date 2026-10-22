-- ============================================================================
-- Migration 0122 — Web lead forms and lead assignment (wave D, C12/C13; study 12 §1)
--
--  * crm_web_forms: a form on a hosted page (/f/{public_id}) the business
--    links from its website, Facebook page or WhatsApp profile. Everything
--    about the lead it makes (pipeline, stage, source, owner) comes from the
--    form row, never from the visitor. public_id is not a secret (it is
--    published), so it only reaches this form's public description and its
--    submit endpoint.
--  * fields: which of a fixed set the form asks for (name is always asked).
--  * daily_cap: a flood guard. Past it the form refuses more submissions
--    for the day instead of filling the pipeline with junk.
--  * crm_leads gains where it came from: the form and the UTM tags of the
--    link the visitor followed.
--  * crm_assignment_pool: who takes new unowned leads (web forms today), in
--    turn (round-robin), each with an optional daily cap and a pause switch.
--    People on approved leave today are skipped (when they are linked to an
--    employee). The per-day count lives on the row so taking a turn is one
--    locked update.
-- ============================================================================

create table crm_web_forms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  public_id     text not null unique check (public_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  name          text not null check (length(btrim(name)) between 1 and 120),
  title         text not null default '' check (length(title) <= 160),
  intro         text not null default '' check (length(intro) <= 1000),
  thank_you     text not null default '' check (length(thank_you) <= 500),
  fields        text[] not null default array['phone', 'email', 'message'],
  pipeline_id   uuid references crm_pipelines(id) on delete set null,
  stage_id      uuid references crm_stages(id) on delete set null,
  source        text not null default 'web form' check (length(btrim(source)) between 1 and 60),
  owner_id      uuid references users(id) on delete set null,   -- null: the assignment pool decides
  daily_cap     int not null default 200 check (daily_cap between 1 and 10000),
  active        boolean not null default true,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crm_web_forms_fields_check
    check (fields <@ array['phone', 'email', 'company', 'city', 'message']::text[])
);
create index crm_web_forms_tenant_idx on crm_web_forms (tenant_id);

alter table crm_leads
  add column web_form_id  uuid references crm_web_forms(id) on delete set null,
  add column utm_source   text check (length(utm_source) <= 100),
  add column utm_medium   text check (length(utm_medium) <= 100),
  add column utm_campaign text check (length(utm_campaign) <= 100),
  add column message      text check (length(message) <= 2000);
create index crm_leads_web_form_idx on crm_leads (web_form_id, created_at) where web_form_id is not null;

create table crm_assignment_pool (
  tenant_id        uuid not null references tenants(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  active           boolean not null default true,
  daily_cap        int check (daily_cap between 1 and 1000),       -- null: no cap
  last_assigned_at timestamptz,
  assigned_day     date,
  assigned_today   int not null default 0 check (assigned_today >= 0),
  primary key (tenant_id, user_id)
);

-- Forms are switched off, never deleted (leads point at them); pool members
-- are added and removed.
grant select, insert, update on crm_web_forms to app_user;
grant select, insert, update, delete on crm_assignment_pool to app_user;

do $$
declare t text;
begin
  foreach t in array array['crm_web_forms', 'crm_assignment_pool'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
