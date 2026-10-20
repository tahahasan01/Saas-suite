-- ============================================================================
-- Migration 0035 — Transactional outbox (decision D-09; checklist 1C, 7.3)
--
-- Every side effect that leaves the system is written as an outbox row in the
-- business transaction and delivered afterwards by a worker (app/fbr_submit.py
-- for the fbr.* kinds). Phase 1 kinds: fbr.submit_sale, fbr.submit_debit_note;
-- email.send / whatsapp.send come later on the same table.
--
--   dedup_key   unique per (tenant, kind): the sale id or the return id, so a
--               document can be queued only once however often it is retried
--   payload     frozen at enqueue: for FBR, the document built from the line
--               snapshots (0034). A null `document` (rows backfilled below) is
--               built once from the snapshots on first delivery and frozen.
--   status      pending -> sending -> done | retry | unknown | failed
--               (cancelled: the source document was voided before sending)
--               retry   — a failed attempt; tried again at run_after (back-off)
--               unknown — the request may have reached FBR without an answer.
--                         Never resent blindly: reconciled first (lookup, or
--                         an owner settles it by hand), because FBR has no
--                         idempotency key and a resend could file twice.
--               failed  — attempts used up, or can never be filed; terminal,
--                         and the tenant's owners are alerted.
--   attempts    counted on the row being sent, when it is claimed
--   run_after   when the row is next due
--   locked_until a 'sending' row past this was abandoned mid-flight (-> unknown)
--   depends_on  a debit note waits until its sale's row is done
--   result      the provider's answer, persisted with the move to done
--   alerted_at  owners were told about a failed/unknown row (once)
--
-- Privileges: the runtime role inserts in the business transaction and reads
-- (status shown on receipts); only the worker, on the owner connection, moves
-- rows between states. Explicit grants, independent of default privileges.
--
-- pos_fbr_invoices stays the legal filing record (status, FBR number) shown to
-- the shop; it gains outbox_id and the status 'unknown'
-- (pending | submitted | unknown | failed).
-- ============================================================================

create table if not exists outbox (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  kind            text not null check (kind ~ '^[a-z]+\.[a-z_]+$'),
  dedup_key       text not null,
  payload         jsonb not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'sending', 'retry', 'done', 'unknown', 'failed', 'cancelled')),
  attempts        int not null default 0 check (attempts >= 0),
  max_attempts    int not null default 10 check (max_attempts > 0),
  run_after       timestamptz not null default now(),
  locked_until    timestamptz,
  depends_on      bigint references outbox(id) on delete set null,
  last_error_code text not null default '',
  last_error      text not null default '',
  result          jsonb,
  alerted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, kind, dedup_key)
);
create index if not exists outbox_ready on outbox (run_after) where status in ('pending', 'retry');
create index if not exists outbox_attention on outbox (tenant_id, status)
  where status in ('sending', 'unknown', 'failed');
create index if not exists outbox_depends_on_idx on outbox (depends_on) where depends_on is not null;

alter table outbox enable row level security;
drop policy if exists tenant_isolation on outbox;
create policy tenant_isolation on outbox
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

revoke all on outbox from app_user;
grant select, insert on outbox to app_user;

alter table pos_fbr_invoices
  add column if not exists outbox_id bigint references outbox(id) on delete set null;

-- ── Backfill (7.3): filings the old retry job had queued become outbox rows ──
-- One row per sale (fbr.submit_sale) and per return (fbr.submit_debit_note,
-- depending on its sale's row). The document is left null and is built once
-- from the line snapshots on first delivery. A row the old job held
-- mid-transmission ('sending') may already be at FBR, so it becomes unknown
-- and is reconciled before any resend. Idempotent. Sales with no filing row
-- at all (audit P0-4 orphans) are NOT queued here: they need the owner's
-- confirmation per tenant first.
-- backfill:begin
insert into outbox (tenant_id, kind, dedup_key, payload, status, attempts, run_after, created_at)
select f.tenant_id, 'fbr.submit_sale', f.sale_id::text,
       jsonb_build_object('fbr_invoice_id', f.id, 'sale_id', f.sale_id, 'return_id', null,
                          'document', null),
       case when f.status = 'sending' then 'unknown' else 'pending' end,
       least(f.attempts, 9), now(), f.created_at
  from pos_fbr_invoices f
 where f.return_id is null and f.status in ('pending', 'sending') and f.outbox_id is null
on conflict (tenant_id, kind, dedup_key) do nothing;

insert into outbox (tenant_id, kind, dedup_key, payload, status, attempts, run_after, depends_on, created_at)
select f.tenant_id, 'fbr.submit_debit_note', f.return_id::text,
       jsonb_build_object('fbr_invoice_id', f.id, 'sale_id', f.sale_id, 'return_id', f.return_id,
                          'document', null),
       case when f.status = 'sending' then 'unknown' else 'pending' end,
       least(f.attempts, 9), now(),
       (select o.id from outbox o
         where o.tenant_id = f.tenant_id and o.kind = 'fbr.submit_sale' and o.dedup_key = f.sale_id::text),
       f.created_at
  from pos_fbr_invoices f
 where f.return_id is not null and f.status in ('pending', 'sending') and f.outbox_id is null
on conflict (tenant_id, kind, dedup_key) do nothing;

update pos_fbr_invoices f
   set outbox_id = o.id,
       status = case when o.status = 'unknown' then 'unknown' else f.status end
  from outbox o
 where f.outbox_id is null
   and o.tenant_id = f.tenant_id
   and o.kind = case when f.return_id is null then 'fbr.submit_sale' else 'fbr.submit_debit_note' end
   and o.dedup_key = coalesce(f.return_id, f.sale_id)::text;
-- backfill:end
