-- ============================================================================
-- Migration 0092 — Stock transfers between branches or warehouses
-- (wave B, study 06 §6.6, D-88)
--
--  * stock_transfers: one document, draft → dispatched (out of the sender,
--    in transit) → received (into the receiver); a draft can be cancelled.
--    It belongs to two branches, so its branch policy lets staff of either
--    end see it (the shared bos_branch_scope only knows one branch column).
--  * stock_transfer_lines: what was sent and what arrived; the difference is
--    the transfer's variance (lost or damaged on the way).
--  * pos_stock_moves gains the reasons transfer_out and transfer_in.
-- ============================================================================

create table stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  number          text not null,
  from_branch_id  uuid not null,
  to_branch_id    uuid not null,
  status          text not null default 'draft',
  note            text not null default '' check (length(note) <= 300),
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  dispatched_by   uuid references users(id) on delete set null,
  dispatched_at   timestamptz,
  received_by     uuid references users(id) on delete set null,
  received_at     timestamptz,
  constraint stock_transfers_status_check check (status in ('draft', 'dispatched', 'received', 'cancelled')),
  constraint stock_transfers_two_branches check (from_branch_id <> to_branch_id),
  foreign key (tenant_id, from_branch_id) references branches (tenant_id, id),
  foreign key (tenant_id, to_branch_id) references branches (tenant_id, id),
  unique (tenant_id, number),
  unique (tenant_id, id)
);
create index stock_transfers_from_idx on stock_transfers (tenant_id, from_branch_id, status);
create index stock_transfers_to_idx on stock_transfers (tenant_id, to_branch_id, status);

create table stock_transfer_lines (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  transfer_id   uuid not null,
  product_id    uuid not null,
  qty_sent      numeric(14,3) not null check (qty_sent > 0),
  qty_received  numeric(14,3) check (qty_received >= 0),
  foreign key (tenant_id, transfer_id) references stock_transfers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id),
  unique (transfer_id, product_id)
);

grant select, insert, update on stock_transfers to app_user;        -- cancelled, never deleted
grant select, insert, update on stock_transfer_lines to app_user;   -- fixed at dispatch, received once

alter table stock_transfers enable row level security;
alter table stock_transfer_lines enable row level security;
create policy tenant_isolation on stock_transfers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on stock_transfer_lines
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- Either end of the transfer may see and work on it.
create policy branch_scope on stock_transfers as restrictive for all
  using (app_branch_visible(from_branch_id) or app_branch_visible(to_branch_id))
  with check (app_branch_visible(from_branch_id) or app_branch_visible(to_branch_id));

alter table pos_stock_moves drop constraint pos_stock_moves_reason_check;
alter table pos_stock_moves add constraint pos_stock_moves_reason_check
  check (reason in ('opening', 'sale', 'return', 'purchase', 'adjustment', 'damage', 'count', 'void',
                    'transfer_out', 'transfer_in'));

drop trigger if exists audit on stock_transfers;
create trigger audit after insert or update on stock_transfers for each row
  execute function audit_row('status', 'from_branch_id', 'to_branch_id', 'dispatched_at', 'received_at');
