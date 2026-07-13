-- ============================================================================
-- Migration 0004 — AI Gateway
--  * ai_interactions: audit + cost log of every AI call (RLS)
--  * ai_v_* : the ONLY surface NL->SQL is allowed to query. These are
--    curated, read-only views created WITH (security_invoker = true) so the
--    underlying tables' RLS is enforced against the querying role (app_user)
--    and app.tenant_id — the AI physically cannot read another tenant's rows.
-- ============================================================================

create table if not exists ai_interactions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  kind       text not null,              -- 'ask' | 'summarize' | 'score' ...
  prompt     text not null,
  response   text,
  sql        text,                        -- generated SQL, if any
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_interactions_tenant_idx on ai_interactions(tenant_id, created_at desc);

grant select, insert on ai_interactions to app_user;
alter table ai_interactions enable row level security;
create policy tenant_isolation on ai_interactions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Curated read-only views for NL->SQL (RLS enforced via security_invoker) ──
create or replace view ai_v_leads with (security_invoker = true) as
  select l.id, l.name, l.company, l.phone, l.email, l.source,
         (l.value_minor / 100.0) as value, l.currency, l.score,
         s.name as stage, s.kind as stage_kind,
         p.name as pipeline, l.created_at
  from crm_leads l
  join crm_stages s on s.id = l.stage_id
  join crm_pipelines p on p.id = l.pipeline_id;

create or replace view ai_v_interactions with (security_invoker = true) as
  select i.id, l.name as lead_name, i.channel, i.outcome, i.note,
         i.next_follow_up_at, i.created_at
  from crm_interactions i
  join crm_leads l on l.id = i.lead_id;

grant select on ai_v_leads, ai_v_interactions to app_user;
