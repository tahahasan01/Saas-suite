-- ============================================================================
-- Migration 0064 — CRM events and the overdue-activity job (St02 §6.10, P1-14)
--
--  * workflows.trigger accepts the new events: lead.won, lead.lost,
--    lead.restored, activity.done, activity.overdue (fired by the job below)
--    and contact.created (defined here, emitted by the contacts module).
--    interaction.logged stays for existing rules: the old log endpoint still
--    fires it.
--  * crm.activity_overdue: every 15 minutes, once per activity whose due day
--    has passed — tells the assignee and fires activity.overdue.
-- ============================================================================

alter table workflows drop constraint if exists workflows_trigger_check;
alter table workflows add constraint workflows_trigger_check check (trigger in (
  'lead.created', 'lead.stage_changed', 'interaction.logged',
  'lead.won', 'lead.lost', 'lead.restored',
  'activity.done', 'activity.overdue', 'contact.created'));

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('crm.activity_overdue', 'Flag activities whose due day has passed', interval '15 minutes', 300, 5, 5)
on conflict (code) do nothing;
