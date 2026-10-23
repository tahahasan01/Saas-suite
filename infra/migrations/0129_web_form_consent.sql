-- ============================================================================
-- Migration 0129 — A marketing tick on web forms (wave D leftovers)
--
--  * crm_web_forms.consent_label: the wording of the tick (empty: the form
--    doesn't ask).
--  * crm_leads.consent_at / consent_ip / consent_text: the evidence of a
--    ticked box: when, from where, and the exact wording shown. It becomes a
--    contact's opt-in only when staff qualify the lead (app/campaigns.py,
--    carry_lead_consent), never straight from the public form.
-- ============================================================================

alter table crm_web_forms
  add column consent_label text not null default '' check (length(consent_label) <= 200);

alter table crm_leads
  add column consent_at   timestamptz,
  add column consent_ip   text check (length(consent_ip) <= 64),
  add column consent_text text check (length(consent_text) <= 200);
