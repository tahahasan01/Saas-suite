"""The reviewed allow-list of what each runtime role may do to each relation.

test_grants.py asserts the database matches this EXACTLY, and that every table
and view in `public` has an entry. So a migration that adds a table must add a
line here (and an explicit grant, since migration 0032 removed the default
grant to app_user) — the review of this file is the review of the grant.

Verbs are the minimum the app's SQL uses under `tenant_conn` (owner-only paths
such as signup, login and token handling don't count):
  * append-only logs get SELECT, INSERT and nothing else;
  * `INSERT … ON CONFLICT DO UPDATE` and `SELECT … FOR UPDATE` need UPDATE;
  * an empty set means app_user must hold no privilege at all.
"""
from __future__ import annotations

S, I, U, D = "SELECT", "INSERT", "UPDATE", "DELETE"

APP_USER: dict[str, set[str]] = {
    # platform
    "tenants":              {S},
    "roles":                {S, I},
    "permissions":          {S, I},
    "users":                {S, I, U},
    "entitlements":         {S, I, U},          # upsert from the modules screen
    "subscriptions":        {S},                # written by signup/activation (owner)
    "payment_requests":     {S, I, U},
    "notifications":        {S, I, U},
    "workflows":            {S, I, U, D},
    # append-only: rows are added only through the audit_row() trigger and
    # audit_event(), security definer as audit_writer (0044); partitions are
    # reached through the parent and are left out of this matrix.
    "audit_log":            {S},
    "timeline_events":      {S, I},             # append-only
    "ai_interactions":      {S, I},             # append-only
    "terminology":          {S},                # global reference data
    "occasion_calendar":    {S},                # global reference data
    # secrets and the migration ledger: owner connection only (migration 0025)
    "sessions":             set(),
    "auth_tokens":          set(),
    "schema_migrations":    set(),
    # the worker's job tables (0043): the owner (worker) connection only
    "scheduled_jobs":       set(),
    "job_triggers":         set(),
    "job_runs":             set(),
    # crm
    "crm_pipelines":        {S, I},
    "crm_stages":           {S, I},
    "crm_leads":            {S, I, U},
    "crm_interactions":     {S, I, U},
    "crm_fulfillment":      {S, I, U},          # upsert
    "crm_invoice_requests": {S, I, U},
    # pos
    "pos_products":         {S, I, U},
    "pos_sales":            {S, I, U},          # select … for update on refunds
    "pos_sale_items":       {S, I},
    "pos_returns":          {S, I},
    "pos_return_items":     {S, I},
    "pos_drawers":          {S, I, U},
    "pos_suppliers":        {S, I},
    "pos_purchase_orders":  {S, I, U},
    "pos_po_items":         {S, I, U},
    "pos_fbr_invoices":     {S, I, U},
    "outbox":               {S, I},     # state changes run on the owner (worker) connection
    "fbr_settings":         {S, I, U},
    # hrms
    "hrms_employees":       {S, I, U},
    "hrms_attendance":      {S, I, U},          # upsert on check-in
    "hrms_leave_requests":  {S, I, U},
    "hrms_leave_policies":  {S, I, U},
    "hrms_holidays":        {S, I, U, D},       # upsert + delete
    # AI views: app_user reaches them only through `set local role ai_reader`
    "ai_v_leads":           set(),
    "ai_v_interactions":    set(),
    "ai_v_sales":           set(),
    "ai_v_sale_items":      set(),
    "ai_v_products":        set(),
    "ai_v_returns":         set(),
    "ai_v_employees":       set(),
    "ai_v_attendance":      set(),
    "ai_v_leave":           set(),
}

AI_VIEWS = {name for name in APP_USER if name.startswith("ai_v_")}

# audit_writer owns the audit definer functions; this is all they may do.
AUDIT_WRITER: dict[str, set[str]] = {name: ({I} if name == "audit_log" else set()) for name in APP_USER}

# ai_reader runs the model's SQL: the curated views, read-only, nothing else.
AI_READER: dict[str, set[str]] = {name: ({S} if name in AI_VIEWS else set()) for name in APP_USER}

# ai_view_owner owns the ai_v_* views (security_invoker = false), so the views
# read the base tables with ITS privileges and under ITS RLS — never the
# querying role's. It may read only what the views select from; `users` is
# granted column by column so no view can ever expose a password hash, which
# is why it has no table-level entry here.
_VIEW_BASES = {
    "crm_leads", "crm_stages", "crm_pipelines", "crm_interactions",
    "pos_sales", "pos_sale_items", "pos_products", "pos_returns",
    "hrms_employees", "hrms_attendance", "hrms_leave_requests",
}
AI_VIEW_OWNER: dict[str, set[str]] = {name: ({S} if name in _VIEW_BASES else set()) for name in APP_USER}
AI_VIEW_OWNER_USER_COLUMNS = {"id", "tenant_id", "name"}
