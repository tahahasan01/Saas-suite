-- ============================================================================
-- Migration 0062 — CRM v2: pipeline and stage editing, lost as a status,
-- lead probability / priority / expected close (D-31, St02 §6.3, checklist 3B)
--
--  * crm_stages gains the v2 flags: is_won, fold, rotting_days,
--    default_probability, requirements. `kind` stays one release for old
--    readers and is kept in step by the API (won | active); it is dropped
--    after that.
--  * crm_lost_reasons: an editable, per-tenant list. A reason in use is
--    retired (active = false), never deleted, so old losses keep their words.
--  * crm_leads gains status open|won|lost, lost_reason_id, lost_note, won_at,
--    lost_at, probability (+ probability_is_manual), expected_close_date,
--    priority 0–3 and stage_entered_at. Losing a lead keeps its stage (the
--    stage it died in), which is what the funnel report counts from.
--  * Pipelines and stages become editable: app_user may now UPDATE and DELETE
--    them (the API enforces "move the leads first").
--
-- Backfill (checklist §7.1), idempotent, between the markers so a test can
-- run it again:
--  1. kind='won' → is_won.
--  2. Leads in a kind='lost' stage → status lost, lost_at from updated_at,
--     probability 0, stage = the pipeline's last open stage. The old stage id
--     is kept in pre_migration_stage_id for rollback. THE STAGE THE DEAL DIED
--     IN CANNOT BE RECOVERED (tenants are told; see the release note).
--  3. Leads in a won stage → status won, won_at from updated_at.
--  4. The emptied "Lost" stages are deleted.
--  5. Default probabilities: open stages spread evenly by position (4 open
--     stages → 20/40/60/80), won stages 100; open leads take their stage's.
--  6. Lost reasons are seeded for every existing tenant (new tenants get
--     them from crm_seed_defaults(), migration 0063).
--
-- Rollback (§7.1 step 4): recreate a "Lost" stage per pipeline, point each
-- lead with pre_migration_stage_id back at it, clear status.
-- ============================================================================

-- ── Stages ──────────────────────────────────────────────────────────────────
alter table crm_stages
  add column if not exists is_won boolean not null default false,
  add column if not exists fold boolean not null default false,
  add column if not exists rotting_days int check (rotting_days is null or rotting_days between 1 and 365),
  add column if not exists default_probability smallint
    check (default_probability is null or default_probability between 0 and 100),
  add column if not exists requirements text not null default '';

grant update, delete on crm_stages, crm_pipelines to app_user;

-- ── Lost reasons ────────────────────────────────────────────────────────────
create table crm_lost_reasons (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  active     boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create unique index crm_lost_reasons_name_key on crm_lost_reasons (tenant_id, lower(name));

grant select, insert, update, delete on crm_lost_reasons to app_user;
alter table crm_lost_reasons enable row level security;
create policy tenant_isolation on crm_lost_reasons
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Leads ───────────────────────────────────────────────────────────────────
alter table crm_leads
  add column if not exists status text not null default 'open',
  add column if not exists lost_reason_id uuid references crm_lost_reasons(id),
  add column if not exists lost_note text,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists probability smallint check (probability is null or probability between 0 and 100),
  add column if not exists probability_is_manual boolean not null default false,
  add column if not exists expected_close_date date,
  add column if not exists priority smallint not null default 0 check (priority between 0 and 3),
  add column if not exists stage_entered_at timestamptz,
  -- rollback only (§7.1): the "Lost" stage a lead sat in before 0062.
  -- Dropped one release after Phase 3 ships.
  add column if not exists pre_migration_stage_id uuid;
alter table crm_leads add constraint crm_leads_status_check check (status in ('open', 'won', 'lost'));

create index if not exists crm_leads_status_idx on crm_leads (tenant_id, pipeline_id, status);
create index if not exists crm_leads_lost_reason_idx on crm_leads (lost_reason_id) where lost_reason_id is not null;

-- backfill:begin
update crm_stages set is_won = true where kind = 'won' and not is_won;

-- Every pipeline needs an open stage to land its lost leads in.
insert into crm_stages (tenant_id, pipeline_id, name, position, kind)
select p.tenant_id, p.id, 'New', -1, 'active'
  from crm_pipelines p
 where not exists (select 1 from crm_stages s
                    where s.pipeline_id = p.id and s.kind <> 'lost' and not s.is_won);

update crm_leads l
   set status = 'lost',
       lost_at = coalesce(l.lost_at, l.updated_at),
       probability = 0,
       pre_migration_stage_id = l.stage_id,
       stage_id = (select s.id from crm_stages s
                    where s.pipeline_id = ls.pipeline_id and s.kind <> 'lost' and not s.is_won
                    order by s.position desc, s.created_at desc
                    limit 1)
  from crm_stages ls
 where ls.id = l.stage_id and ls.kind = 'lost';

update crm_leads l
   set status = 'won', won_at = coalesce(l.won_at, l.updated_at), probability = 100
  from crm_stages s
 where s.id = l.stage_id and s.is_won and l.status = 'open';

delete from crm_stages s
 where s.kind = 'lost' and not exists (select 1 from crm_leads l where l.stage_id = s.id);

with ranked as (
  select id,
         row_number() over (partition by pipeline_id order by position, created_at) as rn,
         count(*) over (partition by pipeline_id) as n
    from crm_stages
   where not is_won)
update crm_stages s
   set default_probability = round(100.0 * r.rn / (r.n + 1))
  from ranked r
 where r.id = s.id and s.default_probability is null;
update crm_stages set default_probability = 100 where is_won and default_probability is null;

update crm_leads l
   set probability = s.default_probability
  from crm_stages s
 where s.id = l.stage_id and l.status = 'open' and l.probability is null and not l.probability_is_manual;

update crm_leads set stage_entered_at = updated_at where stage_entered_at is null;

insert into crm_lost_reasons (tenant_id, name, position)
select t.id, r.name, r.pos
  from tenants t
 cross join (values ('Price too high', 1), ('Went with someone else', 2), ('Stopped replying', 3),
                    ('Not interested any more', 4), ('Not the right time', 5), ('Other', 6)) as r(name, pos)
 where not exists (select 1 from crm_lost_reasons x where x.tenant_id = t.id);
-- backfill:end

-- ── The AI view follows the status ──────────────────────────────────────────
-- Same columns as before, so the model's schema text stays true: stage_kind
-- now comes from the lead's status (a lost lead sits in an open stage).
-- CREATE OR REPLACE resets view options, so 0032's are restated.
create or replace view ai_v_leads with (security_invoker = false, security_barrier = true) as
  select l.id, l.name, l.company, l.phone, l.email, l.source,
         (l.value_minor / 100.0) as value, l.currency, l.score,
         s.name as stage,
         case l.status when 'open' then 'active' else l.status end as stage_kind,
         p.name as pipeline, l.created_at
    from crm_leads l
    join crm_stages s on s.id = l.stage_id
    join crm_pipelines p on p.id = l.pipeline_id;
alter view ai_v_leads owner to ai_view_owner;
