-- ============================================================================
-- Migration 0063 — Activities: planned work, split from history (D-32, St02 §6.4)
--
--  * activity_types: per tenant and editable, seeded with Call, WhatsApp,
--    Meeting, Visit, To-do, Send quote and Collect payment. Seeded types keep
--    a stable `code` so automations and the interaction split can find them
--    whatever the tenant renames them to. Retire = active false (no DELETE).
--  * activities: polymorphic (entity_type, entity_id) like timeline_events —
--    'lead' today, 'contact' once the contacts module lands. State (overdue,
--    today, planned) is computed against the tenant's day, never stored.
--    No DELETE: an activity is done or cancelled.
--  * crm_seed_defaults(tenant): lost reasons + activity types for a tenant
--    that has none; run by a trigger on every new tenant and once here for
--    existing ones.
--  * crm_interactions is split (§7.1): every row becomes a timeline event
--    (kind 'note' for notes, 'call' for any logged contact, the channel in the
--    payload, source_ref 'interaction:<id>'); rows with a future follow-up not
--    yet reminded also become a planned activity. The table is kept,
--    read-only, for one release; nothing writes it any more.
--  * ai_v_interactions now reads the lead timeline, so logged contacts made
--    after this migration stay visible to Ask AI. Same columns as before.
-- ============================================================================

create table activity_types (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  code         text,
  icon         text not null default 'todo',
  default_days int not null default 0 check (default_days between 0 and 365),
  position     int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table activity_types add constraint activity_types_code_check
  check (code is null or code in ('call', 'whatsapp', 'meeting', 'visit', 'todo', 'quote', 'payment'));
alter table activity_types add constraint activity_types_icon_check
  check (icon in ('call', 'whatsapp', 'meeting', 'visit', 'todo', 'quote', 'payment'));
create unique index activity_types_name_key on activity_types (tenant_id, lower(name));
create unique index activity_types_code_key on activity_types (tenant_id, code) where code is not null;

create table activities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  entity_type         text not null,
  entity_id           uuid not null,
  type_id             uuid not null references activity_types(id),
  summary             text not null default '' check (length(summary) <= 200),
  note                text not null default '',
  due_date            date not null,
  due_at              timestamptz,                 -- optional exact time (reminders)
  assigned_to         uuid references users(id) on delete set null,
  created_by          uuid references users(id) on delete set null,
  automated           boolean not null default false,
  done_at             timestamptz,
  done_by             uuid references users(id) on delete set null,
  outcome             text,
  feedback            text not null default '',
  reminder_sent_at    timestamptz,
  overdue_notified_at timestamptz,
  cancelled_at        timestamptz,
  source_ref          text,                        -- idempotency (migration, automations)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table activities add constraint activities_entity_type_check check (entity_type in ('lead', 'contact'));
alter table activities add constraint activities_outcome_check
  check (outcome is null or outcome in ('interested', 'not_interested', 'callback', 'busy'));
create index activities_open_idx on activities (tenant_id, assigned_to, due_date)
  where done_at is null and cancelled_at is null;
create index activities_entity_idx on activities (tenant_id, entity_type, entity_id);
create index activities_type_idx on activities (type_id);
create index activities_assigned_idx on activities (assigned_to) where assigned_to is not null;
create unique index activities_source_ref_key on activities (tenant_id, source_ref) where source_ref is not null;

grant select, insert, update on activity_types to app_user;   -- retire, never delete
grant select, insert, update on activities to app_user;
do $$
declare t text;
begin
  foreach t in array array['activity_types', 'activities'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Defaults for every tenant ───────────────────────────────────────────────
create or replace function crm_seed_defaults(t uuid) returns void language sql as $$
  insert into crm_lost_reasons (tenant_id, name, position)
  select t, r.name, r.pos
    from (values ('Price too high', 1), ('Went with someone else', 2), ('Stopped replying', 3),
                 ('Not interested any more', 4), ('Not the right time', 5), ('Other', 6)) as r(name, pos)
   where not exists (select 1 from crm_lost_reasons x where x.tenant_id = t);
  insert into activity_types (tenant_id, name, code, icon, default_days, position)
  select t, v.name, v.code, v.code, v.days, v.pos
    from (values ('Call', 'call', 0, 1), ('WhatsApp', 'whatsapp', 0, 2), ('Meeting', 'meeting', 2, 3),
                 ('Visit', 'visit', 2, 4), ('To-do', 'todo', 1, 5), ('Send quote', 'quote', 1, 6),
                 ('Collect payment', 'payment', 7, 7)) as v(name, code, days, pos)
   where not exists (select 1 from activity_types x where x.tenant_id = t);
$$;
revoke all on function crm_seed_defaults(uuid) from public;

create or replace function crm_seed_defaults_trg() returns trigger language plpgsql as $$
begin
  perform crm_seed_defaults(new.id);
  return new;
end $$;
revoke all on function crm_seed_defaults_trg() from public;
create trigger crm_seed_defaults after insert on tenants for each row execute function crm_seed_defaults_trg();

select crm_seed_defaults(id) from tenants;

-- ── crm_interactions → timeline + activities (§7.1) ─────────────────────────
-- backfill:begin
insert into timeline_events (tenant_id, entity_type, entity_id, kind, actor_id, body, payload, source_ref, occurred_at)
select i.tenant_id, 'lead', i.lead_id,
       case i.channel when 'note' then 'note' else 'call' end,
       i.user_id, nullif(i.note, ''),
       jsonb_build_object('channel', i.channel, 'outcome', i.outcome, 'next_follow_up_at', i.next_follow_up_at),
       'interaction:' || i.id, i.created_at
  from crm_interactions i
on conflict (tenant_id, source_ref) where source_ref is not null do nothing;

insert into activities (tenant_id, entity_type, entity_id, type_id, summary, note, due_date, due_at,
                        assigned_to, created_by, source_ref, created_at)
select i.tenant_id, 'lead', i.lead_id, at.id, 'Follow up', i.note,
       (i.next_follow_up_at at time zone coalesce(tn.timezone, 'Asia/Karachi'))::date, i.next_follow_up_at,
       coalesce(l.owner_id, i.user_id), i.user_id, 'interaction:' || i.id, i.created_at
  from crm_interactions i
  join crm_leads l on l.id = i.lead_id
  join tenants tn on tn.id = i.tenant_id
  join activity_types at on at.tenant_id = i.tenant_id
                        and at.code = case i.channel when 'call' then 'call' when 'whatsapp' then 'whatsapp' else 'todo' end
 where i.next_follow_up_at > now() and not i.reminder_sent
on conflict (tenant_id, source_ref) where source_ref is not null do nothing;
-- backfill:end

-- Read-only from here on (kept one release for rollback and old readers).
revoke insert, update, delete on crm_interactions from app_user;

-- ── Ask AI keeps seeing logged contacts ─────────────────────────────────────
grant select on timeline_events to ai_view_owner;
create or replace view ai_v_interactions with (security_invoker = false, security_barrier = true) as
  select e.id, l.name as lead_name,
         coalesce(e.payload->>'channel',
                  case when e.kind = 'note' then 'note'
                       when e.payload->>'type_code' in ('call', 'whatsapp') then e.payload->>'type_code'
                       else 'note' end) as channel,
         e.payload->>'outcome' as outcome,
         coalesce(e.body, '') as note,
         (e.payload->>'next_follow_up_at')::timestamptz as next_follow_up_at,
         e.occurred_at as created_at
    from timeline_events e
    join crm_leads l on l.id = e.entity_id
   where e.entity_type = 'lead' and e.kind in ('note', 'call', 'activity_done');
alter view ai_v_interactions owner to ai_view_owner;
