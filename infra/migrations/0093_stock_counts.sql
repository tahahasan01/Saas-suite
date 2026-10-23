-- ============================================================================
-- Migration 0093 — Stock counts that don't clobber sales
-- (wave B, study 06 §6.6, D-88)
--
--  * stock_counts: one count at one branch, optionally one category; open →
--    applied, or cancelled. Branch-scoped like the stock it counts.
--  * stock_count_lines: what was found. system_qty is the branch's stock at
--    the moment the line was counted; applying posts counted − system_qty,
--    so sales made in between are kept.
-- ============================================================================

create table stock_counts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  branch_id    uuid,                          -- filled and required by bos_branch_scope
  category_id  uuid,
  status       text not null default 'open',
  note         text not null default '' check (length(note) <= 300),
  started_by   uuid references users(id) on delete set null,
  started_at   timestamptz not null default now(),
  applied_by   uuid references users(id) on delete set null,
  applied_at   timestamptz,
  constraint stock_counts_status_check check (status in ('open', 'applied', 'cancelled')),
  foreign key (tenant_id, category_id) references pos_categories (tenant_id, id),
  unique (tenant_id, id)
);
call bos_branch_scope('stock_counts', true);

create table stock_count_lines (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  count_id     uuid not null,
  product_id   uuid not null,
  system_qty   numeric(14,3) not null,
  counted_qty  numeric(14,3) not null check (counted_qty >= 0),
  counted_by   uuid references users(id) on delete set null,
  counted_at   timestamptz not null default now(),
  primary key (count_id, product_id),
  foreign key (tenant_id, count_id) references stock_counts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id)
);

grant select, insert, update on stock_counts to app_user;        -- cancelled, never deleted
grant select, insert, update on stock_count_lines to app_user;   -- recounting a shelf replaces its line

alter table stock_counts enable row level security;
alter table stock_count_lines enable row level security;
create policy tenant_isolation on stock_counts
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on stock_count_lines
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop trigger if exists audit on stock_counts;
create trigger audit after insert or update on stock_counts for each row
  execute function audit_row('status', 'category_id', 'applied_at');
