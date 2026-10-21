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
    "/crm/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Invoices */
        get: operations["list_invoices_crm_invoices_get"];
        put?: never;
        /** Create Invoice */
        post: operations["create_invoice_crm_invoices_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/invoices/{invoice_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve */
        post: operations["approve_crm_invoices__invoice_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/invoices/{invoice_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject */
        post: operations["reject_crm_invoices__invoice_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/crm/invoices/{invoice_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Invoice Pdf */
        get: operations["invoice_pdf_crm_invoices__invoice_id__pdf_get"];
        put?: never;
        post?: never;
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
        /** Lookup */
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
        get?: never;
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
         * @description Freezes the expected figure at close: the shift's reconciliation is
         *     evidence, and a later sale edit must not silently rewrite a signed-off
         *     variance.
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
        /** Get Sale */
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
        get?: never;
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
         * @description Approval needs hrms:admin — with plain write, anyone who could request
         *     leave could approve their own (the audit's separation-of-duties finding).
         */
        post: operations["decide_leave_hrms_leave__leave_id___decision__post"];
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
        /** Create Holiday */
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
    "/hrms/payroll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Run Payroll
         * @description Monthly payslips: gross − absence deduction − FBR tax. `month` = YYYY-MM.
         *     Everyone's pay is on it, so it needs a payroll key, not hrms:read (D-42).
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
         * @description An employee requests their own leave. The employee_id in the body is
         *     ignored — it is forced to the caller, so nobody can file against someone
         *     else. Approval still belongs to an admin (hrms:admin).
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
    "/me/payslips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** My Payslips */
        get: operations["my_payslips_me_payslips_get"];
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
        /** Alert */
        Alert: {
            /** Text */
            text: string;
            /** Href */
            href: string;
            /** Tone */
            tone: string;
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
        };
        /** EmployeeUpdate */
        EmployeeUpdate: {
            /** Name */
            name?: string | null;
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
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
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
        /** InvoiceCreate */
        InvoiceCreate: {
            /** Contact Id */
            contact_id?: string | null;
            /** Lead Id */
            lead_id?: string | null;
            /** Amount Minor */
            amount_minor: number;
            /**
             * Discount Pct
             * @default 0
             */
            discount_pct: number;
            /**
             * Notes
             * @default
             */
            notes: string;
        };
        /** InvoiceOut */
        InvoiceOut: {
            /** Id */
            id: string;
            /** Lead Id */
            lead_id: string | null;
            /** Lead Name */
            lead_name: string | null;
            /** Contact Id */
            contact_id: string | null;
            /** Contact Name */
            contact_name: string | null;
            /** Bill To */
            bill_to: string;
            /** Amount Minor */
            amount_minor: number;
            /** Discount Pct */
            discount_pct: number;
            /** Total Minor */
            total_minor: number;
            /** Notes */
            notes: string;
            /** Status */
            status: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Decided At */
            decided_at: string | null;
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
        };
        /** LeaveBalance */
        LeaveBalance: {
            /** Leave Type */
            leave_type: string;
            /** Quota */
            quota: number;
            /** Used */
            used: number;
            /** Remaining */
            remaining: number;
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
             * @enum {string}
             */
            leave_type: "annual" | "sick" | "casual" | "unpaid";
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
        /** MethodTotal */
        MethodTotal: {
            /** Payment Method */
            payment_method: string;
            /** Count */
            count: number;
            /** Total Minor */
            total_minor: number;
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
        /** NoteCreate */
        NoteCreate: {
            /** Body */
            body: string;
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
        /** PayrollOut */
        PayrollOut: {
            /** Month */
            month: string;
            /** Working Days */
            working_days: number;
            /** Payslips */
            payslips: components["schemas"]["Payslip"][];
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
        };
        /** Payslip */
        Payslip: {
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
            cost_minor: number;
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
        /** ResetRequest */
        ResetRequest: {
            /** Token */
            token: string;
            /** Password */
            password: string;
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
            payment_method: "cash" | "card" | "jazzcash" | "easypaisa" | "bank";
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
            payment_method: "cash" | "card" | "jazzcash" | "easypaisa" | "bank";
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
    list_invoices_crm_invoices_get: {
        parameters: {
            query?: {
                status_filter?: string | null;
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
                    "application/json": components["schemas"]["InvoiceOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_invoice_crm_invoices_post: {
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
                    "application/json": components["schemas"]["InvoiceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_crm_invoices__invoice_id__approve_post: {
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
                    "application/json": components["schemas"]["InvoiceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_crm_invoices__invoice_id__reject_post: {
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
                    "application/json": components["schemas"]["InvoiceOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invoice_pdf_crm_invoices__invoice_id__pdf_get: {
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
    list_products_pos_products_get: {
        parameters: {
            query?: {
                q?: string | null;
                include_archived?: boolean;
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
    checkout_pos_sales_post: {
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
    list_leave_hrms_leave_get: {
        parameters: {
            query?: {
                request_type?: ("leave" | "wfh") | null;
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
    list_holidays_hrms_holidays_get: {
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
                    "application/json": components["schemas"]["PayrollOut"];
                };
            };
            /** @description Validation Error */
            422: {
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
    my_checkin_me_attendance_checkin_post: {
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
        requestBody?: never;
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
                    "application/json": components["schemas"]["Payslip"][];
                };
            };
            /** @description Validation Error */
            422: {
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
}
