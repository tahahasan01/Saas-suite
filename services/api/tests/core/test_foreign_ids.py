"""Every id a write endpoint accepts must belong to the caller's tenant
(checklist 1H, gates S1/S12, TR-API-05).

Rather than a hand-written case per endpoint, this walks the OpenAPI schema:
for every POST/PUT/PATCH/DELETE and every id it takes — path parameters and
body fields, nested ones like items[].product_id included — it sends a
request that is valid in every other respect but carries ANOTHER tenant's
real id in that one slot. None may succeed. A new endpoint is covered the
day it ships; a new kind of id fails here until a fixture for it is added.
"""
from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import _drop, _signup

PASSWORD = "Sup3rSecret!23"

# Field or path-parameter name -> the kind of record it points at.
KIND_OF = {
    "role_id": "role", "user_id": "user", "owner_id": "user",
    "pipeline_id": "pipeline", "stage_id": "stage", "lead_id": "lead",
    "workflow_id": "workflow", "invoice_id": "invoice",
    "product_id": "product", "supplier_id": "supplier", "po_id": "po", "po_item_id": "po_item",
    "sale_id": "sale", "sale_item_id": "sale_item",
    "employee_id": "employee", "leave_id": "leave", "holiday_id": "holiday",
    "request_id": "payment_request", "shift_id": "shift",
    # payroll (3F)
    "run_id": "payroll_run", "payslip_id": "payslip", "component_id": "pay_component",
    "structure_id": "pay_structure", "one_off_id": "one_off", "advance_id": "advance",
}

# Path parameters that are not ids: a fixed, valid value. (scheme_code names
# platform reference data — EOBI, PESSI — shared by every tenant.)
PLAIN_PARAMS = {"section": "crm", "decision": "approve", "scheme_code": "EOBI"}

# The /me/* portal never takes an id from the caller — it acts on the logged-in
# employee only (tests/hrms/test_employee_portal.py proves the forcing).
SKIP_PREFIXES = ("/me/",)


async def _ids(c: AsyncClient) -> dict[str, str]:
    """One real record of every kind, in the tenant `c` is logged in to."""
    pipeline = (await c.get("/crm/pipelines")).json()[0]
    lead = (await c.get("/crm/leads")).json()[0]
    product = (await c.get("/pos/products")).json()[0]
    employee = (await c.get("/hrms/employees")).json()[0]
    supplier = (await c.post("/pos/suppliers", json={"name": "Supplier"})).json()
    po = (await c.post("/pos/purchase-orders", json={
        "supplier_id": supplier["id"], "items": [{"product_id": product["id"], "qty": 1}]})).json()
    sale = (await c.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                             "payment_method": "card", "paid_minor": 10_000_000})).json()
    detail = (await c.get(f"/pos/sales/{sale['id']}")).json()
    leave = (await c.post("/hrms/leave", json={"employee_id": employee["id"], "leave_type": "casual",
                                               "from_date": "2027-03-01", "to_date": "2027-03-01"})).json()
    holiday = (await c.post("/hrms/holidays", json={"holiday_date": "2027-03-23",
                                                    "name": "Pakistan Day"})).json()
    invoice = (await c.post("/crm/invoices", json={"lead_id": lead["id"], "amount_minor": 1000})).json()
    workflow = (await c.post("/workflows", json={"name": "Probe", "trigger": "lead.created"})).json()
    payment = (await c.post("/billing/upgrade", json={"plan": "growth"})).json()
    shift = (await c.post("/hrms/shifts", json={"name": "Day"})).json()
    run = (await c.post("/payroll/runs", json={"month": "2026-09"})).json()
    component = (await c.post("/payroll/components", json={"code": "FUEL", "name": "Fuel"})).json()
    structure = (await c.post("/payroll/structures", json={"name": "Probe",
                                                           "component_ids": [component["id"]]})).json()
    one_off = (await c.post("/payroll/one-offs", json={"employee_id": employee["id"], "month": "2026-09",
                                                       "name": "Bonus", "amount_minor": 100})).json()
    advance = (await c.post("/payroll/advances", json={"employee_id": employee["id"], "principal_minor": 100,
                                                       "installment_minor": 100, "start_month": "2026-09"})).json()
    return {
        "payroll_run": run["id"], "pay_component": component["id"], "pay_structure": structure["id"],
        "one_off": one_off["id"], "advance": advance["id"],
        # No payslip exists before a run is calculated; any id stands in (it must still 404).
        "payslip": str(uuid.uuid4()),
        "shift": shift["id"],
        "role": (await c.get("/team/roles")).json()[0]["id"],
        "user": (await c.get("/auth/me")).json()["user"]["id"],
        "pipeline": pipeline["id"], "stage": pipeline["stages"][0]["id"], "lead": lead["id"],
        "workflow": workflow["id"], "invoice": invoice["id"],
        "product": product["id"], "supplier": supplier["id"],
        "po": po["id"], "po_item": po["items"][0]["id"],
        "sale": sale["id"], "sale_item": detail["returnable"][0]["sale_item_id"],
        "employee": employee["id"], "leave": leave["id"], "holiday": holiday["id"],
        "payment_request": payment["payment_request_id"],
    }


@pytest_asyncio.fixture
async def theirs():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        tenant_id = await _signup(c, ["crm", "pos", "hrms"])
        ids = await _ids(c)
        yield ids
    await _drop(tenant_id)


@pytest_asyncio.fixture
async def mine(client):
    tenant_id = await _signup(client, ["crm", "pos", "hrms"])
    yield await _ids(client)
    await _drop(tenant_id)


# ── Building a valid request from the schema ────────────────────────────────
_SCHEMA = app.openapi()


def _resolve(schema: dict) -> dict:
    if "$ref" in schema:
        return _SCHEMA["components"]["schemas"][schema["$ref"].rsplit("/", 1)[1]]
    if "anyOf" in schema:  # Optional[X] -> X
        return _resolve(next(s for s in schema["anyOf"] if s.get("type") != "null"))
    return schema


def _value(name: str, schema: dict, own: dict):
    """A plausible value for a required field, using the caller's own ids."""
    schema = _resolve(schema)
    if name in KIND_OF:
        return own[KIND_OF[name]]
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        return _body(schema, own)
    if t == "array":
        return [_value(name, schema.get("items", {}), own)]
    if t in ("integer", "number"):
        return max(1, schema.get("minimum", 1))
    if t == "boolean":
        return False
    if name == "email":
        return f"probe+{uuid.uuid4().hex[:8]}@example.com"
    if name == "password":
        return PASSWORD
    if schema.get("format") == "date":
        return "2027-04-05"
    return "Probe"


def _body(schema: dict, own: dict) -> dict:
    schema = _resolve(schema)
    props = schema.get("properties", {})
    body = {k: _value(k, props[k], own) for k in schema.get("required", [])}
    if not body and "name" in props:
        # An all-optional PATCH needs one change, or it is refused as "nothing
        # to update" before the id is even looked at.
        body["name"] = "Probe"
    return body


def _id_slots(schema: dict, path: tuple = ()) -> list[tuple]:
    """Every id field in a body schema, as a path of keys ('items', 0, 'product_id')."""
    schema = _resolve(schema)
    slots = []
    for k, sub in schema.get("properties", {}).items():
        sub = _resolve(sub)
        if k in KIND_OF:
            slots.append(path + (k,))
        elif sub.get("type") == "array" and "properties" in _resolve(sub.get("items", {})):
            slots += _id_slots(sub["items"], path + (k, 0))
    return slots


def _set(body: dict, slot: tuple, value: str, schema: dict, own: dict) -> None:
    """Put `value` at `slot`, creating optional parents from the schema."""
    node, sch = body, _resolve(schema)
    for key in slot[:-1]:
        if isinstance(key, int):
            sch = _resolve(sch["items"])
            if not node:
                node.append(_body(sch, own))
            node = node[key]
        else:
            sch = _resolve(sch["properties"][key])
            node = node.setdefault(key, [] if sch.get("type") == "array" else {})
    node[slot[-1]] = value


def _cases():
    """(method, path template, slot) for every id of every write endpoint."""
    for path, ops in _SCHEMA["paths"].items():
        if path.startswith(SKIP_PREFIXES):
            continue
        for method, op in ops.items():
            if method not in ("post", "put", "patch", "delete"):
                continue
            body_schema = (op.get("requestBody", {}).get("content", {})
                           .get("application/json", {}).get("schema"))
            params = [p["name"] for p in op.get("parameters", []) if p["in"] == "path"]
            for p in params:
                if p not in PLAIN_PARAMS:
                    yield method, path, op, body_schema, ("path", p)
            for slot in _id_slots(body_schema) if body_schema else []:
                yield method, path, op, body_schema, ("body", slot)


def test_every_id_kind_has_a_fixture():
    """A new id field must be taught to this test (KIND_OF) before it ships."""
    unknown = {s[1] for *_, s in _cases() if s[0] == "path" and s[1] not in KIND_OF}
    unknown |= {s[1][-1] for *_, s in _cases() if s[0] == "body" and s[1][-1] not in KIND_OF}
    assert not unknown


async def test_no_write_endpoint_accepts_another_tenants_id(client, mine, theirs):
    failures, tried = [], 0
    for method, template, op, body_schema, (where, slot) in _cases():
        params = {p["name"]: (PLAIN_PARAMS.get(p["name"]) or mine[KIND_OF[p["name"]]])
                  for p in op.get("parameters", []) if p["in"] == "path"}
        body = _body(body_schema, mine) if body_schema else None
        if where == "path":
            params[slot] = theirs[KIND_OF[slot]]
            label = f"{{{slot}}}"
        else:
            _set(body, slot, theirs[KIND_OF[slot[-1]]], body_schema, mine)
            label = ".".join(str(k) for k in slot)
        url = template.format(**params)
        r = await client.request(method.upper(), url, json=body)
        tried += 1
        detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
        if r.is_success:
            failures.append(f"{method.upper()} {template} [{label}] -> {r.status_code}: accepted a foreign id")
        elif r.status_code == 422 and isinstance(detail, list):
            # A schema error means the probe was malformed, so the id was never tested.
            failures.append(f"{method.upper()} {template} [{label}] -> probe body invalid: {detail}")
        elif r.status_code not in (403, 404, 422):
            failures.append(f"{method.upper()} {template} [{label}] -> {r.status_code}: {detail}")
    assert tried > 30  # the walk really ran
    assert not failures, "\n".join(failures)
