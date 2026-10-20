# Audit trail and record timeline

Decision D-07, gate M9, TRD §3.10 and §4.4. Migration `0044_audit_partitioned_timeline.sql`.

## What is written, and by whom

| Table | Written by | Shape |
|-------|------------|-------|
| `audit_log` (partitioned by UTC month) | the `audit_row()` trigger on audited tables; `audit_event()` for semantic events | `changes = {"col": [old, new]}`; guarded columns are `["***","***"]` and their names go in `guarded` |
| `timeline_events` | `app/audit.py` `track()` | one row per user-facing event on a record (note, approved, won …) |

- **Audited tables** (an AFTER INSERT/UPDATE/DELETE row trigger): `pos_sales`, `pos_returns`,
  `pos_products` (name, price, cost, tax, HS code, active), `hrms_employees` (incl. salary and CNIC, masked),
  `hrms_leave_requests` (decisions), `crm_invoice_requests` (approvals), `subscriptions`,
  `payment_requests`, `fbr_settings` (token masked). A sale void doesn't exist yet. When it does, it
  will be a `pos_sales` update or delete, which is already audited.
- An update that changes no tracked column writes nothing. That keeps stock movements on
  `pos_products` out of the log.
- **Semantic events** (`audit.event(conn, "module.verb", entity, id, changes=, data=)`):
  `auth.login`, `module.enable`/`module.disable`, `user.create/update/invite`, `role.create`,
  `workflow.create`, `export.leads`, `export.products`, `fbr.invoice.resolve`,
  `hrms.leave.approve/reject`, `invoicing.invoice.approve/reject`. The action must look like
  `module.verb`, so an event can't pass itself off as a trigger row.
- `audit.record(...)` (the pre-0044 helper) still works. It turns `before`/`after` into a diff and
  ignores `actor_id`, because the actor now comes from the context. New code should call `event()`.

### Adding an audited table

```sql
create trigger audit after insert or update or delete on <table> for each row
  execute function audit_row('col_a', 'col_b', '!guarded_col');
```

Then add the table to `AUDITED_TABLES` in `services/api/tests/core/test_audit.py`. A leading `!`
marks a column as guarded. The function also masks these column names even when the `!` is missing:
`cnic, cnic_enc, salary_minor, basic_minor, iban, bank_account, account_number, cost_minor, token,
password_hash, mfa_totp_enc`. To extend that list, change it in both `audit_row()` and `audit_event()`.

## Security model (St04 risk 5)

- `app_user` holds **SELECT** on `audit_log` and nothing else. Its only way to add rows is
  `audit_event()`. It holds no privilege on any partition (`test_partitions_carry_no_grants_and_have_rls`).
- `audit_row()` and `audit_event()` are `SECURITY DEFINER` and owned by **`audit_writer`**. That role is
  `nologin` with no `BYPASSRLS`, and holds INSERT on `audit_log` only. Both functions pin
  `search_path = pg_catalog, pg_temp` and schema-qualify every relation.
- `audit_event()` always writes the caller's own tenant (`app.tenant_id`). It refuses to run
  without one.
- RLS on `audit_log` follows the usual `tenant_isolation` policy. One extra policy lets `audit_writer`
  insert when **no** tenant is set. That case covers triggers firing on owner-connection writes
  (signup, `scripts/activate_payment.py`, the worker), where the audited row supplies the tenant.
- `UPDATE` and `TRUNCATE` on `audit_log` raise for everyone, the owner included. `DELETE` has no
  grant. Only the owner-run retention function deletes rows.
- `audit_log` has **no foreign keys**, so a tenant's cascade delete can't fail on its own audit
  rows. **Tenant purge must delete the tenant's `audit_log` rows explicitly**, keeping the
  minimal record of the deletion itself (checklist §12).
- Production roles: the migration runs `create role audit_writer` and `alter function … owner to
  audit_writer`. That needs a superuser, or a migrator with `CREATEROLE` that is a member of
  `audit_writer`. 0032 makes the same assumption for `ai_view_owner`.

## Request and job context

`app/context.py` holds the actor for the current request or job. `db.tenant_conn()` stamps it on
every transaction as transaction-local GUCs, and the trigger reads them:

| GUC | Request | Job | Neither (owner script, signup, test) |
|-----|---------|-----|---------------------------------------|
| `app.actor_id` | the session user (set in `deps.current_auth`) | empty | empty |
| `app.request_id` | `X-Request-ID` header if it is safe (≤ 64 chars of `[A-Za-z0-9._:-]`), otherwise a new hex id. It is echoed back on the response | `job:<name>:<run_id>` | empty |
| `app.actor_kind` | `user` | `job` | `system` |

`RequestContextMiddleware` (`app/main.py`) gives each HTTP request a fresh context. Nothing
carries over from one request to the next (`test_the_context_does_not_leak_between_requests`).

### For the worker (D-08)

```python
from app import audit, context, db

# A tenant-scoped job step: RLS applies as usual, and audit rows read actor_kind='job'.
async with db.job_conn(tenant_id, "payroll.calculate", run_id=str(run_id)) as conn:
    ...

# Several tenant connections under one job context:
with context.job("fbr.retry", run_id=str(run_id)):
    async with db.tenant_conn(tenant_id) as conn:
        ...

# An owner-connection transaction (cross-tenant dispatch) that writes audited rows:
with context.job("billing.expire_trials", run_id=str(run_id)):
    async with db.owner_conn() as conn, conn.transaction():
        await db.apply_context(conn)   # stamps app.actor_kind='job' etc.
        ...
```

### Scheduled maintenance (owner connection; seeded by migration 0048, handlers in `app/jobs.py`)

| Job | Call | Schedule | What it does |
|-----|------|----------|--------------|
| `audit.partitions` | `await audit.create_partitions(conn, months_ahead=3)` | daily | Creates this month and the next 3 (`audit_log_yYYYYmMM`). Idempotent; returns the names it created. Rows that landed in `audit_log_default` while the job was down are moved into their month |
| `audit.retention` | `await audit.apply_retention(conn)` | monthly | Deletes rows older than each tenant's plan window (below). Returns the count |
| `audit.detach` | `names = await audit.detach_expired_partitions(conn, keep_months=84)` | monthly | Detaches months older than the longest window and logs their names. The archive bucket isn't configured yet, so the detached tables **stay in the database** (out of `audit_log`) until an operator exports each one as compressed JSONL to the append-only archive bucket and runs `drop table <name>`. Neither the SQL nor the job drops data |

The SQL functions behind them are `audit_log_create_partitions(int)`, `audit_log_create_partition(date)`,
`audit_log_apply_retention(timestamptz)` and `audit_log_detach_expired(int, timestamptz)`. None of them
is executable by `public`.

## Retention per plan (TRD TR-NFR-15, 13-system-design §7.5)

| Plan | Hot in Postgres | Function |
|------|-----------------|----------|
| Starter (and no subscription) | 13 months | `audit_retention_months('starter')` |
| Growth | 36 months | `audit_retention_months('growth')` |
| Enterprise | 84 months | `audit_retention_months('enterprise')` |
| Money, tax and payroll entities, on any plan | at least 72 months | `audit_kept_entities()`: `pos_sales`, `pos_returns`, `pos_fbr_invoices`, `fbr_settings`, `crm_invoice_requests`, `invoice_request`, `hrms_employees`, `subscriptions`, `payment_requests` (add payroll tables as they arrive) |

**Founder decision needed (L3):** the 6-year minimum for tax and payroll records has to be confirmed
by an adviser under the Sales Tax Act and the Income Tax Ordinance. The archive bucket also needs
credentials (S3-compatible, object lock), which the founder provides.

## Timeline

`timeline_events(tenant_id, entity_type, entity_id, contact_id, kind, actor_id, body, changes, payload,
source_ref, occurred_at)` is tenant-scoped with RLS, and `app_user` holds `select, insert` (append-only).
`kind` is one of `models.TimelineKind`. A repeated `source_ref` is ignored, so a retried job doesn't
post twice. Leave decisions (`leave_request`) and invoice decisions (`invoice_request`) write to it
today. The merged timeline endpoint (`GET /records/{entity}/{id}/timeline`) is Phase 3.
