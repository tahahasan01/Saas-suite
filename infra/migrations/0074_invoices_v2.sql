-- ============================================================================
-- Migration 0074 — Invoices v2 (3E, P1-9, M8; checklist §7.9)
--
--  * invoices: a real document. Draft -> pending_approval -> issued ->
--    partially_paid -> paid, or void. The number comes from sequences
--    ('sales.invoice' / 'sales.credit_note', D-06) only when it is issued,
--    so a rejected or abandoned draft never burns one. bill_to is a snapshot
--    of the contact (name, address, NTN, STRN) taken at issue.
--  * invoice_lines: amounts from the one pricing function (app/pricing.py);
--    the tax code, rate and rate id are snapshotted on the line.
--  * invoice_payments: append-only; partial payments allowed, never more than
--    the balance.
--  * Credit notes are invoices of kind 'credit_note' pointing at the invoice
--    they credit (credit_of_id); the invoice's credited_minor follows them.
--  * Once issued, money and lines can't change: a trigger refuses it even
--    for code that forgets (the app answers 409 first).
--  * crm_invoice_requests (v1) becomes read-only history: every request is
--    converted to an invoice with the same id, one line, the UUID prefix as
--    legacy_ref and no new number (old invoices keep their old reference).
--    contact_id stays updatable so a contact merge can still re-point it.
-- ============================================================================

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  kind                text not null default 'invoice',
  number              text,
  period_key          text,
  legacy_ref          text,
  status              text not null default 'draft',
  contact_id          uuid references contacts(id),
  lead_id             uuid references crm_leads(id) on delete set null,
  credit_of_id        uuid references invoices(id),
  issue_date          date,
  due_date            date,
  currency            char(3) not null default 'PKR',
  tax_inclusive       boolean not null default false,
  subtotal_minor      bigint not null default 0,
  line_discount_minor bigint not null default 0,
  discount_minor      bigint not null default 0 check (discount_minor >= 0),
  tax_minor           bigint not null default 0,
  total_minor         bigint not null default 0 check (total_minor >= 0),
  paid_minor          bigint not null default 0 check (paid_minor >= 0),
  credited_minor      bigint not null default 0 check (credited_minor >= 0),
  bill_to             jsonb not null default '{}',
  notes               text not null default '' check (length(notes) <= 4000),
  reason              text not null default '' check (length(reason) <= 500),
  requested_by        uuid references users(id) on delete set null,
  approved_by         uuid references users(id) on delete set null,
  approved_at         timestamptz,
  issued_at           timestamptz,
  voided_by           uuid references users(id) on delete set null,
  voided_at           timestamptz,
  last_reminded_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invoices_kind_check check (kind in ('invoice', 'credit_note')),
  constraint invoices_status_check
    check (status in ('draft', 'pending_approval', 'issued', 'partially_paid', 'paid', 'void')),
  -- Only a request carried over from v1 may lack a contact (0061).
  constraint invoices_contact_check check (contact_id is not null or legacy_ref is not null),
  constraint invoices_credit_check check ((kind = 'credit_note') = (credit_of_id is not null)),
  constraint invoices_settled_check check (paid_minor + credited_minor <= total_minor),
  unique (tenant_id, id)
);
create unique index invoices_number_key on invoices (tenant_id, kind, number) where number is not null;
create index invoices_list_idx on invoices (tenant_id, status, created_at desc);
create index invoices_contact_idx on invoices (contact_id);
create index invoices_lead_idx on invoices (lead_id);
create index invoices_credit_of_idx on invoices (credit_of_id);
create index invoices_due_idx on invoices (tenant_id, due_date) where status in ('issued', 'partially_paid');

create table invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  invoice_id          uuid not null,
  position            int not null,
  product_id          uuid references pos_products(id) on delete set null,
  description         text not null check (length(btrim(description)) between 1 and 300),
  qty                 numeric(12,3) not null check (qty > 0),
  unit_price_minor    bigint not null check (unit_price_minor >= 0),
  line_discount_minor bigint not null default 0 check (line_discount_minor >= 0),
  share_minor         bigint not null default 0 check (share_minor >= 0),
  tax_code            text,
  tax_rate_id         uuid references tax_rates(id),
  tax_rate_pct        numeric(7,4) not null default 0,
  net_excl_minor      bigint not null,
  tax_minor           bigint not null,
  total_minor         bigint not null,
  foreign key (tenant_id, invoice_id) references invoices (tenant_id, id) on delete cascade,
  unique (invoice_id, position)
);

create table invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  invoice_id    uuid not null,
  method        text not null,
  amount_minor  bigint not null check (amount_minor > 0),
  paid_on       date not null,
  reference     text not null default '' check (length(reference) <= 120),
  received_by   uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, invoice_id) references invoices (tenant_id, id),
  constraint invoice_payments_method_check
    check (method in ('cash', 'bank', 'cheque', 'card', 'jazzcash', 'easypaisa', 'raast', 'wht_adjustment'))
);
create index invoice_payments_invoice_idx on invoice_payments (invoice_id);

-- Numbered documents are never deleted; payments are append-only; lines are
-- replaced wholesale while the invoice is still editable.
grant select, insert, update on invoices to app_user;
grant select, insert, delete on invoice_lines to app_user;
grant select, insert on invoice_payments to app_user;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_lines', 'invoice_payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

call bos_branch_scope('invoices', true);

-- ── Issued means frozen ─────────────────────────────────────────────────────
create or replace function invoices_freeze() returns trigger language plpgsql as $$
begin
  if old.status in ('draft', 'pending_approval') then
    return new;
  end if;
  if new.subtotal_minor is distinct from old.subtotal_minor
     or new.line_discount_minor is distinct from old.line_discount_minor
     or new.discount_minor is distinct from old.discount_minor
     or new.tax_minor is distinct from old.tax_minor
     or new.total_minor is distinct from old.total_minor
     or new.tax_inclusive is distinct from old.tax_inclusive
     -- contact_id is a link a contact merge may re-point; what was billed is
     -- the frozen bill_to snapshot.
     or new.bill_to is distinct from old.bill_to
     -- numbered once, as issuing's last step, then never renumbered
     or new.number is distinct from old.number and old.number is not null
     or new.issue_date is distinct from old.issue_date
     or new.kind is distinct from old.kind then
    raise exception 'invoice % is %: its amounts, lines and number are frozen', old.id, old.status
      using errcode = 'P0001';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'a void invoice stays void' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoices_freeze before update on invoices for each row execute function invoices_freeze();

create or replace function invoice_lines_freeze() returns trigger language plpgsql as $$
declare
  st text;
begin
  -- The v1 conversion (owner only) writes the lines of already-issued
  -- invoices; the app's role can't use the switch even if it set it.
  if current_setting('bos.invoices_from_v1', true) = 'on' and current_user <> 'app_user' then
    return coalesce(new, old);
  end if;
  select status into st from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is not null and st not in ('draft', 'pending_approval') then
    raise exception 'the invoice is %: its lines are frozen', st using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_freeze before insert or update or delete on invoice_lines
  for each row execute function invoice_lines_freeze();

create trigger audit after insert or update or delete on invoices for each row
  execute function audit_row('kind', 'number', 'status', 'contact_id', 'issue_date', 'due_date', 'total_minor',
                             'paid_minor', 'credited_minor', 'approved_by', 'voided_by', 'reason');
create trigger audit after insert or update or delete on invoice_payments for each row
  execute function audit_row('invoice_id', 'method', 'amount_minor', 'paid_on', 'reference');

-- ── v1 requests -> invoices (idempotent; callable again by tests) ───────────
create or replace function bos_invoices_from_v1() returns integer language plpgsql as $$
declare
  n integer;
begin
  perform set_config('bos.invoices_from_v1', 'on', true);
  with src as (
    select r.*, coalesce(r.contact_id, l.contact_id) as bill_contact,
           (r.amount_minor - round(r.amount_minor * (1 - r.discount_pct / 100)))::bigint as disc
      from crm_invoice_requests r
      left join crm_leads l on l.id = r.lead_id
     where not exists (select 1 from invoices i where i.id = r.id)
  ), ins as (
    insert into invoices (id, tenant_id, branch_id, kind, legacy_ref, status, contact_id, lead_id, issue_date,
                          subtotal_minor, line_discount_minor, total_minor, notes, reason, requested_by,
                          approved_by, approved_at, issued_at, voided_by, voided_at, created_at, updated_at,
                          bill_to)
    select s.id, s.tenant_id, s.branch_id, 'invoice', upper(substr(s.id::text, 1, 8)),
           case s.status when 'pending' then 'pending_approval' when 'approved' then 'issued' else 'void' end,
           s.bill_contact, s.lead_id,
           case when s.status = 'approved' then coalesce(s.decided_at, s.created_at)::date end,
           s.amount_minor, s.disc, s.amount_minor - s.disc, s.notes,
           case when s.status = 'rejected' then 'Rejected (invoice request)' else '' end,
           s.requested_by,
           case when s.status = 'approved' then s.decided_by end,
           case when s.status = 'approved' then s.decided_at end,
           case when s.status = 'approved' then coalesce(s.decided_at, s.created_at) end,
           case when s.status = 'rejected' then s.decided_by end,
           case when s.status = 'rejected' then s.decided_at end,
           s.created_at, coalesce(s.decided_at, s.created_at),
           coalesce((select jsonb_build_object('name', c.name, 'ntn', c.ntn, 'strn', c.strn,
                                               'phone', c.phone_raw, 'email', c.email)
                       from contacts c where c.id = s.bill_contact), '{}')
      from src s
    returning id, tenant_id
  )
  insert into invoice_lines (tenant_id, invoice_id, position, description, qty, unit_price_minor,
                             line_discount_minor, net_excl_minor, tax_minor, total_minor)
  select i.tenant_id, i.id, 0, 'Services', 1, s.amount_minor, s.disc,
         s.amount_minor - s.disc, 0, s.amount_minor - s.disc
    from ins i join src s on s.id = i.id;
  get diagnostics n = row_count;
  perform set_config('bos.invoices_from_v1', 'off', true);
  return n;
end $$;
revoke execute on function bos_invoices_from_v1() from public;

select bos_invoices_from_v1();

-- v1 is history now: read-only, except the contact link merges re-point.
revoke insert, delete on crm_invoice_requests from app_user;
revoke update on crm_invoice_requests from app_user;
grant update (contact_id) on crm_invoice_requests to app_user;

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('invoicing.overdue_reminders', 'Email customers about overdue invoices (weekly per invoice)',
   interval '1 day', 600, 5, 5)
on conflict (code) do nothing;
