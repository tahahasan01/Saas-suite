-- ============================================================================
-- Migration 0015 — reminder dedup flag for the proactive scheduler
-- ============================================================================

alter table crm_interactions add column if not exists reminder_sent boolean not null default false;
create index if not exists crm_interactions_followup_idx
  on crm_interactions(next_follow_up_at) where next_follow_up_at is not null and not reminder_sent;
