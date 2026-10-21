-- ============================================================================
-- Migration 0072 — Short-lived signed links for payslip PDFs (St03 risk 14)
--
-- The portal asks for a link to one of the employee's own payslips; the link
-- carries a random token that works for 5 minutes without a session (so it
-- opens in a new tab or a phone's PDF viewer). Only sha256(token) is stored,
-- as with auth_tokens, and the table is reached through the owner connection
-- only: app_user holds no privilege on it.
-- ============================================================================

create table if not exists payslip_links (
  token_hash text primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  payslip_id uuid not null references payslips(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists payslip_links_expiry on payslip_links (expires_at);

revoke all on payslip_links from app_user;
revoke all on payslip_links from public;
alter table payslip_links enable row level security;
drop policy if exists tenant_isolation on payslip_links;
create policy tenant_isolation on payslip_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
