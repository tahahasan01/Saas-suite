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
    "roles":                {S, I, U, D},       # rename, describe, delete a custom role (0053)
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
    "crm_pipelines":        {S, I, U, D},       # pipeline editing (0062)
    "crm_stages":           {S, I, U, D},       # stage editing; delete moves leads first
    "crm_leads":            {S, I, U},
    "crm_interactions":     {S},                # read-only since the activities split (0063)
    "crm_fulfillment":      {S, I, U},          # upsert
    "crm_invoice_requests": {S},                # v1 history (0074); contact_id stays updatable for merges
    "crm_lost_reasons":     {S, I, U, D},       # delete only when unused, else retired (0062)
    "activity_types":       {S, I, U},          # retired, never deleted (0063)
    "activities":           {S, I, U},          # done or cancelled, never deleted (0063)
    # contacts (0059): archived and merged, never deleted
    "contacts":             {S, I, U},          # select … for update on merge
    "contact_addresses":    {S, I, U, D},
    "tags":                 {S, I, U, D},
    "record_tags":          {S, I, D},
    "contact_review_items": {S, I, U},          # the leads backfill's queue (0060)
    # pos
    "pos_products":         {S, I, U},
    "pos_sales":            {S, I, U},          # select … for update on refunds
    "pos_sale_items":       {S, I},
    "pos_returns":          {S, I},
    "pos_return_items":     {S, I},
    "pos_sessions":         {S, I, U},          # was pos_drawers (0076)
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
    "hrms_shifts":          {S, I, U},          # U: the auto check-out / overtime policy (0066)
    "hrms_shift_assignments": {S, I, U},        # the next assignment closes an open one
    "hrms_punches":         {S, I},             # append-only: the attendance evidence
    # modules and RBAC v2 (0052-0054)
    "tenant_modules":       {S, I, U},          # upsert from the modules screen
    "feature_flags":        set(),              # platform-owned: owner pool only
    "module_purges":        {S, I, U},          # requested and cancelled; run by the worker
    "user_roles":           {S, I, D},          # a user's role set is replaced wholesale
    "role_inherits":        {S, I, D},
    "role_grants":          {S, I, D},
    "teams":                {S, I, U, D},
    "team_members":         {S, I, D},
    # hrms org (0065)
    "hrms_departments":     {S, I, U},
    "hrms_job_titles":      {S, I, U},
    "hrms_locations":       {S, I, U},
    "hrms_employee_documents": {S, I, U, D},    # a mistaken entry is removed
    "hrms_notices":            {S, I, U},       # archived, never deleted (0085)
    "hrms_notice_acks":        {S, I},          # append-only acknowledgements
    "hrms_overtime_claims":    {S, I, U},       # decided, never deleted (0086)
    "hrms_assets":             {S, I, U},       # retired, never deleted (0087)
    "hrms_asset_assignments":  {S, I, U},       # closed on return, never deleted
    "restaurant_floors":       {S, I, U},       # retired, never deleted (0089)
    "restaurant_tables":       {S, I, U},
    "restaurant_stations":     {S, I, U},
    "restaurant_station_categories": {S, I, D},   # the list is replaced
    "pos_stock_levels":        {S, I, U},       # moved only by catalog.move() (0091)
    "pay_advance_repayments":  {S, I},       # append-only (0107)
    "hrms_job_changes":      {S, I, U},       # applied or cancelled, never deleted (0106)
    "hrms_letter_templates":  {S, I, U},       # (0105)
    "hrms_letter_requests":  {S, I, U},       # answered, never deleted
    "hrms_letters":          {S, I},       # issued letters never change
    "payroll_gratuity_settings":  {S, I, U},       # one row per company (0104)
    "hrms_final_settlements":  {S, I, U},       # cancelled, never deleted
    "hrms_final_settlement_lines":  {S, I, U, D},       # edited while a draft
    "hrms_comp_off_requests":  {S, I, U},       # decided, never deleted (0103)
    "hrms_leave_encashments":  {S, I},       # append-only
    "hrms_expense_claims":   {S, I, U},       # decided or cancelled, never deleted (0102)
    "hrms_expense_lines":    {S, I},       # fixed once claimed
    "hrms_probation_reviews":  {S, I},       # append-only (0101)
    "hrms_appraisal_templates":  {S, I, U},
    "hrms_appraisal_template_kras":  {S, I, D},       # replaced as a whole
    "hrms_appraisal_cycles":  {S, I, U},
    "hrms_appraisals":       {S, I, U},
    "hrms_appraisal_ratings":  {S, I, U},
    "hrms_boarding_templates":  {S, I, U},       # retired, never deleted (0100)
    "hrms_boarding_template_tasks":  {S, I, D},       # replaced as a whole
    "hrms_boardings":        {S, I, U},       # closed, never deleted
    "hrms_boarding_tasks":   {S, I, U},
    "hrms_exit_interviews":  {S, I, U},
    # attendance v2 (0066)
    "hrms_kiosks":          {S, I, U},          # revoke; last_seen_at is written by the owner
    "hrms_attendance_corrections": {S, I, U},   # decided in place, audited by trigger
    # holiday calendars (0067)
    "hrms_holiday_calendars": {S, I, U, D},     # a calendar is removed with its days
    "hrms_blackout_days":   {S, I, D},
    # leave v2 (0068)
    "hrms_leave_types":     {S, I, U},
    "hrms_leave_ledger":    {S, I},             # append-only: balance = sum(days)
    "hrms_leave_approvals": {S, I},             # append-only
    # payroll (3F)
    "hrms_compensation":    {S, I},             # salary history: never edited in place (0069)
    "pay_components":       {S, I, U},          # never deleted: payslip lines name them
    "pay_structures":       {S, I, U},
    "pay_structure_lines":  {S, I, D},          # a structure's lines are replaced on save
    "payroll_runs":         {S, I, U},          # never deleted; a trigger enforces the state machine
    "payslips":             {S, I, D},          # rebuilt while calculating, frozen after (trigger)
    "payslip_lines":        {S, I, D},
    "payroll_run_events":   {S, I},             # append-only
    "pay_one_offs":         {S, I, U},
    "pay_advances":         {S, I, U},
    "statutory_schemes":    {S},                # platform reference data (0071)
    "statutory_rates":      {S},
    "minimum_wages":        {S},
    "tenant_statutory_registrations": {S, I, U},   # upsert
    "payslip_links":        set(),              # hashed download tokens: owner connection only (0072)
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
    # org data (3A, p3-orgdata, 0055–0058)
    "pk_regions":           {S},                # global reference data
    "branches":             {S, I, U},          # deactivate, never delete
    "user_branches":        {S, I},             # home branch for users added by the team screen
    "tenant_company":       {S, I, U},          # upsert from the company screen
    "sequences":            {S, I, U},          # created on first use from the defaults
    "sequence_counters":    {S, I, U},          # upsert allocates; never delete (reissue)
    "files":                {S, I, U},          # attach/detach; deletes are the GC's (owner)
    "tenant_branding":      {S, I, U},          # upsert from the company screen
    "tax_rates":            {S},                # global reference data, migrations write it
    "tax_categories":       {S},                # global reference data
    # invoices v2 (0074): numbered documents are never deleted
    "invoices":             {S, I, U},
    "invoice_lines":        {S, I, D},          # replaced wholesale while editable
    "invoice_payments":     {S, I},             # append-only
    # CRM selling (wave D, 0120+)
    "crm_deal_lines":       {S, I, D},          # replaced wholesale
    "crm_settings":         {S, I, U},          # upsert from CRM settings
    "crm_quotes":           {S, I, U},          # status changes only; never deleted
    "crm_quote_lines":      {S, I},             # written once, with the quote
    "crm_web_forms":        {S, I, U},          # switched off, never deleted
    "crm_assignment_pool":  {S, I, U, D},       # members added and removed
    "crm_targets":          {S, I, U, D},       # set, replaced and removed by managers
    "contact_consents":     {S, I, U},          # per channel; history in the audit/timeline
    "crm_segments":         {S, I, U},          # archived, never deleted
    "crm_templates":        {S, I, U},          # archived, never deleted
    "crm_campaigns":        {S, I, U},          # draft -> sent; never deleted
    "crm_campaign_recipients": {S, I},          # written once, when sent
    # fee vouchers (0126)
    "invoice_plans":        {S, I, U},          # switched off, never deleted
    "invoice_runs":         {S, I, U},          # draft -> issued; never deleted
    # catalog v2 and stock (0075)
    "pos_categories":       {S, I, U},          # retired, never deleted
    "pos_product_barcodes": {S, I, D},
    "pos_barcode_rules":    {S, I, U, D},
    "pos_stock_moves":      {S, I},             # append-only ledger
    # registers and sessions (0076)
    "pos_registers":        {S, I, U},
    "pos_devices":          {S, I, U},
    "pos_payments":         {S, I},             # part of the sale, never edited
    "pos_cash_moves":       {S, I},             # append-only
    "pos_held_bills":       {S, I, D},          # parked carts, resumed once (0078)
    "customer_ledger":      {S, I},             # khata: append-only (0079)
    "pos_cashier_sessions": {S, I, U},          # signed out by setting ended_at (0080)
}

# Column-level grants don't appear in role_table_grants, so they are pinned
# here and checked by tests/core/test_company_settings.py.
APP_USER_COLUMN_UPDATES: dict[str, set[str]] = {
    "tenants": {"name", "timezone", "fy_start_month", "updated_at", "allow_negative_stock"},
    "crm_invoice_requests": {"contact_id"},     # v1 is read-only; merges re-point (0074)
    "customer_ledger": {"contact_id"},          # append-only khata; merges re-point (0082)
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
    "timeline_events",          # ai_v_interactions reads the lead timeline (0063)
    "pos_sales", "pos_sale_items", "pos_products", "pos_returns",
    "hrms_employees", "hrms_attendance", "hrms_leave_requests",
}
AI_VIEW_OWNER: dict[str, set[str]] = {name: ({S} if name in _VIEW_BASES else set()) for name in APP_USER}
AI_VIEW_OWNER_USER_COLUMNS = {"id", "tenant_id", "name"}
