-- ============================================================================
-- Migration 0061 — Invoices bill a contact (St02 P0, §7.1)
--  * contact_id is who the invoice is for; it is REQUIRED on every request
--    created from now on (trigger below).
--  * lead_id becomes optional: an invoice may come from a deal or straight
--    from a contact (a walk-in wholesale order, a repeat customer).
--  * Requests raised before 0061 get their lead's contact where the lead has
--    one (here, and again whenever the backfill or Qualify links the lead).
--    Those whose lead has no contact keep contact_id null and still list,
--    approve and print under the lead's name. A CHECK can't express "required
--    for new rows only" (NOT VALID checks still fire on every UPDATE, which
--    would block approving an old request), hence the trigger.
--  * An invoice is a money record: deleting its lead no longer deletes it.
-- ============================================================================

alter table crm_invoice_requests add column contact_id uuid references contacts(id);
alter table crm_invoice_requests alter column lead_id drop not null;
alter table crm_invoice_requests drop constraint crm_invoice_requests_lead_id_fkey;
alter table crm_invoice_requests add constraint crm_invoice_requests_lead_id_fkey
  foreign key (lead_id) references crm_leads(id) on delete set null;
create index invoice_req_contact_idx on crm_invoice_requests (contact_id) where contact_id is not null;

update crm_invoice_requests i set contact_id = l.contact_id
  from crm_leads l
 where l.id = i.lead_id and i.contact_id is null and l.contact_id is not null;

create or replace function crm_invoice_requests_need_contact() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.contact_id is null and (tg_op = 'INSERT' or old.contact_id is not null) then
    raise exception 'an invoice request needs a contact (contact_id)' using errcode = 'not_null_violation';
  end if;
  return new;
end $$;
create trigger crm_invoice_requests_contact before insert or update of contact_id on crm_invoice_requests
  for each row execute function crm_invoice_requests_need_contact();

-- The audit trigger now records who is billed too.
drop trigger audit on crm_invoice_requests;
create trigger audit after insert or update or delete on crm_invoice_requests for each row
  execute function audit_row('lead_id', 'contact_id', 'requested_by', 'amount_minor', 'discount_pct', 'status',
                             'decided_by', 'decided_at');
