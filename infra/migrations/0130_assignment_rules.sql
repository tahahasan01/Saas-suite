-- ============================================================================
-- Migration 0130 — Lead assignment rules by source and area (wave D, C13)
--
--  * crm_assignment_rules: an ordered list. A rule matches a new unowned
--    lead by its source and/or city (case and spaces ignored) and hands it,
--    in turn, to its own people. They must be in the lead pool, so its daily
--    caps, pausing and leave still apply; when none of them can take the
--    lead, the next rule, then the whole pool, decides. Replaced wholesale
--    from the settings screen.
--  * crm_leads.city: where the lead is, as a web form asked it (it was asked
--    and dropped until now). Area rules read it.
-- ============================================================================

create table crm_assignment_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  position    int not null check (position >= 0),
  name        text not null check (length(btrim(name)) between 1 and 80),
  source      text check (length(source) <= 60),
  city        text check (length(city) <= 80),
  user_ids    uuid[] not null check (cardinality(user_ids) between 1 and 50),
  created_at  timestamptz not null default now(),
  constraint crm_assignment_rules_match_check check (source is not null or city is not null)
);
create index crm_assignment_rules_tenant_idx on crm_assignment_rules (tenant_id, position);

alter table crm_leads add column city text check (length(city) <= 80);

-- Replaced wholesale (delete + insert), never updated in place.
grant select, insert, delete on crm_assignment_rules to app_user;

alter table crm_assignment_rules enable row level security;
create policy tenant_isolation on crm_assignment_rules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
