/* Generated from services/api's OpenAPI schema by packages/api-client/scripts/generate.mjs.
 * Do not edit by hand: run `npm run api-client:generate`. CI fails when this is stale. */

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ready */
        get: operations["ready_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/signup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Signup */
        post: operations["signup_auth_signup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Forgot
         * @description Always 204, whatever the address and whatever SMTP is doing: the email
         *     is queued (never sent inline), so the answer, its timing and a mail
         *     outage reveal nothing about which emails have accounts (P1-7).
         */
        post: operations["forgot_auth_forgot_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset */
        post: operations["reset_auth_reset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change Password
         * @description Change the password and sign out every other device. The caller keeps
         *     working on a re-issued session: its old one died with the epoch bump.
         */
        post: operations["change_password_auth_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify */
        post: operations["verify_auth_verify_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/accept-invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept Invite */
        post: operations["accept_invite_auth_accept_invite_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Me */
        get: operations["me_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Overview */
        get: operations["overview_dashboard_overview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/terminology": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Terminology
         * @description Label map for the signed-in tenant's industry.
         */
        get: operations["my_terminology_terminology_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/terminology/preview/{industry_type}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Preview Terminology
         * @description Public preview used during signup/onboarding (before a session exists).
         */
        get: operations["preview_terminology_terminology_preview__industry_type__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/entitlements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Entitlements */
        get: operations["list_entitlements_entitlements_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/entitlements/{section}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Toggle Section */
        patch: operations["toggle_section_entitlements__section__patch"];
        trace?: never;
    };
    "/team/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_team_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_team_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/team/users/{user_id}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set User Roles
         * @description Give someone several roles (D-04): they hold the union, at the widest
         *     scope. The first role is their primary one. Their sessions end (D-05).
         */
        put: operations["set_user_roles_team_users__user_id__roles_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/team/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update User */
        patch: operations["update_user_team_users__user_id__patch"];
        trace?: never;
    };
    "/team/invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invite Member
         * @description 204 once the invite is recorded. The email is queued in the same
         *     transaction and sent after commit, so a mail outage can't fail it.
         */
        post: operations["invite_member_team_invite_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/team/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Roles */
        get: operations["list_roles_team_roles_get"];
        put?: never;
        /** Create Role */
        post: operations["create_role_team_roles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Leads
         * @description Bulk-load leads from a CSV posted as the raw request body.
         *
         *     Row-level tolerance on purpose: a 2,000-row file with three bad rows imports
         *     1,997 and names the three — failing the whole file sends the user back to
         *     Excel to hunt for a needle. Duplicate checks run inside the same transaction,
         *     so a phone number appearing twice *within the file* is caught too.
         */
        post: operations["import_leads_crm_leads_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Leads
         * @description Their data is theirs — export is also what makes import trustworthy.
         */
        get: operations["export_leads_crm_leads_export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Summary */
        get: operations["summary_crm_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/fulfillment/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fulfillment Schema */
        get: operations["fulfillment_schema_crm_fulfillment_schema_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/fulfillment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Fulfillment */
        get: operations["get_fulfillment_crm_leads__lead_id__fulfillment_get"];
        /** Save Fulfillment */
        put: operations["save_fulfillment_crm_leads__lead_id__fulfillment_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Leads */
        get: operations["list_leads_crm_leads_get"];
        put?: never;
        /** Create Lead */
        post: operations["create_lead_crm_leads_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Lead */
        get: operations["get_lead_crm_leads__lead_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Lead */
        patch: operations["update_lead_crm_leads__lead_id__patch"];
        trace?: never;
    };
    "/crm/leads/{lead_id}/won": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Win Lead */
        post: operations["win_lead_crm_leads__lead_id__won_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/lost": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Lose Lead */
        post: operations["lose_lead_crm_leads__lead_id__lost_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Restore Lead */
        post: operations["restore_lead_crm_leads__lead_id__restore_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lead Timeline */
        get: operations["lead_timeline_crm_leads__lead_id__timeline_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Note */
        post: operations["add_note_crm_leads__lead_id__notes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/interactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Log Interaction
         * @description The pre-activities way to log a contact, kept for API callers: the
         *     contact lands on the timeline (kind 'note' or 'call'), a follow-up time
         *     becomes a planned activity, and `interaction.logged` still fires.
         */
        post: operations["log_interaction_crm_leads__lead_id__interactions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ai/ask": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ask
         * @description Answers across every module the tenant has enabled.
         *
         *     Deliberately not gated on a single section: the whole point is that one
         *     question can span sales, stock and staff. Access is scoped by passing the
         *     enabled sections down to the guard, which allowlists views accordingly — so
         *     a POS-only tenant can never reach a CRM view.
         */
        post: operations["ask_ai_ask_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Notifications */
        get: operations["list_notifications_notifications_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark All Read */
        post: operations["mark_all_read_notifications_read_all_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Workflows */
        get: operations["list_workflows_workflows_get"];
        put?: never;
        /** Create Workflow */
        post: operations["create_workflow_workflows_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflow_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Workflow */
        delete: operations["delete_workflow_workflows__workflow_id__delete"];
        options?: never;
        head?: never;
        /** Update Workflow */
        patch: operations["update_workflow_workflows__workflow_id__patch"];
        trace?: never;
    };
    "/invoices/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Plans */
        get: operations["list_plans_invoices_plans_get"];
        put?: never;
        /** Create Plan */
        post: operations["create_plan_invoices_plans_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/plans/{plan_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Runs */
        get: operations["list_runs_invoices_plans__plan_id__runs_get"];
        put?: never;
        /**
         * Make Run
         * @description One draft invoice per contact for the month, for review.
         */
        post: operations["make_run_invoices_plans__plan_id__runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/runs/{invoice_run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Run */
        get: operations["get_run_invoices_runs__invoice_run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/runs/{invoice_run_id}/issue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Issue Run */
        post: operations["issue_run_invoices_runs__invoice_run_id__issue_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/runs/{invoice_run_id}/pdfs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Run Pdfs */
        get: operations["run_pdfs_invoices_runs__invoice_run_id__pdfs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Invoices */
        get: operations["list_invoices_invoices_get"];
        put?: never;
        /** Create Invoice */
        post: operations["create_invoice_invoices_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/aging": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Receivables Aging
         * @description What each customer owes, by how late: not yet due, 1-30, 31-60, 61-90, 90+ days.
         */
        get: operations["receivables_aging_invoices_aging_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Invoice */
        get: operations["get_invoice_invoices__invoice_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Invoice */
        patch: operations["update_invoice_invoices__invoice_id__patch"];
        trace?: never;
    };
    "/invoices/{invoice_id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit Invoice */
        post: operations["submit_invoice_invoices__invoice_id__submit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve Invoice */
        post: operations["approve_invoice_invoices__invoice_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject Invoice */
        post: operations["reject_invoice_invoices__invoice_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record Payment */
        post: operations["record_payment_invoices__invoice_id__payments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/credit-notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Credit Invoice */
        post: operations["credit_invoice_invoices__invoice_id__credit_notes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Void Invoice */
        post: operations["void_invoice_invoices__invoice_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Invoice Pdf */
        get: operations["invoice_pdf_invoices__invoice_id__pdf_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/invoices/{invoice_id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send Invoice
         * @description Email the issued invoice with its PDF, through the outbox: SMTP being
         *     down never fails this, and the PDF is built when the email goes.
         */
        post: operations["send_invoice_invoices__invoice_id__send_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Products
         * @description One page of the catalog; `X-Total-Count` is how many match in all.
         *
         *     Archived products stay listable behind a flag — otherwise archiving is a
         *     one-way trip and the catalog can never be un-done. The default page size
         *     (50 for a search, 200 otherwise) is what the till and pickers have always
         *     received; the Products page pages with limit/offset so nothing past the
         *     first page is unreachable. Ties on name are broken by id so pages never
         *     overlap or skip a row.
         */
        get: operations["list_products_pos_products_get"];
        put?: never;
        /** Create Product */
        post: operations["create_product_pos_products_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lookup
         * @description What the scanner read: the product and how much one scan counts as (a
         *     carton barcode, or a weight/price label from a scale).
         */
        get: operations["lookup_pos_products_lookup_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Product */
        patch: operations["update_product_pos_products__product_id__patch"];
        trace?: never;
    };
    "/pos/sales": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sales History
         * @description Search by receipt number, customer name or phone; filter by method,
         *     status, register and local day. Own-scope cashiers see their own sales.
         */
        get: operations["sales_history_pos_sales_get"];
        put?: never;
        /** Checkout */
        post: operations["checkout_pos_sales_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sales/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Quote Sale
         * @description Price a cart exactly as a sale would be priced, without recording it, so
         *     the till shows the server's own total (tax-exclusive prices included).
         */
        post: operations["quote_sale_pos_sales_quote_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/suppliers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Suppliers */
        get: operations["list_suppliers_pos_suppliers_get"];
        put?: never;
        /** Create Supplier */
        post: operations["create_supplier_pos_suppliers_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/purchase-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Pos */
        get: operations["list_pos_pos_purchase_orders_get"];
        put?: never;
        /**
         * Create Po
         * @description Created straight into 'ordered' — the SME phones the order in; this
         *     record exists so the delivery can be received against it.
         */
        post: operations["create_po_pos_purchase_orders_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/purchase-orders/{po_id}/receive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive Po
         * @description Goods arrive. Stock rises here and nowhere else on the inbound side.
         *
         *     Partial deliveries are the norm, so lines carry received_qty and the PO only
         *     flips to 'received' once every line is complete. Over-receiving is refused —
         *     a delivery larger than the order is a paperwork problem to resolve, not a
         *     number to absorb silently.
         */
        post: operations["receive_po_pos_purchase_orders__po_id__receive_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/purchase-orders/{po_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Po */
        post: operations["cancel_po_pos_purchase_orders__po_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/drawer/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Open Drawer */
        post: operations["open_drawer_pos_drawer_open_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/drawer/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current Drawer */
        get: operations["current_drawer_pos_drawer_current_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/drawer/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Close Drawer
         * @description Counts the cash only; the register's other methods count as expected.
         *     Freezes the figures at close (pos_sessions.close).
         */
        post: operations["close_drawer_pos_drawer_close_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/drawer/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Drawer History */
        get: operations["drawer_history_pos_drawer_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Products
         * @description Bulk-load the catalog from CSV. A shop's stock list almost always already
         *     exists in Excel — retyping 500 SKUs by hand is how trials die.
         */
        post: operations["import_products_pos_products_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Products */
        get: operations["export_products_pos_products_export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sales/{sale_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Sale
         * @description One sale with what can still be returned. `sale_id` is the sale's id
         *     or the receipt number printed on it (R1-2026-27-000042, 0078; an offline
         *     till's own number once synced), so a return starts from the paper.
         */
        get: operations["get_sale_pos_sales__sale_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sales/{sale_id}/returns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Return */
        post: operations["create_return_pos_sales__sale_id__returns_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Summary */
        get: operations["summary_pos_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/restock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Restock
         * @description Velocity-based reorder advice: flag products running out relative to how
         *     fast they sell (30-day velocity), plus anything below its low-stock line.
         */
        get: operations["restock_pos_restock_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/forecast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Forecast
         * @description 60-day look-ahead: upcoming occasions with projected demand per product
         *     from recent velocity × event duration × expected uplift.
         */
        get: operations["forecast_pos_forecast_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fbr/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Settings */
        get: operations["get_settings_fbr_settings_get"];
        /** Update Settings */
        put: operations["update_settings_fbr_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fbr/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Invoices
         * @description Submission log — the retailer's evidence of what was filed and what was not.
         */
        get: operations["list_invoices_fbr_invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fbr/invoices/{invoice_id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resolve Invoice
         * @description Settle a filing whose outcome is unknown (the connection dropped after
         *     it was sent). FBR offers no lookup, so a person checks IRIS: filed (record
         *     FBR's number, never resend) or not filed (send it once more).
         */
        post: operations["resolve_invoice_fbr_invoices__invoice_id__resolve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Employees */
        get: operations["list_employees_hrms_employees_get"];
        put?: never;
        /** Create Employee */
        post: operations["create_employee_hrms_employees_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invite Employee
         * @description Give an employee their own self-service login. Sends an invite they accept
         *     to set a password — the same flow as team invites, on the Employee role.
         */
        post: operations["invite_employee_hrms_employees__employee_id__invite_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Employee */
        get: operations["get_employee_hrms_employees__employee_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Employee */
        patch: operations["update_employee_hrms_employees__employee_id__patch"];
        trace?: never;
    };
    "/hrms/attendance/checkin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check In */
        post: operations["check_in_hrms_attendance_checkin_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/attendance/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check Out */
        post: operations["check_out_hrms_attendance_checkout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/attendance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Attendance */
        get: operations["list_attendance_hrms_attendance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/attendance/week": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Attendance Week
         * @description Last 7 days as a matrix: one derived status per employee per day.
         *
         *     Derivation mirrors the payroll rules exactly — the matrix and the payslip
         *     must never disagree about the same day. In particular: today with no
         *     check-in is 'pending', not absent (the day isn't over), and WFH is its own
         *     state, never leave.
         */
        get: operations["attendance_week_hrms_attendance_week_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/shifts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Shifts */
        get: operations["list_shifts_hrms_shifts_get"];
        put?: never;
        /** Create Shift */
        post: operations["create_shift_hrms_shifts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/shifts/{shift_id}/assign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Assign Shift
         * @description Put an employee on a shift from `date_from`. An open-ended assignment
         *     that started earlier is closed the day before; any other overlap is a 409,
         *     so a day never has two shifts. It applies to punches from then on — days
         *     already derived keep their derivation.
         */
        post: operations["assign_shift_hrms_shifts__shift_id__assign_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/shift-assignments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Shift Assignments */
        get: operations["list_shift_assignments_hrms_shift_assignments_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Summary */
        get: operations["summary_hrms_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/payroll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Run Payroll
         * @description A month's payroll as it would be calculated now — saved nowhere (saved
         *     runs are /payroll/runs). Everyone's pay is on it, so it needs a payroll
         *     key, not hrms:read (D-42).
         */
        get: operations["run_payroll_hrms_payroll_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Profile */
        get: operations["my_profile_me_profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/attendance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Attendance */
        get: operations["my_attendance_me_attendance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Billing */
        get: operations["get_billing_billing_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Plans */
        get: operations["list_plans_billing_plans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upgrade */
        post: operations["upgrade_billing_upgrade_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/billing/payment-requests/{request_id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit Payment
         * @description Customer states they have sent the bank transfer.
         *
         *     This records the claim and nothing more. It deliberately does NOT activate
         *     the plan: the payer is not the party who gets to confirm that money arrived.
         *     A human reconciles the transfer against the reference and runs
         *     `scripts/activate_payment.py`, which is the only path to an active plan.
         */
        post: operations["submit_payment_billing_payment_requests__request_id__submit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/pipelines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Pipelines */
        get: operations["list_pipelines_crm_pipelines_get"];
        put?: never;
        /** Create Pipeline */
        post: operations["create_pipeline_crm_pipelines_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/pipelines/{pipeline_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Pipeline */
        delete: operations["delete_pipeline_crm_pipelines__pipeline_id__delete"];
        options?: never;
        head?: never;
        /** Update Pipeline */
        patch: operations["update_pipeline_crm_pipelines__pipeline_id__patch"];
        trace?: never;
    };
    "/crm/pipelines/{pipeline_id}/stages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Stage */
        post: operations["create_stage_crm_pipelines__pipeline_id__stages_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/pipelines/{pipeline_id}/stages/{stage_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Stage */
        delete: operations["delete_stage_crm_pipelines__pipeline_id__stages__stage_id__delete"];
        options?: never;
        head?: never;
        /** Update Stage */
        patch: operations["update_stage_crm_pipelines__pipeline_id__stages__stage_id__patch"];
        trace?: never;
    };
    "/crm/pipelines/{pipeline_id}/stages/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Reorder Stages */
        put: operations["reorder_stages_crm_pipelines__pipeline_id__stages_order_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/lost-reasons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Lost Reasons */
        get: operations["list_lost_reasons_crm_lost_reasons_get"];
        put?: never;
        /** Create Lost Reason */
        post: operations["create_lost_reason_crm_lost_reasons_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/lost-reasons/{reason_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Lost Reason
         * @description Unused: deleted. In use: retired, so past losses keep their reason.
         */
        delete: operations["delete_lost_reason_crm_lost_reasons__reason_id__delete"];
        options?: never;
        head?: never;
        /** Update Lost Reason */
        patch: operations["update_lost_reason_crm_lost_reasons__reason_id__patch"];
        trace?: never;
    };
    "/crm/reports/funnel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Funnel */
        get: operations["funnel_crm_reports_funnel_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/reports/lost-reasons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lost Reasons */
        get: operations["lost_reasons_crm_reports_lost_reasons_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/reports/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sources */
        get: operations["sources_crm_reports_sources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/lines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Lines */
        get: operations["get_lines_crm_leads__lead_id__lines_get"];
        /**
         * Put Lines
         * @description Replace the deal's lines (an empty list clears them).
         */
        put: operations["put_lines_crm_leads__lead_id__lines_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/lines/update-prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Update Prices */
        post: operations["update_prices_crm_leads__lead_id__lines_update_prices_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find Products
         * @description Active catalog products for the line editor. A rep putting products on a
         *     deal needn't hold POS rights, so this is the narrow read they get: name,
         *     unit and price, never cost or stock.
         */
        get: operations["find_products_crm_products_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Settings
         * @description Reps read the settings too: the line editor shows the discount ceiling.
         */
        get: operations["get_settings_crm_settings_get"];
        /** Put Settings */
        put: operations["put_settings_crm_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Quotes */
        get: operations["list_quotes_crm_leads__lead_id__quotes_get"];
        put?: never;
        /**
         * Create Quote
         * @description Freeze the deal's products into a numbered quote with its link; an
         *     open quote for the deal is superseded.
         */
        post: operations["create_quote_crm_leads__lead_id__quotes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/quotes/{quote_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Quote */
        get: operations["get_quote_crm_quotes__quote_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/quotes/{quote_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Quote */
        post: operations["cancel_quote_crm_quotes__quote_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/quotes/{quote_id}/invoice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invoice Quote
         * @description A draft invoice from the accepted quote's frozen lines (invoices v2).
         */
        post: operations["invoice_quote_crm_quotes__quote_id__invoice_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/targets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Targets */
        get: operations["list_targets_crm_targets_get"];
        /** Set Target */
        put: operations["set_target_crm_targets_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/targets/{target_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Target */
        delete: operations["delete_target_crm_targets__target_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/targets/copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Copy Targets */
        post: operations["copy_targets_crm_targets_copy_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/forecast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Forecast */
        get: operations["forecast_crm_forecast_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/quotes/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** View */
        get: operations["view_public_quotes__token__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/quotes/{token}/view": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Beacon */
        post: operations["beacon_public_quotes__token__view_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/quotes/{token}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept */
        post: operations["accept_public_quotes__token__accept_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/quotes/{token}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decline */
        post: operations["decline_public_quotes__token__decline_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/web-forms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Forms */
        get: operations["list_forms_crm_web_forms_get"];
        put?: never;
        /** Create Form */
        post: operations["create_form_crm_web_forms_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/web-forms/{form_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Form */
        patch: operations["update_form_crm_web_forms__form_id__patch"];
        trace?: never;
    };
    "/crm/assignment/pool": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Pool */
        get: operations["get_pool_crm_assignment_pool_get"];
        /**
         * Put Pool
         * @description Replace the pool. Members keep their place in the turn and today's count.
         */
        put: operations["put_pool_crm_assignment_pool_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/assignment/people": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pool Candidates
         * @description Active teammates, by name only: a CRM admin picks the pool without
         *     needing the team screen's rights (emails and roles stay there).
         */
        get: operations["pool_candidates_crm_assignment_people_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/forms/{public_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Describe */
        get: operations["describe_public_forms__public_id__get"];
        put?: never;
        /** Submit */
        post: operations["submit_public_forms__public_id__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Consents */
        get: operations["list_consents_contacts__contact_id__consents_get"];
        /** Set Consent */
        put: operations["set_consent_contacts__contact_id__consents_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/segments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Segments */
        get: operations["list_segments_crm_segments_get"];
        put?: never;
        /** Create Segment */
        post: operations["create_segment_crm_segments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/segments/{segment_id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preview Segment */
        get: operations["preview_segment_crm_segments__segment_id__preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Templates */
        get: operations["list_templates_crm_templates_get"];
        put?: never;
        /** Create Template */
        post: operations["create_template_crm_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Campaigns */
        get: operations["list_campaigns_crm_campaigns_get"];
        put?: never;
        /** Create Campaign */
        post: operations["create_campaign_crm_campaigns_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/campaigns/{campaign_id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send Campaign */
        post: operations["send_campaign_crm_campaigns__campaign_id__send_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/campaigns/{campaign_id}/recipients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recipients */
        get: operations["recipients_crm_campaigns__campaign_id__recipients_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/public/unsubscribe/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Unsubscribe Page
         * @description Shows who is asking; changes nothing (mail scanners open links).
         */
        get: operations["unsubscribe_page_public_unsubscribe__token__get"];
        put?: never;
        /** Unsubscribe */
        post: operations["unsubscribe_public_unsubscribe__token__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Activities */
        get: operations["list_activities_activities_get"];
        put?: never;
        /** Create Activity */
        post: operations["create_activity_activities_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activities/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Activity Summary */
        get: operations["activity_summary_activities_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activities/{activity_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Activity */
        patch: operations["update_activity_activities__activity_id__patch"];
        trace?: never;
    };
    "/activities/{activity_id}/done": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Activity */
        post: operations["complete_activity_activities__activity_id__done_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activities/{activity_id}/snooze": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Snooze Activity */
        post: operations["snooze_activity_activities__activity_id__snooze_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activities/{activity_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Activity */
        post: operations["cancel_activity_activities__activity_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activity-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Activity Types */
        get: operations["list_activity_types_activity_types_get"];
        put?: never;
        /** Create Activity Type */
        post: operations["create_activity_type_activity_types_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/activity-types/{type_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Activity Type
         * @description Retires the type: it leaves the picker, old activities keep their label,
         *     and automations naming it fall back to To-do.
         */
        delete: operations["delete_activity_type_activity_types__type_id__delete"];
        options?: never;
        head?: never;
        /** Update Activity Type */
        patch: operations["update_activity_type_activity_types__type_id__patch"];
        trace?: never;
    };
    "/contacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Contacts
         * @description One page; `X-Total-Count` is how many match. A phone typed in any
         *     format matches its E.164 key.
         */
        get: operations["list_contacts_contacts_get"];
        put?: never;
        /**
         * Create Contact
         * @description With contacts.contact.create: any field, and a 409 naming the likely
         *     duplicates. From the till (pos.sale.create only): name, phone and email,
         *     and a duplicate answer that names no one — matched on phone alone and
         *     reported as a count — so adding a customer can't be used to read the
         *     contact book. The cashier then finds them with lookup by phone.
         */
        post: operations["create_contact_contacts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lookup
         * @description Exact E.164 lookup for the till (and the WhatsApp inbox later). Every
         *     live holder comes back: a shared number is the cashier's pick, never an
         *     automatic match.
         */
        get: operations["lookup_contacts_lookup_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge Contacts
         * @description Merge up to four contacts into one, in one transaction (soft merge).
         */
        post: operations["merge_contacts_contacts_merge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/merge/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge Preview
         * @description Side by side: the records, the fields that differ, and how many
         *     records would move from each (sales only for those who can read POS).
         */
        post: operations["merge_preview_contacts_merge_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review Queue
         * @description Open items, each with the contacts holding the clashing key.
         */
        get: operations["review_queue_contacts_review_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Contact
         * @description Contact 360: the record, its company or people, addresses, and what
         *     the other modules hold for it.
         */
        get: operations["get_contact_contacts__contact_id__get"];
        put?: never;
        post?: never;
        /**
         * Archive Contact
         * @description Archive, never delete: sales, invoices and old receipts keep pointing here.
         */
        delete: operations["archive_contact_contacts__contact_id__delete"];
        options?: never;
        head?: never;
        /** Update Contact */
        patch: operations["update_contact_contacts__contact_id__patch"];
        trace?: never;
    };
    "/contacts/{contact_id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Restore Contact */
        post: operations["restore_contact_contacts__contact_id__restore_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/duplicates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Contact Duplicates
         * @description Other contacts holding this one's phone, email or NTN (archived ones
         *     too); keys shared by more than the threshold are listed, not matched.
         */
        get: operations["contact_duplicates_contacts__contact_id__duplicates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Contact Timeline
         * @description Everything that happened to this contact or to a record rolled up to
         *     it, newest first, limited to the record types the caller may read
         *     (TIMELINE_ENTITY_KEYS). Contacts merged into this one bring their
         *     history: the timeline is append-only, so reads follow merged_into_id
         *     instead of rewriting old events (contact_merge registry, "follow").
         */
        get: operations["contact_timeline_contacts__contact_id__timeline_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Note */
        post: operations["add_note_contacts__contact_id__notes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Address */
        post: operations["add_address_contacts__contact_id__addresses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/{contact_id}/addresses/{address_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Address */
        delete: operations["delete_address_contacts__contact_id__addresses__address_id__delete"];
        options?: never;
        head?: never;
        /** Update Address */
        patch: operations["update_address_contacts__contact_id__addresses__address_id__patch"];
        trace?: never;
    };
    "/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Tags */
        get: operations["list_tags_tags_get"];
        put?: never;
        /** Create Tag */
        post: operations["create_tag_tags_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tags/{tag_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Tag */
        delete: operations["delete_tag_tags__tag_id__delete"];
        options?: never;
        head?: never;
        /** Update Tag */
        patch: operations["update_tag_tags__tag_id__patch"];
        trace?: never;
    };
    "/crm/leads/{lead_id}/contact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lead Contact
         * @description The contact a lead is qualified to, or null.
         */
        get: operations["lead_contact_crm_leads__lead_id__contact_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/leads/{lead_id}/qualify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Qualify Lead
         * @description Link the lead to a contact, or create the contact from the lead. A
         *     create that finds a contact with the same phone or email answers 409
         *     with them, so the user links instead of duplicating (unless `force`).
         */
        post: operations["qualify_lead_crm_leads__lead_id__qualify_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/backfill": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Backfill
         * @description Create contacts for this tenant's leads (option b). Safe to rerun.
         */
        post: operations["run_backfill_contacts_backfill_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/contacts/review/{item_id}/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dismiss Review
         * @description Leave the lead without a contact; the backfill won't queue it again.
         */
        post: operations["dismiss_review_contacts_review__item_id__dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/org/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Regions */
        get: operations["regions_org_regions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/org/company": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Company */
        get: operations["get_company_org_company_get"];
        /** Update Company */
        put: operations["update_company_org_company_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/org/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Branches */
        get: operations["list_branches_org_branches_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/org/branches/{branch_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Branch */
        patch: operations["update_branch_org_branches__branch_id__patch"];
        trace?: never;
    };
    "/org/branding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Branding
         * @description Everyone in the tenant reads it: the shell and documents render with it.
         */
        get: operations["get_branding_org_branding_get"];
        /** Update Branding */
        put: operations["update_branding_org_branding_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sequences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sequences */
        get: operations["list_sequences_sequences_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sequences/{sequence_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Set Next */
        patch: operations["set_next_sequences__sequence_id__patch"];
        trace?: never;
    };
    "/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload */
        post: operations["upload_files_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/_local/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Local Blob
         * @description Serves the local backend's signed links. Signed, so no session: an
         *     <img> or a download follows it like an S3 link.
         */
        get: operations["local_blob_files__local__key__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{file_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download */
        get: operations["download_files__file_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tax/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Rates */
        get: operations["rates_tax_rates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tax/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Categories */
        get: operations["categories_tax_categories_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Profile */
        get: operations["get_profile_profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Profile */
        patch: operations["update_profile_profile_patch"];
        trace?: never;
    };
    "/platform/modules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Modules */
        get: operations["list_modules_platform_modules_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform/modules/{key}/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Enable Module */
        post: operations["enable_module_platform_modules__key__enable_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform/modules/{key}/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Disable Module */
        post: operations["disable_module_platform_modules__key__disable_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform/modules/{key}/purge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Purge Module
         * @description Schedules the deletion of a disabled module's data, 7 days out. Typing
         *     "DELETE <module>" confirms; turning the module back on cancels it.
         */
        post: operations["purge_module_platform_modules__key__purge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/permissions/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog
         * @description Every key, grouped by the module that owns it, with whether scopes
         *     narrower than 'all' mean anything for it.
         */
        get: operations["catalog_permissions_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Roles */
        get: operations["list_roles_roles_get"];
        put?: never;
        /** Create Role */
        post: operations["create_role_roles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/roles/{role_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Role */
        get: operations["get_role_roles__role_id__get"];
        put?: never;
        post?: never;
        /** Delete Role */
        delete: operations["delete_role_roles__role_id__delete"];
        options?: never;
        head?: never;
        /** Update Role */
        patch: operations["update_role_roles__role_id__patch"];
        trace?: never;
    };
    "/roles/{role_id}/grants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Grants */
        put: operations["put_grants_roles__role_id__grants_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/roles/{role_id}/inherits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Inherits */
        put: operations["put_inherits_roles__role_id__inherits_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/roles/{role_id}/copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copy Role
         * @description Copy-on-edit for system templates: the copy keeps every grant
         *     (the Owner's '*' too) and inheritance, and is freely editable.
         */
        post: operations["copy_role_roles__role_id__copy_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Teams */
        get: operations["list_teams_teams_get"];
        put?: never;
        /** Create Team */
        post: operations["create_team_teams_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teams/{team_id}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Put Members */
        put: operations["put_members_teams__team_id__members_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/teams/{team_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Team */
        delete: operations["delete_team_teams__team_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/departments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Departments */
        get: operations["list_departments_hrms_departments_get"];
        put?: never;
        /** Create Department */
        post: operations["create_department_hrms_departments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/departments/{dept_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Department */
        patch: operations["update_department_hrms_departments__dept_id__patch"];
        trace?: never;
    };
    "/hrms/job-titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Job Titles */
        get: operations["list_job_titles_hrms_job_titles_get"];
        put?: never;
        /** Create Job Title */
        post: operations["create_job_title_hrms_job_titles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/job-titles/{title_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Job Title */
        patch: operations["update_job_title_hrms_job_titles__title_id__patch"];
        trace?: never;
    };
    "/hrms/locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Locations */
        get: operations["list_locations_hrms_locations_get"];
        put?: never;
        /** Create Location */
        post: operations["create_location_hrms_locations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/locations/{location_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Location */
        patch: operations["update_location_hrms_locations__location_id__patch"];
        trace?: never;
    };
    "/hrms/employees/{employee_id}/job": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Employee Job */
        patch: operations["update_employee_job_hrms_employees__employee_id__job_patch"];
        trace?: never;
    };
    "/hrms/employees/{employee_id}/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Documents */
        get: operations["list_documents_hrms_employees__employee_id__documents_get"];
        put?: never;
        /** Add Document */
        post: operations["add_document_hrms_employees__employee_id__documents_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/documents/{doc_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Document */
        delete: operations["delete_document_hrms_documents__doc_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/documents/expiring": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Expiring Documents
         * @description Expired documents and those expiring within `days`, soonest first, for
         *     active staff — the list HR works through before an inspection.
         */
        get: operations["expiring_documents_hrms_documents_expiring_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/shifts/{shift_id}/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Shift Policy
         * @description Auto check-out and overtime threshold. Like the rest of a shift's
         *     rules they move pay, so this is hrms admin (hrms.shift.manage).
         */
        patch: operations["update_shift_policy_hrms_shifts__shift_id__policy_patch"];
        trace?: never;
    };
    "/hrms/attendance/corrections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Corrections */
        get: operations["list_corrections_hrms_attendance_corrections_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/attendance/corrections/{correction_id}/{decision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Decide Correction
         * @description The employee's manager, or anyone holding hrms.attendance.approve,
         *     decides — never the employee or whoever filed it (TR-SEC-33). Only a
         *     pending request can be decided. Approval appends `correction` punches
         *     and re-derives the day; a payroll-locked day can't be corrected.
         */
        post: operations["decide_correction_hrms_attendance_corrections__correction_id___decision__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/attendance/punch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * My Punch
         * @description Check in, or out if checked in. Send what the browser's Geolocation
         *     API reported; the server decides against the work location (D-43).
         */
        post: operations["my_punch_me_attendance_punch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/attendance/checkin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** My Checkin */
        post: operations["my_checkin_me_attendance_checkin_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/attendance/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** My Checkout */
        post: operations["my_checkout_me_attendance_checkout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/attendance/corrections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Corrections */
        get: operations["my_corrections_me_attendance_corrections_get"];
        put?: never;
        /** Request Correction */
        post: operations["request_correction_me_attendance_corrections_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/approvals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Approvals
         * @description A manager's inbox: their direct reports' pending corrections and leave
         *     at the manager step. Any login may ask; someone with no reports gets an
         *     empty inbox.
         */
        get: operations["my_approvals_me_approvals_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/kiosks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Kiosks */
        get: operations["list_kiosks_hrms_kiosks_get"];
        put?: never;
        /**
         * Create Kiosk
         * @description The response carries the token once; open /kiosk/{token} on the device.
         */
        post: operations["create_kiosk_hrms_kiosks_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/kiosks/{kiosk_id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke Kiosk */
        post: operations["revoke_kiosk_hrms_kiosks__kiosk_id__revoke_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/kiosk-pin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set Kiosk Pin
         * @description Set or replace an employee's kiosk PIN (4–6 digits, stored hashed).
         */
        put: operations["set_kiosk_pin_hrms_employees__employee_id__kiosk_pin_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/kiosk/{token}/bootstrap": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bootstrap */
        get: operations["bootstrap_kiosk__token__bootstrap_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/kiosk/{token}/punch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kiosk Punch */
        post: operations["kiosk_punch_kiosk__token__punch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/holiday-calendars": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Calendars */
        get: operations["list_calendars_hrms_holiday_calendars_get"];
        put?: never;
        /** Create Calendar */
        post: operations["create_calendar_hrms_holiday_calendars_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/holiday-calendars/{calendar_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Calendar */
        delete: operations["delete_calendar_hrms_holiday_calendars__calendar_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/holidays": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Holidays */
        get: operations["list_holidays_hrms_holidays_get"];
        put?: never;
        /**
         * Create Holiday
         * @description One holiday per date per calendar; a repeat renames it (as before).
         */
        post: operations["create_holiday_hrms_holidays_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/holidays/{holiday_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Holiday */
        delete: operations["delete_holiday_hrms_holidays__holiday_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/holidays/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Holidays
         * @description Load a calendar from a CSV posted as the body: columns Date and Name,
         *     optional Kind (public / optional / company) and Half day (yes/no).
         *     Dates already in the calendar are skipped, never renamed; bad rows are
         *     named and the rest still import.
         */
        post: operations["import_holidays_hrms_holidays_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/blackout-days": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Blackouts */
        get: operations["list_blackouts_hrms_blackout_days_get"];
        put?: never;
        /** Create Blackout */
        post: operations["create_blackout_hrms_blackout_days_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/blackout-days/{blackout_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Blackout */
        delete: operations["delete_blackout_hrms_blackout_days__blackout_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/notices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Notices */
        get: operations["list_notices_hrms_notices_get"];
        put?: never;
        /** Create Notice */
        post: operations["create_notice_hrms_notices_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/notices/{notice_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Notice */
        patch: operations["update_notice_hrms_notices__notice_id__patch"];
        trace?: never;
    };
    "/hrms/notices/{notice_id}/remind": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Remind Now */
        post: operations["remind_now_hrms_notices__notice_id__remind_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/notices/{notice_id}/acknowledgements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Acknowledgements
         * @description Everyone the notice is for, with when they acknowledged (null: not yet).
         */
        get: operations["acknowledgements_hrms_notices__notice_id__acknowledgements_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Notices */
        get: operations["my_notices_me_notices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notices/{notice_id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Acknowledge
         * @description Once: a second call returns the first acknowledgement unchanged.
         */
        post: operations["acknowledge_me_notices__notice_id__acknowledge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/overtime-rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Rates */
        get: operations["get_rates_hrms_overtime_rates_get"];
        /** Put Rates */
        put: operations["put_rates_hrms_overtime_rates_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/overtime": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Claims */
        get: operations["list_claims_hrms_overtime_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/overtime/{claim_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_hrms_overtime__claim_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/overtime/{claim_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject */
        post: operations["reject_hrms_overtime__claim_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/overtime": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Claims */
        get: operations["my_claims_me_overtime_get"];
        put?: never;
        /** Claim */
        post: operations["claim_me_overtime_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Assets */
        get: operations["list_assets_hrms_assets_get"];
        put?: never;
        /** Create Asset */
        post: operations["create_asset_hrms_assets_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/assets/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Asset */
        patch: operations["update_asset_hrms_assets__asset_id__patch"];
        trace?: never;
    };
    "/hrms/assets/{asset_id}/issue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Issue */
        post: operations["issue_hrms_assets__asset_id__issue_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/assets/{asset_id}/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Take Back */
        post: operations["take_back_hrms_assets__asset_id__return_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/assets/{asset_id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** History */
        get: operations["history_hrms_assets__asset_id__history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Employee Assets
         * @description What someone holds now (offboarding lists it, wave C).
         */
        get: operations["employee_assets_hrms_employees__employee_id__assets_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Assets */
        get: operations["my_assets_me_assets_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/policies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Policies */
        get: operations["get_policies_payroll_policies_get"];
        /** Put Policies */
        put: operations["put_policies_payroll_policies_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/policy-presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Presets */
        get: operations["presets_payroll_policy_presets_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/policies/apply-preset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply Preset */
        post: operations["apply_preset_payroll_policies_apply_preset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/analytics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Analytics */
        get: operations["analytics_hrms_analytics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/job-changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** History */
        get: operations["history_hrms_employees__employee_id__job_changes_get"];
        put?: never;
        /** Create */
        post: operations["create_hrms_employees__employee_id__job_changes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/job-changes/{change_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_hrms_job_changes__change_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Templates */
        get: operations["list_templates_hrms_letter_templates_get"];
        put?: never;
        /** Create Template */
        post: operations["create_template_hrms_letter_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-placeholders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Placeholders */
        get: operations["placeholders_hrms_letter_placeholders_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Template */
        patch: operations["update_template_hrms_letter_templates__template_id__patch"];
        trace?: never;
    };
    "/hrms/employees/{employee_id}/letters/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview */
        post: operations["preview_hrms_employees__employee_id__letters_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/letters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Employee Letters */
        get: operations["employee_letters_hrms_employees__employee_id__letters_get"];
        put?: never;
        /** Issue */
        post: operations["issue_hrms_employees__employee_id__letters_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letters/{letter_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Letter Pdf */
        get: operations["letter_pdf_hrms_letters__letter_id__pdf_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Requests */
        get: operations["list_requests_hrms_letter_requests_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-requests/{request_id}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decline */
        post: operations["decline_hrms_letter_requests__request_id__decline_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/letter-requests/{request_id}/done": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Done
         * @description Answered without a letter (an ID card handed over, say).
         */
        post: operations["done_hrms_letter_requests__request_id__done_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/letter-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Requests */
        get: operations["my_requests_me_letter_requests_get"];
        put?: never;
        /** Ask */
        post: operations["ask_me_letter_requests_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/letters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Letters */
        get: operations["my_letters_me_letters_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/letters/{letter_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Letter Pdf */
        get: operations["my_letter_pdf_me_letters__letter_id__pdf_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/gratuity-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Gratuity */
        get: operations["get_gratuity_payroll_gratuity_settings_get"];
        /** Put Gratuity */
        put: operations["put_gratuity_payroll_gratuity_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/final-settlement": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Draft */
        post: operations["draft_hrms_employees__employee_id__final_settlement_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Settlements */
        get: operations["list_settlements_hrms_final_settlements_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements/{settlement_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Settlement */
        get: operations["get_settlement_hrms_final_settlements__settlement_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements/{settlement_id}/recalculate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recalculate */
        post: operations["recalculate_hrms_final_settlements__settlement_id__recalculate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements/{settlement_id}/lines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Line */
        post: operations["add_line_hrms_final_settlements__settlement_id__lines_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlement-lines/{line_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Line */
        delete: operations["delete_line_hrms_final_settlement_lines__line_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements/{settlement_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_hrms_final_settlements__settlement_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/final-settlements/{settlement_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_hrms_final_settlements__settlement_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/comp-off": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Requests */
        get: operations["list_requests_hrms_comp_off_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/comp-off/{comp_off_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_hrms_comp_off__comp_off_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/comp-off/{comp_off_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject */
        post: operations["reject_hrms_comp_off__comp_off_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/leave-encashments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Encashments */
        get: operations["list_encashments_hrms_employees__employee_id__leave_encashments_get"];
        put?: never;
        /** Create Encashment */
        post: operations["create_encashment_hrms_employees__employee_id__leave_encashments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/comp-off": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mine */
        get: operations["mine_me_comp_off_get"];
        put?: never;
        /** Ask */
        post: operations["ask_me_comp_off_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Claims */
        get: operations["list_claims_hrms_expenses_get"];
        put?: never;
        /** Claim For */
        post: operations["claim_for_hrms_expenses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/expenses/{expense_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Claim */
        get: operations["get_claim_hrms_expenses__expense_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/expenses/{expense_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_hrms_expenses__expense_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/expenses/{expense_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject */
        post: operations["reject_hrms_expenses__expense_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Claims */
        get: operations["my_claims_me_expenses_get"];
        put?: never;
        /** Make Claim */
        post: operations["make_claim_me_expenses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/expenses/{expense_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Mine */
        post: operations["cancel_mine_me_expenses__expense_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/probation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Probation Due */
        get: operations["probation_due_hrms_probation_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/probation-review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Review Probation */
        post: operations["review_probation_hrms_employees__employee_id__probation_review_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/probation-reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Probation History */
        get: operations["probation_history_hrms_employees__employee_id__probation_reviews_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Templates */
        get: operations["list_templates_hrms_appraisal_templates_get"];
        put?: never;
        /** Create Template */
        post: operations["create_template_hrms_appraisal_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Template */
        patch: operations["update_template_hrms_appraisal_templates__template_id__patch"];
        trace?: never;
    };
    "/hrms/appraisals/{appraisal_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Appraisal */
        get: operations["get_appraisal_hrms_appraisals__appraisal_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisals/{appraisal_id}/manager-review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Hr Review
         * @description HR reviews on the manager's behalf (or without waiting for the self review).
         */
        put: operations["hr_review_hrms_appraisals__appraisal_id__manager_review_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisals/{appraisal_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Appraisal */
        post: operations["cancel_appraisal_hrms_appraisals__appraisal_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-cycles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Cycles */
        get: operations["list_cycles_hrms_appraisal_cycles_get"];
        put?: never;
        /** Create Cycle */
        post: operations["create_cycle_hrms_appraisal_cycles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-cycles/{cycle_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Cycle */
        get: operations["get_cycle_hrms_appraisal_cycles__cycle_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-cycles/{cycle_id}/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Open Cycle */
        post: operations["open_cycle_hrms_appraisal_cycles__cycle_id__open_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/appraisal-cycles/{cycle_id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Close Cycle */
        post: operations["close_cycle_hrms_appraisal_cycles__cycle_id__close_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/appraisals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Appraisals */
        get: operations["my_appraisals_me_appraisals_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/appraisals/{appraisal_id}/self": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Self Review */
        put: operations["self_review_me_appraisals__appraisal_id__self_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Reviews */
        get: operations["my_reviews_me_reviews_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/reviews/{appraisal_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Review As Manager */
        put: operations["review_as_manager_me_reviews__appraisal_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boarding-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Templates */
        get: operations["list_templates_hrms_boarding_templates_get"];
        put?: never;
        /** Create Template */
        post: operations["create_template_hrms_boarding_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boarding-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Template */
        patch: operations["update_template_hrms_boarding_templates__template_id__patch"];
        trace?: never;
    };
    "/hrms/employees/{employee_id}/onboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start Onboarding */
        post: operations["start_onboarding_hrms_employees__employee_id__onboarding_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/employees/{employee_id}/offboarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start Offboarding */
        post: operations["start_offboarding_hrms_employees__employee_id__offboarding_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boardings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Boardings */
        get: operations["list_boardings_hrms_boardings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boardings/{boarding_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Boarding */
        get: operations["get_boarding_hrms_boardings__boarding_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boardings/{boarding_id}/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Task */
        post: operations["add_task_hrms_boardings__boarding_id__tasks_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boarding-tasks/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Task */
        patch: operations["update_task_hrms_boarding_tasks__task_id__patch"];
        trace?: never;
    };
    "/hrms/boardings/{boarding_id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete */
        post: operations["complete_hrms_boardings__boarding_id__complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boardings/{boarding_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_hrms_boardings__boarding_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/boardings/{boarding_id}/exit-interview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Save Exit Interview */
        put: operations["save_exit_interview_hrms_boardings__boarding_id__exit_interview_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/boarding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Tasks */
        get: operations["my_tasks_me_boarding_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/boarding-tasks/{task_id}/done": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** My Task Done */
        post: operations["my_task_done_me_boarding_tasks__task_id__done_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/requests/pending": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Pending */
        get: operations["pending_hrms_requests_pending_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Requests */
        get: operations["my_requests_me_requests_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/celebrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Celebrations */
        get: operations["celebrations_hrms_celebrations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/org-chart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Org Chart */
        get: operations["org_chart_hrms_org_chart_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/celebrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Celebrations */
        get: operations["my_celebrations_me_celebrations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/celebrations/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * My Celebration Settings
         * @description Whether the team sees my birthday: my choice, not HR's.
         */
        put: operations["my_celebration_settings_me_celebrations_settings_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/attendance/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Import Log */
        post: operations["import_log_hrms_attendance_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Leave Types */
        get: operations["list_leave_types_hrms_leave_types_get"];
        put?: never;
        /** Create Leave Type */
        post: operations["create_leave_type_hrms_leave_types_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave-types/{leave_type_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Leave Type
         * @description Edit a template or a type of your own. Changing days per year tops up
         *     or trims this year's grants with new ledger entries.
         */
        patch: operations["update_leave_type_hrms_leave_types__leave_type_id__patch"];
        trace?: never;
    };
    "/hrms/leave/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Leave Policy */
        get: operations["get_leave_policy_hrms_leave_policy_get"];
        /** Update Leave Policy */
        put: operations["update_leave_policy_hrms_leave_policy_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Leave */
        get: operations["list_leave_hrms_leave_get"];
        put?: never;
        /** Create Leave */
        post: operations["create_leave_hrms_leave_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Leave Balances */
        get: operations["leave_balances_hrms_leave_balances_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Leave Ledger */
        get: operations["leave_ledger_hrms_leave_ledger_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave/ledger/adjust": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adjust Ledger
         * @description HR corrects a balance with a reason; audited. Never your own.
         */
        post: operations["adjust_ledger_hrms_leave_ledger_adjust_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave/{leave_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hr Cancel Leave */
        post: operations["hr_cancel_leave_hrms_leave__leave_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/hrms/leave/{leave_id}/{decision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Decide Leave
         * @description Approve or reject the current step. Needs hrms.leave.approve; the
         *     employee's manager decides the manager step, anyone else with the key
         *     decides as HR. Never your own leave; only pending requests.
         */
        post: operations["decide_leave_hrms_leave__leave_id___decision__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Leave */
        get: operations["my_leave_me_leave_get"];
        put?: never;
        /**
         * My Request Leave
         * @description An employee requests their own leave: the employee_id in the body is
         *     ignored and forced to the caller.
         */
        post: operations["my_request_leave_me_leave_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/leave/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Balances */
        get: operations["my_balances_me_leave_balances_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/leave-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Leave Types */
        get: operations["my_leave_types_me_leave_types_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/leave/{leave_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** My Cancel Leave */
        post: operations["my_cancel_leave_me_leave__leave_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/employees/{employee_id}/compensation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Compensation */
        get: operations["list_compensation_payroll_employees__employee_id__compensation_get"];
        put?: never;
        /**
         * Add Compensation
         * @description A raise, promotion or correction is a new dated row; history is never
         *     rewritten, so a locked payslip can't move (D-40, D-42).
         */
        post: operations["add_compensation_payroll_employees__employee_id__compensation_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/employees/{employee_id}/details": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Details
         * @description For the employee profile's payroll card. HR sees it masked; payroll
         *     readers see the real values.
         */
        get: operations["get_details_payroll_employees__employee_id__details_get"];
        /** Update Details */
        put: operations["update_details_payroll_employees__employee_id__details_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Runs */
        get: operations["list_runs_payroll_runs_get"];
        put?: never;
        /** Create Run */
        post: operations["create_run_payroll_runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/recompute-tax-year": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Recompute */
        post: operations["create_recompute_payroll_runs_recompute_tax_year_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Run */
        get: operations["get_run_payroll_runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/payslips/{payslip_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Payslip */
        get: operations["get_payslip_payroll_runs__run_id__payslips__payslip_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/calculate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Calculate
         * @description Queues the calculation for the worker (batches of 100) and answers at
         *     once; poll the run for progress.
         */
        post: operations["calculate_payroll_runs__run_id__calculate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_payroll_runs__run_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/reopen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reopen */
        post: operations["reopen_payroll_runs__run_id__reopen_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/payslips/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send Payslips
         * @description Email each payslip of a final run to the employee's email on file
         *     (0111), through the outbox. Sent once unless `again`; no email, skipped.
         */
        post: operations["send_payslips_payroll_runs__run_id__payslips_send_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark Paid */
        post: operations["mark_paid_payroll_runs__run_id__mark_paid_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/lock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Lock */
        post: operations["lock_payroll_runs__run_id__lock_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_payroll_runs__run_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/payslips/{payslip_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Payslip Pdf Admin */
        get: operations["payslip_pdf_admin_payroll_runs__run_id__payslips__payslip_id__pdf_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/exports/wht.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Wht */
        get: operations["export_wht_payroll_runs__run_id__exports_wht_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/exports/eobi.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Eobi */
        get: operations["export_eobi_payroll_runs__run_id__exports_eobi_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/exports/social-security.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Social Security */
        get: operations["export_social_security_payroll_runs__run_id__exports_social_security_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/exports/bank.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Bank */
        get: operations["export_bank_payroll_runs__run_id__exports_bank_csv_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/runs/{run_id}/exports/bank-check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bank Check
         * @description Before downloading the bank file: who it pays, who it can't, and why.
         */
        get: operations["bank_check_payroll_runs__run_id__exports_bank_check_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/reports/salary-certificate.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Salary Certificate Data */
        get: operations["salary_certificate_data_payroll_reports_salary_certificate_json_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/reports/salary-certificate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Salary Certificate Pdf */
        get: operations["salary_certificate_pdf_payroll_reports_salary_certificate_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/payslips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * My Payslips
         * @description Stored payslips of approved, paid or locked runs — newest first, or
         *     one month's (regular and any adjustments) with `month=YYYY-MM`.
         */
        get: operations["my_payslips_me_payslips_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/payslips/{payslip_id}/link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * My Payslip Link
         * @description A 5-minute download link for one of the caller's own final payslips
         *     (St03 risk 14: a signed short-lived link, not a CNIC-derived password).
         */
        post: operations["my_payslip_link_me_payslips__payslip_id__link_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payslips/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download Payslip
         * @description No session needed: the unexpired token is the credential.
         */
        get: operations["download_payslip_payslips_download_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/components": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Components */
        get: operations["list_components_payroll_components_get"];
        put?: never;
        /** Create Component */
        post: operations["create_component_payroll_components_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/components/{component_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Component */
        patch: operations["update_component_payroll_components__component_id__patch"];
        trace?: never;
    };
    "/payroll/structures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Structures */
        get: operations["list_structures_payroll_structures_get"];
        put?: never;
        /** Create Structure */
        post: operations["create_structure_payroll_structures_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/structures/{structure_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Structure */
        put: operations["update_structure_payroll_structures__structure_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/one-offs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List One Offs */
        get: operations["list_one_offs_payroll_one_offs_get"];
        put?: never;
        /** Create One Off */
        post: operations["create_one_off_payroll_one_offs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/one-offs/{one_off_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Void One Off */
        post: operations["void_one_off_payroll_one_offs__one_off_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/advances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Advances */
        get: operations["list_advances_payroll_advances_get"];
        put?: never;
        /** Create Advance */
        post: operations["create_advance_payroll_advances_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/advances/{advance_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Void Advance
         * @description Stops further recovery; what was already recovered stays on its payslips.
         */
        post: operations["void_advance_payroll_advances__advance_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/advances/{advance_id}/repay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Repay Advance
         * @description Paying off early (0107): cash for any part of what's left, or the whole
         *     balance from the next salary as one ADVANCE_SETTLE deduction. Fully paid,
         *     the advance closes, so payroll takes no instalment on top.
         */
        post: operations["repay_advance_payroll_advances__advance_id__repay_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/statutory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Statutory */
        get: operations["get_statutory_payroll_statutory_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payroll/statutory/{scheme_code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Register Scheme */
        put: operations["register_scheme_payroll_statutory__scheme_code__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Categories */
        get: operations["list_categories_pos_categories_get"];
        put?: never;
        /** Create Category */
        post: operations["create_category_pos_categories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/categories/{category_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Category */
        patch: operations["update_category_pos_categories__category_id__patch"];
        trace?: never;
    };
    "/pos/products/{product_id}/variants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Variants
         * @description The product's group: the group's first product and everything pointing at it.
         */
        get: operations["variants_pos_products__product_id__variants_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/{product_id}/barcodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Barcodes */
        get: operations["list_barcodes_pos_products__product_id__barcodes_get"];
        put?: never;
        /** Add Barcode */
        post: operations["add_barcode_pos_products__product_id__barcodes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/products/{product_id}/barcodes/{barcode_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove Barcode */
        delete: operations["remove_barcode_pos_products__product_id__barcodes__barcode_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/barcode-rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Rules */
        get: operations["list_rules_pos_barcode_rules_get"];
        put?: never;
        /** Add Rule */
        post: operations["add_rule_pos_barcode_rules_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/barcode-rules/{rule_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove Rule */
        delete: operations["remove_rule_pos_barcode_rules__rule_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/stock/adjustments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Adjust */
        post: operations["adjust_pos_stock_adjustments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/stock/moves": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Moves */
        get: operations["moves_pos_stock_moves_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/registers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Registers */
        get: operations["list_registers_pos_registers_get"];
        put?: never;
        /** Create Register */
        post: operations["create_register_pos_registers_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/registers/{register_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Register */
        patch: operations["update_register_pos_registers__register_id__patch"];
        trace?: never;
    };
    "/pos/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Devices */
        get: operations["list_devices_pos_devices_get"];
        put?: never;
        /** Add Device */
        post: operations["add_device_pos_devices_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/devices/{device_id}/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Heartbeat
         * @description The till says it's alive and how many sales it still holds. Only the
         *     device itself, with its own token, may say so.
         */
        post: operations["heartbeat_pos_devices__device_id__heartbeat_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sessions */
        get: operations["list_sessions_pos_sessions_get"];
        put?: never;
        /** Start Session */
        post: operations["start_session_pos_sessions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sessions/{session_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Session */
        get: operations["get_session_pos_sessions__session_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sessions/{session_id}/cash-moves": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cash Move */
        post: operations["cash_move_pos_sessions__session_id__cash_moves_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sessions/{session_id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Close Session */
        post: operations["close_session_pos_sessions__session_id__close_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sessions/{session_id}/z-report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Z Report */
        get: operations["z_report_pos_sessions__session_id__z_report_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/pin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set My Pin
         * @description Your own till PIN: what you enter to approve at a till.
         */
        put: operations["set_my_pin_pos_pin_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/approvers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Approvers
         * @description Who can approve `need` at a till: holds the key and has set a till PIN.
         *     Names only; the PIN is checked on the action itself.
         */
        get: operations["approvers_pos_approvers_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sales/{sale_id}/print": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Print Receipt
         * @description Count a print: the first is the original, every later one a DUPLICATE.
         */
        post: operations["print_receipt_pos_sales__sale_id__print_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sales/{sale_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Void Sale
         * @description A full return of what is left (refund into the session, stock back,
         *     FBR debit note), then the sale is marked void — audited.
         */
        post: operations["void_sale_pos_sales__sale_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/held": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Held */
        get: operations["list_held_pos_held_get"];
        put?: never;
        /** Hold Bill */
        post: operations["hold_bill_pos_held_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/held/{held_id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resume Bill
         * @description Take a held bill back to the till: it leaves the list (once).
         */
        post: operations["resume_bill_pos_held__held_id__resume_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/pin-locks/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Unlock Pin
         * @description Switch an approver's till PIN back on after a lockout.
         */
        delete: operations["unlock_pin_pos_pin_locks__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/khata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Balances */
        get: operations["balances_khata_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/khata/{contact_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Statement */
        get: operations["statement_khata__contact_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Set Limit */
        patch: operations["set_limit_khata__contact_id__patch"];
        trace?: never;
    };
    "/khata/{contact_id}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Receive Payment */
        post: operations["receive_payment_khata__contact_id__payments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/cashiers/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sign In */
        post: operations["sign_in_pos_cashiers_sign_in_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/cashiers/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sign Out */
        post: operations["sign_out_pos_cashiers_sign_out_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/cashiers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cashier List
         * @description Who can sign in at a till: active staff with a PIN.
         */
        get: operations["cashier_list_pos_cashiers_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/sync/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sync Orders */
        post: operations["sync_orders_pos_sync_orders_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/catalog/delta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog Delta
         * @description Products changed after `since` (a row_version), oldest first, plus what
         *     the till needs to price offline exactly as the server would (pos-core).
         *     Cost is left out: a till never needs it (field-guarded).
         *
         *     `reset` tells the till to drop its cached catalogue and start again: the
         *     cursor is ahead of every product (a restored database), so the feed
         *     restarts from 0. The till does the same itself when the register's
         *     `config_version` moves (3D).
         */
        get: operations["catalog_delta_pos_catalog_delta_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Review Queue */
        get: operations["review_queue_pos_review_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pos/review/{sale_id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve */
        post: operations["resolve_pos_review__sale_id__resolve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/sales": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sales */
        get: operations["sales_reports_sales_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/stock-valuation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stock Valuation */
        get: operations["stock_valuation_reports_stock_valuation_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/tax": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tax Summary
         * @description POS sales by rate from the sale-line snapshots (never the current
         *     product), plus issued invoices and credit notes.
         */
        get: operations["tax_summary_reports_tax_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/attendance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Attendance */
        get: operations["attendance_reports_attendance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reports/payroll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Payroll
         * @description One approved run, a line per employee. Pay is shown only to those who
         *     may see salaries, and every read is audited like the other exports.
         */
        get: operations["payroll_reports_payroll_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/restaurant/floors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Floors */
        get: operations["list_floors_restaurant_floors_get"];
        put?: never;
        /** Create Floor */
        post: operations["create_floor_restaurant_floors_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/restaurant/floors/{floor_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Floor */
        patch: operations["update_floor_restaurant_floors__floor_id__patch"];
        trace?: never;
    };
    "/restaurant/floors/{floor_id}/tables": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Tables */
        post: operations["add_tables_restaurant_floors__floor_id__tables_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/restaurant/tables/{table_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Table */
        patch: operations["update_table_restaurant_tables__table_id__patch"];
        trace?: never;
    };
    "/restaurant/stations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Stations */
        get: operations["list_stations_restaurant_stations_get"];
        put?: never;
        /** Create Station */
        post: operations["create_station_restaurant_stations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/restaurant/stations/{station_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Station */
        patch: operations["update_station_restaurant_stations__station_id__patch"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AcceptInviteRequest */
        AcceptInviteRequest: {
            /** Token */
            token: string;
            /** Name */
            name: string;
            /** Password */
            password: string;
        };
        /** Account */
        Account: {
            /** Contact Id */
            contact_id: string;
            /** Name */
            name: string;
            /** Balance Minor */
            balance_minor: number;
            /** Credit Limit Minor */
            credit_limit_minor: number | null;
            /** Entries */
            entries: components["schemas"]["Entry"][];
        };
        /** ActivityCreate */
        ActivityCreate: {
            /**
             * Entity Type
             * @default lead
             * @enum {string}
             */
            entity_type: "lead" | "contact";
            /** Entity Id */
            entity_id: string;
            /** Type Id */
            type_id: string;
            /**
             * Summary
             * @default
             */
            summary: string;
            /**
             * Note
             * @default
             */
            note: string;
            /**
             * Due Date
             * Format: date
             */
            due_date: string;
            /** Due At */
            due_at?: string | null;
            /** Assigned To */
            assigned_to?: string | null;
        };
        /** ActivityDone */
        ActivityDone: {
            /** Outcome */
            outcome?: ("interested" | "not_interested" | "callback" | "busy") | null;
            /**
             * Feedback
             * @default
             */
            feedback: string;
            next?: components["schemas"]["ActivityNext"] | null;
        };
        /** ActivityItem */
        ActivityItem: {
            /** Action */
            action: string;
            /** Entity */
            entity: string;
            /** Actor */
            actor: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ActivityNext */
        ActivityNext: {
            /** Type Id */
            type_id: string;
            /**
             * Due Date
             * Format: date
             */
            due_date: string;
            /**
             * Summary
             * @default
             */
            summary: string;
        };
        /** ActivityOut */
        ActivityOut: {
            /** Id */
            id: string;
            /**
             * Entity Type
             * @enum {string}
             */
            entity_type: "lead" | "contact";
            /** Entity Id */
            entity_id: string;
            /** Entity Name */
            entity_name: string | null;
            /** Type Id */
            type_id: string;
            /** Type Name */
            type_name: string;
            /** Type Icon */
            type_icon: string;
            /** Summary */
            summary: string;
            /** Note */
            note: string;
            /**
             * Due Date
             * Format: date
             */
            due_date: string;
            /** Due At */
            due_at: string | null;
            /** Assigned To */
            assigned_to: string | null;
            /** Assigned Name */
            assigned_name: string | null;
            /** Automated */
            automated: boolean;
            /**
             * State
             * @enum {string}
             */
            state: "overdue" | "today" | "planned" | "done" | "cancelled";
            /** Done At */
            done_at: string | null;
            /** Outcome */
            outcome: string | null;
            /** Feedback */
            feedback: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ActivitySnooze */
        ActivitySnooze: {
            /** Days */
            days: number;
        };
        /** ActivitySummary */
        ActivitySummary: {
            /** Overdue */
            overdue: number;
            /** Today */
            today: number;
            /** Planned */
            planned: number;
        };
        /** ActivityTypeCreate */
        ActivityTypeCreate: {
            /** Name */
            name: string;
            /**
             * Icon
             * @default todo
             * @enum {string}
             */
            icon: "call" | "whatsapp" | "meeting" | "visit" | "todo" | "quote" | "payment";
            /**
             * Default Days
             * @default 0
             */
            default_days: number;
        };
        /** ActivityTypeOut */
        ActivityTypeOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Code */
            code: string | null;
            /**
             * Icon
             * @enum {string}
             */
            icon: "call" | "whatsapp" | "meeting" | "visit" | "todo" | "quote" | "payment";
            /** Default Days */
            default_days: number;
            /** Position */
            position: number;
            /** Active */
            active: boolean;
        };
        /** ActivityTypeUpdate */
        ActivityTypeUpdate: {
            /** Name */
            name?: string | null;
            /** Icon */
            icon?: ("call" | "whatsapp" | "meeting" | "visit" | "todo" | "quote" | "payment") | null;
            /** Default Days */
            default_days?: number | null;
            /** Position */
            position?: number | null;
        };
        /** ActivityUpdate */
        ActivityUpdate: {
            /** Type Id */
            type_id?: string | null;
            /** Summary */
            summary?: string | null;
            /** Note */
            note?: string | null;
            /** Due Date */
            due_date?: string | null;
            /** Due At */
            due_at?: string | null;
            /** Assigned To */
            assigned_to?: string | null;
        };
        /** AddressCreate */
        AddressCreate: {
            /**
             * Kind
             * @default billing
             * @enum {string}
             */
            kind: "billing" | "shipping" | "other";
            /** Line1 */
            line1: string;
            /**
             * Line2
             * @default
             */
            line2: string;
            /**
             * City
             * @default
             */
            city: string;
            /**
             * Province
             * @default
             */
            province: string;
            /**
             * Postal Code
             * @default
             */
            postal_code: string;
            /**
             * Is Default
             * @default false
             */
            is_default: boolean;
        };
        /** AddressOut */
        AddressOut: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Line1 */
            line1: string;
            /** Line2 */
            line2: string;
            /** City */
            city: string;
            /** Province */
            province: string;
            /** Postal Code */
            postal_code: string;
            /** Is Default */
            is_default: boolean;
        };
        /** AddressUpdate */
        AddressUpdate: {
            /** Kind */
            kind?: ("billing" | "shipping" | "other") | null;
            /** Line1 */
            line1?: string | null;
            /** Line2 */
            line2?: string | null;
            /** City */
            city?: string | null;
            /** Province */
            province?: string | null;
            /** Postal Code */
            postal_code?: string | null;
            /** Is Default */
            is_default?: boolean | null;
        };
        /** AdjustmentIn */
        AdjustmentIn: {
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /** Qty Delta */
            qty_delta: number;
            /**
             * Reason
             * @enum {string}
             */
            reason: "adjustment" | "damage" | "count";
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AdjustmentOut */
        AdjustmentOut: {
            /** Product Id */
            product_id: string;
            /** Stock Qty */
            stock_qty: number;
        };
        /** AdvanceIn */
        AdvanceIn: {
            /** Employee Id */
            employee_id: string;
            /** Principal Minor */
            principal_minor: number;
            /** Installment Minor */
            installment_minor: number;
            /** Start Month */
            start_month: string;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AdvanceOut */
        AdvanceOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Principal Minor */
            principal_minor: number;
            /** Installment Minor */
            installment_minor: number;
            /** Recovered Minor */
            recovered_minor: number;
            /** Outstanding Minor */
            outstanding_minor: number;
            /** Start Month */
            start_month: string;
            /** Status */
            status: string;
            /** Note */
            note: string;
        };
        /** AdvanceRepay */
        AdvanceRepay: {
            /**
             * Method
             * @default cash
             * @enum {string}
             */
            method: "cash" | "payroll";
            /** Amount Minor */
            amount_minor?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AgingBuckets */
        AgingBuckets: {
            /**
             * Current Minor
             * @default 0
             */
            current_minor: number;
            /**
             * D1 30 Minor
             * @default 0
             */
            d1_30_minor: number;
            /**
             * D31 60 Minor
             * @default 0
             */
            d31_60_minor: number;
            /**
             * D61 90 Minor
             * @default 0
             */
            d61_90_minor: number;
            /**
             * D90 Plus Minor
             * @default 0
             */
            d90_plus_minor: number;
            /**
             * Total Minor
             * @default 0
             */
            total_minor: number;
        };
        /** AgingReport */
        AgingReport: {
            /**
             * As Of
             * Format: date
             */
            as_of: string;
            /** Rows */
            rows: components["schemas"]["AgingRow"][];
            totals: components["schemas"]["AgingBuckets"];
        };
        /** AgingRow */
        AgingRow: {
            /**
             * Current Minor
             * @default 0
             */
            current_minor: number;
            /**
             * D1 30 Minor
             * @default 0
             */
            d1_30_minor: number;
            /**
             * D31 60 Minor
             * @default 0
             */
            d31_60_minor: number;
            /**
             * D61 90 Minor
             * @default 0
             */
            d61_90_minor: number;
            /**
             * D90 Plus Minor
             * @default 0
             */
            d90_plus_minor: number;
            /**
             * Total Minor
             * @default 0
             */
            total_minor: number;
            /** Contact Id */
            contact_id: string | null;
            /** Contact Name */
            contact_name: string;
            /** Invoices */
            invoices: number;
        };
        /** Alert */
        Alert: {
            /** Text */
            text: string;
            /** Href */
            href: string;
            /** Tone */
            tone: string;
        };
        /** AppraisalCycleCreate */
        AppraisalCycleCreate: {
            /** Name */
            name: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /**
             * Template Id
             * Format: uuid
             */
            template_id: string;
            /**
             * Self Review
             * @default true
             */
            self_review: boolean;
            /** Employee Ids */
            employee_ids?: string[] | null;
        };
        /** AppraisalCycleOut */
        AppraisalCycleOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /** Template Id */
            template_id: string;
            /** Template Name */
            template_name: string;
            /** Self Review */
            self_review: boolean;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "open" | "closed";
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Opened At */
            opened_at: string | null;
            /** Closed At */
            closed_at: string | null;
            /** Counts */
            counts?: {
                [key: string]: number;
            };
            /** Appraisals */
            appraisals?: components["schemas"]["AppraisalOut"][];
        };
        /** AppraisalOut */
        AppraisalOut: {
            /** Id */
            id: string;
            /** Cycle Id */
            cycle_id: string;
            /** Cycle Name */
            cycle_name: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Reviewer Id */
            reviewer_id: string | null;
            /** Reviewer Name */
            reviewer_name: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "self_review" | "manager_review" | "done" | "cancelled";
            /** Self Comment */
            self_comment: string;
            /** Self Submitted At */
            self_submitted_at: string | null;
            /** Manager Comment */
            manager_comment: string;
            /** Manager Submitted At */
            manager_submitted_at: string | null;
            /** Score */
            score: number | null;
            /** Ratings */
            ratings?: components["schemas"]["AppraisalRatingOut"][];
        };
        /** AppraisalRatingOut */
        AppraisalRatingOut: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /** Description */
            description: string;
            /** Weight */
            weight: number;
            /** Self Rating */
            self_rating: number | null;
            /** Self Note */
            self_note: string;
            /** Manager Rating */
            manager_rating: number | null;
            /** Manager Note */
            manager_note: string;
        };
        /** AppraisalReviewIn */
        AppraisalReviewIn: {
            /** Ratings */
            ratings?: components["schemas"]["RatingIn"][];
            /**
             * Comment
             * @default
             */
            comment: string;
            /**
             * Submit
             * @default false
             */
            submit: boolean;
        };
        /** AppraisalTemplateCreate */
        AppraisalTemplateCreate: {
            /** Name */
            name: string;
            /** Kras */
            kras: components["schemas"]["KraIn"][];
        };
        /** AppraisalTemplateOut */
        AppraisalTemplateOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Kras */
            kras: components["schemas"]["KraOut"][];
        };
        /** AppraisalTemplateUpdate */
        AppraisalTemplateUpdate: {
            /** Name */
            name?: string | null;
            /** Active */
            active?: boolean | null;
            /** Kras */
            kras?: components["schemas"]["KraIn"][] | null;
        };
        /**
         * ApprovalsOut
         * @description A manager's inbox: pending requests from their direct reports.
         */
        ApprovalsOut: {
            /** Corrections */
            corrections: components["schemas"]["CorrectionOut"][];
            /** Leave */
            leave: components["schemas"]["LeaveOut"][];
        };
        /** Approver */
        Approver: {
            /** User Id */
            user_id: string;
            /** Name */
            name: string;
        };
        /** AskRequest */
        AskRequest: {
            /** Question */
            question: string;
        };
        /** AskResponse */
        AskResponse: {
            /** Answer */
            answer: string;
            /** Sql */
            sql?: string | null;
            /** Rows */
            rows?: {
                [key: string]: unknown;
            }[];
        };
        /** AssetAssignmentOut */
        AssetAssignmentOut: {
            /** Id */
            id: string;
            /** Asset Id */
            asset_id: string;
            /** Asset Name */
            asset_name: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
            /** Issue Note */
            issue_note: string;
            /** Returned At */
            returned_at: string | null;
            /** Return Condition */
            return_condition: ("new" | "good" | "fair" | "damaged") | null;
            /** Return Note */
            return_note: string;
        };
        /** AssetCreate */
        AssetCreate: {
            /** Name */
            name: string;
            /**
             * Category
             * @default other
             * @enum {string}
             */
            category: "laptop" | "desktop" | "phone" | "tablet" | "sim" | "vehicle" | "furniture" | "tool" | "uniform" | "other";
            /** Tag */
            tag?: string | null;
            /**
             * Serial No
             * @default
             */
            serial_no: string;
            /** Purchased On */
            purchased_on?: string | null;
            /** Value Minor */
            value_minor?: number | null;
            /**
             * Condition
             * @default good
             * @enum {string}
             */
            condition: "new" | "good" | "fair" | "damaged";
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AssetIssue */
        AssetIssue: {
            /**
             * Employee Id
             * Format: uuid
             */
            employee_id: string;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AssetOut */
        AssetOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Category
             * @enum {string}
             */
            category: "laptop" | "desktop" | "phone" | "tablet" | "sim" | "vehicle" | "furniture" | "tool" | "uniform" | "other";
            /** Tag */
            tag: string | null;
            /** Serial No */
            serial_no: string;
            /** Purchased On */
            purchased_on: string | null;
            /** Value Minor */
            value_minor: number | null;
            /**
             * Condition
             * @enum {string}
             */
            condition: "new" | "good" | "fair" | "damaged";
            /**
             * Status
             * @enum {string}
             */
            status: "available" | "issued" | "retired" | "lost";
            /** Note */
            note: string;
            /** Holder Id */
            holder_id: string | null;
            /** Holder Name */
            holder_name: string | null;
            /** Issued At */
            issued_at: string | null;
        };
        /** AssetReturn */
        AssetReturn: {
            /** Condition */
            condition?: ("new" | "good" | "fair" | "damaged") | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** AssetUpdate */
        AssetUpdate: {
            /** Name */
            name?: string | null;
            /** Tag */
            tag?: string | null;
            /** Serial No */
            serial_no?: string | null;
            /** Value Minor */
            value_minor?: number | null;
            /** Condition */
            condition?: ("new" | "good" | "fair" | "damaged") | null;
            /** Status */
            status?: ("available" | "issued" | "retired" | "lost") | null;
            /** Note */
            note?: string | null;
        };
        /** AttendanceOut */
        AttendanceOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Check In */
            check_in: string | null;
            /** Check Out */
            check_out: string | null;
            /** Status */
            status: string;
            /** Method */
            method: string;
            /** Fraud Flag */
            fraud_flag: string;
            /**
             * Late Min
             * @default 0
             */
            late_min: number;
            /**
             * Early Min
             * @default 0
             */
            early_min: number;
            /**
             * Worked Min
             * @default 0
             */
            worked_min: number;
            /** Shift Id */
            shift_id?: string | null;
            /**
             * Locked
             * @default false
             */
            locked: boolean;
            /**
             * Missing Checkout
             * @default false
             */
            missing_checkout: boolean;
            /**
             * Auto Closed
             * @default false
             */
            auto_closed: boolean;
            /**
             * Overtime Min
             * @default 0
             */
            overtime_min: number;
            /**
             * Corrected
             * @default false
             */
            corrected: boolean;
            /** Geo Status */
            geo_status?: string | null;
            /** Ip Status */
            ip_status?: string | null;
        };
        /** BackfillReport */
        BackfillReport: {
            /** Leads Seen */
            leads_seen: number;
            /** Contacts Created */
            contacts_created: number;
            /** Leads Linked */
            leads_linked: number;
            /** Queued */
            queued: number;
            /** Invalid Phones */
            invalid_phones: number;
            /**
             * Invoices Linked
             * @default 0
             */
            invoices_linked: number;
        };
        /** BalanceRow */
        BalanceRow: {
            /** Contact Id */
            contact_id: string;
            /** Name */
            name: string;
            /** Phone */
            phone: string;
            /** Balance Minor */
            balance_minor: number;
            /** Credit Limit Minor */
            credit_limit_minor: number | null;
            /**
             * Last Entry At
             * Format: date-time
             */
            last_entry_at: string;
        };
        /** BarcodeIn */
        BarcodeIn: {
            /** Barcode */
            barcode: string;
            /**
             * Qty
             * @default 1
             */
            qty: number;
            /**
             * Label
             * @default
             */
            label: string;
        };
        /** BarcodeOut */
        BarcodeOut: {
            /** Id */
            id: string;
            /** Barcode */
            barcode: string;
            /** Qty */
            qty: number;
            /** Label */
            label: string;
        };
        /** BillingOut */
        BillingOut: {
            /** Plan */
            plan: string;
            /** Status */
            status: string;
            /** Days Left */
            days_left: number | null;
            /** Current Period End */
            current_period_end: string | null;
            /** Max Sections */
            max_sections: number;
            /** Max Seats */
            max_seats: number;
            /** Ai Monthly */
            ai_monthly: number;
            /** Seats Used */
            seats_used: number;
            /** Sections Used */
            sections_used: number;
        };
        /** BiometricImportOut */
        BiometricImportOut: {
            /** Imported */
            imported: number;
            /** Duplicates */
            duplicates: number;
            /** Unknown Codes */
            unknown_codes: string[];
            /** Errors */
            errors: components["schemas"]["ImportRowError"][];
        };
        /** BlackoutCreate */
        BlackoutCreate: {
            /** Name */
            name: string;
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
            /** Location Id */
            location_id?: string | null;
            /** Department Id */
            department_id?: string | null;
        };
        /** BlackoutOut */
        BlackoutOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
            /** Location Id */
            location_id: string | null;
            /** Department Id */
            department_id: string | null;
        };
        /** BoardingClose */
        BoardingClose: {
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** BoardingOut */
        BoardingOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "onboarding" | "offboarding";
            /** Template Id */
            template_id: string | null;
            /**
             * Anchor Date
             * Format: date
             */
            anchor_date: string;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "completed" | "cancelled";
            /** Reason */
            reason: ("resigned" | "terminated" | "retired" | "contract_end" | "absconded" | "deceased" | "other") | null;
            /** Notice Date */
            notice_date: string | null;
            /** Last Working Day */
            last_working_day: string | null;
            /** Note */
            note: string;
            /** Done */
            done: number;
            /** Total */
            total: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Closed At */
            closed_at: string | null;
            /** Tasks */
            tasks?: components["schemas"]["BoardingTaskOut"][];
            /** Assets Held */
            assets_held?: components["schemas"]["HeldAsset"][];
            exit_interview?: components["schemas"]["ExitInterviewOut"] | null;
        };
        /** BoardingTaskCreate */
        BoardingTaskCreate: {
            /** Title */
            title: string;
            /**
             * Owner
             * @default hr
             * @enum {string}
             */
            owner: "hr" | "it" | "manager" | "employee" | "admin";
            /** Due On */
            due_on?: string | null;
        };
        /** BoardingTaskOut */
        BoardingTaskOut: {
            /** Id */
            id: string;
            /** Boarding Id */
            boarding_id: string;
            /** Title */
            title: string;
            /**
             * Owner
             * @enum {string}
             */
            owner: "hr" | "it" | "manager" | "employee" | "admin";
            /** Due On */
            due_on: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "done" | "skipped";
            /** Note */
            note: string;
            /** Done At */
            done_at: string | null;
        };
        /** BoardingTaskUpdate */
        BoardingTaskUpdate: {
            /** Status */
            status?: ("open" | "done" | "skipped") | null;
            /** Note */
            note?: string | null;
            /** Due On */
            due_on?: string | null;
        };
        /** BoardingTemplateCreate */
        BoardingTemplateCreate: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "onboarding" | "offboarding";
            /** Name */
            name: string;
            /** Tasks */
            tasks?: components["schemas"]["BoardingTemplateTaskIn"][];
        };
        /** BoardingTemplateOut */
        BoardingTemplateOut: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "onboarding" | "offboarding";
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Tasks */
            tasks: components["schemas"]["BoardingTemplateTaskOut"][];
        };
        /** BoardingTemplateTaskIn */
        BoardingTemplateTaskIn: {
            /** Title */
            title: string;
            /**
             * Owner
             * @default hr
             * @enum {string}
             */
            owner: "hr" | "it" | "manager" | "employee" | "admin";
            /**
             * Offset Days
             * @default 0
             */
            offset_days: number;
        };
        /** BoardingTemplateTaskOut */
        BoardingTemplateTaskOut: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /**
             * Owner
             * @enum {string}
             */
            owner: "hr" | "it" | "manager" | "employee" | "admin";
            /** Offset Days */
            offset_days: number;
        };
        /** BoardingTemplateUpdate */
        BoardingTemplateUpdate: {
            /** Name */
            name?: string | null;
            /** Active */
            active?: boolean | null;
            /** Tasks */
            tasks?: components["schemas"]["BoardingTemplateTaskIn"][] | null;
        };
        /** BranchOut */
        BranchOut: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Address */
            address: string;
            /** Phone */
            phone: string;
            /** Region Code */
            region_code: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /** Timezone */
            timezone: string | null;
            /** Fbr Pos Id */
            fbr_pos_id: string | null;
            /** Receipt Header */
            receipt_header: string | null;
            /** Is Default */
            is_default: boolean;
            /** Active */
            active: boolean;
        };
        /** BranchUpdate */
        BranchUpdate: {
            /** Code */
            code?: string | null;
            /** Name */
            name?: string | null;
            /** Address */
            address?: string | null;
            /** Phone */
            phone?: string | null;
            /** Region Code */
            region_code?: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /** Timezone */
            timezone?: string | null;
            /** Fbr Pos Id */
            fbr_pos_id?: string | null;
            /** Receipt Header */
            receipt_header?: string | null;
            /** Active */
            active?: boolean | null;
        };
        /** BrandingOut */
        BrandingOut: {
            /** Logo File Id */
            logo_file_id: string | null;
            /** Primary Color */
            primary_color: string | null;
            /** Accent Color */
            accent_color: string | null;
            /** Receipt Header */
            receipt_header: string;
            /** Receipt Footer */
            receipt_footer: string;
            /** Invoice Header */
            invoice_header: string;
            /** Invoice Footer */
            invoice_footer: string;
            /** Payslip Header */
            payslip_header: string;
            /** Receipt Width Mm */
            receipt_width_mm: number;
            /**
             * Layout
             * @enum {string}
             */
            layout: "classic" | "compact" | "bold";
            /** Version */
            version: number;
            /** Tokens */
            tokens: {
                [key: string]: string;
            };
        };
        /** BrandingUpdate */
        BrandingUpdate: {
            /** Logo File Id */
            logo_file_id?: string | null;
            /**
             * Clear Logo
             * @default false
             */
            clear_logo: boolean;
            /** Primary Color */
            primary_color?: string | null;
            /** Accent Color */
            accent_color?: string | null;
            /** Receipt Header */
            receipt_header?: string | null;
            /** Receipt Footer */
            receipt_footer?: string | null;
            /** Invoice Header */
            invoice_header?: string | null;
            /** Invoice Footer */
            invoice_footer?: string | null;
            /** Payslip Header */
            payslip_header?: string | null;
            /** Receipt Width Mm */
            receipt_width_mm?: number | null;
            /** Layout */
            layout?: ("classic" | "compact" | "bold") | null;
        };
        /** CampaignIn */
        CampaignIn: {
            /** Name */
            name: string;
            /**
             * Channel
             * @default email
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /**
             * Segment Id
             * Format: uuid
             */
            segment_id: string;
            /**
             * Template Id
             * Format: uuid
             */
            template_id: string;
        };
        /** CampaignOut */
        CampaignOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Channel
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /** Segment Id */
            segment_id: string;
            /** Template Id */
            template_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "sent" | "cancelled";
            /** Queued Count */
            queued_count: number;
            /** Skipped Count */
            skipped_count: number;
            /** Sent At */
            sent_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** CashMoveIn */
        CashMoveIn: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "pay_in" | "pay_out" | "drop";
            /** Amount Minor */
            amount_minor: number;
            /** Reason */
            reason: string;
        };
        /** CatalogKey */
        CatalogKey: {
            /** Key */
            key: string;
            /** Resource */
            resource: string;
            /** Action */
            action: string;
            /** Scoped */
            scoped: boolean;
            /** Legacy */
            legacy: string[];
        };
        /** CatalogModule */
        CatalogModule: {
            /** Module */
            module: string;
            /** Label */
            label: string;
            /** Keys */
            keys: components["schemas"]["CatalogKey"][];
        };
        /** CategoryIn */
        CategoryIn: {
            /** Name */
            name: string;
            /**
             * Position
             * @default 0
             */
            position: number;
            /** Color */
            color?: ("red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "purple" | "pink" | "slate") | null;
        };
        /** CategoryOut */
        CategoryOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Position */
            position: number;
            /** Active */
            active: boolean;
            /** Product Count */
            product_count: number;
            /** Color */
            color?: string | null;
        };
        /** CategoryUpdate */
        CategoryUpdate: {
            /** Name */
            name?: string | null;
            /** Position */
            position?: number | null;
            /** Active */
            active?: boolean | null;
            /** Color */
            color?: ("red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "purple" | "pink" | "slate") | "" | null;
        };
        /** Celebration */
        Celebration: {
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "birthday" | "anniversary";
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Years */
            years: number | null;
        };
        /** CelebrationSettings */
        CelebrationSettings: {
            /** Celebrate Birthday */
            celebrate_birthday: boolean;
        };
        /** CheckInRequest */
        CheckInRequest: {
            /** Employee Id */
            employee_id: string;
            /**
             * Method
             * @default web
             * @enum {string}
             */
            method: "web" | "mobile" | "biometric" | "qr";
            /** Lat */
            lat?: number | null;
            /** Lng */
            lng?: number | null;
            /**
             * Mock Gps
             * @default false
             */
            mock_gps: boolean;
        };
        /** CompOffApprove */
        CompOffApprove: {
            /**
             * Leave Type Id
             * Format: uuid
             */
            leave_type_id: string;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** CompOffIn */
        CompOffIn: {
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /**
             * Days
             * @default 1
             */
            days: number;
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** CompOffOut */
        CompOffOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Days */
            days: number;
            /** Reason */
            reason: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "approved" | "rejected";
            /** Leave Type Name */
            leave_type_name: string | null;
            /** Decision Note */
            decision_note: string;
            /** Decided At */
            decided_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** CompOffReject */
        CompOffReject: {
            /** Note */
            note: string;
        };
        /** CompanyOut */
        CompanyOut: {
            /** Name */
            name: string;
            /** Legal Name */
            legal_name: string;
            /** Ntn */
            ntn: string | null;
            /** Strn */
            strn: string | null;
            /** Address */
            address: string;
            /** City */
            city: string;
            /** Phone */
            phone: string;
            /** Email */
            email: string;
            /** Region Code */
            region_code: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /** Timezone */
            timezone: string;
            /** Fy Start Month */
            fy_start_month: number;
            /** Logo File Id */
            logo_file_id?: string | null;
        };
        /**
         * CompanyUpdate
         * @description Every field optional; an empty string clears NTN, STRN and province.
         */
        CompanyUpdate: {
            /** Name */
            name?: string | null;
            /** Legal Name */
            legal_name?: string | null;
            /** Ntn */
            ntn?: string | null;
            /** Strn */
            strn?: string | null;
            /** Address */
            address?: string | null;
            /** City */
            city?: string | null;
            /** Phone */
            phone?: string | null;
            /** Email */
            email?: string | null;
            /** Region Code */
            region_code?: string | null;
            /** Timezone */
            timezone?: string | null;
            /** Fy Start Month */
            fy_start_month?: number | null;
        };
        /** CompensationCreate */
        CompensationCreate: {
            /**
             * Effective From
             * Format: date
             */
            effective_from: string;
            /** Base Minor */
            base_minor: number;
            /**
             * Reason
             * @default increment
             * @enum {string}
             */
            reason: "joining" | "increment" | "promotion" | "correction" | "adjustment";
            /**
             * Note
             * @default
             */
            note: string;
            /** Structure Id */
            structure_id?: string | null;
        };
        /** CompensationOut */
        CompensationOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /**
             * Effective From
             * Format: date
             */
            effective_from: string;
            /** Base Minor */
            base_minor: number;
            /** Reason */
            reason: string;
            /** Note */
            note: string;
            /** Structure Id */
            structure_id?: string | null;
            /** Structure Name */
            structure_name?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ComponentIn */
        ComponentIn: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /**
             * Kind
             * @default earning
             * @enum {string}
             */
            kind: "earning" | "deduction";
            /**
             * Calc
             * @default fixed
             * @enum {string}
             */
            calc: "fixed" | "percent" | "formula";
            /**
             * Amount Minor
             * @default 0
             */
            amount_minor: number;
            /** Percent */
            percent?: number | null;
            /**
             * Percent Of
             * @default BASE
             */
            percent_of: string;
            /**
             * Formula
             * @default
             */
            formula: string;
            /**
             * Taxable
             * @default true
             */
            taxable: boolean;
            /**
             * Prorate
             * @default true
             */
            prorate: boolean;
            /**
             * Sort
             * @default 0
             */
            sort: number;
        };
        /** ComponentOut */
        ComponentOut: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /**
             * Kind
             * @default earning
             * @enum {string}
             */
            kind: "earning" | "deduction";
            /**
             * Calc
             * @default fixed
             * @enum {string}
             */
            calc: "fixed" | "percent" | "formula";
            /**
             * Amount Minor
             * @default 0
             */
            amount_minor: number;
            /** Percent */
            percent?: number | null;
            /**
             * Percent Of
             * @default BASE
             */
            percent_of: string;
            /**
             * Formula
             * @default
             */
            formula: string;
            /**
             * Taxable
             * @default true
             */
            taxable: boolean;
            /**
             * Prorate
             * @default true
             */
            prorate: boolean;
            /**
             * Sort
             * @default 0
             */
            sort: number;
            /** Id */
            id: string;
            /** Active */
            active: boolean;
        };
        /** ComponentUpdate */
        ComponentUpdate: {
            /** Name */
            name?: string | null;
            /** Calc */
            calc?: ("fixed" | "percent" | "formula") | null;
            /** Amount Minor */
            amount_minor?: number | null;
            /** Percent */
            percent?: number | null;
            /** Percent Of */
            percent_of?: string | null;
            /** Formula */
            formula?: string | null;
            /** Taxable */
            taxable?: boolean | null;
            /** Prorate */
            prorate?: boolean | null;
            /** Sort */
            sort?: number | null;
            /** Active */
            active?: boolean | null;
        };
        /** ConsentIn */
        ConsentIn: {
            /**
             * Channel
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /**
             * Status
             * @enum {string}
             */
            status: "opted_in" | "opted_out";
            /**
             * Source
             * @default
             */
            source: string;
        };
        /** ConsentOut */
        ConsentOut: {
            /**
             * Channel
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /**
             * Status
             * @enum {string}
             */
            status: "opted_in" | "opted_out";
            /** Source */
            source: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** ContactBrief */
        ContactBrief: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Name */
            name: string;
            /** Phone */
            phone: string;
            /** Phone E164 */
            phone_e164: string | null;
            /** Email */
            email: string;
            /** Company Name */
            company_name: string;
            /** Archived */
            archived: boolean;
        };
        /** ContactCreate */
        ContactCreate: {
            /**
             * Kind
             * @default person
             * @enum {string}
             */
            kind: "person" | "company";
            /** Name */
            name: string;
            /** Company Id */
            company_id?: string | null;
            /**
             * Company Name
             * @default
             */
            company_name: string;
            /**
             * Job Title
             * @default
             */
            job_title: string;
            /**
             * Phone
             * @default
             */
            phone: string;
            /**
             * Email
             * @default
             */
            email: string;
            /**
             * Ntn
             * @default
             */
            ntn: string;
            /**
             * Strn
             * @default
             */
            strn: string;
            /**
             * City
             * @default
             */
            city: string;
            /** Roles */
            roles?: ("customer" | "supplier" | "patient" | "student" | "parent" | "partner")[];
            /**
             * Source
             * @default
             */
            source: string;
            /**
             * Notes
             * @default
             */
            notes: string;
            /** Owner Id */
            owner_id?: string | null;
            /** Tag Ids */
            tag_ids?: string[];
            /**
             * Force
             * @default false
             */
            force: boolean;
        };
        /** ContactDeal */
        ContactDeal: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Stage */
            stage: string;
            /** Stage Kind */
            stage_kind: string;
            /** Value Minor */
            value_minor: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ContactDetail */
        ContactDetail: {
            contact: components["schemas"]["ContactOut"];
            company: components["schemas"]["ContactBrief"] | null;
            /** People */
            people: components["schemas"]["ContactBrief"][];
            /** Addresses */
            addresses: components["schemas"]["AddressOut"][];
            stats: components["schemas"]["ContactStats"];
            /** Deals */
            deals: components["schemas"]["ContactDeal"][];
            /** Sales */
            sales: components["schemas"]["ContactSale"][];
            /** Invoices */
            invoices: components["schemas"]["ContactInvoice"][];
        };
        /** ContactDuplicate */
        ContactDuplicate: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Kind */
            kind: string;
            /** Phone E164 */
            phone_e164: string | null;
            /** Email */
            email: string;
            /** Ntn */
            ntn: string;
            /** Archived */
            archived: boolean;
            /**
             * Reason
             * @enum {string}
             */
            reason: "phone" | "email" | "ntn";
        };
        /** ContactDuplicates */
        ContactDuplicates: {
            /** Duplicates */
            duplicates: components["schemas"]["ContactDuplicate"][];
            /** Shared Keys */
            shared_keys?: string[];
        };
        /** ContactInvoice */
        ContactInvoice: {
            /** Id */
            id: string;
            /** Total Minor */
            total_minor: number;
            /** Status */
            status: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ContactLookup */
        ContactLookup: {
            /** Phone E164 */
            phone_e164: string | null;
            /** Shared */
            shared: boolean;
            /** Matches */
            matches: components["schemas"]["ContactBrief"][];
        };
        /** ContactNoteCreate */
        ContactNoteCreate: {
            /** Body */
            body: string;
        };
        /** ContactOut */
        ContactOut: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Name */
            name: string;
            /** Company Id */
            company_id: string | null;
            /** Company Name */
            company_name: string;
            /** Job Title */
            job_title: string;
            /** Phone */
            phone: string;
            /** Phone E164 */
            phone_e164: string | null;
            /** Email */
            email: string;
            /** Ntn */
            ntn: string;
            /** Strn */
            strn: string;
            /** Effective Ntn */
            effective_ntn: string;
            /** City */
            city: string;
            /** Roles */
            roles: string[];
            /** Source */
            source: string;
            /** Notes */
            notes: string;
            /** Owner Id */
            owner_id: string | null;
            /** Tags */
            tags?: components["schemas"]["TagOut"][];
            /** Archived At */
            archived_at: string | null;
            /** Merged Into Id */
            merged_into_id: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** ContactSale */
        ContactSale: {
            /** Id */
            id: string;
            /** Total Minor */
            total_minor: number;
            /** Item Count */
            item_count: number;
            /** Payment Method */
            payment_method: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ContactStats */
        ContactStats: {
            /** Open Deals */
            open_deals: number;
            /** Won Value Minor */
            won_value_minor: number;
            /** Sales Count */
            sales_count: number;
            /** Lifetime Spend Minor */
            lifetime_spend_minor: number;
            /** Last Visit At */
            last_visit_at: string | null;
            /** Invoiced Minor */
            invoiced_minor: number;
        };
        /** ContactUpdate */
        ContactUpdate: {
            /** Kind */
            kind?: ("person" | "company") | null;
            /** Name */
            name?: string | null;
            /** Company Id */
            company_id?: string | null;
            /** Company Name */
            company_name?: string | null;
            /** Job Title */
            job_title?: string | null;
            /** Phone */
            phone?: string | null;
            /** Email */
            email?: string | null;
            /** Ntn */
            ntn?: string | null;
            /** Strn */
            strn?: string | null;
            /** City */
            city?: string | null;
            /** Roles */
            roles?: ("customer" | "supplier" | "patient" | "student" | "parent" | "partner")[] | null;
            /** Source */
            source?: string | null;
            /** Notes */
            notes?: string | null;
            /** Owner Id */
            owner_id?: string | null;
            /** Tag Ids */
            tag_ids?: string[] | null;
        };
        /** Copied */
        Copied: {
            /** Copied */
            copied: number;
        };
        /** CorrectionCreate */
        CorrectionCreate: {
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Requested In */
            requested_in?: string | null;
            /** Requested Out */
            requested_out?: string | null;
            /** Reason */
            reason: string;
        };
        /** CorrectionOut */
        CorrectionOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Requested In */
            requested_in: string | null;
            /** Requested Out */
            requested_out: string | null;
            /** Reason */
            reason: string;
            /** Status */
            status: string;
            /** Decided By */
            decided_by: string | null;
            /** Decided At */
            decided_at: string | null;
            /** Decision Note */
            decision_note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * CreditNoteIn
         * @description No amount = credit the whole invoice, line by line (tax included).
         */
        CreditNoteIn: {
            /** Reason */
            reason: string;
            /** Amount Minor */
            amount_minor?: number | null;
        };
        /**
         * CrmSettingsIn
         * @description Only the fields sent change.
         */
        CrmSettingsIn: {
            /** Max Discount Pct */
            max_discount_pct?: number | string | null;
            /** Campaign Daily Cap */
            campaign_daily_cap?: number | null;
        };
        /** CrmSettingsOut */
        CrmSettingsOut: {
            /** Max Discount Pct */
            max_discount_pct?: number | null;
            /**
             * Campaign Daily Cap
             * @default 500
             */
            campaign_daily_cap: number;
        };
        /** CrmSummary */
        CrmSummary: {
            /** Total Leads */
            total_leads: number;
            /** Open Leads */
            open_leads: number;
            /** Won Value Minor */
            won_value_minor: number;
            /** Added This Week */
            added_this_week: number;
        };
        /** DashboardOverview */
        DashboardOverview: {
            /** Sections */
            sections: string[];
            /** Kpis */
            kpis: components["schemas"]["Kpi"][];
            /** Revenue Trend */
            revenue_trend: components["schemas"]["TrendPoint"][];
            /** Leads Trend */
            leads_trend: components["schemas"]["TrendPoint"][];
            /** Pipeline */
            pipeline: components["schemas"]["StageSlice"][];
            /** Alerts */
            alerts: components["schemas"]["Alert"][];
            /** Activity */
            activity: components["schemas"]["ActivityItem"][];
        };
        /**
         * DealLineIn
         * @description The shape of an invoice line, so a deal's lines carry over unchanged.
         *     With a product, the server snapshots its unit and catalog price and marks
         *     a different price as typed by hand.
         */
        DealLineIn: {
            /** Description */
            description: string;
            /** Qty */
            qty: number | string;
            /** Unit Price Minor */
            unit_price_minor: number;
            /**
             * Line Discount Minor
             * @default 0
             */
            line_discount_minor: number;
            /** Tax Code */
            tax_code?: string | null;
            /** Product Id */
            product_id?: string | null;
        };
        /** DealLineOut */
        DealLineOut: {
            /** Id */
            id: string;
            /** Position */
            position: number;
            /** Product Id */
            product_id: string | null;
            /** Description */
            description: string;
            /** Unit */
            unit: string;
            /** Qty */
            qty: number;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** List Price Minor */
            list_price_minor: number | null;
            /** Price Overridden */
            price_overridden: boolean;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Tax Code */
            tax_code: string | null;
            /** Tax Rate Pct */
            tax_rate_pct: number;
            /** Gross Minor */
            gross_minor: number;
            /** Net Excl Minor */
            net_excl_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
        };
        /** DealLines */
        DealLines: {
            /** Lead Id */
            lead_id: string;
            /** Tax Inclusive */
            tax_inclusive: boolean;
            /** Lines */
            lines: components["schemas"]["DealLineOut"][];
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
        };
        /** DealLinesPut */
        DealLinesPut: {
            /** Lines */
            lines: components["schemas"]["DealLineIn"][];
            /**
             * Tax Inclusive
             * @default false
             */
            tax_inclusive: boolean;
        };
        /**
         * DealProductOut
         * @description What the line editor's picker needs from the catalog.
         */
        DealProductOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Unit */
            unit: string;
            /** Price Minor */
            price_minor: number;
        };
        /** Decision */
        Decision: {
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** DepartmentCreate */
        DepartmentCreate: {
            /** Name */
            name: string;
            /** Parent Id */
            parent_id?: string | null;
            /** Head Employee Id */
            head_employee_id?: string | null;
        };
        /** DepartmentOut */
        DepartmentOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Parent Id */
            parent_id: string | null;
            /** Head Employee Id */
            head_employee_id: string | null;
            /** Active */
            active: boolean;
            /**
             * Headcount
             * @default 0
             */
            headcount: number;
        };
        /**
         * DepartmentUpdate
         * @description An explicit null clears parent or head.
         */
        DepartmentUpdate: {
            /** Name */
            name?: string | null;
            /** Parent Id */
            parent_id?: string | null;
            /** Head Employee Id */
            head_employee_id?: string | null;
            /** Active */
            active?: boolean | null;
        };
        /** DeviceCreated */
        DeviceCreated: {
            /** Id */
            id: string;
            /** Register Id */
            register_id: string;
            /** Device Code */
            device_code: string;
            /** Name */
            name: string;
            /** Last Seen At */
            last_seen_at: string | null;
            /** Outbox Count */
            outbox_count: number;
            /** Oldest Pending At */
            oldest_pending_at: string | null;
            /**
             * Ageing
             * @default false
             */
            ageing: boolean;
            /** Token */
            token: string;
        };
        /** DeviceIn */
        DeviceIn: {
            /**
             * Register Id
             * Format: uuid
             */
            register_id: string;
            /** Device Code */
            device_code: string;
            /**
             * Name
             * @default
             */
            name: string;
        };
        /** DeviceOut */
        DeviceOut: {
            /** Id */
            id: string;
            /** Register Id */
            register_id: string;
            /** Device Code */
            device_code: string;
            /** Name */
            name: string;
            /** Last Seen At */
            last_seen_at: string | null;
            /** Outbox Count */
            outbox_count: number;
            /** Oldest Pending At */
            oldest_pending_at: string | null;
            /**
             * Ageing
             * @default false
             */
            ageing: boolean;
        };
        /** DisablePlanOut */
        DisablePlanOut: {
            /** Module */
            module: string;
            /** To Disable */
            to_disable: string[];
            /** Blocked By */
            blocked_by: string[];
            /** Applied */
            applied: boolean;
        };
        /** DocumentCreate */
        DocumentCreate: {
            /**
             * Kind
             * @default other
             * @enum {string}
             */
            kind: "cnic" | "contract" | "certificate" | "medical" | "license" | "passport" | "other";
            /** Title */
            title: string;
            /**
             * Number
             * @default
             */
            number: string;
            /** Issued On */
            issued_on?: string | null;
            /** Expires On */
            expires_on?: string | null;
            /** File Id */
            file_id?: string | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** DocumentOut */
        DocumentOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /**
             * Employee Name
             * @default
             */
            employee_name: string;
            /** Kind */
            kind: string;
            /** Title */
            title: string;
            /** Number */
            number: string;
            /** Issued On */
            issued_on: string | null;
            /** Expires On */
            expires_on: string | null;
            /** File Id */
            file_id: string | null;
            /** Note */
            note: string;
            /** Days Left */
            days_left?: number | null;
        };
        /** DrawerClose */
        DrawerClose: {
            /** Counted Minor */
            counted_minor: number;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** DrawerOpen */
        DrawerOpen: {
            /**
             * Opening Float Minor
             * @default 0
             */
            opening_float_minor: number;
        };
        /** DrawerOut */
        DrawerOut: {
            /** Id */
            id: string;
            /** Status */
            status: string;
            /**
             * Opened At
             * Format: date-time
             */
            opened_at: string;
            /** Opened By */
            opened_by: string | null;
            /** Opening Float Minor */
            opening_float_minor: number;
            /** Expected Minor */
            expected_minor: number;
            /** Cash Sales Minor */
            cash_sales_minor: number;
            /** Cash Refunds Minor */
            cash_refunds_minor: number;
            /** Sales By Method */
            sales_by_method?: components["schemas"]["MethodTotal"][];
            /** Closed At */
            closed_at?: string | null;
            /** Counted Minor */
            counted_minor?: number | null;
            /** Variance Minor */
            variance_minor?: number | null;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** EmployeeCreate */
        EmployeeCreate: {
            /** Name */
            name: string;
            /**
             * Email
             * @default
             */
            email: string;
            /**
             * Phone
             * @default
             */
            phone: string;
            /**
             * Cnic
             * @default
             */
            cnic: string;
            /**
             * Designation
             * @default
             */
            designation: string;
            /**
             * Department
             * @default
             */
            department: string;
            /** Join Date */
            join_date?: string | null;
            /**
             * Salary Minor
             * @default 0
             */
            salary_minor: number;
            /** Code */
            code?: string | null;
            /** Department Id */
            department_id?: string | null;
            /** Job Title Id */
            job_title_id?: string | null;
            /** Location Id */
            location_id?: string | null;
            /** Manager Id */
            manager_id?: string | null;
            /**
             * Employment Type
             * @default permanent
             * @enum {string}
             */
            employment_type: "permanent" | "contract" | "probation" | "daily_wage" | "intern";
            /** Probation End */
            probation_end?: string | null;
        };
        /**
         * EmployeeJobUpdate
         * @description Org fields; an explicit null clears a link.
         */
        EmployeeJobUpdate: {
            /** Code */
            code?: string | null;
            /** Department Id */
            department_id?: string | null;
            /** Job Title Id */
            job_title_id?: string | null;
            /** Location Id */
            location_id?: string | null;
            /** Manager Id */
            manager_id?: string | null;
            /** Employment Type */
            employment_type?: ("permanent" | "contract" | "probation" | "daily_wage" | "intern") | null;
            /** Probation End */
            probation_end?: string | null;
        };
        /** EmployeeOut */
        EmployeeOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Email */
            email: string;
            /** Phone */
            phone: string;
            /** Cnic */
            cnic: string;
            /** Designation */
            designation: string;
            /** Department */
            department: string;
            /** Join Date */
            join_date: string | null;
            /** Salary Minor */
            salary_minor: number | null;
            /** Status */
            status: string;
            /**
             * Present Today
             * @default false
             */
            present_today: boolean;
            /**
             * Has Login
             * @default false
             */
            has_login: boolean;
            /**
             * Pay Masked
             * @default false
             */
            pay_masked: boolean;
            /** Date Of Birth */
            date_of_birth?: string | null;
            /**
             * Celebrate Birthday
             * @default true
             */
            celebrate_birthday: boolean;
        };
        /** EmployeeProfile */
        EmployeeProfile: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Email */
            email: string;
            /** Phone */
            phone: string;
            /** Cnic */
            cnic: string;
            /** Designation */
            designation: string;
            /** Department */
            department: string;
            /** Join Date */
            join_date: string | null;
            /** Salary Minor */
            salary_minor: number | null;
            /** Status */
            status: string;
            /**
             * Present Today
             * @default false
             */
            present_today: boolean;
            /**
             * Has Login
             * @default false
             */
            has_login: boolean;
            /**
             * Pay Masked
             * @default false
             */
            pay_masked: boolean;
            /** Date Of Birth */
            date_of_birth?: string | null;
            /**
             * Celebrate Birthday
             * @default true
             */
            celebrate_birthday: boolean;
            /** Code */
            code?: string | null;
            /** Department Id */
            department_id?: string | null;
            /** Job Title Id */
            job_title_id?: string | null;
            /** Location Id */
            location_id?: string | null;
            /** Location Name */
            location_name?: string | null;
            /** Province */
            province?: string | null;
            /** Manager Id */
            manager_id?: string | null;
            /** Manager Name */
            manager_name?: string | null;
            /**
             * Employment Type
             * @default permanent
             */
            employment_type: string;
            /** Probation End */
            probation_end?: string | null;
            /**
             * Has Kiosk Pin
             * @default false
             */
            has_kiosk_pin: boolean;
            /**
             * Documents Expiring
             * @default 0
             */
            documents_expiring: number;
            /** Exit Date */
            exit_date?: string | null;
            /** Exit Reason */
            exit_reason?: string | null;
            /** Confirmed On */
            confirmed_on?: string | null;
        };
        /** EmployeeUpdate */
        EmployeeUpdate: {
            /** Name */
            name?: string | null;
            /** Email */
            email?: string | null;
            /** Phone */
            phone?: string | null;
            /** Designation */
            designation?: string | null;
            /** Department */
            department?: string | null;
            /** Salary Minor */
            salary_minor?: number | null;
            /** Status */
            status?: ("active" | "inactive") | null;
            /** Join Date */
            join_date?: string | null;
            /** Date Of Birth */
            date_of_birth?: string | null;
            /** Celebrate Birthday */
            celebrate_birthday?: boolean | null;
        };
        /** EnablePlanOut */
        EnablePlanOut: {
            /** Module */
            module: string;
            /** To Enable */
            to_enable: string[];
            /** Violations */
            violations: string[];
            /** Applied */
            applied: boolean;
        };
        /** EncashIn */
        EncashIn: {
            /**
             * Leave Type Id
             * Format: uuid
             */
            leave_type_id: string;
            /** Days */
            days: number;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** EncashOut */
        EncashOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Leave Type Id */
            leave_type_id: string;
            /** Leave Type Name */
            leave_type_name: string;
            /** Days */
            days: number;
            /** Per Day Minor */
            per_day_minor: number | null;
            /** Amount Minor */
            amount_minor: number | null;
            /** One Off Id */
            one_off_id: string | null;
            /** Note */
            note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** EntitlementOut */
        EntitlementOut: {
            /** Section Key */
            section_key: string;
            /** Enabled */
            enabled: boolean;
            /** Limits */
            limits?: {
                [key: string]: unknown;
            };
        };
        /** EntitlementUpdate */
        EntitlementUpdate: {
            /** Enabled */
            enabled: boolean;
        };
        /** Entry */
        Entry: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Amount Minor */
            amount_minor: number;
            /** Balance After Minor */
            balance_after_minor: number;
            /** Sale Id */
            sale_id: string | null;
            /** Receipt No */
            receipt_no: string | null;
            /** Method */
            method: string | null;
            /** Note */
            note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** ExitInterviewIn */
        ExitInterviewIn: {
            /** Held On */
            held_on?: string | null;
            /** Outcome */
            outcome?: ("retained" | "leaving") | null;
            /** Rating */
            rating?: number | null;
            /** Primary Reason */
            primary_reason?: ("pay" | "growth" | "manager" | "workload" | "hours" | "relocation" | "studies" | "health" | "personal" | "other") | null;
            /** Would Rejoin */
            would_rejoin?: boolean | null;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** ExitInterviewOut */
        ExitInterviewOut: {
            /** Held On */
            held_on?: string | null;
            /** Outcome */
            outcome?: ("retained" | "leaving") | null;
            /** Rating */
            rating?: number | null;
            /** Primary Reason */
            primary_reason?: ("pay" | "growth" | "manager" | "workload" | "hours" | "relocation" | "studies" | "health" | "personal" | "other") | null;
            /** Would Rejoin */
            would_rejoin?: boolean | null;
            /**
             * Notes
             * @default
             */
            notes: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** ExpenseApprove */
        ExpenseApprove: {
            /** Approved Minor */
            approved_minor?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** ExpenseClaimFor */
        ExpenseClaimFor: {
            /** Title */
            title: string;
            /** Lines */
            lines: components["schemas"]["ExpenseLineIn"][];
            /**
             * Employee Id
             * Format: uuid
             */
            employee_id: string;
        };
        /** ExpenseClaimIn */
        ExpenseClaimIn: {
            /** Title */
            title: string;
            /** Lines */
            lines: components["schemas"]["ExpenseLineIn"][];
        };
        /** ExpenseClaimOut */
        ExpenseClaimOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Title */
            title: string;
            /**
             * Status
             * @enum {string}
             */
            status: "submitted" | "approved" | "rejected" | "cancelled";
            /** Total Minor */
            total_minor: number;
            /** Approved Minor */
            approved_minor: number | null;
            /** One Off Id */
            one_off_id: string | null;
            /** Pay Month */
            pay_month: string | null;
            /** Paid */
            paid: boolean;
            /** Decision Note */
            decision_note: string;
            /** Decided At */
            decided_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Lines */
            lines?: components["schemas"]["ExpenseLineOut"][];
        };
        /** ExpenseLineIn */
        ExpenseLineIn: {
            /**
             * Spent On
             * Format: date
             */
            spent_on: string;
            /**
             * Category
             * @default other
             * @enum {string}
             */
            category: "travel" | "fuel" | "meals" | "phone" | "supplies" | "medical" | "accommodation" | "other";
            /**
             * Description
             * @default
             */
            description: string;
            /** Amount Minor */
            amount_minor: number;
            /** Receipt File Id */
            receipt_file_id?: string | null;
        };
        /** ExpenseLineOut */
        ExpenseLineOut: {
            /** Id */
            id: string;
            /**
             * Spent On
             * Format: date
             */
            spent_on: string;
            /**
             * Category
             * @enum {string}
             */
            category: "travel" | "fuel" | "meals" | "phone" | "supplies" | "medical" | "accommodation" | "other";
            /** Description */
            description: string;
            /** Amount Minor */
            amount_minor: number;
            /** Receipt File Id */
            receipt_file_id: string | null;
        };
        /** ExpenseReject */
        ExpenseReject: {
            /** Note */
            note: string;
        };
        /** FbrInvoiceOut */
        FbrInvoiceOut: {
            /** Sale Id */
            sale_id: string;
            /** Status */
            status: string;
            /** Fbr Invoice Number */
            fbr_invoice_number: string | null;
            /** Error Code */
            error_code: string;
            /** Error */
            error: string;
            /** Attempts */
            attempts: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id?: string | null;
            /** Return Id */
            return_id?: string | null;
        };
        /**
         * FbrResolve
         * @description An owner's answer for a filing in `unknown`, after checking IRIS.
         */
        FbrResolve: {
            /** Filed */
            filed: boolean;
            /** Fbr Invoice Number */
            fbr_invoice_number?: string | null;
        };
        /** FbrSettingsOut */
        FbrSettingsOut: {
            /** Enabled */
            enabled: boolean;
            /** Environment */
            environment: string;
            /** Seller Ntn Cnic */
            seller_ntn_cnic: string;
            /** Seller Business Name */
            seller_business_name: string;
            /** Seller Province */
            seller_province: string;
            /** Seller Address */
            seller_address: string;
            /** Prices Include Tax */
            prices_include_tax: boolean;
            /** Token Set */
            token_set: boolean;
            /** Seller Region Code */
            seller_region_code?: string | null;
        };
        /** FbrSettingsUpdate */
        FbrSettingsUpdate: {
            /** Enabled */
            enabled?: boolean | null;
            /** Environment */
            environment?: ("sandbox" | "production") | null;
            /** Seller Ntn Cnic */
            seller_ntn_cnic?: string | null;
            /** Seller Business Name */
            seller_business_name?: string | null;
            /** Seller Province */
            seller_province?: string | null;
            /** Seller Address */
            seller_address?: string | null;
            /** Prices Include Tax */
            prices_include_tax?: boolean | null;
            /** Token */
            token?: string | null;
            /** Seller Region Code */
            seller_region_code?: string | null;
        };
        /** FileOut */
        FileOut: {
            /** Id */
            id: string;
            /**
             * Mime
             * @enum {string}
             */
            mime: "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            /** Size Bytes */
            size_bytes: number;
            /** Sha256 */
            sha256: string;
            /** Original Name */
            original_name: string;
        };
        /** FloorIn */
        FloorIn: {
            /** Name */
            name: string;
            /** Branch Id */
            branch_id?: string | null;
            /**
             * Position
             * @default 0
             */
            position: number;
        };
        /** FloorOut */
        FloorOut: {
            /** Id */
            id: string;
            /** Branch Id */
            branch_id: string;
            /** Name */
            name: string;
            /** Position */
            position: number;
            /** Active */
            active: boolean;
            /** Tables */
            tables: components["schemas"]["TableOut"][];
        };
        /** FloorUpdate */
        FloorUpdate: {
            /** Name */
            name?: string | null;
            /** Position */
            position?: number | null;
            /** Active */
            active?: boolean | null;
        };
        /** ForecastBucket */
        ForecastBucket: {
            /** Month */
            month?: string | null;
            /**
             * Won Minor
             * @default 0
             */
            won_minor: number;
            /**
             * Weighted Minor
             * @default 0
             */
            weighted_minor: number;
            /**
             * Best Case Minor
             * @default 0
             */
            best_case_minor: number;
            /**
             * Open Count
             * @default 0
             */
            open_count: number;
            /** Deals */
            deals?: components["schemas"]["ForecastDeal"][];
        };
        /** ForecastDeal */
        ForecastDeal: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Owner Id */
            owner_id: string | null;
            /** Value Minor */
            value_minor: number;
            /** Probability */
            probability: number | null;
            /** Weighted Minor */
            weighted_minor: number;
            /** Expected Close Date */
            expected_close_date: string | null;
        };
        /** ForecastItem */
        ForecastItem: {
            /** Product Id */
            product_id: string;
            /** Name */
            name: string;
            /** Current Stock */
            current_stock: number;
            /** Projected Units */
            projected_units: number;
            /** Recommend Qty */
            recommend_qty: number;
        };
        /** ForecastOut */
        ForecastOut: {
            /** Occasions */
            occasions: components["schemas"]["OccasionForecast"][];
        };
        /** ForgotRequest */
        ForgotRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** FulfillmentData */
        FulfillmentData: {
            /** Data */
            data?: {
                [key: string]: unknown;
            };
        };
        /** FulfillmentSchema */
        FulfillmentSchema: {
            /** Label */
            label: string;
            /** Fields */
            fields: {
                [key: string]: unknown;
            }[];
        };
        /** FunnelReport */
        FunnelReport: {
            /** Rows */
            rows: components["schemas"]["FunnelRow"][];
        };
        /** FunnelRow */
        FunnelRow: {
            /** Stage Id */
            stage_id: string;
            /** Stage */
            stage: string;
            /** Is Won */
            is_won: boolean;
            /** Reached */
            reached: number;
            /** Value Minor */
            value_minor: number;
            /** Conversion Pct */
            conversion_pct: number | null;
        };
        /** GrantIn */
        GrantIn: {
            /** Permission Key */
            permission_key: string;
            /**
             * Scope
             * @default all
             * @enum {string}
             */
            scope: "own" | "team" | "branch" | "all";
        };
        /** GrantsPut */
        GrantsPut: {
            /** Grants */
            grants: components["schemas"]["GrantIn"][];
        };
        /** GratuitySettings */
        GratuitySettings: {
            /**
             * Enabled
             * @default false
             */
            enabled: boolean;
            /**
             * Days Per Year
             * @default 30
             */
            days_per_year: number;
            /**
             * Min Service Months
             * @default 12
             */
            min_service_months: number;
            /**
             * Part Year Months
             * @default 6
             */
            part_year_months: number;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** GratuitySettingsOut */
        GratuitySettingsOut: {
            /**
             * Enabled
             * @default false
             */
            enabled: boolean;
            /**
             * Days Per Year
             * @default 30
             */
            days_per_year: number;
            /**
             * Min Service Months
             * @default 12
             */
            min_service_months: number;
            /**
             * Part Year Months
             * @default 6
             */
            part_year_months: number;
            /**
             * Note
             * @default
             */
            note: string;
            /**
             * Verified
             * @default false
             */
            verified: boolean;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HeartbeatIn */
        HeartbeatIn: {
            /** Outbox Count */
            outbox_count: number;
            /** Oldest Pending At */
            oldest_pending_at?: string | null;
        };
        /** HeldAsset */
        HeldAsset: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Tag */
            tag: string | null;
        };
        /** HeldIn */
        HeldIn: {
            /**
             * Label
             * @default
             */
            label: string;
            /** Register Id */
            register_id?: string | null;
            /** Cart */
            cart: {
                [key: string]: unknown;
            };
        };
        /** HeldOut */
        HeldOut: {
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Register Id */
            register_id: string | null;
            /** Cart */
            cart: {
                [key: string]: unknown;
            };
            /** Held By */
            held_by: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** HolidayCalendarCreate */
        HolidayCalendarCreate: {
            /** Name */
            name: string;
            /**
             * Scope
             * @default company
             * @enum {string}
             */
            scope: "province" | "company";
            /** Province */
            province?: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
        };
        /** HolidayCalendarOut */
        HolidayCalendarOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Scope */
            scope: string;
            /** Province */
            province: string | null;
            /**
             * Holidays
             * @default 0
             */
            holidays: number;
        };
        /** HolidayCreate */
        HolidayCreate: {
            /**
             * Holiday Date
             * Format: date
             */
            holiday_date: string;
            /** Name */
            name: string;
            /** Calendar Id */
            calendar_id?: string | null;
            /**
             * Kind
             * @default public
             * @enum {string}
             */
            kind: "public" | "optional" | "company";
            /**
             * Half Day
             * @default false
             */
            half_day: boolean;
        };
        /** HolidayOut */
        HolidayOut: {
            /** Id */
            id: string;
            /**
             * Holiday Date
             * Format: date
             */
            holiday_date: string;
            /** Name */
            name: string;
            /** Calendar Id */
            calendar_id?: string | null;
            /**
             * Calendar Name
             * @default
             */
            calendar_name: string;
            /**
             * Kind
             * @default public
             */
            kind: string;
            /**
             * Half Day
             * @default false
             */
            half_day: boolean;
        };
        /** HrAnalytics */
        HrAnalytics: {
            /** Months */
            months: components["schemas"]["HrMonth"][];
            /** Headcount Now */
            headcount_now: number;
            /** Joiners */
            joiners: number;
            /** Leavers */
            leavers: number;
            /** Attrition Pct */
            attrition_pct: number;
            /** Absenteeism Pct */
            absenteeism_pct: number | null;
            /** Absenteeism Month */
            absenteeism_month: string | null;
            /** Leaving Reasons */
            leaving_reasons: {
                [key: string]: number;
            };
            /** By Department */
            by_department: components["schemas"]["HrDepartment"][];
        };
        /** HrDepartment */
        HrDepartment: {
            /** Department */
            department: string;
            /** Headcount */
            headcount: number;
            /** Leavers */
            leavers: number;
        };
        /** HrMonth */
        HrMonth: {
            /** Month */
            month: string;
            /** Headcount */
            headcount: number;
            /** Joiners */
            joiners: number;
            /** Leavers */
            leavers: number;
        };
        /** HrmsSummary */
        HrmsSummary: {
            /** Headcount */
            headcount: number;
            /** Present Today */
            present_today: number;
            /** On Leave Today */
            on_leave_today: number;
            /** Pending Leaves */
            pending_leaves: number;
        };
        /** ImportResult */
        ImportResult: {
            /** Created */
            created: number;
            /** Skipped Duplicates */
            skipped_duplicates: number;
            /** Errors */
            errors?: components["schemas"]["ImportRowError"][];
        };
        /** ImportRowError */
        ImportRowError: {
            /** Row */
            row: number;
            /** Error */
            error: string;
        };
        /** InteractionCreate */
        InteractionCreate: {
            /**
             * Channel
             * @default note
             * @enum {string}
             */
            channel: "call" | "whatsapp" | "email" | "note" | "bot";
            /** Outcome */
            outcome?: ("interested" | "not_interested" | "callback" | "busy") | null;
            /**
             * Note
             * @default
             */
            note: string;
            /** Next Follow Up At */
            next_follow_up_at?: string | null;
        };
        /** InteractionOut */
        InteractionOut: {
            /** Id */
            id: string;
            /** User Id */
            user_id: string | null;
            /** Channel */
            channel: string;
            /** Outcome */
            outcome: string | null;
            /** Note */
            note: string;
            /** Next Follow Up At */
            next_follow_up_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** InviteRequest */
        InviteRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Role Id */
            role_id: string;
        };
        /**
         * InvoiceCreate
         * @description A draft; `submit` sends it straight for approval.
         */
        InvoiceCreate: {
            /** Contact Id */
            contact_id?: string | null;
            /** Lead Id */
            lead_id?: string | null;
            /** Due Date */
            due_date?: string | null;
            /**
             * Tax Inclusive
             * @default false
             */
            tax_inclusive: boolean;
            /**
             * Discount Minor
             * @default 0
             */
            discount_minor: number;
            /**
             * Notes
             * @default
             */
            notes: string;
            /** Lines */
            lines: components["schemas"]["InvoiceLineIn-Input"][];
            /**
             * Submit
             * @default false
             */
            submit: boolean;
        };
        /** InvoiceDetail */
        InvoiceDetail: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Number */
            number: string | null;
            /** Legacy Ref */
            legacy_ref: string | null;
            /** Status */
            status: string;
            /** Contact Id */
            contact_id: string | null;
            /** Contact Name */
            contact_name: string | null;
            /** Lead Id */
            lead_id: string | null;
            /** Lead Name */
            lead_name: string | null;
            /** Issue Date */
            issue_date: string | null;
            /** Due Date */
            due_date: string | null;
            /** Total Minor */
            total_minor: number;
            /** Paid Minor */
            paid_minor: number;
            /** Credited Minor */
            credited_minor: number;
            /** Balance Minor */
            balance_minor: number;
            /** Overdue */
            overdue: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Credit Of Id */
            credit_of_id: string | null;
            /** Tax Inclusive */
            tax_inclusive: boolean;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Discount Minor */
            discount_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Bill To */
            bill_to: {
                [key: string]: string;
            };
            /** Notes */
            notes: string;
            /** Reason */
            reason: string;
            /** Lines */
            lines: components["schemas"]["InvoiceLineOut"][];
            /** Payments */
            payments: components["schemas"]["PaymentOut"][];
            /** Credit Notes */
            credit_notes: components["schemas"]["InvoiceSummary"][];
            /** Unverified Rates */
            unverified_rates: boolean;
            /** Last Sent At */
            last_sent_at?: string | null;
        };
        /** InvoiceLineIn */
        "InvoiceLineIn-Input": {
            /** Description */
            description: string;
            /** Qty */
            qty: number | string;
            /** Unit Price Minor */
            unit_price_minor: number;
            /**
             * Line Discount Minor
             * @default 0
             */
            line_discount_minor: number;
            /** Tax Code */
            tax_code?: string | null;
            /** Product Id */
            product_id?: string | null;
        };
        /** InvoiceLineIn */
        "InvoiceLineIn-Output": {
            /** Description */
            description: string;
            /** Qty */
            qty: string;
            /** Unit Price Minor */
            unit_price_minor: number;
            /**
             * Line Discount Minor
             * @default 0
             */
            line_discount_minor: number;
            /** Tax Code */
            tax_code?: string | null;
            /** Product Id */
            product_id?: string | null;
        };
        /** InvoiceLineOut */
        InvoiceLineOut: {
            /** Id */
            id: string;
            /** Position */
            position: number;
            /** Description */
            description: string;
            /** Qty */
            qty: number;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Share Minor */
            share_minor: number;
            /** Tax Code */
            tax_code: string | null;
            /** Tax Rate Pct */
            tax_rate_pct: number;
            /** Net Excl Minor */
            net_excl_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Product Id */
            product_id: string | null;
        };
        /**
         * InvoicePlanIn
         * @description What to bill, to whom (a tag or a saved list, not both) and when it's due.
         */
        InvoicePlanIn: {
            /** Name */
            name: string;
            /** Lines */
            lines: components["schemas"]["InvoiceLineIn-Input"][];
            /** Tag Id */
            tag_id?: string | null;
            /** Segment Id */
            segment_id?: string | null;
            /**
             * Due Day
             * @default 10
             */
            due_day: number;
            /** Run Day */
            run_day?: number | null;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** InvoicePlanOut */
        InvoicePlanOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Lines */
            lines: components["schemas"]["InvoiceLineIn-Output"][];
            /** Tag Id */
            tag_id: string | null;
            /** Segment Id */
            segment_id: string | null;
            /** Due Day */
            due_day: number;
            /** Run Day */
            run_day: number | null;
            /** Notes */
            notes: string;
            /** Active */
            active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** InvoiceRunCreate */
        InvoiceRunCreate: {
            /** Period */
            period: string;
        };
        /** InvoiceRunDetail */
        InvoiceRunDetail: {
            /** Id */
            id: string;
            /** Plan Id */
            plan_id: string;
            /** Plan Name */
            plan_name: string;
            /**
             * Period
             * Format: date
             */
            period: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued";
            /** Invoice Count */
            invoice_count: number;
            /** Total Minor */
            total_minor: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Issued At */
            issued_at: string | null;
            /** Invoices */
            invoices: components["schemas"]["InvoiceSummary"][];
        };
        /** InvoiceRunOut */
        InvoiceRunOut: {
            /** Id */
            id: string;
            /** Plan Id */
            plan_id: string;
            /** Plan Name */
            plan_name: string;
            /**
             * Period
             * Format: date
             */
            period: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "issued";
            /** Invoice Count */
            invoice_count: number;
            /** Total Minor */
            total_minor: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Issued At */
            issued_at: string | null;
        };
        /**
         * InvoiceSend
         * @description No address: the billed contact's email.
         */
        InvoiceSend: {
            /** To */
            to?: string | null;
        };
        /** InvoiceSent */
        InvoiceSent: {
            /** To */
            to: string;
        };
        /** InvoiceSummary */
        InvoiceSummary: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Number */
            number: string | null;
            /** Legacy Ref */
            legacy_ref: string | null;
            /** Status */
            status: string;
            /** Contact Id */
            contact_id: string | null;
            /** Contact Name */
            contact_name: string | null;
            /** Lead Id */
            lead_id: string | null;
            /** Lead Name */
            lead_name: string | null;
            /** Issue Date */
            issue_date: string | null;
            /** Due Date */
            due_date: string | null;
            /** Total Minor */
            total_minor: number;
            /** Paid Minor */
            paid_minor: number;
            /** Credited Minor */
            credited_minor: number;
            /** Balance Minor */
            balance_minor: number;
            /** Overdue */
            overdue: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * InvoiceUpdate
         * @description Draft or awaiting approval only; `lines` replaces them all.
         */
        InvoiceUpdate: {
            /** Contact Id */
            contact_id?: string | null;
            /** Due Date */
            due_date?: string | null;
            /** Tax Inclusive */
            tax_inclusive?: boolean | null;
            /** Discount Minor */
            discount_minor?: number | null;
            /** Notes */
            notes?: string | null;
            /** Lines */
            lines?: components["schemas"]["InvoiceLineIn-Input"][] | null;
        };
        /** JobChangeIn */
        JobChangeIn: {
            /**
             * Kind
             * @default change
             * @enum {string}
             */
            kind: "promotion" | "transfer" | "demotion" | "change";
            /**
             * Effective On
             * Format: date
             */
            effective_on: string;
            /** Job Title Id */
            job_title_id?: string | null;
            /** Department Id */
            department_id?: string | null;
            /** Location Id */
            location_id?: string | null;
            /** Manager Id */
            manager_id?: string | null;
            /** New Base Minor */
            new_base_minor?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** JobChangeOut */
        JobChangeOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "promotion" | "transfer" | "demotion" | "change";
            /**
             * Effective On
             * Format: date
             */
            effective_on: string;
            /**
             * Status
             * @enum {string}
             */
            status: "scheduled" | "applied" | "cancelled";
            /** From Title */
            from_title: string | null;
            /** To Title */
            to_title: string | null;
            /** From Department */
            from_department: string | null;
            /** To Department */
            to_department: string | null;
            /** From Location */
            from_location: string | null;
            /** To Location */
            to_location: string | null;
            /** From Manager */
            from_manager: string | null;
            /** To Manager */
            to_manager: string | null;
            /** Old Base Minor */
            old_base_minor: number | null;
            /** New Base Minor */
            new_base_minor: number | null;
            /** Note */
            note: string;
            /** Applied At */
            applied_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** JobTitleCreate */
        JobTitleCreate: {
            /** Name */
            name: string;
            /** Department Id */
            department_id?: string | null;
        };
        /** JobTitleOut */
        JobTitleOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Department Id */
            department_id: string | null;
            /** Active */
            active: boolean;
        };
        /** JobTitleUpdate */
        JobTitleUpdate: {
            /** Name */
            name?: string | null;
            /** Department Id */
            department_id?: string | null;
            /** Active */
            active?: boolean | null;
        };
        /** KioskBootstrap */
        KioskBootstrap: {
            location: components["schemas"]["KioskLocation"];
            /** Kiosk Name */
            kiosk_name: string;
            /** Employees */
            employees: components["schemas"]["KioskEmployee"][];
        };
        /** KioskCreate */
        KioskCreate: {
            /**
             * Location Id
             * Format: uuid
             */
            location_id: string;
            /** Name */
            name: string;
        };
        /** KioskEmployee */
        KioskEmployee: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Has Pin */
            has_pin: boolean;
        };
        /** KioskLocation */
        KioskLocation: {
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** KioskOut */
        KioskOut: {
            /** Id */
            id: string;
            /** Location Id */
            location_id: string;
            /** Location Name */
            location_name: string;
            /** Name */
            name: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Last Seen At */
            last_seen_at: string | null;
            /** Revoked At */
            revoked_at: string | null;
            /** Token */
            token?: string | null;
        };
        /** KioskPinSet */
        KioskPinSet: {
            /** Pin */
            pin: string;
        };
        /** KioskPunchOut */
        KioskPunchOut: {
            /** Kind */
            kind: string;
            /** Name */
            name: string;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Worked Today Min */
            worked_today_min: number;
        };
        /** KioskPunchRequest */
        KioskPunchRequest: {
            /**
             * Employee Id
             * Format: uuid
             */
            employee_id: string;
            /** Pin */
            pin: string;
        };
        /** Kpi */
        Kpi: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Value */
            value: number;
            /** Kind */
            kind: string;
            /** Delta Pct */
            delta_pct?: number | null;
            /** Href */
            href: string;
        };
        /** KraIn */
        KraIn: {
            /** Title */
            title: string;
            /**
             * Description
             * @default
             */
            description: string;
            /** Weight */
            weight: number;
        };
        /** KraOut */
        KraOut: {
            /** Title */
            title: string;
            /**
             * Description
             * @default
             */
            description: string;
            /** Weight */
            weight: number;
            /** Id */
            id: string;
        };
        /** LeadContact */
        LeadContact: {
            /** Lead Id */
            lead_id: string;
            contact: components["schemas"]["ContactOut"];
        };
        /** LeadCreate */
        LeadCreate: {
            /** Name */
            name: string;
            /**
             * Company
             * @default
             */
            company: string;
            /**
             * Phone
             * @default
             */
            phone: string;
            /**
             * Email
             * @default
             */
            email: string;
            /**
             * Source
             * @default manual
             */
            source: string;
            /**
             * Value Minor
             * @default 0
             */
            value_minor: number;
            /** Pipeline Id */
            pipeline_id?: string | null;
            /** Stage Id */
            stage_id?: string | null;
            /**
             * Priority
             * @default 0
             */
            priority: number;
            /** Expected Close Date */
            expected_close_date?: string | null;
            /** Tag Ids */
            tag_ids?: string[];
            /**
             * Force
             * @default false
             */
            force: boolean;
        };
        /** LeadDetail */
        LeadDetail: {
            lead: components["schemas"]["LeadOut"];
            /** Timeline */
            timeline: components["schemas"]["TimelineEventOut"][];
            /** Activities */
            activities: components["schemas"]["ActivityOut"][];
        };
        /** LeadLost */
        LeadLost: {
            /** Lost Reason Id */
            lost_reason_id?: string | null;
            /** Lost Note */
            lost_note?: string | null;
        };
        /** LeadOut */
        LeadOut: {
            /** Id */
            id: string;
            /** Pipeline Id */
            pipeline_id: string;
            /** Stage Id */
            stage_id: string;
            /** Owner Id */
            owner_id: string | null;
            /** Name */
            name: string;
            /** Company */
            company: string;
            /** Phone */
            phone: string;
            /** Email */
            email: string;
            /** Source */
            source: string;
            /** Value Minor */
            value_minor: number;
            /** Currency */
            currency: string;
            /** Score */
            score: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Stage Kind */
            stage_kind?: string | null;
            /**
             * Status
             * @default open
             * @enum {string}
             */
            status: "open" | "won" | "lost";
            /** Lost Reason Id */
            lost_reason_id?: string | null;
            /** Lost Reason */
            lost_reason?: string | null;
            /** Lost Note */
            lost_note?: string | null;
            /** Won At */
            won_at?: string | null;
            /** Lost At */
            lost_at?: string | null;
            /** Probability */
            probability?: number | null;
            /**
             * Probability Is Manual
             * @default false
             */
            probability_is_manual: boolean;
            /**
             * Weighted Value Minor
             * @default 0
             */
            weighted_value_minor: number;
            /** Expected Close Date */
            expected_close_date?: string | null;
            /**
             * Priority
             * @default 0
             */
            priority: number;
            /** Stage Entered At */
            stage_entered_at?: string | null;
            /** Activity State */
            activity_state?: ("overdue" | "today" | "planned") | null;
            /** Next Activity Date */
            next_activity_date?: string | null;
            /**
             * Tags
             * @default []
             */
            tags: components["schemas"]["TagOut"][];
            /**
             * Line Count
             * @default 0
             */
            line_count: number;
        };
        /** LeadUpdate */
        LeadUpdate: {
            /** Stage Id */
            stage_id?: string | null;
            /** Name */
            name?: string | null;
            /** Company */
            company?: string | null;
            /** Phone */
            phone?: string | null;
            /** Email */
            email?: string | null;
            /** Value Minor */
            value_minor?: number | null;
            /** Owner Id */
            owner_id?: string | null;
            /** Probability */
            probability?: number | null;
            /** Probability Auto */
            probability_auto?: boolean | null;
            /** Priority */
            priority?: number | null;
            /** Expected Close Date */
            expected_close_date?: string | null;
            /** Tag Ids */
            tag_ids?: string[] | null;
        };
        /**
         * LeaveBalance
         * @description One leave type's balance in the current leave year, from the ledger
         *     (0068): quota = granted + accrued + carried in ± adjustments.
         */
        LeaveBalance: {
            /** Leave Type */
            leave_type: string;
            /** Quota */
            quota: number;
            /** Used */
            used: number;
            /** Remaining */
            remaining: number;
            /** Leave Type Id */
            leave_type_id?: string | null;
            /**
             * Name
             * @default
             */
            name: string;
            /**
             * Pending
             * @default 0
             */
            pending: number;
            /** Cycle Start */
            cycle_start?: string | null;
            /** Cycle End */
            cycle_end?: string | null;
        };
        /** LeaveCreate */
        LeaveCreate: {
            /** Employee Id */
            employee_id: string;
            /**
             * Request Type
             * @default leave
             * @enum {string}
             */
            request_type: "leave" | "wfh";
            /**
             * Leave Type
             * @default annual
             */
            leave_type: string;
            /** Leave Type Id */
            leave_type_id?: string | null;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** From Half */
            from_half?: ("am" | "pm") | null;
            /** To Half */
            to_half?: ("am" | "pm") | null;
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** LeaveOut */
        LeaveOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Request Type */
            request_type: string;
            /** Leave Type */
            leave_type: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Reason */
            reason: string;
            /** Status */
            status: string;
            /** Leave Type Id */
            leave_type_id?: string | null;
            /**
             * Leave Type Name
             * @default
             */
            leave_type_name: string;
            /**
             * Paid
             * @default true
             */
            paid: boolean;
            /** From Half */
            from_half?: string | null;
            /** To Half */
            to_half?: string | null;
            /** Duration Days */
            duration_days?: number | null;
            /** Approval Step */
            approval_step?: string | null;
        };
        /** LeavePolicyOut */
        LeavePolicyOut: {
            /** Annual Days */
            annual_days: number;
            /** Sick Days */
            sick_days: number;
            /** Casual Days */
            casual_days: number;
        };
        /** LeavePolicyUpdate */
        LeavePolicyUpdate: {
            /** Annual Days */
            annual_days?: number | null;
            /** Sick Days */
            sick_days?: number | null;
            /** Casual Days */
            casual_days?: number | null;
        };
        /** LeaveTypeCreate */
        LeaveTypeCreate: {
            /** Name */
            name: string;
            /**
             * Color
             * @default #0f766e
             */
            color: string;
            /**
             * Paid
             * @default true
             */
            paid: boolean;
            /**
             * Requires Balance
             * @default true
             */
            requires_balance: boolean;
            /**
             * Counts As
             * @default leave
             * @enum {string}
             */
            counts_as: "leave" | "wfh";
            /**
             * Allow Half Day
             * @default true
             */
            allow_half_day: boolean;
            /**
             * Approval
             * @default manager_then_hr
             * @enum {string}
             */
            approval: "none" | "manager" | "hr" | "manager_then_hr";
            /**
             * Grant Mode
             * @default annual_upfront
             * @enum {string}
             */
            grant_mode: "annual_upfront" | "monthly_accrual" | "none";
            /**
             * Days Per Year
             * @default 0
             */
            days_per_year: number;
            /**
             * Accrual Start After Days
             * @default 0
             */
            accrual_start_after_days: number;
            /**
             * Prorate Joiners
             * @default true
             */
            prorate_joiners: boolean;
            /**
             * Cycle Start Month
             * @default 1
             */
            cycle_start_month: number;
            /**
             * Carry Forward
             * @default none
             * @enum {string}
             */
            carry_forward: "none" | "all" | "capped";
            /**
             * Carry Cap Days
             * @default 0
             */
            carry_cap_days: number;
            /** Carry Expires After Months */
            carry_expires_after_months?: number | null;
            /** Max Balance Days */
            max_balance_days?: number | null;
            /**
             * Allow Negative Days
             * @default 0
             */
            allow_negative_days: number;
            /** Max Consecutive Days */
            max_consecutive_days?: number | null;
            /**
             * Include Holidays
             * @default false
             */
            include_holidays: boolean;
            /**
             * Statutory Note
             * @default
             */
            statutory_note: string;
            /**
             * Active
             * @default true
             */
            active: boolean;
            /** Code */
            code: string;
        };
        /** LeaveTypeOut */
        LeaveTypeOut: {
            /** Name */
            name: string;
            /**
             * Color
             * @default #0f766e
             */
            color: string;
            /**
             * Paid
             * @default true
             */
            paid: boolean;
            /**
             * Requires Balance
             * @default true
             */
            requires_balance: boolean;
            /**
             * Counts As
             * @default leave
             * @enum {string}
             */
            counts_as: "leave" | "wfh";
            /**
             * Allow Half Day
             * @default true
             */
            allow_half_day: boolean;
            /**
             * Approval
             * @default manager_then_hr
             * @enum {string}
             */
            approval: "none" | "manager" | "hr" | "manager_then_hr";
            /**
             * Grant Mode
             * @default annual_upfront
             * @enum {string}
             */
            grant_mode: "annual_upfront" | "monthly_accrual" | "none";
            /**
             * Days Per Year
             * @default 0
             */
            days_per_year: number;
            /**
             * Accrual Start After Days
             * @default 0
             */
            accrual_start_after_days: number;
            /**
             * Prorate Joiners
             * @default true
             */
            prorate_joiners: boolean;
            /**
             * Cycle Start Month
             * @default 1
             */
            cycle_start_month: number;
            /**
             * Carry Forward
             * @default none
             * @enum {string}
             */
            carry_forward: "none" | "all" | "capped";
            /**
             * Carry Cap Days
             * @default 0
             */
            carry_cap_days: number;
            /** Carry Expires After Months */
            carry_expires_after_months?: number | null;
            /** Max Balance Days */
            max_balance_days?: number | null;
            /**
             * Allow Negative Days
             * @default 0
             */
            allow_negative_days: number;
            /** Max Consecutive Days */
            max_consecutive_days?: number | null;
            /**
             * Include Holidays
             * @default false
             */
            include_holidays: boolean;
            /**
             * Statutory Note
             * @default
             */
            statutory_note: string;
            /**
             * Active
             * @default true
             */
            active: boolean;
            /** Id */
            id: string;
            /** Code */
            code: string;
        };
        /**
         * LeaveTypeUpdate
         * @description Any LeaveTypeBase field; the code never changes (requests keep it).
         */
        LeaveTypeUpdate: {
            /** Name */
            name?: string | null;
            /** Color */
            color?: string | null;
            /** Paid */
            paid?: boolean | null;
            /** Requires Balance */
            requires_balance?: boolean | null;
            /** Counts As */
            counts_as?: ("leave" | "wfh") | null;
            /** Allow Half Day */
            allow_half_day?: boolean | null;
            /** Approval */
            approval?: ("none" | "manager" | "hr" | "manager_then_hr") | null;
            /** Grant Mode */
            grant_mode?: ("annual_upfront" | "monthly_accrual" | "none") | null;
            /** Days Per Year */
            days_per_year?: number | null;
            /** Accrual Start After Days */
            accrual_start_after_days?: number | null;
            /** Prorate Joiners */
            prorate_joiners?: boolean | null;
            /** Cycle Start Month */
            cycle_start_month?: number | null;
            /** Carry Forward */
            carry_forward?: ("none" | "all" | "capped") | null;
            /** Carry Cap Days */
            carry_cap_days?: number | null;
            /** Carry Expires After Months */
            carry_expires_after_months?: number | null;
            /** Max Balance Days */
            max_balance_days?: number | null;
            /** Allow Negative Days */
            allow_negative_days?: number | null;
            /** Max Consecutive Days */
            max_consecutive_days?: number | null;
            /** Include Holidays */
            include_holidays?: boolean | null;
            /** Statutory Note */
            statutory_note?: string | null;
            /** Active */
            active?: boolean | null;
        };
        /** LedgerAdjust */
        LedgerAdjust: {
            /**
             * Employee Id
             * Format: uuid
             */
            employee_id: string;
            /**
             * Leave Type Id
             * Format: uuid
             */
            leave_type_id: string;
            /** Days */
            days: number;
            /** Note */
            note: string;
        };
        /** LedgerEntryOut */
        LedgerEntryOut: {
            /** Id */
            id: string;
            /** Leave Type Id */
            leave_type_id: string;
            /** Leave Type */
            leave_type: string;
            /**
             * Cycle Start
             * Format: date
             */
            cycle_start: string;
            /** Entry */
            entry: string;
            /** Days */
            days: number;
            /** Period Key */
            period_key: string | null;
            /** Ref Request Id */
            ref_request_id: string | null;
            /** Note */
            note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** LetterDecline */
        LetterDecline: {
            /** Note */
            note: string;
        };
        /** LetterIssue */
        LetterIssue: {
            /**
             * Template Id
             * Format: uuid
             */
            template_id: string;
            /** Title */
            title?: string | null;
            /** Body */
            body?: string | null;
            /** Request Id */
            request_id?: string | null;
        };
        /** LetterOut */
        LetterOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "offer" | "appointment" | "experience" | "salary" | "noc" | "employment" | "relieving" | "warning" | "other";
            /** Number */
            number: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /**
             * Issued At
             * Format: date-time
             */
            issued_at: string;
        };
        /** LetterPreview */
        LetterPreview: {
            /** Title */
            title: string;
            /** Body */
            body: string;
        };
        /** LetterPreviewIn */
        LetterPreviewIn: {
            /**
             * Template Id
             * Format: uuid
             */
            template_id: string;
        };
        /** LetterRequestIn */
        LetterRequestIn: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "experience" | "salary" | "noc" | "employment" | "id_card" | "other";
            /**
             * Purpose
             * @default
             */
            purpose: string;
        };
        /** LetterRequestOut */
        LetterRequestOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "experience" | "salary" | "noc" | "employment" | "id_card" | "other";
            /** Purpose */
            purpose: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "issued" | "declined";
            /** Letter Id */
            letter_id: string | null;
            /** Note */
            note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Decided At */
            decided_at: string | null;
        };
        /** LetterTemplateIn */
        LetterTemplateIn: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "offer" | "appointment" | "experience" | "salary" | "noc" | "employment" | "relieving" | "warning" | "other";
            /** Name */
            name: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
        };
        /** LetterTemplateOut */
        LetterTemplateOut: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "offer" | "appointment" | "experience" | "salary" | "noc" | "employment" | "relieving" | "warning" | "other";
            /** Name */
            name: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /** Id */
            id: string;
            /** Active */
            active: boolean;
        };
        /** LetterTemplateUpdate */
        LetterTemplateUpdate: {
            /** Name */
            name?: string | null;
            /** Title */
            title?: string | null;
            /** Body */
            body?: string | null;
            /** Active */
            active?: boolean | null;
        };
        /** LimitIn */
        LimitIn: {
            /** Credit Limit Minor */
            credit_limit_minor: number | null;
        };
        /** LineOut */
        LineOut: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Kind */
            kind: string;
            /** Amount Minor */
            amount_minor: number;
            /**
             * Taxable
             * @default false
             */
            taxable: boolean;
            /** Explain */
            explain?: {
                [key: string]: unknown;
            };
        };
        /**
         * LocaleOut
         * @description How to render for this caller (12-trd §5.2 `locale`).
         */
        LocaleOut: {
            /**
             * Locale
             * @enum {string}
             */
            locale: "en" | "ur";
            /**
             * Dir
             * @enum {string}
             */
            dir: "ltr" | "rtl";
            /** Timezone */
            timezone: string;
            /** Currency */
            currency: string;
        };
        /** LocationCreate */
        LocationCreate: {
            /** Name */
            name: string;
            /**
             * Kind
             * @default office
             * @enum {string}
             */
            kind: "office" | "store" | "warehouse" | "factory" | "remote";
            /**
             * Address
             * @default
             */
            address: string;
            /** Lat */
            lat?: number | null;
            /** Lng */
            lng?: number | null;
            /**
             * Radius M
             * @default 150
             */
            radius_m: number;
            /** Allowed Cidrs */
            allowed_cidrs?: string[];
            /** Province */
            province?: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /**
             * Geo Mode
             * @default record
             * @enum {string}
             */
            geo_mode: "off" | "record" | "require";
            /**
             * Ip Mode
             * @default off
             * @enum {string}
             */
            ip_mode: "off" | "record" | "require";
        };
        /** LocationOut */
        LocationOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Kind */
            kind: string;
            /** Address */
            address: string;
            /** Lat */
            lat: number | null;
            /** Lng */
            lng: number | null;
            /** Radius M */
            radius_m: number;
            /** Allowed Cidrs */
            allowed_cidrs: string[];
            /** Province */
            province: string | null;
            /** Geo Mode */
            geo_mode: string;
            /** Ip Mode */
            ip_mode: string;
            /** Active */
            active: boolean;
            /**
             * Kiosks
             * @default 0
             */
            kiosks: number;
        };
        /** LocationUpdate */
        LocationUpdate: {
            /** Name */
            name?: string | null;
            /** Kind */
            kind?: ("office" | "store" | "warehouse" | "factory" | "remote") | null;
            /** Address */
            address?: string | null;
            /** Lat */
            lat?: number | null;
            /** Lng */
            lng?: number | null;
            /** Radius M */
            radius_m?: number | null;
            /** Allowed Cidrs */
            allowed_cidrs?: string[] | null;
            /** Province */
            province?: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /** Geo Mode */
            geo_mode?: ("off" | "record" | "require") | null;
            /** Ip Mode */
            ip_mode?: ("off" | "record" | "require") | null;
            /** Active */
            active?: boolean | null;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
        };
        /** LostReasonCreate */
        LostReasonCreate: {
            /** Name */
            name: string;
        };
        /** LostReasonOut */
        LostReasonOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Position */
            position: number;
        };
        /** LostReasonRow */
        LostReasonRow: {
            /** Reason */
            reason: string;
            /** Count */
            count: number;
            /** Value Minor */
            value_minor: number;
        };
        /** LostReasonUpdate */
        LostReasonUpdate: {
            /** Name */
            name?: string | null;
            /** Position */
            position?: number | null;
        };
        /** LostReasonsReport */
        LostReasonsReport: {
            /** Rows */
            rows: components["schemas"]["LostReasonRow"][];
        };
        /** MeBranch */
        MeBranch: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Is Default */
            is_default: boolean;
        };
        /** MeModule */
        MeModule: {
            /** Key */
            key: string;
            /**
             * State
             * @enum {string}
             */
            state: "enabled" | "disabled";
            /** Application */
            application: boolean;
        };
        /** MeNavChild */
        MeNavChild: {
            /** Href */
            href: string;
            /** Label Key */
            label_key: string;
        };
        /**
         * MeNavItem
         * @description A sidebar entry the caller may see; the web owns labels and icons.
         */
        MeNavItem: {
            /** Key */
            key: string;
            /** Module */
            module: string;
            /** Href */
            href: string;
            /** Label Key */
            label_key: string;
            /** Icon */
            icon: string;
            /** Group */
            group: string;
            /** Children */
            children?: components["schemas"]["MeNavChild"][];
        };
        /** MeResponse */
        MeResponse: {
            user: components["schemas"]["UserOut"];
            tenant: components["schemas"]["TenantOut"];
            /** Entitlements */
            entitlements: components["schemas"]["EntitlementOut"][];
            /** Permissions */
            permissions: {
                [key: string]: "own" | "team" | "branch" | "all";
            };
            /** Modules */
            modules?: components["schemas"]["MeModule"][];
            /** Nav */
            nav?: components["schemas"]["MeNavItem"][];
            /** Flags */
            flags?: {
                [key: string]: boolean;
            };
            terminology?: components["schemas"]["TerminologyRef"] | null;
            locale: components["schemas"]["LocaleOut"];
            /**
             * Employee Portal
             * @default false
             */
            employee_portal: boolean;
            /** Branches */
            branches?: components["schemas"]["MeBranch"][];
            /** Branding */
            branding?: {
                [key: string]: unknown;
            } | null;
        };
        /** MergeCounts */
        MergeCounts: {
            /** Leads */
            leads: number;
            /** Sales */
            sales: number;
            /** Invoices */
            invoices: number;
            /** People */
            people: number;
        };
        /** MergePreview */
        MergePreview: {
            /** Contacts */
            contacts: components["schemas"]["ContactOut"][];
            /** Differing Fields */
            differing_fields: string[];
            /** Counts */
            counts: {
                [key: string]: components["schemas"]["MergeCounts"];
            };
        };
        /** MergePreviewRequest */
        MergePreviewRequest: {
            /** Ids */
            ids: string[];
        };
        /** MergeRequest */
        MergeRequest: {
            /**
             * Winner Id
             * Format: uuid
             */
            winner_id: string;
            /** Loser Ids */
            loser_ids: string[];
            /** Field Choices */
            field_choices?: {
                [key: string]: string;
            };
        };
        /** MergeResult */
        MergeResult: {
            winner: components["schemas"]["ContactOut"];
            /** Merged Ids */
            merged_ids: string[];
            /** Moved */
            moved: {
                [key: string]: number;
            };
        };
        /** MethodFigures */
        MethodFigures: {
            /** Method */
            method: string;
            /** Taken Minor */
            taken_minor: number;
            /** Refunds Minor */
            refunds_minor: number;
            /** Expected Minor */
            expected_minor: number;
            /** Counted Minor */
            counted_minor: number | null;
            /** Variance Minor */
            variance_minor: number | null;
        };
        /** MethodTotal */
        MethodTotal: {
            /** Payment Method */
            payment_method: string;
            /** Count */
            count: number;
            /** Total Minor */
            total_minor: number;
        };
        /** MinimumWageOut */
        MinimumWageOut: {
            /** Province */
            province: string;
            /**
             * Effective From
             * Format: date
             */
            effective_from: string;
            /** Monthly Minor */
            monthly_minor: number;
            /** Source Ref */
            source_ref: string;
            /** Verified */
            verified: boolean;
        };
        /** ModuleOut */
        ModuleOut: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Description */
            description: string;
            /** Application */
            application: boolean;
            /** Always On */
            always_on: boolean;
            /**
             * State
             * @enum {string}
             */
            state: "enabled" | "disabled";
            /** Reason */
            reason: ("user" | "dependency" | "auto") | null;
            /** Depends */
            depends: string[];
            /** Auto Enable */
            auto_enable: string[];
            /** Purgeable */
            purgeable: boolean;
            /** Pending Purge At */
            pending_purge_at?: string | null;
        };
        /** MoveOut */
        MoveOut: {
            /** Id */
            id: string;
            /** Product Id */
            product_id: string;
            /** Product Name */
            product_name: string;
            /** Qty Delta */
            qty_delta: number;
            /** Reason */
            reason: string;
            /** Ref Id */
            ref_id: string | null;
            /** Note */
            note: string;
            /** User Name */
            user_name: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** MyBoardingTask */
        MyBoardingTask: {
            /** Id */
            id: string;
            /** Boarding Id */
            boarding_id: string;
            /** Title */
            title: string;
            /**
             * Owner
             * @enum {string}
             */
            owner: "hr" | "it" | "manager" | "employee" | "admin";
            /** Due On */
            due_on: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "done" | "skipped";
            /** Note */
            note: string;
            /** Done At */
            done_at: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "onboarding" | "offboarding";
        };
        /** NoteCreate */
        NoteCreate: {
            /** Body */
            body: string;
        };
        /** NoticeAck */
        NoticeAck: {
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /** Acknowledged At */
            acknowledged_at: string | null;
        };
        /** NoticeCreate */
        NoticeCreate: {
            /** Title */
            title: string;
            /**
             * Body
             * @default
             */
            body: string;
            /**
             * Requires Ack
             * @default false
             */
            requires_ack: boolean;
            /**
             * Audience
             * @default all
             * @enum {string}
             */
            audience: "all" | "department" | "location";
            /** Department Id */
            department_id?: string | null;
            /** Location Id */
            location_id?: string | null;
            /** File Id */
            file_id?: string | null;
            /**
             * Pinned
             * @default false
             */
            pinned: boolean;
        };
        /** NoticeOut */
        NoticeOut: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /** Requires Ack */
            requires_ack: boolean;
            /**
             * Audience
             * @enum {string}
             */
            audience: "all" | "department" | "location";
            /** Department Id */
            department_id: string | null;
            /** Location Id */
            location_id: string | null;
            /** Audience Label */
            audience_label: string;
            /** File Id */
            file_id: string | null;
            /** Pinned */
            pinned: boolean;
            /**
             * Published At
             * Format: date-time
             */
            published_at: string;
            /** Archived At */
            archived_at: string | null;
            /** Audience Size */
            audience_size: number;
            /** Acknowledged */
            acknowledged: number;
            /** Acknowledged At */
            acknowledged_at?: string | null;
            /** Last Reminded At */
            last_reminded_at?: string | null;
            /**
             * Reminders Sent
             * @default 0
             */
            reminders_sent: number;
        };
        /** NoticeRemindOut */
        NoticeRemindOut: {
            /** Reminded */
            reminded: number;
        };
        /** NoticeUpdate */
        NoticeUpdate: {
            /** Pinned */
            pinned?: boolean | null;
            /** Archived */
            archived?: boolean | null;
        };
        /** NotificationList */
        NotificationList: {
            /** Items */
            items: components["schemas"]["NotificationOut"][];
            /** Unread */
            unread: number;
        };
        /** NotificationOut */
        NotificationOut: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /** Kind */
            kind: string;
            /** Link */
            link: string | null;
            /** Read */
            read: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** OccasionForecast */
        OccasionForecast: {
            /** Occasion */
            occasion: string;
            /** Event Date */
            event_date: string;
            /** Days Until */
            days_until: number;
            /** Uplift Pct */
            uplift_pct: number;
            /** Items */
            items: components["schemas"]["ForecastItem"][];
        };
        /** OffboardingStart */
        OffboardingStart: {
            /** Template Id */
            template_id?: string | null;
            /**
             * Reason
             * @enum {string}
             */
            reason: "resigned" | "terminated" | "retired" | "contract_end" | "absconded" | "deceased" | "other";
            /** Notice Date */
            notice_date?: string | null;
            /**
             * Last Working Day
             * Format: date
             */
            last_working_day: string;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** OfflineOrder */
        OfflineOrder: {
            /**
             * Client Uuid
             * Format: uuid
             */
            client_uuid: string;
            /** Offline Ref */
            offline_ref: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Items */
            items: components["schemas"]["SaleLine"][];
            /**
             * Discount Minor
             * @default 0
             */
            discount_minor: number;
            /**
             * Paid Minor
             * @default 0
             */
            paid_minor: number;
            /**
             * Payment Method
             * @default cash
             * @enum {string}
             */
            payment_method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata";
            /** Payments */
            payments?: components["schemas"]["TenderIn"][] | null;
            /** Contact Id */
            contact_id?: string | null;
            /** Client Total Minor */
            client_total_minor: number;
            /** Cashier Token */
            cashier_token?: string | null;
            /** Approver Id */
            approver_id?: string | null;
            /** Approver Pin */
            approver_pin?: string | null;
        };
        /** OnboardingStart */
        OnboardingStart: {
            /** Template Id */
            template_id?: string | null;
            /** Anchor Date */
            anchor_date?: string | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** OneOffIn */
        OneOffIn: {
            /** Employee Id */
            employee_id: string;
            /** Month */
            month: string;
            /**
             * Code
             * @default ONE_OFF
             */
            code: string;
            /** Name */
            name: string;
            /**
             * Kind
             * @default earning
             * @enum {string}
             */
            kind: "earning" | "deduction";
            /** Amount Minor */
            amount_minor: number;
            /**
             * Taxable
             * @default true
             */
            taxable: boolean;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** OneOffOut */
        OneOffOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Month */
            month: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Kind */
            kind: string;
            /** Amount Minor */
            amount_minor: number;
            /** Taxable */
            taxable: boolean;
            /** Note */
            note: string;
            /** Status */
            status: string;
            /** Run Id */
            run_id: string | null;
        };
        /** OrgChartPerson */
        OrgChartPerson: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Job Title */
            job_title: string;
            /** Department */
            department: string;
            /** Manager Id */
            manager_id: string | null;
            /** Reports */
            reports: number;
        };
        /** OvertimeClaimIn */
        OvertimeClaimIn: {
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Minutes */
            minutes?: number | null;
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** OvertimeDecision */
        OvertimeDecision: {
            /**
             * Note
             * @default
             */
            note: string;
            /** Rate Multiplier */
            rate_multiplier?: number | null;
        };
        /** OvertimeOut */
        OvertimeOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Work Date
             * Format: date
             */
            work_date: string;
            /** Minutes */
            minutes: number;
            /** Reason */
            reason: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "approved" | "rejected";
            /** Rate Multiplier */
            rate_multiplier: number;
            /**
             * Day Type
             * @default normal
             * @enum {string}
             */
            day_type: "normal" | "rest_day" | "holiday";
            /** Amount Minor */
            amount_minor: number | null;
            /** Decided At */
            decided_at: string | null;
            /** Decision Note */
            decision_note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** OvertimeRates */
        OvertimeRates: {
            /** Normal */
            normal: number;
            /** Rest Day */
            rest_day: number;
            /** Holiday */
            holiday: number;
        };
        /** OvertimeRatesOut */
        OvertimeRatesOut: {
            /** Normal */
            normal: number;
            /** Rest Day */
            rest_day: number;
            /** Holiday */
            holiday: number;
            /** Verified */
            verified: boolean;
        };
        /** PasswordChange */
        PasswordChange: {
            /** Current Password */
            current_password: string;
            /** New Password */
            new_password: string;
        };
        /** PaymentInstructions */
        PaymentInstructions: {
            /** Payment Request Id */
            payment_request_id: string;
            /** Plan */
            plan: string;
            /** Amount Minor */
            amount_minor: number;
            /** Reference */
            reference: string;
            /** Bank */
            bank: {
                [key: string]: unknown;
            };
        };
        /** PaymentLine */
        PaymentLine: {
            /** Method */
            method: string;
            /** Amount Minor */
            amount_minor: number;
            /** Tendered Minor */
            tendered_minor: number;
            /** Change Minor */
            change_minor: number;
            /**
             * Reference
             * @default
             */
            reference: string;
        };
        /** PaymentOut */
        PaymentOut: {
            /** Id */
            id: string;
            /** Method */
            method: string;
            /** Amount Minor */
            amount_minor: number;
            /**
             * Paid On
             * Format: date
             */
            paid_on: string;
            /** Reference */
            reference: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** PayrollDetailsOut */
        PayrollDetailsOut: {
            /** Employee Id */
            employee_id: string;
            /** Bank Name */
            bank_name: string;
            /** Iban */
            iban: string;
            /** Iban Valid */
            iban_valid: boolean;
            /** Ntn */
            ntn: string;
            /** Eobi Number */
            eobi_number: string;
            /** Ss Number */
            ss_number: string;
            /** Payment Mode */
            payment_mode: string;
            /** Eobi Applicable */
            eobi_applicable: boolean | null;
            /** Ss Applicable */
            ss_applicable: boolean | null;
            /** Statutory Note */
            statutory_note: string;
            /** Masked */
            masked: boolean;
            /** Current Base Minor */
            current_base_minor: number | null;
            /** Work Province */
            work_province?: string | null;
            /**
             * Work Province Source
             * @default
             */
            work_province_source: string;
        };
        /** PayrollDetailsUpdate */
        PayrollDetailsUpdate: {
            /** Bank Name */
            bank_name?: string | null;
            /** Iban */
            iban?: string | null;
            /** Ntn */
            ntn?: string | null;
            /** Eobi Number */
            eobi_number?: string | null;
            /** Ss Number */
            ss_number?: string | null;
            /** Payment Mode */
            payment_mode?: ("bank" | "cash" | "cheque") | null;
            /** Eobi Applicable */
            eobi_applicable?: boolean | null;
            /** Ss Applicable */
            ss_applicable?: boolean | null;
            /** Statutory Note */
            statutory_note?: string | null;
            /**
             * Eobi Auto
             * @default false
             */
            eobi_auto: boolean;
            /**
             * Ss Auto
             * @default false
             */
            ss_auto: boolean;
        };
        /** PayslipDetail */
        PayslipDetail: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /** Gross Minor */
            gross_minor: number;
            /** Deductions Minor */
            deductions_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Employer Cost Minor */
            employer_cost_minor: number;
            /** Tax Verified */
            tax_verified: boolean;
            /** Statutory Verified */
            statutory_verified: boolean;
            /** Warnings */
            warnings?: string[];
            /**
             * Error
             * @default
             */
            error: string;
            /** Run Id */
            run_id: string;
            /** Run Number */
            run_number: string;
            /** Run Kind */
            run_kind: string;
            /** Run Status */
            run_status: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /**
             * Pay Date
             * Format: date
             */
            pay_date: string;
            /** Tax Year */
            tax_year: string;
            /** Snapshot */
            snapshot: {
                [key: string]: unknown;
            };
            /** Period Days */
            period_days: number;
            /** Employed Days */
            employed_days: number;
            /** Working Days */
            working_days: number;
            /** Present Days */
            present_days: number;
            /** Paid Leave Days */
            paid_leave_days: number;
            /** Unpaid Leave Days */
            unpaid_leave_days: number;
            /** Wfh Days */
            wfh_days: number;
            /** Absent Days */
            absent_days: number;
            /** Half Days */
            half_days: number;
            /** Taxable Minor */
            taxable_minor: number;
            /** Taxable Ytd Minor */
            taxable_ytd_minor: number;
            /** Tax Ytd Minor */
            tax_ytd_minor: number;
            /** Projected Annual Taxable Minor */
            projected_annual_taxable_minor: number;
            /** Annual Tax Minor */
            annual_tax_minor: number;
            /** Notes */
            notes?: string[];
            /** Lines */
            lines?: components["schemas"]["LineOut"][];
        };
        /** PayslipLink */
        PayslipLink: {
            /** Url */
            url: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
        };
        /** PayslipSendIn */
        PayslipSendIn: {
            /** Employee Ids */
            employee_ids?: string[] | null;
            /**
             * Again
             * @default false
             */
            again: boolean;
        };
        /** PayslipSendOut */
        PayslipSendOut: {
            /**
             * Queued
             * @default 0
             */
            queued: number;
            /**
             * No Email
             * @default 0
             */
            no_email: number;
            /**
             * Already Sent
             * @default 0
             */
            already_sent: number;
        };
        /** PayslipSummary */
        PayslipSummary: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /** Gross Minor */
            gross_minor: number;
            /** Deductions Minor */
            deductions_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Employer Cost Minor */
            employer_cost_minor: number;
            /** Tax Verified */
            tax_verified: boolean;
            /** Statutory Verified */
            statutory_verified: boolean;
            /** Warnings */
            warnings?: string[];
            /**
             * Error
             * @default
             */
            error: string;
        };
        /** PersonOut */
        PersonOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** PinIn */
        PinIn: {
            /** Pin */
            pin: string;
        };
        /** PipelineCreate */
        PipelineCreate: {
            /** Name */
            name: string;
        };
        /** PipelineOut */
        PipelineOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Is Default */
            is_default: boolean;
            /** Stages */
            stages: components["schemas"]["StageOut"][];
        };
        /** PipelineUpdate */
        PipelineUpdate: {
            /** Name */
            name?: string | null;
            /** Is Default */
            is_default?: boolean | null;
        };
        /** PlanOut */
        PlanOut: {
            /** Key */
            key: string;
            /** Name */
            name: string;
            /** Price Minor */
            price_minor: number;
            /** Max Sections */
            max_sections: number;
            /** Max Seats */
            max_seats: number;
            /** Ai Monthly */
            ai_monthly: number;
        };
        /** PoCreate */
        PoCreate: {
            /** Supplier Id */
            supplier_id?: string | null;
            /** Items */
            items: components["schemas"]["PoLineCreate"][];
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** PoLineCreate */
        PoLineCreate: {
            /** Product Id */
            product_id: string;
            /** Qty */
            qty: number;
            /**
             * Cost Minor
             * @default 0
             */
            cost_minor: number;
        };
        /** PoLineOut */
        PoLineOut: {
            /** Id */
            id: string;
            /** Product Id */
            product_id: string | null;
            /** Name */
            name: string;
            /** Qty */
            qty: number;
            /** Cost Minor */
            cost_minor: number;
            /** Received Qty */
            received_qty: number;
        };
        /** PoOut */
        PoOut: {
            /** Id */
            id: string;
            /** Supplier Id */
            supplier_id: string | null;
            /** Supplier Name */
            supplier_name: string | null;
            /** Status */
            status: string;
            /** Notes */
            notes: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Received At */
            received_at: string | null;
            /** Total Cost Minor */
            total_cost_minor: number;
            /** Items */
            items?: components["schemas"]["PoLineOut"][];
        };
        /** PoReceive */
        PoReceive: {
            /** Items */
            items: components["schemas"]["PoReceiveLine"][];
        };
        /** PoReceiveLine */
        PoReceiveLine: {
            /** Po Item Id */
            po_item_id: string;
            /** Qty */
            qty: number;
        };
        /** PoliciesIn */
        PoliciesIn: {
            /**
             * Encash Basis
             * @enum {string}
             */
            encash_basis: "days_30" | "days_26" | "working_days";
            /**
             * Gratuity Tax
             * @enum {string}
             */
            gratuity_tax: "taxed" | "exempt" | "exempt_up_to";
            /** Gratuity Exempt Minor */
            gratuity_exempt_minor?: number | null;
            /** Paid On Leaving Ids */
            paid_on_leaving_ids?: string[] | null;
        };
        /** PoliciesOut */
        PoliciesOut: {
            /**
             * Encash Basis
             * @enum {string}
             */
            encash_basis: "days_30" | "days_26" | "working_days";
            /**
             * Gratuity Tax
             * @enum {string}
             */
            gratuity_tax: "taxed" | "exempt" | "exempt_up_to";
            /** Gratuity Exempt Minor */
            gratuity_exempt_minor: number | null;
            /** Preset */
            preset: ("standing_orders" | "provident_fund" | "small_business") | null;
            /** Leave Types */
            leave_types: components["schemas"]["PolicyLeaveType"][];
        };
        /** PolicyLeaveType */
        PolicyLeaveType: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Paid On Leaving */
            paid_on_leaving: boolean;
        };
        /** PoolMemberIn */
        PoolMemberIn: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /**
             * Active
             * @default true
             */
            active: boolean;
            /** Daily Cap */
            daily_cap?: number | null;
        };
        /** PoolMemberOut */
        PoolMemberOut: {
            /** User Id */
            user_id: string;
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Daily Cap */
            daily_cap: number | null;
            /** Assigned Today */
            assigned_today: number;
        };
        /** PoolPut */
        PoolPut: {
            /** Members */
            members: components["schemas"]["PoolMemberIn"][];
        };
        /** PosSummary */
        PosSummary: {
            /** Products Count */
            products_count: number;
            /** Low Stock Count */
            low_stock_count: number;
            /** Sales Today Count */
            sales_today_count: number;
            /** Sales Today Total Minor */
            sales_today_total_minor: number;
        };
        /** PresetIn */
        PresetIn: {
            /**
             * Preset
             * @enum {string}
             */
            preset: "standing_orders" | "provident_fund" | "small_business";
        };
        /** PresetOut */
        PresetOut: {
            /**
             * Key
             * @enum {string}
             */
            key: "standing_orders" | "provident_fund" | "small_business";
            /** Name */
            name: string;
            /** Summary */
            summary: string;
        };
        /** PreviewOut */
        PreviewOut: {
            /** Month */
            month: string;
            /** Working Days */
            working_days: number;
            /** Payslips */
            payslips: components["schemas"]["PreviewPayslip"][];
            /**
             * Tax Year
             * @default
             */
            tax_year: string;
            /**
             * Tax Rates Verified
             * @default true
             */
            tax_rates_verified: boolean;
            /**
             * Rates Verified
             * @default true
             */
            rates_verified: boolean;
            /** Unverified */
            unverified?: string[];
        };
        /**
         * PreviewPayslip
         * @description The legacy preview payslip plus the full calculation.
         */
        PreviewPayslip: {
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /** Gross Minor */
            gross_minor: number;
            /** Present Days */
            present_days: number;
            /** Paid Leave Days */
            paid_leave_days: number;
            /** Unpaid Leave Days */
            unpaid_leave_days: number;
            /** Wfh Days */
            wfh_days: number;
            /** Absent Days */
            absent_days: number;
            /**
             * Half Days
             * @default 0
             */
            half_days: number;
            /** Absence Deduction Minor */
            absence_deduction_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Net Minor */
            net_minor: number;
            /**
             * Tax Year
             * @default
             */
            tax_year: string;
            /**
             * Tax Rates Verified
             * @default true
             */
            tax_rates_verified: boolean;
            /**
             * Period Days
             * @default 0
             */
            period_days: number;
            /**
             * Employed Days
             * @default 0
             */
            employed_days: number;
            /**
             * Deductions Minor
             * @default 0
             */
            deductions_minor: number;
            /**
             * Employer Cost Minor
             * @default 0
             */
            employer_cost_minor: number;
            /**
             * Statutory Verified
             * @default true
             */
            statutory_verified: boolean;
            /** Warnings */
            warnings?: string[];
            /** Notes */
            notes?: string[];
            /** Error */
            error?: string | null;
            /** Lines */
            lines?: components["schemas"]["LineOut"][];
        };
        /** PrintOut */
        PrintOut: {
            /** Sale Id */
            sale_id: string;
            /** Receipt No */
            receipt_no: string | null;
            /** Copy */
            copy: number;
            /** Duplicate */
            duplicate: boolean;
        };
        /** ProbationDue */
        ProbationDue: {
            /** Employee Id */
            employee_id: string;
            /** Name */
            name: string;
            /** Designation */
            designation: string;
            /** Manager Name */
            manager_name: string | null;
            /** Join Date */
            join_date: string | null;
            /**
             * Probation End
             * Format: date
             */
            probation_end: string;
            /** Days Left */
            days_left: number;
        };
        /** ProbationReviewIn */
        ProbationReviewIn: {
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "confirmed" | "extended" | "ended";
            /** New End */
            new_end?: string | null;
            /** On */
            on?: string | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** ProbationReviewOut */
        ProbationReviewOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "confirmed" | "extended" | "ended";
            /** Previous End */
            previous_end: string | null;
            /** New End */
            new_end: string | null;
            /** Note */
            note: string;
            /**
             * Decided At
             * Format: date-time
             */
            decided_at: string;
        };
        /** ProductCreate */
        ProductCreate: {
            /** Name */
            name: string;
            /**
             * Sku
             * @default
             */
            sku: string;
            /**
             * Barcode
             * @default
             */
            barcode: string;
            /**
             * Category
             * @default
             */
            category: string;
            /**
             * Unit
             * @default pcs
             */
            unit: string;
            /**
             * Price Minor
             * @default 0
             */
            price_minor: number;
            /**
             * Cost Minor
             * @default 0
             */
            cost_minor: number;
            /**
             * Stock Qty
             * @default 0
             */
            stock_qty: number;
            /**
             * Low Stock At
             * @default 0
             */
            low_stock_at: number;
            /**
             * Hs Code
             * @default
             */
            hs_code: string;
            /**
             * Tax Rate
             * @default 0
             */
            tax_rate: number;
            /**
             * Fbr Uom
             * @default Numbers, pieces, units
             */
            fbr_uom: string;
            /** Category Id */
            category_id?: string | null;
            /**
             * Track Stock
             * @default true
             */
            track_stock: boolean;
            /** Group Id */
            group_id?: string | null;
            /** Attributes */
            attributes?: {
                [key: string]: string;
            };
        };
        /** ProductOut */
        ProductOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Sku */
            sku: string;
            /** Barcode */
            barcode: string;
            /** Category */
            category: string;
            /** Unit */
            unit: string;
            /** Price Minor */
            price_minor: number;
            /** Cost Minor */
            cost_minor: number | null;
            /** Stock Qty */
            stock_qty: number;
            /** Low Stock At */
            low_stock_at: number;
            /** Active */
            active: boolean;
            /**
             * Hs Code
             * @default
             */
            hs_code: string;
            /**
             * Tax Rate
             * @default 0
             */
            tax_rate: number;
            /**
             * Fbr Uom
             * @default Numbers, pieces, units
             */
            fbr_uom: string;
            /** Category Id */
            category_id?: string | null;
            /**
             * Track Stock
             * @default true
             */
            track_stock: boolean;
            /** Group Id */
            group_id?: string | null;
            /** Attributes */
            attributes?: {
                [key: string]: string;
            };
            /** Scan Qty */
            scan_qty?: number | null;
            /** Color */
            color?: string | null;
            /**
             * Pinned
             * @default false
             */
            pinned: boolean;
        };
        /** ProductUpdate */
        ProductUpdate: {
            /** Name */
            name?: string | null;
            /** Sku */
            sku?: string | null;
            /** Barcode */
            barcode?: string | null;
            /** Category */
            category?: string | null;
            /** Unit */
            unit?: string | null;
            /** Price Minor */
            price_minor?: number | null;
            /** Cost Minor */
            cost_minor?: number | null;
            /** Stock Qty */
            stock_qty?: number | null;
            /** Low Stock At */
            low_stock_at?: number | null;
            /** Active */
            active?: boolean | null;
            /** Hs Code */
            hs_code?: string | null;
            /** Tax Rate */
            tax_rate?: number | null;
            /** Fbr Uom */
            fbr_uom?: string | null;
            /** Category Id */
            category_id?: string | null;
            /** Track Stock */
            track_stock?: boolean | null;
            /** Group Id */
            group_id?: string | null;
            /** Attributes */
            attributes?: {
                [key: string]: string;
            } | null;
            /** Color */
            color?: ("red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "purple" | "pink" | "slate") | "" | null;
            /** Pinned */
            pinned?: boolean | null;
        };
        /** ProfileOut */
        ProfileOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Email */
            email: string;
            /** Locale */
            locale: string;
        };
        /** ProfileUpdate */
        ProfileUpdate: {
            /** Name */
            name?: string | null;
            /** Locale */
            locale?: string | null;
        };
        /** PunchOut */
        PunchOut: {
            /** Kind */
            kind: string;
            attendance: components["schemas"]["AttendanceOut"];
            /** Geo Status */
            geo_status: string;
            /** Ip Status */
            ip_status: string;
        };
        /**
         * PunchRequest
         * @description What the browser's Geolocation API reported; all optional — a punch
         *     without a fix is recorded as `no_fix` (TR-NFR-32).
         */
        PunchRequest: {
            /** Lat */
            lat?: number | null;
            /** Lng */
            lng?: number | null;
            /** Accuracy M */
            accuracy_m?: number | null;
            /**
             * Mock Gps
             * @default false
             */
            mock_gps: boolean;
        };
        /** PurgeOut */
        PurgeOut: {
            /** Module */
            module: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pending" | "cancelled" | "done" | "failed";
            /**
             * Run After
             * Format: date-time
             */
            run_after: string;
        };
        /** PurgeRequest */
        PurgeRequest: {
            /** Confirm */
            confirm: string;
        };
        /**
         * QualifyRequest
         * @description Link the lead to an existing contact, or create one from the lead.
         */
        QualifyRequest: {
            /**
             * Mode
             * @enum {string}
             */
            mode: "link" | "create";
            /** Contact Id */
            contact_id?: string | null;
            /** Company Id */
            company_id?: string | null;
            /**
             * Create Company
             * @default false
             */
            create_company: boolean;
            /**
             * Force
             * @default false
             */
            force: boolean;
        };
        /** QuoteAccept */
        QuoteAccept: {
            /** Name */
            name: string;
            /** Content Hash */
            content_hash: string;
        };
        /** QuoteCreate */
        QuoteCreate: {
            /** Valid Until */
            valid_until?: string | null;
            /**
             * Terms
             * @default
             */
            terms: string;
        };
        /** QuoteDecline */
        QuoteDecline: {
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** QuoteInvoiced */
        QuoteInvoiced: {
            /** Invoice Id */
            invoice_id: string;
        };
        /** QuoteLineOut */
        QuoteLineOut: {
            /** Description */
            description: string;
            /** Unit */
            unit: string;
            /** Qty */
            qty: number;
            /** Unit Price Minor */
            unit_price_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Tax Rate Pct */
            tax_rate_pct: number;
            /** Net Excl Minor */
            net_excl_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
        };
        /**
         * QuoteOut
         * @description What staff see. `link` is the page path while the quote is open.
         */
        QuoteOut: {
            /** Number */
            number: string;
            /**
             * Valid Until
             * Format: date
             */
            valid_until: string;
            /** Terms */
            terms: string;
            /** Customer Name */
            customer_name: string;
            /** Tax Inclusive */
            tax_inclusive: boolean;
            /** Lines */
            lines: components["schemas"]["QuoteLineOut"][];
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Content Hash */
            content_hash: string;
            /** Accepted Name */
            accepted_name?: string | null;
            /** Accepted At */
            accepted_at?: string | null;
            /** Id */
            id: string;
            /** Lead Id */
            lead_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "sent" | "accepted" | "declined" | "superseded" | "cancelled";
            /** Expired */
            expired: boolean;
            /** Link */
            link: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** First Viewed At */
            first_viewed_at: string | null;
            /** View Count */
            view_count: number;
            /** Accepted Ip */
            accepted_ip: string | null;
            /** Declined At */
            declined_at: string | null;
            /** Decline Reason */
            decline_reason: string | null;
            /** Invoice Id */
            invoice_id: string | null;
        };
        /**
         * QuotePublic
         * @description What the customer sees: the document and the business's own details,
         *     nothing else (no ids, no notes, no list prices).
         */
        QuotePublic: {
            /** Number */
            number: string;
            /**
             * Valid Until
             * Format: date
             */
            valid_until: string;
            /** Terms */
            terms: string;
            /** Customer Name */
            customer_name: string;
            /** Tax Inclusive */
            tax_inclusive: boolean;
            /** Lines */
            lines: components["schemas"]["QuoteLineOut"][];
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Line Discount Minor */
            line_discount_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Content Hash */
            content_hash: string;
            /** Accepted Name */
            accepted_name?: string | null;
            /** Accepted At */
            accepted_at?: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "open" | "accepted" | "declined" | "expired";
            /** Business */
            business: {
                [key: string]: string;
            };
        };
        /** RatingIn */
        RatingIn: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Rating */
            rating?: number | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** Reason */
        Reason: {
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** RecipientOut */
        RecipientOut: {
            /** Contact Id */
            contact_id: string;
            /** Name */
            name: string;
            /** Address */
            address: string;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "skipped";
            /** Skip Reason */
            skip_reason: ("no_address" | "no_consent" | "opted_out" | "daily_cap") | null;
        };
        /**
         * RecomputeCreate
         * @description The one-time "recompute this tax year" run (St03 risk 2).
         */
        RecomputeCreate: {
            /** Tax Year */
            tax_year: string;
            /** Through Month */
            through_month: string;
            /** Pay Date */
            pay_date?: string | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /**
         * RefundableLine
         * @description A returnable line plus the two figures a refund is computed from
         *     (pricing.refund_for), so the Returns screen previews what will actually be
         *     paid out rather than list price x qty (audit I8).
         */
        RefundableLine: {
            /** Sale Item Id */
            sale_item_id: string;
            /** Product Id */
            product_id: string | null;
            /** Name */
            name: string;
            /** Qty Sold */
            qty_sold: number;
            /** Qty Returned */
            qty_returned: number;
            /** Qty Returnable */
            qty_returnable: number;
            /** Price Minor */
            price_minor: number;
            /** Paid Minor */
            paid_minor: number;
            /** Refunded Minor */
            refunded_minor: number;
        };
        /** RegionOut */
        RegionOut: {
            /**
             * Code
             * @enum {string}
             */
            code: "PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK";
            /** Name */
            name: string;
            /** Name Ur */
            name_ur: string;
            /** Fbr Name */
            fbr_name: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "province" | "territory";
            /** Pst Authority */
            pst_authority: string;
        };
        /** RegisterIn */
        RegisterIn: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Payment Methods */
            payment_methods?: ("cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata")[];
            /** Cash Rounding Minor */
            cash_rounding_minor?: number | null;
            /**
             * Max Variance Minor
             * @default 50000
             */
            max_variance_minor: number;
        };
        /** RegisterOut */
        RegisterOut: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Payment Methods */
            payment_methods: string[];
            /** Cash Rounding Minor */
            cash_rounding_minor: number | null;
            /** Max Variance Minor */
            max_variance_minor: number;
            /** Config Version */
            config_version: number;
            /** Is Default */
            is_default: boolean;
            /** Active */
            active: boolean;
            /** Open Session Id */
            open_session_id: string | null;
        };
        /** RegisterUpdate */
        RegisterUpdate: {
            /** Name */
            name?: string | null;
            /** Payment Methods */
            payment_methods?: ("cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata")[] | null;
            /** Cash Rounding Minor */
            cash_rounding_minor?: number | null;
            /** Max Variance Minor */
            max_variance_minor?: number | null;
            /** Active */
            active?: boolean | null;
        };
        /** RegistrationIn */
        RegistrationIn: {
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /**
             * Registration No
             * @default
             */
            registration_no: string;
            /** Effective From */
            effective_from?: string | null;
        };
        /** RequestRow */
        RequestRow: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "leave" | "wfh" | "correction" | "overtime";
            /** Title */
            title: string;
            /** Status */
            status: string;
            /** Reason */
            reason: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Link */
            link: string;
        };
        /** ResetRequest */
        ResetRequest: {
            /** Token */
            token: string;
            /** Password */
            password: string;
        };
        /** ResolveIn */
        ResolveIn: {
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** RestockItem */
        RestockItem: {
            /** Product Id */
            product_id: string;
            /** Name */
            name: string;
            /** Unit */
            unit: string;
            /** Stock Qty */
            stock_qty: number;
            /** Daily Velocity */
            daily_velocity: number;
            /** Days Left */
            days_left: number | null;
            /** Recommend Qty */
            recommend_qty: number;
            /** Reason */
            reason: string;
        };
        /** ReturnCreate */
        ReturnCreate: {
            /** Items */
            items: components["schemas"]["ReturnLine"][];
            /**
             * Reason
             * @default
             */
            reason: string;
            /**
             * Restock
             * @default true
             */
            restock: boolean;
            /** Register Id */
            register_id?: string | null;
        };
        /** ReturnItemOut */
        ReturnItemOut: {
            /** Name */
            name: string;
            /** Qty */
            qty: number;
            /** Line Refund Minor */
            line_refund_minor: number;
        };
        /** ReturnLine */
        ReturnLine: {
            /** Sale Item Id */
            sale_item_id: string;
            /** Qty */
            qty: number;
        };
        /** ReturnOut */
        ReturnOut: {
            /** Id */
            id: string;
            /** Sale Id */
            sale_id: string;
            /** Reason */
            reason: string;
            /** Refund Minor */
            refund_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Items */
            items?: components["schemas"]["ReturnItemOut"][];
            /** Fbr Invoice Number */
            fbr_invoice_number?: string | null;
            /** Fbr Status */
            fbr_status?: string | null;
        };
        /** ReviewItem */
        ReviewItem: {
            /** Id */
            id: string;
            /** Lead Id */
            lead_id: string;
            /** Lead Name */
            lead_name: string;
            /** Lead Phone */
            lead_phone: string;
            /** Lead Email */
            lead_email: string;
            /** Reason */
            reason: string;
            /** Match Key */
            match_key: string;
            /** Candidates */
            candidates: components["schemas"]["ContactBrief"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** RoleCopy */
        RoleCopy: {
            /** Name */
            name: string;
        };
        /** RoleCreate */
        RoleCreate: {
            /** Name */
            name: string;
            /** Permissions */
            permissions?: {
                [key: string]: string[];
            };
        };
        /** RoleDetail */
        RoleDetail: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Is System */
            is_system: boolean;
            /** Template Key */
            template_key: string | null;
            /** User Count */
            user_count: number;
            /** Grants */
            grants: components["schemas"]["GrantIn"][];
            /** Inherits */
            inherits: string[];
        };
        /** RoleIdsPut */
        RoleIdsPut: {
            /** Role Ids */
            role_ids: string[];
        };
        /** RoleOut */
        RoleOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Is System */
            is_system: boolean;
        };
        /** RoleRef */
        RoleRef: {
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** RoleSummary */
        RoleSummary: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Is System */
            is_system: boolean;
            /** Template Key */
            template_key: string | null;
            /** User Count */
            user_count: number;
        };
        /** RoleV2Create */
        RoleV2Create: {
            /** Name */
            name: string;
            /**
             * Description
             * @default
             */
            description: string;
            /** Grants */
            grants?: components["schemas"]["GrantIn"][];
        };
        /** RoleV2Update */
        RoleV2Update: {
            /** Name */
            name?: string | null;
            /** Description */
            description?: string | null;
        };
        /** RuleIn */
        RuleIn: {
            /** Prefix */
            prefix: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "weight" | "price";
            /**
             * Value Decimals
             * @default 3
             */
            value_decimals: number;
            /**
             * Active
             * @default true
             */
            active: boolean;
        };
        /** RuleOut */
        RuleOut: {
            /** Prefix */
            prefix: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "weight" | "price";
            /**
             * Value Decimals
             * @default 3
             */
            value_decimals: number;
            /**
             * Active
             * @default true
             */
            active: boolean;
            /** Id */
            id: string;
        };
        /** RunAction */
        RunAction: {
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** RunCreate */
        RunCreate: {
            /** Month */
            month: string;
            /** Pay Date */
            pay_date?: string | null;
            /**
             * Kind
             * @default regular
             * @enum {string}
             */
            kind: "regular" | "adjustment";
            /** Employee Ids */
            employee_ids?: string[] | null;
            /**
             * Note
             * @default
             */
            note: string;
        };
        /** RunDetail */
        RunDetail: {
            /** Id */
            id: string;
            /** Number */
            number: string;
            /** Kind */
            kind: string;
            /** Purpose */
            purpose: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /**
             * Pay Date
             * Format: date
             */
            pay_date: string;
            /** Tax Year */
            tax_year: string;
            /** Status */
            status: string;
            /** Progress Done */
            progress_done: number;
            /** Progress Total */
            progress_total: number;
            /** Totals */
            totals: {
                [key: string]: unknown;
            };
            /** Error */
            error: string;
            /** Note */
            note: string;
            /** Cancel Reason */
            cancel_reason: string;
            /** Adjusts Run Id */
            adjusts_run_id: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Calculated At */
            calculated_at: string | null;
            /** Approved At */
            approved_at: string | null;
            /** Paid At */
            paid_at: string | null;
            /** Locked At */
            locked_at: string | null;
            /** Payslips */
            payslips: components["schemas"]["PayslipSummary"][];
            /** Events */
            events: components["schemas"]["RunEventOut"][];
            /** Rates Verified */
            rates_verified: boolean;
            /** Unverified */
            unverified: string[];
        };
        /** RunEventOut */
        RunEventOut: {
            /** From Status */
            from_status: string | null;
            /** To Status */
            to_status: string;
            /** Actor Name */
            actor_name: string | null;
            /** Note */
            note: string;
            /**
             * At
             * Format: date-time
             */
            at: string;
        };
        /** RunOut */
        RunOut: {
            /** Id */
            id: string;
            /** Number */
            number: string;
            /** Kind */
            kind: string;
            /** Purpose */
            purpose: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /**
             * Pay Date
             * Format: date
             */
            pay_date: string;
            /** Tax Year */
            tax_year: string;
            /** Status */
            status: string;
            /** Progress Done */
            progress_done: number;
            /** Progress Total */
            progress_total: number;
            /** Totals */
            totals: {
                [key: string]: unknown;
            };
            /** Error */
            error: string;
            /** Note */
            note: string;
            /** Cancel Reason */
            cancel_reason: string;
            /** Adjusts Run Id */
            adjusts_run_id: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Calculated At */
            calculated_at: string | null;
            /** Approved At */
            approved_at: string | null;
            /** Paid At */
            paid_at: string | null;
            /** Locked At */
            locked_at: string | null;
        };
        /** SaleCreate */
        SaleCreate: {
            /** Client Uuid */
            client_uuid?: string | null;
            /** Items */
            items: components["schemas"]["SaleLine"][];
            /**
             * Discount Minor
             * @default 0
             */
            discount_minor: number;
            /**
             * Paid Minor
             * @default 0
             */
            paid_minor: number;
            /**
             * Payment Method
             * @default cash
             * @enum {string}
             */
            payment_method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata";
            /** Payments */
            payments?: components["schemas"]["TenderIn"][] | null;
            /** Register Id */
            register_id?: string | null;
            /** Device Id */
            device_id?: string | null;
            /** Approver Id */
            approver_id?: string | null;
            /** Approver Pin */
            approver_pin?: string | null;
            /** Contact Id */
            contact_id?: string | null;
        };
        /** SaleItemOut */
        SaleItemOut: {
            /** Name */
            name: string;
            /** Qty */
            qty: number;
            /** Price Minor */
            price_minor: number;
            /** Line Total Minor */
            line_total_minor: number;
        };
        /** SaleLine */
        SaleLine: {
            /** Product Id */
            product_id: string;
            /** Qty */
            qty: number;
            /** Discount Minor */
            discount_minor?: number | null;
            /** Discount Pct */
            discount_pct?: number | null;
            /** Price Minor */
            price_minor?: number | null;
        };
        /** SaleLookup */
        SaleLookup: {
            /** Id */
            id: string;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Discount Minor */
            discount_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Paid Minor */
            paid_minor: number;
            /** Change Minor */
            change_minor: number;
            /** Payment Method */
            payment_method: string;
            /** Item Count */
            item_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Items */
            items?: components["schemas"]["SaleItemOut"][];
            /**
             * Tax Minor
             * @default 0
             */
            tax_minor: number;
            /**
             * Rounding Minor
             * @default 0
             */
            rounding_minor: number;
            /**
             * Amount Due Minor
             * @default 0
             */
            amount_due_minor: number;
            /** Fbr Invoice Number */
            fbr_invoice_number?: string | null;
            /** Fbr Status */
            fbr_status?: string | null;
            /** Contact Id */
            contact_id?: string | null;
            /** Session Id */
            session_id?: string | null;
            /** Payments */
            payments?: components["schemas"]["PaymentLine"][];
            /** Receipt No */
            receipt_no?: string | null;
            /**
             * Status
             * @default completed
             */
            status: string;
            /**
             * Void Reason
             * @default
             */
            void_reason: string;
            /** Returnable */
            returnable?: components["schemas"]["RefundableLine"][];
            /**
             * Refundable Minor
             * @default 0
             */
            refundable_minor: number;
        };
        /** SaleOut */
        SaleOut: {
            /** Id */
            id: string;
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Discount Minor */
            discount_minor: number;
            /** Total Minor */
            total_minor: number;
            /** Paid Minor */
            paid_minor: number;
            /** Change Minor */
            change_minor: number;
            /** Payment Method */
            payment_method: string;
            /** Item Count */
            item_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Items */
            items?: components["schemas"]["SaleItemOut"][];
            /**
             * Tax Minor
             * @default 0
             */
            tax_minor: number;
            /**
             * Rounding Minor
             * @default 0
             */
            rounding_minor: number;
            /**
             * Amount Due Minor
             * @default 0
             */
            amount_due_minor: number;
            /** Fbr Invoice Number */
            fbr_invoice_number?: string | null;
            /** Fbr Status */
            fbr_status?: string | null;
            /** Contact Id */
            contact_id?: string | null;
            /** Session Id */
            session_id?: string | null;
            /** Payments */
            payments?: components["schemas"]["PaymentLine"][];
            /** Receipt No */
            receipt_no?: string | null;
            /**
             * Status
             * @default completed
             */
            status: string;
            /**
             * Void Reason
             * @default
             */
            void_reason: string;
        };
        /** SaleQuote */
        SaleQuote: {
            /** Subtotal Minor */
            subtotal_minor: number;
            /** Discount Minor */
            discount_minor: number;
            /** Tax Minor */
            tax_minor: number;
            /** Total Minor */
            total_minor: number;
            /**
             * Rounding Minor
             * @default 0
             */
            rounding_minor: number;
            /**
             * Amount Due Minor
             * @default 0
             */
            amount_due_minor: number;
        };
        /** SaleQuoteRequest */
        SaleQuoteRequest: {
            /** Items */
            items: components["schemas"]["SaleLine"][];
            /**
             * Discount Minor
             * @default 0
             */
            discount_minor: number;
            /**
             * Payment Method
             * @default cash
             * @enum {string}
             */
            payment_method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata";
            /** Register Id */
            register_id?: string | null;
        };
        /** SaleRow */
        SaleRow: {
            /** Id */
            id: string;
            /** Receipt No */
            receipt_no: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Total Minor */
            total_minor: number;
            /** Payment Method */
            payment_method: string;
            /** Item Count */
            item_count: number;
            /** Status */
            status: string;
            /** Cashier */
            cashier: string | null;
            /** Customer */
            customer: string | null;
            /** Register Code */
            register_code: string | null;
        };
        /** SalesForecastOut */
        SalesForecastOut: {
            /** Months */
            months: components["schemas"]["ForecastBucket"][];
            overdue: components["schemas"]["ForecastBucket"];
            no_date: components["schemas"]["ForecastBucket"];
        };
        /**
         * SegmentFilter
         * @description The only things a segment can filter on (compiled to parameterised SQL).
         */
        SegmentFilter: {
            /** Tag Ids */
            tag_ids?: string[];
            /** Kind */
            kind?: ("person" | "company") | null;
            /** Roles */
            roles?: ("customer" | "supplier" | "patient" | "student" | "parent" | "partner")[];
            /** City */
            city?: string | null;
            /** Has Email */
            has_email?: boolean | null;
        };
        /** SegmentIn */
        SegmentIn: {
            /** Name */
            name: string;
            filter?: components["schemas"]["SegmentFilter"];
        };
        /** SegmentOut */
        SegmentOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            filter: components["schemas"]["SegmentFilter"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** SegmentPreview */
        SegmentPreview: {
            /** Total */
            total: number;
            /** Reachable */
            reachable: number;
            /** Skipped */
            skipped: {
                [key: string]: number;
            };
            /** Sample */
            sample: components["schemas"]["PersonOut"][];
        };
        /** SequenceOut */
        SequenceOut: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Branch Id */
            branch_id: string | null;
            /** Register Id */
            register_id: string | null;
            /** Pattern */
            pattern: string;
            /** Padding */
            padding: number;
            /**
             * Reset
             * @enum {string}
             */
            reset: "never" | "fiscal_year" | "calendar_year" | "month";
            /** Gapless */
            gapless: boolean;
            /** Period Key */
            period_key: string;
            /** Next Value */
            next_value: number;
            /** Preview */
            preview: string;
        };
        /** SequenceUpdate */
        SequenceUpdate: {
            /** Next Value */
            next_value: number;
            /** Period Key */
            period_key?: string | null;
        };
        /** SessionClose */
        SessionClose: {
            /** Counted */
            counted?: {
                [key: string]: number;
            };
            /**
             * Notes
             * @default
             */
            notes: string;
            /** Device Id */
            device_id?: string | null;
            /** Approver Id */
            approver_id?: string | null;
            /** Approver Pin */
            approver_pin?: string | null;
        };
        /** SessionOpen */
        SessionOpen: {
            /** Register Id */
            register_id?: string | null;
            /**
             * Opening Float Minor
             * @default 0
             */
            opening_float_minor: number;
        };
        /** SessionOut */
        SessionOut: {
            /** Id */
            id: string;
            /** Register Id */
            register_id: string;
            /** Register Code */
            register_code: string;
            /** Register Name */
            register_name: string;
            /** Status */
            status: string;
            /**
             * Opened At
             * Format: date-time
             */
            opened_at: string;
            /** Opened By */
            opened_by: string | null;
            /** Closed At */
            closed_at: string | null;
            /** Closed By */
            closed_by: string | null;
            /** Opening Float Minor */
            opening_float_minor: number;
            /** Methods */
            methods: components["schemas"]["MethodFigures"][];
            /** Pay In Minor */
            pay_in_minor: number;
            /** Pay Out Minor */
            pay_out_minor: number;
            /** Drop Minor */
            drop_minor: number;
            /** Variance Approved By */
            variance_approved_by: string | null;
            /** Notes */
            notes: string;
            /** Warnings */
            warnings: string[];
        };
        /** SettlementLineIn */
        SettlementLineIn: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "payable" | "receivable";
            /**
             * Code
             * @enum {string}
             */
            code: "GRATUITY" | "LEAVE_ENCASH" | "NOTICE_PAY" | "BONUS" | "OTHER" | "ADVANCE_SETTLE" | "ASSET_RECOVERY" | "NOTICE_SHORTFALL" | "OTHER_RECOVERY";
            /** Name */
            name: string;
            /** Amount Minor */
            amount_minor: number;
            /** Taxable */
            taxable?: boolean | null;
        };
        /** SettlementLineOut */
        SettlementLineOut: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "payable" | "receivable";
            /**
             * Code
             * @enum {string}
             */
            code: "GRATUITY" | "LEAVE_ENCASH" | "NOTICE_PAY" | "BONUS" | "OTHER" | "ADVANCE_SETTLE" | "ASSET_RECOVERY" | "NOTICE_SHORTFALL" | "OTHER_RECOVERY";
            /** Name */
            name: string;
            /** Amount Minor */
            amount_minor: number;
            /** Taxable */
            taxable: boolean;
            /** Auto */
            auto: boolean;
            /** Days */
            days: number | null;
            /** Explain */
            explain: {
                [key: string]: unknown;
            };
            /** One Off Id */
            one_off_id: string | null;
        };
        /** SettlementOut */
        SettlementOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Join Date */
            join_date: string | null;
            /**
             * Last Working Day
             * Format: date
             */
            last_working_day: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "approved" | "paid" | "cancelled";
            /** Service Years */
            service_years: number;
            /** Pay Month */
            pay_month: string | null;
            /** Payable Minor */
            payable_minor: number;
            /** Receivable Minor */
            receivable_minor: number;
            /** Net Minor */
            net_minor: number;
            /** Assets Held */
            assets_held?: components["schemas"]["HeldAsset"][];
            /** Gratuity Verified */
            gratuity_verified: boolean;
            /** Note */
            note: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Approved At */
            approved_at: string | null;
            /** Paid At */
            paid_at: string | null;
            /** Lines */
            lines?: components["schemas"]["SettlementLineOut"][];
        };
        /** ShiftAssign */
        ShiftAssign: {
            /** Employee Id */
            employee_id: string;
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /** Date To */
            date_to?: string | null;
        };
        /** ShiftAssignmentOut */
        ShiftAssignmentOut: {
            /** Id */
            id: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Shift Id */
            shift_id: string;
            /** Shift Name */
            shift_name: string;
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /** Date To */
            date_to: string | null;
        };
        /** ShiftCreate */
        ShiftCreate: {
            /** Name */
            name: string;
            /**
             * Start Time
             * Format: time
             * @default 09:00:00
             */
            start_time: string;
            /**
             * End Time
             * Format: time
             * @default 18:00:00
             */
            end_time: string;
            /**
             * Grace In Min
             * @default 15
             */
            grace_in_min: number;
            /**
             * Grace Out Min
             * @default 10
             */
            grace_out_min: number;
            /**
             * Half Day Below Min
             * @default 240
             */
            half_day_below_min: number;
            /**
             * Absent Below Min
             * @default 120
             */
            absent_below_min: number;
        };
        /** ShiftOut */
        ShiftOut: {
            /** Name */
            name: string;
            /**
             * Start Time
             * Format: time
             * @default 09:00:00
             */
            start_time: string;
            /**
             * End Time
             * Format: time
             * @default 18:00:00
             */
            end_time: string;
            /**
             * Grace In Min
             * @default 15
             */
            grace_in_min: number;
            /**
             * Grace Out Min
             * @default 10
             */
            grace_out_min: number;
            /**
             * Half Day Below Min
             * @default 240
             */
            half_day_below_min: number;
            /**
             * Absent Below Min
             * @default 120
             */
            absent_below_min: number;
            /** Id */
            id: string;
            /** Overnight */
            overnight: boolean;
            /** Active */
            active: boolean;
            /**
             * Auto Checkout
             * @default off
             */
            auto_checkout: string;
            /**
             * Auto Checkout After Min
             * @default 600
             */
            auto_checkout_after_min: number;
            /**
             * Overtime After Min
             * @default 30
             */
            overtime_after_min: number;
        };
        /** ShiftPolicyUpdate */
        ShiftPolicyUpdate: {
            /** Auto Checkout */
            auto_checkout?: ("off" | "shift_end" | "max_hours") | null;
            /** Auto Checkout After Min */
            auto_checkout_after_min?: number | null;
            /** Overtime After Min */
            overtime_after_min?: number | null;
        };
        /** SignIn */
        SignIn: {
            /**
             * Employee Id
             * Format: uuid
             */
            employee_id: string;
            /** Pin */
            pin: string;
            /** Device Id */
            device_id?: string | null;
        };
        /** SignedIn */
        SignedIn: {
            /** Cashier Token */
            cashier_token: string;
            /** Employee Id */
            employee_id: string;
            /** Employee Name */
            employee_name: string;
            /** Expires In Hours */
            expires_in_hours: number;
        };
        /** SignupRequest */
        SignupRequest: {
            /** Company Name */
            company_name: string;
            /** Industry Type */
            industry_type: string;
            /** Name */
            name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /** Sections */
            sections?: string[];
            /**
             * Sample Data
             * @default true
             */
            sample_data: boolean;
        };
        /** SourceRow */
        SourceRow: {
            /** Source */
            source: string;
            /** Leads */
            leads: number;
            /** Open */
            open: number;
            /** Won */
            won: number;
            /** Lost */
            lost: number;
            /** Won Value Minor */
            won_value_minor: number;
            /** Win Rate Pct */
            win_rate_pct: number | null;
        };
        /** SourcesReport */
        SourcesReport: {
            /** Rows */
            rows: components["schemas"]["SourceRow"][];
        };
        /** StageCreate */
        StageCreate: {
            /** Name */
            name: string;
            /**
             * Is Won
             * @default false
             */
            is_won: boolean;
            /**
             * Fold
             * @default false
             */
            fold: boolean;
            /** Rotting Days */
            rotting_days?: number | null;
            /** Default Probability */
            default_probability?: number | null;
            /**
             * Requirements
             * @default
             */
            requirements: string;
        };
        /** StageOrder */
        StageOrder: {
            /** Stage Ids */
            stage_ids: string[];
        };
        /** StageOut */
        StageOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Position */
            position: number;
            /** Kind */
            kind: string;
            /**
             * Is Won
             * @default false
             */
            is_won: boolean;
            /**
             * Fold
             * @default false
             */
            fold: boolean;
            /** Rotting Days */
            rotting_days?: number | null;
            /** Default Probability */
            default_probability?: number | null;
            /**
             * Requirements
             * @default
             */
            requirements: string;
        };
        /**
         * StageSlice
         * @description One pipeline stage's standing total. Value and count both, because a stage
         *     holding one large deal and a stage holding twenty small ones are different
         *     situations and a single number hides which you're in.
         */
        StageSlice: {
            /** Name */
            name: string;
            /** Kind */
            kind: string;
            /** Count */
            count: number;
            /** Value */
            value: number;
        };
        /** StageUpdate */
        StageUpdate: {
            /** Name */
            name?: string | null;
            /** Is Won */
            is_won?: boolean | null;
            /** Fold */
            fold?: boolean | null;
            /** Rotting Days */
            rotting_days?: number | null;
            /** Default Probability */
            default_probability?: number | null;
            /** Requirements */
            requirements?: string | null;
        };
        /** StationCategory */
        StationCategory: {
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** StationIn */
        StationIn: {
            /** Name */
            name: string;
            /** Branch Id */
            branch_id?: string | null;
            /** Category Ids */
            category_ids?: string[];
        };
        /** StationOut */
        StationOut: {
            /** Id */
            id: string;
            /** Branch Id */
            branch_id: string;
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Categories */
            categories: components["schemas"]["StationCategory"][];
        };
        /** StationUpdate */
        StationUpdate: {
            /** Name */
            name?: string | null;
            /** Category Ids */
            category_ids?: string[] | null;
            /** Active */
            active?: boolean | null;
        };
        /** StatutoryOut */
        StatutoryOut: {
            /** Schemes */
            schemes: components["schemas"]["StatutorySchemeOut"][];
            /** Minimum Wages */
            minimum_wages: components["schemas"]["MinimumWageOut"][];
            /** Rates Verified */
            rates_verified: boolean;
        };
        /** StatutoryRateOut */
        StatutoryRateOut: {
            /** Province */
            province: string | null;
            /**
             * Effective From
             * Format: date
             */
            effective_from: string;
            /** Base Kind */
            base_kind: string;
            /** Base Minor */
            base_minor: number | null;
            /** Employee Rate */
            employee_rate: number;
            /** Employer Rate */
            employer_rate: number;
            /** Coverage Wage Ceiling Minor */
            coverage_wage_ceiling_minor: number | null;
            /** Source Ref */
            source_ref: string;
            /** Verified */
            verified: boolean;
        };
        /** StatutorySchemeOut */
        StatutorySchemeOut: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Authority */
            authority: string;
            /** Province */
            province: string | null;
            /** Available */
            available: boolean;
            /** Enabled */
            enabled: boolean;
            /** Registration No */
            registration_no: string;
            /** Effective From */
            effective_from: string | null;
            /** Rates */
            rates: components["schemas"]["StatutoryRateOut"][];
        };
        /** StructureIn */
        StructureIn: {
            /** Name */
            name: string;
            /** Component Ids */
            component_ids?: string[];
            /**
             * Active
             * @default true
             */
            active: boolean;
        };
        /** StructureOut */
        StructureOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Active */
            active: boolean;
            /** Components */
            components: components["schemas"]["ComponentOut"][];
            /** Order */
            order: string[];
            /**
             * Pays Salary
             * @default true
             */
            pays_salary: boolean;
        };
        /** SupplierCreate */
        SupplierCreate: {
            /** Name */
            name: string;
            /**
             * Phone
             * @default
             */
            phone: string;
            /**
             * Email
             * @default
             */
            email: string;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** SupplierOut */
        SupplierOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Phone */
            phone: string;
            /** Email */
            email: string;
            /** Notes */
            notes: string;
        };
        /** SyncIn */
        SyncIn: {
            /**
             * Device Id
             * Format: uuid
             */
            device_id: string;
            /** Orders */
            orders: components["schemas"]["OfflineOrder"][];
        };
        /** SyncOut */
        SyncOut: {
            /** Results */
            results: components["schemas"]["SyncResult"][];
        };
        /** SyncResult */
        SyncResult: {
            /** Client Uuid */
            client_uuid: string;
            /**
             * Status
             * @enum {string}
             */
            status: "created" | "duplicate" | "conflict";
            /** Sale Id */
            sale_id?: string | null;
            /** Receipt No */
            receipt_no?: string | null;
            /**
             * Needs Review
             * @default false
             */
            needs_review: boolean;
            /**
             * Reasons
             * @default []
             */
            reasons: string[];
            /** Error */
            error?: string | null;
        };
        /** TableOut */
        TableOut: {
            /** Id */
            id: string;
            /** Floor Id */
            floor_id: string;
            /** Label */
            label: string;
            /** Seats */
            seats: number;
            /** Position */
            position: number;
            /** Active */
            active: boolean;
        };
        /** TableUpdate */
        TableUpdate: {
            /** Label */
            label?: string | null;
            /** Seats */
            seats?: number | null;
            /** Position */
            position?: number | null;
            /** Active */
            active?: boolean | null;
        };
        /** TablesIn */
        TablesIn: {
            /** Labels */
            labels: string[];
            /**
             * Seats
             * @default 4
             */
            seats: number;
        };
        /** TagCreate */
        TagCreate: {
            /** Name */
            name: string;
            /**
             * Color
             * @default slate
             * @enum {string}
             */
            color: "slate" | "teal" | "amber" | "rose" | "violet" | "sky" | "lime";
        };
        /** TagOut */
        TagOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Color */
            color: string;
        };
        /** TagUpdate */
        TagUpdate: {
            /** Name */
            name?: string | null;
            /** Color */
            color?: ("slate" | "teal" | "amber" | "rose" | "violet" | "sky" | "lime") | null;
        };
        /** TargetCopy */
        TargetCopy: {
            /** From Month */
            from_month: string;
            /** To Month */
            to_month: string;
        };
        /**
         * TargetIn
         * @description Set (or replace) the target for a month, person (none: the company) and measure.
         */
        TargetIn: {
            /** Month */
            month: string;
            /**
             * Metric
             * @enum {string}
             */
            metric: "won_value" | "invoiced" | "collected";
            /** Amount Minor */
            amount_minor: number;
            /** User Id */
            user_id?: string | null;
        };
        /** TargetOut */
        TargetOut: {
            /** Id */
            id: string;
            /** Month */
            month: string;
            /** User Id */
            user_id: string | null;
            /** User Name */
            user_name: string | null;
            /**
             * Metric
             * @enum {string}
             */
            metric: "won_value" | "invoiced" | "collected";
            /** Amount Minor */
            amount_minor: number;
            /** Achieved Minor */
            achieved_minor: number;
            /** Percent */
            percent: number;
            /** Pace Minor */
            pace_minor: number;
        };
        /** TargetsOut */
        TargetsOut: {
            /** Month */
            month: string;
            /** Targets */
            targets: components["schemas"]["TargetOut"][];
        };
        /** TaxCategoryOut */
        TaxCategoryOut: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Rate Codes */
            rate_codes: string[];
        };
        /** TaxRateOut */
        TaxRateOut: {
            /** Id */
            id: string;
            /** Code */
            code: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "gst" | "pst" | "further" | "extra" | "fed" | "wht";
            /** Name */
            name: string;
            /** Region Code */
            region_code: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            /** Rate Pct */
            rate_pct: number;
            /**
             * Applies To
             * @enum {string}
             */
            applies_to: "sale" | "purchase" | "both";
            /** Included In Price */
            included_in_price: boolean | null;
            /**
             * Effective From
             * Format: date
             */
            effective_from: string;
            /** Effective To */
            effective_to: string | null;
            /** Verified */
            verified: boolean;
            /** Source Ref */
            source_ref: string;
        };
        /** TaxRatesOut */
        TaxRatesOut: {
            /**
             * On
             * Format: date
             */
            on: string;
            /** Rates */
            rates: components["schemas"]["TaxRateOut"][];
            /** Unverified In Use */
            unverified_in_use: boolean;
        };
        /** TeamCreate */
        TeamCreate: {
            /** Name */
            name: string;
            /** Lead User Id */
            lead_user_id?: string | null;
        };
        /** TeamMembersPut */
        TeamMembersPut: {
            /** User Ids */
            user_ids: string[];
        };
        /** TeamOut */
        TeamOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Lead User Id */
            lead_user_id: string | null;
            /** Member Ids */
            member_ids: string[];
        };
        /** TeamUser */
        TeamUser: {
            /** Id */
            id: string;
            /** Email */
            email: string;
            /** Name */
            name: string;
            /** Role */
            role: string | null;
            /** Status */
            status: string;
            /** Roles */
            roles?: components["schemas"]["RoleRef"][];
        };
        /** TemplateIn */
        TemplateIn: {
            /** Name */
            name: string;
            /**
             * Channel
             * @default email
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /**
             * Subject
             * @default
             */
            subject: string;
            /** Body */
            body: string;
        };
        /** TemplateOut */
        TemplateOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /**
             * Channel
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /** Subject */
            subject: string;
            /** Body */
            body: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** TenantOut */
        TenantOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Industry Type */
            industry_type: string;
            /** Status */
            status: string;
        };
        /**
         * TenderIn
         * @description One tender of a split payment (0076). For cash, `amount_minor` is what
         *     was handed over; the change comes back out of it.
         */
        TenderIn: {
            /**
             * Method
             * @enum {string}
             */
            method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata";
            /** Amount Minor */
            amount_minor: number;
            /**
             * Reference
             * @default
             */
            reference: string;
        };
        /**
         * TerminologyRef
         * @description Which label set is current: refetch /terminology when the ETag moves.
         */
        TerminologyRef: {
            /** Etag */
            etag: string;
            /** Industry Type */
            industry_type: string;
            /** Locale */
            locale: string;
        };
        /** TerminologyResponse */
        TerminologyResponse: {
            /** Industry Type */
            industry_type: string;
            /** Locale */
            locale: string;
            /** Labels */
            labels: {
                [key: string]: string;
            };
        };
        /** TimelineChange */
        TimelineChange: {
            /** Field */
            field: string;
            /** Label */
            label: string;
            /** Old */
            old?: unknown;
            /** New */
            new?: unknown;
            /** Old Label */
            old_label?: string | null;
            /** New Label */
            new_label?: string | null;
            /**
             * Masked
             * @default false
             */
            masked: boolean;
        };
        /** TimelineEventOut */
        TimelineEventOut: {
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Actor Id */
            actor_id: string | null;
            /** Actor Name */
            actor_name: string | null;
            /** Body */
            body: string | null;
            /** Changes */
            changes: components["schemas"]["TimelineChange"][];
            /** Payload */
            payload: {
                [key: string]: unknown;
            } | null;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
        };
        /** TimelineItem */
        TimelineItem: {
            /** Id */
            id: string;
            /** Entity Type */
            entity_type: string;
            /** Entity Id */
            entity_id: string;
            /** Kind */
            kind: string;
            /** Body */
            body: string | null;
            /** Changes */
            changes: {
                [key: string]: unknown;
            } | null;
            /** Actor Id */
            actor_id: string | null;
            /** Actor Name */
            actor_name: string | null;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /** Activity */
            activity?: {
                [key: string]: unknown;
            } | null;
        };
        /** TimelinePage */
        TimelinePage: {
            /** Items */
            items: components["schemas"]["TimelineEventOut"][];
            /** Next Cursor */
            next_cursor: string | null;
        };
        /** TrendPoint */
        TrendPoint: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Value */
            value: number;
        };
        /** UnsubscribePage */
        UnsubscribePage: {
            /** Business Name */
            business_name: string;
            /**
             * Channel
             * @enum {string}
             */
            channel: "email" | "sms" | "whatsapp";
            /** Done */
            done: boolean;
        };
        /** UpgradeRequest */
        UpgradeRequest: {
            /** Plan */
            plan: string;
        };
        /** UserCreate */
        UserCreate: {
            /** Name */
            name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /** Role Id */
            role_id: string;
        };
        /** UserOut */
        UserOut: {
            /** Id */
            id: string;
            /** Email */
            email: string;
            /** Name */
            name: string;
            /** Role */
            role?: string | null;
        };
        /** UserUpdate */
        UserUpdate: {
            /** Role Id */
            role_id?: string | null;
            /** Status */
            status?: ("active" | "disabled") | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
        /** VerifyRequest */
        VerifyRequest: {
            /** Token */
            token: string;
        };
        /** VoidIn */
        VoidIn: {
            /** Reason */
            reason: string;
            /** Register Id */
            register_id?: string | null;
        };
        /** VoidOut */
        VoidOut: {
            /** Sale Id */
            sale_id: string;
            /** Status */
            status: string;
            /** Void Reason */
            void_reason: string;
            /** Refund Minor */
            refund_minor: number;
        };
        /** WebFormAnswer */
        WebFormAnswer: {
            /** Message */
            message: string;
        };
        /** WebFormIn */
        WebFormIn: {
            /** Name */
            name: string;
            /**
             * Title
             * @default
             */
            title: string;
            /**
             * Intro
             * @default
             */
            intro: string;
            /**
             * Thank You
             * @default
             */
            thank_you: string;
            /** Fields */
            fields?: ("phone" | "email" | "company" | "city" | "message")[];
            /** Pipeline Id */
            pipeline_id?: string | null;
            /** Stage Id */
            stage_id?: string | null;
            /**
             * Source
             * @default web form
             */
            source: string;
            /** Owner Id */
            owner_id?: string | null;
            /**
             * Daily Cap
             * @default 200
             */
            daily_cap: number;
        };
        /** WebFormOut */
        WebFormOut: {
            /** Id */
            id: string;
            /** Public Id */
            public_id: string;
            /** Link */
            link: string;
            /** Name */
            name: string;
            /** Title */
            title: string;
            /** Intro */
            intro: string;
            /** Thank You */
            thank_you: string;
            /** Fields */
            fields: ("phone" | "email" | "company" | "city" | "message")[];
            /** Pipeline Id */
            pipeline_id: string | null;
            /** Stage Id */
            stage_id: string | null;
            /** Source */
            source: string;
            /** Owner Id */
            owner_id: string | null;
            /** Daily Cap */
            daily_cap: number;
            /** Active */
            active: boolean;
            /** Leads Today */
            leads_today: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** WebFormPatch */
        WebFormPatch: {
            /** Name */
            name?: string | null;
            /** Title */
            title?: string | null;
            /** Intro */
            intro?: string | null;
            /** Thank You */
            thank_you?: string | null;
            /** Fields */
            fields?: ("phone" | "email" | "company" | "city" | "message")[] | null;
            /** Pipeline Id */
            pipeline_id?: string | null;
            /** Stage Id */
            stage_id?: string | null;
            /** Source */
            source?: string | null;
            /** Owner Id */
            owner_id?: string | null;
            /** Daily Cap */
            daily_cap?: number | null;
            /** Active */
            active?: boolean | null;
        };
        /**
         * WebFormPublic
         * @description What a visitor's browser gets: the form, never its routing.
         */
        WebFormPublic: {
            /** Title */
            title: string;
            /** Intro */
            intro: string;
            /** Fields */
            fields: ("phone" | "email" | "company" | "city" | "message")[];
            /** Business Name */
            business_name: string;
            /** Ticket */
            ticket: string;
        };
        /** WebFormSubmit */
        WebFormSubmit: {
            /** Ticket */
            ticket: string;
            values: components["schemas"]["WebFormValues"];
        };
        /**
         * WebFormValues
         * @description What a visitor may send. Unknown keys are dropped, not refused: a page
         *     can't learn anything from the answer. `website` is the honeypot.
         */
        WebFormValues: {
            /** Name */
            name: string;
            /**
             * Phone
             * @default
             */
            phone: string;
            /**
             * Email
             * @default
             */
            email: string;
            /**
             * Company
             * @default
             */
            company: string;
            /**
             * City
             * @default
             */
            city: string;
            /**
             * Message
             * @default
             */
            message: string;
            /**
             * Website
             * @default
             */
            website: string;
            /**
             * Utm Source
             * @default
             */
            utm_source: string;
            /**
             * Utm Medium
             * @default
             */
            utm_medium: string;
            /**
             * Utm Campaign
             * @default
             */
            utm_campaign: string;
        };
        /** WeekOut */
        WeekOut: {
            /** Days */
            days: string[];
            /** Employees */
            employees: components["schemas"]["WeekRow"][];
        };
        /** WeekRow */
        WeekRow: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Cells */
            cells: string[];
        };
        /** WorkflowCreate */
        WorkflowCreate: {
            /** Name */
            name: string;
            /**
             * Trigger
             * @enum {string}
             */
            trigger: "lead.created" | "lead.stage_changed" | "interaction.logged" | "lead.won" | "lead.lost" | "lead.restored" | "activity.done" | "activity.overdue" | "contact.created";
            /** Conditions */
            conditions?: {
                [key: string]: unknown;
            }[];
            /** Actions */
            actions?: {
                [key: string]: unknown;
            }[];
        };
        /** WorkflowOut */
        WorkflowOut: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Trigger */
            trigger: string;
            /** Conditions */
            conditions: {
                [key: string]: unknown;
            }[];
            /** Actions */
            actions: {
                [key: string]: unknown;
            }[];
            /** Enabled */
            enabled: boolean;
            /** Is System */
            is_system: boolean;
        };
        /** WorkflowUpdate */
        WorkflowUpdate: {
            /** Name */
            name?: string | null;
            /** Enabled */
            enabled?: boolean | null;
        };
        /** PaymentIn */
        app__invoice_models__PaymentIn: {
            /**
             * Method
             * @enum {string}
             */
            method: "cash" | "bank" | "cheque" | "card" | "jazzcash" | "easypaisa" | "raast" | "wht_adjustment";
            /** Amount Minor */
            amount_minor: number;
            /**
             * Paid On
             * Format: date
             */
            paid_on: string;
            /**
             * Reference
             * @default
             */
            reference: string;
        };
        /** PaymentIn */
        app__routers__khata__PaymentIn: {
            /** Amount Minor */
            amount_minor: number;
            /**
             * Method
             * @enum {string}
             */
            method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "cheque";
            /** Register Id */
            register_id?: string | null;
            /**
             * Reference
             * @default
             */
            reference: string;
            /**
             * Note
             * @default
             */
            note: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
        };
    };
    ready_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    signup_auth_signup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignupRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forgot_auth_forgot_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reset_auth_reset_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_password_auth_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChange"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_auth_verify_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    accept_invite_auth_accept_invite_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptInviteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    me_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    overview_dashboard_overview_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DashboardOverview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_terminology_terminology_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TerminologyResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_terminology_terminology_preview__industry_type__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                industry_type: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TerminologyResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_entitlements_entitlements_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    toggle_section_entitlements__section__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                section: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EntitlementUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_team_users_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamUser"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_user_team_users_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_user_roles_team_users__user_id__roles_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleIdsPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_team_users__user_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_member_team_invite_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InviteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_roles_team_roles_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_role_team_roles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_leads_crm_leads_import_post: {
        parameters: {
            query?: {
                skip_duplicates?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_leads_crm_leads_export_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    summary_crm_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    fulfillment_schema_crm_fulfillment_schema_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfillmentSchema"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_fulfillment_crm_leads__lead_id__fulfillment_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfillmentData"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_fulfillment_crm_leads__lead_id__fulfillment_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FulfillmentData"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfillmentData"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_leads_crm_leads_get: {
        parameters: {
            query?: {
                pipeline_id?: string | null;
                /** @description Comma list of open, won, lost */
                status?: string | null;
                tag_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_lead_crm_leads_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeadCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lead_crm_leads__lead_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_lead_crm_leads__lead_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeadUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    win_lead_crm_leads__lead_id__won_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lose_lead_crm_leads__lead_id__lost_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeadLost"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restore_lead_crm_leads__lead_id__restore_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lead_timeline_crm_leads__lead_id__timeline_get: {
        parameters: {
            query?: {
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimelinePage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_note_crm_leads__lead_id__notes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NoteCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimelineEventOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    log_interaction_crm_leads__lead_id__interactions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InteractionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InteractionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ask_ai_ask_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AskRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AskResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_notifications_notifications_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_all_read_notifications_read_all_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflows_workflows_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkflowOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_workflows_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkflowOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_workflow_workflows__workflow_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_workflow_workflows__workflow_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkflowOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_plans_invoices_plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoicePlanOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_plan_invoices_plans_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoicePlanIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoicePlanOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_runs_invoices_plans__plan_id__runs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                plan_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceRunOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    make_run_invoices_plans__plan_id__runs_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                plan_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoiceRunCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceRunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_run_invoices_runs__invoice_run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceRunDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_run_invoices_runs__invoice_run_id__issue_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceRunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_pdfs_invoices_runs__invoice_run_id__pdfs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_invoices_invoices_get: {
        parameters: {
            query?: {
                status?: ("draft" | "pending_approval" | "issued" | "partially_paid" | "paid" | "void") | null;
                contact_id?: string | null;
                lead_id?: string | null;
                overdue?: boolean;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceSummary"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_invoice_invoices_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoiceCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    receivables_aging_invoices_aging_get: {
        parameters: {
            query?: {
                as_of?: string | null;
                format?: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgingReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_invoice_invoices__invoice_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_invoice_invoices__invoice_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoiceUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_invoice_invoices__invoice_id__submit_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_invoice_invoices__invoice_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_invoice_invoices__invoice_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Reason"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_payment_invoices__invoice_id__payments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["app__invoice_models__PaymentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    credit_invoice_invoices__invoice_id__credit_notes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreditNoteIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_invoice_invoices__invoice_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Reason"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invoice_pdf_invoices__invoice_id__pdf_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_invoice_invoices__invoice_id__send_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvoiceSend"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceSent"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_products_pos_products_get: {
        parameters: {
            query?: {
                q?: string | null;
                include_archived?: boolean;
                category_id?: string | null;
                limit?: number | null;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_product_pos_products_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lookup_pos_products_lookup_get: {
        parameters: {
            query: {
                barcode: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_product_pos_products__product_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sales_history_pos_sales_get: {
        parameters: {
            query?: {
                q?: string | null;
                method?: ("cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "khata") | null;
                status?: string | null;
                register_id?: string | null;
                from?: string | null;
                to?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaleRow"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    checkout_pos_sales_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Cashier-Token"?: string | null;
            };
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    quote_sale_pos_sales_quote_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaleQuoteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaleQuote"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_suppliers_pos_suppliers_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SupplierOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_supplier_pos_suppliers_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SupplierCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SupplierOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_pos_pos_purchase_orders_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_po_pos_purchase_orders_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PoCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    receive_po_pos_purchase_orders__po_id__receive_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                po_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PoReceive"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_po_pos_purchase_orders__po_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                po_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    open_drawer_pos_drawer_open_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DrawerOpen"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DrawerOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    current_drawer_pos_drawer_current_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DrawerOut"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    close_drawer_pos_drawer_close_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DrawerClose"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DrawerOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    drawer_history_pos_drawer_history_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DrawerOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_products_pos_products_import_post: {
        parameters: {
            query?: {
                skip_duplicates?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_products_pos_products_export_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_sale_pos_sales__sale_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sale_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaleLookup"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_return_pos_sales__sale_id__returns_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sale_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReturnCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReturnOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    summary_pos_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PosSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restock_pos_restock_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RestockItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forecast_pos_forecast_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForecastOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_settings_fbr_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FbrSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_settings_fbr_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FbrSettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FbrSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_invoices_fbr_invoices_get: {
        parameters: {
            query?: {
                pending_only?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FbrInvoiceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resolve_invoice_fbr_invoices__invoice_id__resolve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invoice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FbrResolve"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FbrInvoiceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_employees_hrms_employees_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_employee_hrms_employees_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmployeeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_employee_hrms_employees__employee_id__invite_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_employee_hrms_employees__employee_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeProfile"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_employee_hrms_employees__employee_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmployeeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    check_in_hrms_attendance_checkin_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckInRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    check_out_hrms_attendance_checkout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckInRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_attendance_hrms_attendance_get: {
        parameters: {
            query?: {
                on?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    attendance_week_hrms_attendance_week_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeekOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_shifts_hrms_shifts_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShiftOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_shift_hrms_shifts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShiftCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShiftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    assign_shift_hrms_shifts__shift_id__assign_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                shift_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShiftAssign"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShiftAssignmentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_shift_assignments_hrms_shift_assignments_get: {
        parameters: {
            query?: {
                employee_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShiftAssignmentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    summary_hrms_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HrmsSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_payroll_hrms_payroll_get: {
        parameters: {
            query?: {
                month?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreviewOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_profile_me_profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_attendance_me_attendance_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_billing_billing_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_plans_billing_plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanOut"][];
                };
            };
        };
    };
    upgrade_billing_upgrade_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpgradeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentInstructions"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_payment_billing_payment_requests__request_id__submit_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                request_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_pipelines_crm_pipelines_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_pipeline_crm_pipelines_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PipelineCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_pipeline_crm_pipelines__pipeline_id__delete: {
        parameters: {
            query?: {
                move_to?: string | null;
            };
            header?: never;
            path: {
                pipeline_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_pipeline_crm_pipelines__pipeline_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pipeline_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PipelineUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_stage_crm_pipelines__pipeline_id__stages_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pipeline_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_stage_crm_pipelines__pipeline_id__stages__stage_id__delete: {
        parameters: {
            query?: {
                move_to?: string | null;
            };
            header?: never;
            path: {
                pipeline_id: string;
                stage_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_stage_crm_pipelines__pipeline_id__stages__stage_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pipeline_id: string;
                stage_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reorder_stages_crm_pipelines__pipeline_id__stages_order_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pipeline_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageOrder"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PipelineOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_lost_reasons_crm_lost_reasons_get: {
        parameters: {
            query?: {
                include_retired?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LostReasonOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_lost_reason_crm_lost_reasons_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LostReasonCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LostReasonOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_lost_reason_crm_lost_reasons__reason_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reason_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_lost_reason_crm_lost_reasons__reason_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reason_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LostReasonUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LostReasonOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    funnel_crm_reports_funnel_get: {
        parameters: {
            query?: {
                pipeline_id?: string | null;
                date_from?: string | null;
                date_to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FunnelReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lost_reasons_crm_reports_lost_reasons_get: {
        parameters: {
            query?: {
                pipeline_id?: string | null;
                date_from?: string | null;
                date_to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LostReasonsReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sources_crm_reports_sources_get: {
        parameters: {
            query?: {
                pipeline_id?: string | null;
                date_from?: string | null;
                date_to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourcesReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lines_crm_leads__lead_id__lines_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealLines"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_lines_crm_leads__lead_id__lines_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DealLinesPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealLines"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_prices_crm_leads__lead_id__lines_update_prices_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealLines"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    find_products_crm_products_get: {
        parameters: {
            query?: {
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DealProductOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_settings_crm_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_settings_crm_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmSettingsIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmSettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_quotes_crm_leads__lead_id__quotes_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_quote_crm_leads__lead_id__quotes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_quote_crm_quotes__quote_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_quote_crm_quotes__quote_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invoice_quote_crm_quotes__quote_id__invoice_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteInvoiced"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_targets_crm_targets_get: {
        parameters: {
            query: {
                month: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TargetsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_target_crm_targets_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TargetIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TargetOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_target_crm_targets__target_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                target_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    copy_targets_crm_targets_copy_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TargetCopy"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Copied"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forecast_crm_forecast_get: {
        parameters: {
            query?: {
                months?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesForecastOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    view_public_quotes__token__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuotePublic"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    beacon_public_quotes__token__view_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    accept_public_quotes__token__accept_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteAccept"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuotePublic"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decline_public_quotes__token__decline_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteDecline"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuotePublic"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_forms_crm_web_forms_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebFormOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_form_crm_web_forms_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WebFormIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebFormOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_form_crm_web_forms__form_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                form_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WebFormPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebFormOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pool_crm_assignment_pool_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoolMemberOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_pool_crm_assignment_pool_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PoolPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoolMemberOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pool_candidates_crm_assignment_people_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PersonOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    describe_public_forms__public_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                public_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebFormPublic"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_public_forms__public_id__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                public_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WebFormSubmit"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebFormAnswer"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_consents_contacts__contact_id__consents_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_consent_contacts__contact_id__consents_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_segments_crm_segments_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SegmentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_segment_crm_segments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SegmentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SegmentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_segment_crm_segments__segment_id__preview_get: {
        parameters: {
            query?: {
                channel?: "email" | "sms" | "whatsapp";
            };
            header?: never;
            path: {
                segment_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SegmentPreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_templates_crm_templates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_template_crm_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TemplateIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_campaigns_crm_campaigns_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_campaign_crm_campaigns_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CampaignIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_campaign_crm_campaigns__campaign_id__send_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    recipients_crm_campaigns__campaign_id__recipients_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecipientOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unsubscribe_page_public_unsubscribe__token__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnsubscribePage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unsubscribe_public_unsubscribe__token__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnsubscribePage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_activities_activities_get: {
        parameters: {
            query?: {
                /** @description Comma list of overdue, today, planned, done, cancelled */
                state?: string | null;
                assigned?: ("me" | "all") | null;
                entity_type?: ("lead" | "contact") | null;
                entity_id?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_activity_activities_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivityCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    activity_summary_activities_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivitySummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_activity_activities__activity_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activity_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivityUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_activity_activities__activity_id__done_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activity_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivityDone"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    snooze_activity_activities__activity_id__snooze_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activity_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivitySnooze"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_activity_activities__activity_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                activity_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_activity_types_activity_types_get: {
        parameters: {
            query?: {
                include_retired?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_activity_type_activity_types_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivityTypeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_activity_type_activity_types__type_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_activity_type_activity_types__type_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivityTypeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityTypeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_contacts_contacts_get: {
        parameters: {
            query?: {
                q?: string | null;
                kind?: ("person" | "company") | null;
                role?: ("customer" | "supplier" | "patient" | "student" | "parent" | "partner") | null;
                tag?: string | null;
                owner?: string | null;
                include_archived?: boolean;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_contact_contacts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lookup_contacts_lookup_get: {
        parameters: {
            query: {
                phone: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactLookup"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    merge_contacts_contacts_merge_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MergeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MergeResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    merge_preview_contacts_merge_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MergePreviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MergePreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_queue_contacts_review_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_contact_contacts__contact_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    archive_contact_contacts__contact_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_contact_contacts__contact_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restore_contact_contacts__contact_id__restore_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    contact_duplicates_contacts__contact_id__duplicates_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactDuplicates"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    contact_timeline_contacts__contact_id__timeline_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimelineItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_note_contacts__contact_id__notes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactNoteCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: boolean;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_address_contacts__contact_id__addresses_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_address_contacts__contact_id__addresses__address_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
                address_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_address_contacts__contact_id__addresses__address_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
                address_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_tags_tags_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_tag_tags_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_tag_tags__tag_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tag_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_tag_tags__tag_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tag_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lead_contact_crm_leads__lead_id__contact_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactOut"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    qualify_lead_crm_leads__lead_id__qualify_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lead_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QualifyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeadContact"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_backfill_contacts_backfill_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackfillReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_review_contacts_review__item_id__dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    regions_org_regions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegionOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_company_org_company_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_company_org_company_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_branches_org_branches_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BranchOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_branch_org_branches__branch_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                branch_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BranchUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BranchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_branding_org_branding_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_branding_org_branding_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BrandingUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sequences_sequences_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SequenceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_next_sequences__sequence_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sequence_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SequenceUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SequenceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_files_post: {
        parameters: {
            query: {
                name: string;
                purpose?: "attachment" | "logo";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    local_blob_files__local__key__get: {
        parameters: {
            query: {
                exp: number;
                ct: string;
                cd: string;
                sig: string;
            };
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_files__file_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    rates_tax_rates_get: {
        parameters: {
            query?: {
                on?: string | null;
                region?: ("PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxRatesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    categories_tax_categories_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxCategoryOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_profile_profile_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_profile_profile_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_modules_platform_modules_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModuleOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    enable_module_platform_modules__key__enable_post: {
        parameters: {
            query?: {
                dry_run?: boolean;
            };
            header?: never;
            path: {
                key: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnablePlanOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    disable_module_platform_modules__key__disable_post: {
        parameters: {
            query?: {
                cascade?: boolean;
                dry_run?: boolean;
            };
            header?: never;
            path: {
                key: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisablePlanOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    purge_module_platform_modules__key__purge_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PurgeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurgeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_permissions_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogModule"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_roles_roles_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleSummary"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_role_roles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleV2Create"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_role_roles__role_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_role_roles__role_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_role_roles__role_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleV2Update"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_grants_roles__role_id__grants_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GrantsPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_inherits_roles__role_id__inherits_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleIdsPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    copy_role_roles__role_id__copy_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleCopy"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_teams_teams_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_team_teams_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TeamCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_members_teams__team_id__members_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TeamMembersPut"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TeamOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_team_teams__team_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                team_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_departments_hrms_departments_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DepartmentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_department_hrms_departments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DepartmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DepartmentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_department_hrms_departments__dept_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dept_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DepartmentUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DepartmentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_job_titles_hrms_job_titles_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobTitleOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_job_title_hrms_job_titles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobTitleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobTitleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_job_title_hrms_job_titles__title_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                title_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobTitleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobTitleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_locations_hrms_locations_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_location_hrms_locations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LocationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_location_hrms_locations__location_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                location_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LocationUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_employee_job_hrms_employees__employee_id__job_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmployeeJobUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeProfile"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_documents_hrms_employees__employee_id__documents_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_document_hrms_employees__employee_id__documents_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DocumentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_document_hrms_documents__doc_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                doc_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    expiring_documents_hrms_documents_expiring_get: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_shift_policy_hrms_shifts__shift_id__policy_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                shift_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShiftPolicyUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShiftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_corrections_hrms_attendance_corrections_get: {
        parameters: {
            query?: {
                status?: ("pending" | "approved" | "rejected" | "cancelled") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CorrectionOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_correction_hrms_attendance_corrections__correction_id___decision__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                correction_id: string;
                decision: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Decision"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CorrectionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_punch_me_attendance_punch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PunchRequest"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PunchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_checkin_me_attendance_checkin_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PunchRequest"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_checkout_me_attendance_checkout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PunchRequest"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_corrections_me_attendance_corrections_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CorrectionOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_correction_me_attendance_corrections_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CorrectionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CorrectionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_approvals_me_approvals_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApprovalsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_kiosks_hrms_kiosks_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KioskOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_kiosk_hrms_kiosks_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["KioskCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KioskOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    revoke_kiosk_hrms_kiosks__kiosk_id__revoke_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kiosk_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KioskOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_kiosk_pin_hrms_employees__employee_id__kiosk_pin_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["KioskPinSet"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bootstrap_kiosk__token__bootstrap_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KioskBootstrap"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    kiosk_punch_kiosk__token__punch_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["KioskPunchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KioskPunchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_calendars_hrms_holiday_calendars_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HolidayCalendarOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_calendar_hrms_holiday_calendars_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HolidayCalendarCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HolidayCalendarOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_calendar_hrms_holiday_calendars__calendar_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                calendar_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_holidays_hrms_holidays_get: {
        parameters: {
            query?: {
                calendar_id?: string | null;
                year?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HolidayOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_holiday_hrms_holidays_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HolidayCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HolidayOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_holiday_hrms_holidays__holiday_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                holiday_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_holidays_hrms_holidays_import_post: {
        parameters: {
            query?: {
                calendar_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_blackouts_hrms_blackout_days_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlackoutOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_blackout_hrms_blackout_days_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BlackoutCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlackoutOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_blackout_hrms_blackout_days__blackout_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                blackout_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_notices_hrms_notices_get: {
        parameters: {
            query?: {
                archived?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_notice_hrms_notices_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NoticeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_notice_hrms_notices__notice_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NoticeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remind_now_hrms_notices__notice_id__remind_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeRemindOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acknowledgements_hrms_notices__notice_id__acknowledgements_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeAck"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_notices_me_notices_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acknowledge_me_notices__notice_id__acknowledge_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notice_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_rates_hrms_overtime_rates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeRatesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_rates_hrms_overtime_rates_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OvertimeRates"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeRatesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_claims_hrms_overtime_get: {
        parameters: {
            query?: {
                status?: ("pending" | "approved" | "rejected") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_hrms_overtime__claim_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                claim_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OvertimeDecision"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_hrms_overtime__claim_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                claim_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OvertimeDecision"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_claims_me_overtime_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    claim_me_overtime_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OvertimeClaimIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OvertimeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_assets_hrms_assets_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_asset_hrms_assets_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_asset_hrms_assets__asset_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_hrms_assets__asset_id__issue_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetIssue"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    take_back_hrms_assets__asset_id__return_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetReturn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_hrms_assets__asset_id__history_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetAssignmentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    employee_assets_hrms_employees__employee_id__assets_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_assets_me_assets_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_policies_payroll_policies_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoliciesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_policies_payroll_policies_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PoliciesIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoliciesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    presets_payroll_policy_presets_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PresetOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_preset_payroll_policies_apply_preset_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PresetIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PoliciesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analytics_hrms_analytics_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HrAnalytics"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_hrms_employees__employee_id__job_changes_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobChangeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_hrms_employees__employee_id__job_changes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobChangeIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobChangeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_hrms_job_changes__change_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                change_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobChangeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_templates_hrms_letter_templates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterTemplateOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_template_hrms_letter_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterTemplateIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    placeholders_hrms_letter_placeholders_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_template_hrms_letter_templates__template_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterTemplateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_hrms_employees__employee_id__letters_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterPreviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterPreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    employee_letters_hrms_employees__employee_id__letters_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_hrms_employees__employee_id__letters_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterIssue"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    letter_pdf_hrms_letters__letter_id__pdf_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                letter_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_requests_hrms_letter_requests_get: {
        parameters: {
            query?: {
                status?: ("pending" | "issued" | "declined") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterRequestOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decline_hrms_letter_requests__request_id__decline_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                request_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterDecline"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterRequestOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    done_hrms_letter_requests__request_id__done_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                request_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterDecline"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterRequestOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_requests_me_letter_requests_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterRequestOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ask_me_letter_requests_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LetterRequestIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterRequestOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_letters_me_letters_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LetterOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_letter_pdf_me_letters__letter_id__pdf_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                letter_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_gratuity_payroll_gratuity_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GratuitySettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    put_gratuity_payroll_gratuity_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GratuitySettings"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GratuitySettingsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    draft_hrms_employees__employee_id__final_settlement_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_settlements_hrms_final_settlements_get: {
        parameters: {
            query?: {
                status?: ("draft" | "approved" | "paid" | "cancelled") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_settlement_hrms_final_settlements__settlement_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                settlement_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    recalculate_hrms_final_settlements__settlement_id__recalculate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                settlement_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_line_hrms_final_settlements__settlement_id__lines_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                settlement_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SettlementLineIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementLineOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_line_hrms_final_settlement_lines__line_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                line_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_hrms_final_settlements__settlement_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                settlement_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_hrms_final_settlements__settlement_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                settlement_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_requests_hrms_comp_off_get: {
        parameters: {
            query?: {
                status?: ("pending" | "approved" | "rejected") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompOffOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_hrms_comp_off__comp_off_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comp_off_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompOffApprove"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompOffOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_hrms_comp_off__comp_off_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comp_off_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompOffReject"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompOffOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_encashments_hrms_employees__employee_id__leave_encashments_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncashOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_encashment_hrms_employees__employee_id__leave_encashments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EncashIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncashOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mine_me_comp_off_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompOffOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ask_me_comp_off_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompOffIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompOffOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_claims_hrms_expenses_get: {
        parameters: {
            query?: {
                status?: ("submitted" | "approved" | "rejected" | "cancelled") | null;
                employee_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    claim_for_hrms_expenses_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpenseClaimFor"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_claim_hrms_expenses__expense_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expense_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_hrms_expenses__expense_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expense_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpenseApprove"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_hrms_expenses__expense_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expense_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpenseReject"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_claims_me_expenses_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    make_claim_me_expenses_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpenseClaimIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_mine_me_expenses__expense_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                expense_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpenseClaimOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    probation_due_hrms_probation_get: {
        parameters: {
            query?: {
                within_days?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProbationDue"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_probation_hrms_employees__employee_id__probation_review_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProbationReviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProbationReviewOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    probation_history_hrms_employees__employee_id__probation_reviews_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProbationReviewOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_templates_hrms_appraisal_templates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalTemplateOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_template_hrms_appraisal_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalTemplateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_template_hrms_appraisal_templates__template_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalTemplateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_appraisal_hrms_appraisals__appraisal_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appraisal_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hr_review_hrms_appraisals__appraisal_id__manager_review_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appraisal_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalReviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_appraisal_hrms_appraisals__appraisal_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appraisal_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_cycles_hrms_appraisal_cycles_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalCycleOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_cycle_hrms_appraisal_cycles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalCycleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalCycleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_cycle_hrms_appraisal_cycles__cycle_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cycle_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalCycleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    open_cycle_hrms_appraisal_cycles__cycle_id__open_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cycle_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalCycleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    close_cycle_hrms_appraisal_cycles__cycle_id__close_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cycle_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalCycleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_appraisals_me_appraisals_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    self_review_me_appraisals__appraisal_id__self_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appraisal_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalReviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_reviews_me_reviews_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_as_manager_me_reviews__appraisal_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appraisal_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppraisalReviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppraisalOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_templates_hrms_boarding_templates_get: {
        parameters: {
            query?: {
                kind?: ("onboarding" | "offboarding") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingTemplateOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_template_hrms_boarding_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BoardingTemplateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_template_hrms_boarding_templates__template_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BoardingTemplateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingTemplateOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_onboarding_hrms_employees__employee_id__onboarding_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OnboardingStart"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_offboarding_hrms_employees__employee_id__offboarding_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OffboardingStart"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_boardings_hrms_boardings_get: {
        parameters: {
            query?: {
                kind?: ("onboarding" | "offboarding") | null;
                status?: ("open" | "completed" | "cancelled") | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_boarding_hrms_boardings__boarding_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                boarding_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_task_hrms_boardings__boarding_id__tasks_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                boarding_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BoardingTaskCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingTaskOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_task_hrms_boarding_tasks__task_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BoardingTaskUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingTaskOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_hrms_boardings__boarding_id__complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                boarding_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["BoardingClose"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_hrms_boardings__boarding_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                boarding_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["BoardingClose"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_exit_interview_hrms_boardings__boarding_id__exit_interview_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                boarding_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExitInterviewIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BoardingOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_tasks_me_boarding_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyBoardingTask"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_task_done_me_boarding_tasks__task_id__done_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyBoardingTask"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pending_hrms_requests_pending_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequestRow"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_requests_me_requests_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequestRow"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    celebrations_hrms_celebrations_get: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Celebration"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    org_chart_hrms_org_chart_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrgChartPerson"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_celebrations_me_celebrations_get: {
        parameters: {
            query?: {
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Celebration"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_celebration_settings_me_celebrations_settings_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CelebrationSettings"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CelebrationSettings"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_log_hrms_attendance_import_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BiometricImportOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_leave_types_hrms_leave_types_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveTypeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_leave_type_hrms_leave_types_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeaveTypeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveTypeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_leave_type_hrms_leave_types__leave_type_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                leave_type_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeaveTypeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveTypeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_leave_policy_hrms_leave_policy_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeavePolicyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_leave_policy_hrms_leave_policy_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeavePolicyUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeavePolicyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_leave_hrms_leave_get: {
        parameters: {
            query?: {
                request_type?: ("leave" | "wfh") | null;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_leave_hrms_leave_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeaveCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    leave_balances_hrms_leave_balances_get: {
        parameters: {
            query: {
                employee_id: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveBalance"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    leave_ledger_hrms_leave_ledger_get: {
        parameters: {
            query: {
                employee_id: string;
                leave_type_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LedgerEntryOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    adjust_ledger_hrms_leave_ledger_adjust_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LedgerAdjust"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveBalance"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hr_cancel_leave_hrms_leave__leave_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                leave_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_leave_hrms_leave__leave_id___decision__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                leave_id: string;
                decision: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Decision"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_leave_me_leave_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_request_leave_me_leave_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LeaveCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_balances_me_leave_balances_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveBalance"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_leave_types_me_leave_types_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveTypeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_cancel_leave_me_leave__leave_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                leave_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LeaveOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_compensation_payroll_employees__employee_id__compensation_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompensationOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_compensation_payroll_employees__employee_id__compensation_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompensationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompensationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_details_payroll_employees__employee_id__details_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayrollDetailsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_details_payroll_employees__employee_id__details_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employee_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayrollDetailsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayrollDetailsOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_runs_payroll_runs_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_run_payroll_runs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_recompute_payroll_runs_recompute_tax_year_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecomputeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_run_payroll_runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_payslip_payroll_runs__run_id__payslips__payslip_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
                payslip_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayslipDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    calculate_payroll_runs__run_id__calculate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_payroll_runs__run_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["RunAction"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reopen_payroll_runs__run_id__reopen_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunAction"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_payslips_payroll_runs__run_id__payslips_send_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayslipSendIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayslipSendOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mark_paid_payroll_runs__run_id__mark_paid_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["RunAction"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lock_payroll_runs__run_id__lock_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["RunAction"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_payroll_runs__run_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["RunAction"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    payslip_pdf_admin_payroll_runs__run_id__payslips__payslip_id__pdf_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
                payslip_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_wht_payroll_runs__run_id__exports_wht_csv_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_eobi_payroll_runs__run_id__exports_eobi_csv_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_social_security_payroll_runs__run_id__exports_social_security_csv_get: {
        parameters: {
            query?: {
                scheme?: string;
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_bank_payroll_runs__run_id__exports_bank_csv_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bank_check_payroll_runs__run_id__exports_bank_check_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    salary_certificate_data_payroll_reports_salary_certificate_json_get: {
        parameters: {
            query: {
                employee_id: string;
                tax_year: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    salary_certificate_pdf_payroll_reports_salary_certificate_get: {
        parameters: {
            query: {
                employee_id: string;
                tax_year: string;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_payslips_me_payslips_get: {
        parameters: {
            query?: {
                month?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayslipDetail"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    my_payslip_link_me_payslips__payslip_id__link_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payslip_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayslipLink"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_payslip_payslips_download_get: {
        parameters: {
            query?: {
                token?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_components_payroll_components_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComponentOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_component_payroll_components_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ComponentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComponentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_component_payroll_components__component_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                component_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ComponentUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComponentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_structures_payroll_structures_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StructureOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_structure_payroll_structures_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StructureIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StructureOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_structure_payroll_structures__structure_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                structure_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StructureIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StructureOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_one_offs_payroll_one_offs_get: {
        parameters: {
            query?: {
                month?: string | null;
                employee_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OneOffOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_one_off_payroll_one_offs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OneOffIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OneOffOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_one_off_payroll_one_offs__one_off_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                one_off_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OneOffOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_advances_payroll_advances_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdvanceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_advance_payroll_advances_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdvanceIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdvanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_advance_payroll_advances__advance_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                advance_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdvanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    repay_advance_payroll_advances__advance_id__repay_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                advance_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdvanceRepay"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdvanceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_statutory_payroll_statutory_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatutoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_scheme_payroll_statutory__scheme_code__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scheme_code: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegistrationIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatutoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_categories_pos_categories_get: {
        parameters: {
            query?: {
                include_retired?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_category_pos_categories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_category_pos_categories__category_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    variants_pos_products__product_id__variants_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_barcodes_pos_products__product_id__barcodes_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BarcodeOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_barcode_pos_products__product_id__barcodes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BarcodeIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BarcodeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_barcode_pos_products__product_id__barcodes__barcode_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                product_id: string;
                barcode_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_rules_pos_barcode_rules_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_rule_pos_barcode_rules_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuleIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_rule_pos_barcode_rules__rule_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    adjust_pos_stock_adjustments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdjustmentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdjustmentOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    moves_pos_stock_moves_get: {
        parameters: {
            query?: {
                product_id?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MoveOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_registers_pos_registers_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_register_pos_registers_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_register_pos_registers__register_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                register_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_devices_pos_devices_get: {
        parameters: {
            query?: {
                register_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_device_pos_devices_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceCreated"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    heartbeat_pos_devices__device_id__heartbeat_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Device-Token"?: string | null;
            };
            path: {
                device_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeartbeatIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sessions_pos_sessions_get: {
        parameters: {
            query?: {
                register_id?: string | null;
                status?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_session_pos_sessions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionOpen"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_session_pos_sessions__session_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cash_move_pos_sessions__session_id__cash_moves_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Cashier-Token"?: string | null;
            };
            path: {
                session_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CashMoveIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    close_session_pos_sessions__session_id__close_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionClose"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    z_report_pos_sessions__session_id__z_report_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_my_pin_pos_pin_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PinIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approvers_pos_approvers_get: {
        parameters: {
            query: {
                need: "pos.sale.discount" | "pos.price.override" | "pos.session.approve";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Approver"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    print_receipt_pos_sales__sale_id__print_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sale_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_sale_pos_sales__sale_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sale_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VoidIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VoidOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_held_pos_held_get: {
        parameters: {
            query?: {
                register_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeldOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hold_bill_pos_held_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeldIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeldOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resume_bill_pos_held__held_id__resume_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                held_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeldOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlock_pin_pos_pin_locks__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    balances_khata_get: {
        parameters: {
            query?: {
                owing_only?: boolean;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BalanceRow"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    statement_khata__contact_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Account"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_limit_khata__contact_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LimitIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Account"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    receive_payment_khata__contact_id__payments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                contact_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["app__routers__khata__PaymentIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Account"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sign_in_pos_cashiers_sign_in_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignedIn"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sign_out_pos_cashiers_sign_out_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Cashier-Token"?: string | null;
            };
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cashier_list_pos_cashiers_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sync_orders_pos_sync_orders_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Device-Token"?: string | null;
            };
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SyncIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_delta_pos_catalog_delta_get: {
        parameters: {
            query?: {
                since?: number;
                limit?: number;
                register_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_queue_pos_review_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resolve_pos_review__sale_id__resolve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sale_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResolveIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sales_reports_sales_get: {
        parameters: {
            query: {
                by: "day" | "item" | "cashier" | "method";
                from?: string | null;
                to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    stock_valuation_reports_stock_valuation_get: {
        parameters: {
            query?: {
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    tax_summary_reports_tax_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    attendance_reports_attendance_get: {
        parameters: {
            query?: {
                from?: string | null;
                to?: string | null;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    payroll_reports_payroll_get: {
        parameters: {
            query: {
                run_id: string;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_floors_restaurant_floors_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_floor_restaurant_floors_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FloorIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_floor_restaurant_floors__floor_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                floor_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FloorUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_tables_restaurant_floors__floor_id__tables_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                floor_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TablesIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TableOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_table_restaurant_tables__table_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                table_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TableUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TableOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_stations_restaurant_stations_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StationOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_station_restaurant_stations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StationIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_station_restaurant_stations__station_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                station_id: string;
            };
            cookie?: {
                bos_session?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StationUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
