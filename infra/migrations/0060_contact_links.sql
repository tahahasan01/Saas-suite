-- ============================================================================
-- Migration 0060 — Leads and sales point at contacts (St02 P0, D-31, §7.1)
--  * crm_leads.contact_id: null until the lead is qualified (Qualify links an
--    existing contact or creates one; the backfill does it for old leads).
--  * pos_sales.contact_id: null for a walk-in.
--  * contact_review_items: leads the backfill would not link on its own — a
--    number shared by more than the threshold, or the same number under a
--    different name. A person resolves each one (Qualify) or dismisses it.
-- Every column that references contacts must be registered with the merge
-- re-pointer (app/contact_merge.py); tests/crm/test_contact_merge.py fails
-- otherwise (St02 risk 8).
-- ============================================================================

alter table crm_leads add column contact_id uuid references contacts(id);
create index crm_leads_contact_idx on crm_leads (contact_id) where contact_id is not null;

alter table pos_sales add column contact_id uuid references contacts(id);
create index pos_sales_contact_idx on pos_sales (contact_id, created_at desc) where contact_id is not null;

create table contact_review_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  lead_id             uuid not null references crm_leads(id) on delete cascade,
  reason              text not null,
  match_key           text not null default '',
  status              text not null default 'open',
  resolved_contact_id uuid references contacts(id),
  resolved_by         uuid references users(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint contact_review_items_reason_check check (reason in ('shared_phone', 'name_mismatch')),
  constraint contact_review_items_status_check check (status in ('open', 'resolved', 'dismissed'))
);
-- A lead is reviewed once: the backfill skips leads that were ever queued.
create unique index contact_review_items_lead_key on contact_review_items (tenant_id, lead_id);
create index contact_review_items_open_idx on contact_review_items (tenant_id, created_at) where status = 'open';
create index contact_review_items_contact_idx on contact_review_items (resolved_contact_id)
  where resolved_contact_id is not null;

grant select, insert, update on contact_review_items to app_user;
alter table contact_review_items enable row level security;
create policy tenant_isolation on contact_review_items
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
