-- ============================================================================
-- Migration 0076 — Registers, devices, sessions, split tender (3C, D-24,
-- St01 §6.2/§6.6, checklist §7.8)
--
--  * pos_registers: a till. Its code (R1, R2 …) prefixes receipt numbers;
--    it lists the payment methods it takes, its cash rounding (blank = the
--    company's) and the cash
--    variance it tolerates at close before a manager must approve.
--    config_version bumps on every change so offline tills (3D) reload.
--  * pos_devices: a phone/tablet/PC working a register (device_code D01 …).
--    Its heartbeat reports unsent sales; a device with any blocks the close.
--  * pos_drawers becomes pos_sessions: one open session per register (no
--    longer per tenant). Expected amounts come by FOREIGN KEY: the session's
--    own payments, cash moves and refunds — never "sales between two times".
--    Closing freezes expected and counted per method.
--  * pos_payments: one row per tender of a sale (split tender), with the
--    cash change; pos_cash_moves: pay-ins, pay-outs and cash drops.
--  * Existing data (§7.8): every tenant gets register R1 in its default
--    branch; drawers become its sessions; every sale gets one payment row;
--    sales and returns made while a drawer was open join that session.
--  * users.pos_pin_hash: a manager's till PIN (argon2), for approvals.
-- ============================================================================

create table pos_registers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  branch_id           uuid,                  -- required once bos_branch_scope runs below
  code                text not null check (code ~ '^[A-Z0-9]{1,6}$'),
  name                text not null check (length(btrim(name)) between 1 and 60),
  payment_methods     text[] not null default array['cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'khata'],
  cash_rounding_minor int check (cash_rounding_minor between 0 and 10000),   -- null: the company's
  max_variance_minor  bigint not null default 50000 check (max_variance_minor >= 0),
  config_version      int not null default 1,
  is_default          boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pos_registers_methods_check check (payment_methods <@ array['cash', 'card', 'jazzcash', 'easypaisa',
                                                                        'raast', 'bank', 'khata']
                                                and cardinality(payment_methods) >= 1),
  unique (tenant_id, code),
  unique (tenant_id, id)
);
create unique index pos_registers_one_default on pos_registers (tenant_id) where is_default;

create table pos_devices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  register_id       uuid not null,
  device_code       text not null check (device_code ~ '^[A-Z0-9]{1,6}$'),
  name              text not null default '' check (length(name) <= 60),
  last_seen_at      timestamptz,
  outbox_count      int not null default 0 check (outbox_count >= 0),
  oldest_pending_at timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, register_id) references pos_registers (tenant_id, id),
  unique (register_id, device_code),
  unique (tenant_id, id)
);

-- ── Drawers become register sessions ────────────────────────────────────────
alter table pos_drawers rename to pos_sessions;
alter table pos_sessions rename constraint pos_drawers_status_check to pos_sessions_status_check;
drop index if exists pos_drawers_one_open;
alter table pos_sessions
  add column register_id uuid,
  add column expected jsonb,                 -- {method: minor}, frozen at close
  add column counted jsonb,                  -- {method: minor}, as counted
  add column variance_approved_by uuid references users(id) on delete set null,
  add column closed_device_id uuid,
  add constraint pos_sessions_tenant_id_key unique (tenant_id, id);

-- Every tenant's register R1, in its default branch.
insert into pos_registers (tenant_id, branch_id, code, name, is_default)
select t.id, b.id, 'R1', 'Main register', true
  from tenants t join branches b on b.tenant_id = t.id and b.is_default;
update pos_sessions s set register_id = r.id from pos_registers r where r.tenant_id = s.tenant_id and r.is_default;
alter table pos_sessions alter column register_id set not null,
  add constraint pos_sessions_register_fk foreign key (tenant_id, register_id) references pos_registers (tenant_id, id);
create unique index pos_sessions_one_open on pos_sessions (register_id) where status = 'open';

-- New tenants get R1 too, once their default branch exists (0055 seeds it).
create or replace function pos_seed_register() returns trigger language plpgsql as $$
begin
  if new.is_default then
    insert into pos_registers (tenant_id, branch_id, code, name, is_default)
    select new.tenant_id, new.id, 'R1', 'Main register', true
     where not exists (select 1 from pos_registers where tenant_id = new.tenant_id);
  end if;
  return new;
end $$;
create trigger pos_seed_register after insert on branches for each row execute function pos_seed_register();

-- ── Sales, payments, cash moves, refunds join their session ────────────────
alter table pos_sales
  add column session_id uuid,
  add column register_id uuid,
  add column device_id uuid,
  add constraint pos_sales_session_fk foreign key (tenant_id, session_id) references pos_sessions (tenant_id, id),
  add constraint pos_sales_register_fk foreign key (tenant_id, register_id) references pos_registers (tenant_id, id),
  add constraint pos_sales_device_fk foreign key (tenant_id, device_id) references pos_devices (tenant_id, id);
create index pos_sales_session_idx on pos_sales (session_id);

alter table pos_sales drop constraint if exists pos_sales_payment_method_check;
alter table pos_sales add constraint pos_sales_payment_method_check
  check (payment_method in ('cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'khata', 'split'));

alter table pos_returns
  add column session_id uuid,
  add column refund_method text not null default 'cash',
  add constraint pos_returns_session_fk foreign key (tenant_id, session_id) references pos_sessions (tenant_id, id),
  add constraint pos_returns_refund_method_check
    check (refund_method in ('cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'khata'));

create table pos_payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  sale_id        uuid not null references pos_sales(id) on delete cascade,
  session_id     uuid,
  method         text not null,
  amount_minor   bigint not null check (amount_minor > 0),   -- applied to the sale
  tendered_minor bigint not null check (tendered_minor >= amount_minor),
  change_minor   bigint not null default 0 check (change_minor >= 0),
  reference      text not null default '' check (length(reference) <= 80),
  created_at     timestamptz not null default now(),
  foreign key (tenant_id, session_id) references pos_sessions (tenant_id, id),
  constraint pos_payments_method_check
    check (method in ('cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'khata')),
  constraint pos_payments_change_check check (change_minor = tendered_minor - amount_minor)
);
create index pos_payments_sale_idx on pos_payments (sale_id);
create index pos_payments_session_idx on pos_payments (session_id, method);

create table pos_cash_moves (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  session_id   uuid not null,
  kind         text not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason       text not null check (length(btrim(reason)) between 1 and 200),
  user_id      uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, session_id) references pos_sessions (tenant_id, id),
  constraint pos_cash_moves_kind_check check (kind in ('pay_in', 'pay_out', 'drop'))
);
create index pos_cash_moves_session_idx on pos_cash_moves (session_id);

-- One payment row per existing sale (§7.8): what it was paid with.
insert into pos_payments (tenant_id, sale_id, method, amount_minor, tendered_minor, change_minor, created_at)
select s.tenant_id, s.id, s.payment_method, s.total_minor + s.rounding_minor,
       greatest(s.paid_minor, s.total_minor + s.rounding_minor),
       greatest(s.paid_minor, s.total_minor + s.rounding_minor) - (s.total_minor + s.rounding_minor), s.created_at
  from pos_sales s where s.total_minor + s.rounding_minor > 0;

-- Sales and refunds made while a drawer was open belong to that session.
update pos_sales s set session_id = d.id, register_id = d.register_id
  from pos_sessions d
 where d.tenant_id = s.tenant_id and s.created_at >= d.opened_at and s.created_at <= coalesce(d.closed_at, now());
update pos_payments p set session_id = s.session_id from pos_sales s where s.id = p.sale_id;
update pos_returns r set session_id = d.id, refund_method = case when s.payment_method = 'cash' then 'cash'
                                                              else s.payment_method end
  from pos_sessions d, pos_sales s
 where s.id = r.sale_id and d.tenant_id = r.tenant_id
   and r.created_at >= d.opened_at and r.created_at <= coalesce(d.closed_at, now());
update pos_returns r set refund_method = s.payment_method
  from pos_sales s where s.id = r.sale_id and r.session_id is null and s.payment_method <> 'split';

-- Closed drawers keep their single cash figure as the frozen per-method one.
update pos_sessions set expected = jsonb_build_object('cash', expected_minor),
                        counted = jsonb_build_object('cash', counted_minor)
 where status = 'closed';

alter table users add column pos_pin_hash text;

grant select, insert, update on pos_registers to app_user;     -- retired, never deleted
grant select, insert, update on pos_devices to app_user;
grant select, insert on pos_payments to app_user;              -- part of the sale: never edited
grant select, insert on pos_cash_moves to app_user;            -- append-only

do $$
declare t text;
begin
  foreach t in array array['pos_registers', 'pos_devices', 'pos_payments', 'pos_cash_moves'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

call bos_branch_scope('pos_registers', true);
call bos_branch_scope('pos_payments', true);
call bos_branch_scope('pos_cash_moves', true);

create trigger audit after insert or update or delete on pos_registers for each row
  execute function audit_row('code', 'name', 'payment_methods', 'cash_rounding_minor', 'max_variance_minor',
                             'is_default', 'active');
create trigger audit after insert or update or delete on pos_cash_moves for each row
  execute function audit_row('session_id', 'kind', 'amount_minor', 'reason');
