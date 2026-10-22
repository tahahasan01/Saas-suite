-- ============================================================================
-- Migration 0079 — Khata, customer credit (3C, St01 P1)
--
--  * customer_ledger: append-only. A khata tender posts a 'sale' (+, the
--    customer owes more) in the sale's transaction; a khata refund posts a
--    'refund' (−); money received posts a 'payment' (−); a manager's
--    'adjustment' can go either way. Balance = sum(amount_minor).
--  * contacts.credit_limit_minor: null = no limit.
-- ============================================================================

create table customer_ledger (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  contact_id   uuid not null references contacts(id),
  kind         text not null,
  amount_minor bigint not null check (amount_minor <> 0),
  sale_id      uuid references pos_sales(id),
  return_id    uuid references pos_returns(id),
  method       text,
  session_id   uuid,
  note         text not null default '' check (length(note) <= 300),
  user_id      uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint customer_ledger_kind_check check (kind in ('sale', 'refund', 'payment', 'adjustment')),
  constraint customer_ledger_method_check
    check (method is null or method in ('cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'cheque')),
  constraint customer_ledger_sign_check check (
    (kind = 'sale' and amount_minor > 0) or (kind in ('refund', 'payment') and amount_minor < 0)
    or kind = 'adjustment')
);
create index customer_ledger_contact_idx on customer_ledger (contact_id, created_at);

alter table contacts add column credit_limit_minor bigint check (credit_limit_minor is null or credit_limit_minor >= 0);

grant select, insert on customer_ledger to app_user;     -- append-only
alter table customer_ledger enable row level security;
create policy tenant_isolation on customer_ledger
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
call bos_branch_scope('customer_ledger', true);

create trigger audit after insert or update or delete on customer_ledger for each row
  execute function audit_row('contact_id', 'kind', 'amount_minor', 'sale_id', 'return_id', 'method', 'note');
