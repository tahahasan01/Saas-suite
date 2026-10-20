/* Generated from services/api's OpenAPI schema by packages/api-client/scripts/generate.mjs.
 * Do not edit by hand: run `npm run api-client:generate`. CI fails when this is stale. */

export interface paths {
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
        /** Forgot */
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
        /** Invite Member */
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
        post?: never;
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
    "/crm/leads/{lead_id}/interactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Log Interaction */
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
            /** Lead Id */
            lead_id: string;
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
            lead_id: string;
            /** Lead Name */
            lead_name: string;
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
             * Force
             * @default false
             */
            force: boolean;
        };
        /** LeadDetail */
        LeadDetail: {
            lead: components["schemas"]["LeadOut"];
            /** Interactions */
            interactions: components["schemas"]["InteractionOut"][];
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
            locale: components["schemas"]["LocaleOut"];
            /**
             * Employee Portal
             * @default false
             */
            employee_portal: boolean;
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
        /** RoleCreate */
        RoleCreate: {
            /** Name */
            name: string;
            /** Permissions */
            permissions?: {
                [key: string]: string[];
            };
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
            trigger: "lead.created" | "lead.stage_changed" | "interaction.logged";
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
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
}
