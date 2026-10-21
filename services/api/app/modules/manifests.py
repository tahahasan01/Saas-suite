"""One manifest per module (D-01). Adding a module is one more entry here.

Nav `key`s match the web shell's module keys (apps/web/lib/modules.ts); the
server decides *which* entries a caller sees (manifests ∩ enabled modules ∩
held keys), the web decides how they look.
"""
from __future__ import annotations

from .spec import FieldGuard, ModuleSpec, NavChild, NavItem

_MANIFESTS = [
    ModuleSpec(
        "core", "Workspace", "Team, roles, modules, billing and automations.",
        always_on=True,
        jobs=("email.outbox", "ops.monitor", "ops.prune", "audit.partitions", "audit.retention",
              "audit.detach", "modules.purge", "files.gc"),
        nav=(
            NavItem("dashboard", "/dashboard", "nav.dashboard", "gauge", "overview"),
            NavItem("automations", "/automations", "nav.automations", "workflow", "admin",
                    perm="settings.workflows.read"),
            NavItem("settings", "/settings/team", "nav.settings", "settings", "admin",
                    perm="settings.team.read",
                    children=(
                        NavChild("/settings/team", "nav.settings.team", "settings.team.read"),
                        NavChild("/settings/roles", "nav.settings.roles", "settings.roles.manage"),
                        NavChild("/settings/sections", "nav.settings.modules", "settings.team.read"),
                        NavChild("/settings/billing", "nav.settings.billing", "settings.team.read"),
                        NavChild("/settings/fbr", "nav.settings.fbr", "fbr.settings.read"),
                        NavChild("/settings/company", "nav.settings.company", "settings.company.read"),
                        NavChild("/settings/profile", "nav.settings.profile"),
                    )),
        ),
    ),
    ModuleSpec(
        "contacts", "Customers", "The people and businesses you sell to.",
        depends=("core",),
        nav=(
            NavItem("contacts", "/contacts", "nav.contacts", "book-user", "sell", perm="contacts.contact.read",
                    children=(
                        NavChild("/contacts", "nav.contacts.all", "contacts.contact.read"),
                        NavChild("/contacts/review", "nav.contacts.review", "contacts.contact.update"),
                    )),
        ),
    ),
    ModuleSpec(
        "products", "Products", "Your catalogue, prices and stock.",
        depends=("core",),
        field_guards=(FieldGuard("products.product", "cost_minor", "products.cost.read",
                                 "products.cost.update"),),
    ),
    ModuleSpec(
        "crm", "Sales / CRM", "Leads, pipeline, follow-ups and invoice requests.",
        application=True, depends=("contacts",),
        # Invoice requests are a CRM feature until invoices v2 (3E) moves them.
        claims=("invoicing.invoice.*", "invoicing.payment.*"),
        scoped={"crm.lead": "owner_id"},
        jobs=("crm.followup_reminders", "crm.activity_overdue"),
        purge_tables=("crm_leads",),
        nav=(
            NavItem("crm", "/crm", "nav.crm", "kanban", "sell", perm="crm.lead.read",
                    children=(
                        NavChild("/crm", "nav.crm.pipeline", "crm.lead.read"),
                        NavChild("/crm/reports", "nav.crm.reports", "crm.report.read"),
                        NavChild("/crm/settings", "nav.crm.settings", "crm.settings.manage"),
                    )),
            NavItem("my-day", "/my-day", "nav.my_day", "calendar-check", "overview", perm="crm.lead.read"),
            NavItem("invoices", "/invoices", "nav.invoices", "file-text", "sell",
                    perm="invoicing.invoice.read"),
        ),
    ),
    ModuleSpec(
        "pos", "POS & inventory", "Register, cash drawer, returns and stock.",
        application=True, depends=("products", "contacts"),
        scoped={"pos.sale": "cashier_id"},
        sequences=("pos.sale", "pos.return"),
        jobs=("pos.restock_alerts",),
        nav=(
            NavItem("pos", "/pos", "nav.pos", "cart", "sell", perm="pos.sale.read",
                    children=(
                        NavChild("/pos", "nav.pos.register", "pos.sale.create"),
                        NavChild("/pos/products", "nav.pos.products", "products.product.read"),
                        NavChild("/pos/purchase-orders", "nav.pos.purchase_orders", "purchasing.po.read"),
                        NavChild("/pos/drawer", "nav.pos.drawer", "pos.session.read"),
                        NavChild("/pos/returns", "nav.pos.returns", "pos.sale.read"),
                        NavChild("/pos/insights", "nav.pos.insights", "pos.report.sales"),
                    )),
        ),
    ),
    ModuleSpec(
        "purchasing", "Purchasing", "Suppliers and purchase orders.",
        depends=("pos",), auto_enable=("pos",),
        sequences=("purchase.order",),
    ),
    ModuleSpec(
        "fbr", "FBR invoicing", "Real-time POS invoices to FBR (PRAL).",
        depends=("pos",), auto_enable=("pos",),
        jobs=("fbr.outbox",),
    ),
    ModuleSpec(
        "invoicing", "Invoices", "Quotations and tax invoices (invoices v2).",
        application=True, depends=("contacts", "products"),
        sequences=("sales.invoice", "sales.credit_note"),
        jobs=("invoicing.overdue_reminders",),
    ),
    ModuleSpec(
        "hrms", "Staff / HRMS", "Employees, attendance, shifts and leave.",
        application=True, depends=("core",),
        jobs=("hrms.finalise_open_days", "hrms.auto_checkout", "hrms.leave_entitlements"),
        field_guards=(
            # CNIC rides on the payroll grant (D-42) until hrms.employee.pii.read lands.
            FieldGuard("hrms.employee", "cnic", "payroll.salary.read", "hrms.employee.update"),
        ),
        nav=(
            NavItem("hrms", "/hrms", "nav.hrms", "users", "people", perm="hrms.employee.read",
                    children=(
                        NavChild("/hrms", "nav.hrms.team", "hrms.employee.read"),
                        NavChild("/hrms/attendance", "nav.hrms.attendance", "hrms.attendance.read"),
                        NavChild("/hrms/leave", "nav.hrms.leave", "hrms.leave.read"),
                        NavChild("/hrms/holidays", "nav.hrms.holidays", "hrms.leave.read"),
                        NavChild("/hrms/employees/setup", "nav.hrms.org", "hrms.org.manage"),
                        NavChild("/hrms/employees/documents", "nav.hrms.documents", "hrms.document.read"),
                        NavChild("/hrms/kiosk", "nav.hrms.kiosks", "hrms.kiosk.manage"),
                    )),
        ),
    ),
    ModuleSpec(
        "payroll", "Payroll", "Salaries, payroll runs and payslips.",
        depends=("hrms",), auto_enable=("hrms",),
        field_guards=(FieldGuard("hrms.employee", "salary_minor", "payroll.salary.read",
                                 "payroll.salary.update"),),
        sequences=("payroll.payslip",),
        jobs=("payroll.calculate",),
        nav=(NavItem("payroll", "/hrms/payroll", "nav.payroll", "banknote", "people",
                     perm="payroll.run.read"),),
    ),
    ModuleSpec(
        "pos_hrms", "Cashiers are staff", "Cashier sign-in with the employee PIN.",
        depends=("pos", "hrms"), auto_enable=("pos", "hrms"),
    ),
]

MODULES: dict[str, ModuleSpec] = {m.key: m for m in _MANIFESTS}
