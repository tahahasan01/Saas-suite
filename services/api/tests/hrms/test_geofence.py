"""Server-side geofence and network checks on punches (D-43, TR-DOM-52,
QA-H09). The client's coordinates and `mock_gps` are evidence; the decision
is the server's, per the employee's work location."""
from __future__ import annotations

import uuid

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import geofence
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

from .test_employee_portal import _link_login

STORE = (31.5204, 74.3587)            # a point in Lahore
NEAR = (31.5208, 74.3590)             # ~50 m away
FAR = (31.5497, 74.3436)              # ~3.5 km away


# ── The pure check ──────────────────────────────────────────────────────────
def _loc(**kw):
    base = dict(name="Store", lat=STORE[0], lng=STORE[1], radius_m=150, allowed_cidrs=[],
                geo_mode="record", ip_mode="off")
    return geofence.Site(**{**base, **kw})


def test_distance_is_haversine():
    assert 40 < geofence.distance_m(*STORE, *NEAR) < 60
    assert 3000 < geofence.distance_m(*STORE, *FAR) < 4000


def test_inside_outside_and_no_fix():
    assert geofence.check(_loc(), lat=NEAR[0], lng=NEAR[1], accuracy_m=20, ip="1.2.3.4").geo_status == "inside"
    assert geofence.check(_loc(), lat=FAR[0], lng=FAR[1], accuracy_m=20, ip="1.2.3.4").geo_status == "outside"
    # No coordinates, or accuracy worse than the radius, is no fix — never inside.
    assert geofence.check(_loc(), lat=None, lng=None, accuracy_m=None, ip="1.2.3.4").geo_status == "no_fix"
    assert geofence.check(_loc(), lat=NEAR[0], lng=NEAR[1], accuracy_m=500, ip="1.2.3.4").geo_status == "no_fix"


def test_record_mode_flags_but_allows_and_require_refuses():
    out = geofence.check(_loc(geo_mode="record"), lat=FAR[0], lng=FAR[1], accuracy_m=10, ip="1.2.3.4")
    assert out.refusal is None and out.geo_status == "outside"
    out = geofence.check(_loc(geo_mode="require"), lat=FAR[0], lng=FAR[1], accuracy_m=10, ip="1.2.3.4")
    assert out.refusal and "Store" in out.refusal
    out = geofence.check(_loc(geo_mode="require"), lat=None, lng=None, accuracy_m=None, ip="1.2.3.4")
    assert out.refusal                                  # no fix is not good enough when required
    assert geofence.check(_loc(geo_mode="off"), lat=None, lng=None, accuracy_m=None,
                          ip="1.2.3.4").geo_status == "not_required"


def test_network_rule():
    site = _loc(geo_mode="off", ip_mode="require", allowed_cidrs=["203.0.113.0/24"])
    assert geofence.check(site, lat=None, lng=None, accuracy_m=None, ip="203.0.113.9").ip_status == "allowed"
    out = geofence.check(site, lat=None, lng=None, accuracy_m=None, ip="198.51.100.1")
    assert out.ip_status == "outside" and out.refusal
    assert geofence.check(_loc(), lat=None, lng=None, accuracy_m=None, ip="x").ip_status == "not_required"


def test_mock_gps_is_a_flag_not_a_pass():
    out = geofence.check(_loc(geo_mode="require"), lat=FAR[0], lng=FAR[1], accuracy_m=5, ip="1.2.3.4",
                         mock_gps=True)
    assert "mock_gps" in out.risk_flags and out.refusal
    out = geofence.check(_loc(geo_mode="require"), lat=NEAR[0], lng=NEAR[1], accuracy_m=5, ip="1.2.3.4",
                         mock_gps=True)
    assert "mock_gps" in out.risk_flags and out.refusal is None   # flagged for review only


def test_no_location_means_nothing_is_required():
    out = geofence.check(None, lat=None, lng=None, accuracy_m=None, ip="1.2.3.4")
    assert (out.geo_status, out.ip_status, out.refusal) == ("not_required", "not_required", None)


# ── Through the portal punch ────────────────────────────────────────────────
@pytest_asyncio.fixture
async def portal(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"geo+{uuid.uuid4().hex[:8]}@example.com")
    emp = AsyncClient(transport=ASGITransport(app=app, client=("127.0.0.1", 5000)), base_url="http://test",
                      cookies={SESSION_COOKIE: token})
    yield emp
    await emp.aclose()


async def _place(client, tenant, **loc) -> str:
    r = await client.post("/hrms/locations", json={"name": f"Site {uuid.uuid4().hex[:4]}", "lat": STORE[0],
                                                   "lng": STORE[1], "radius_m": 150, **loc})
    assert r.status_code == 201, r.text
    lid = r.json()["id"]
    assert (await client.patch(f"/hrms/employees/{tenant.employee_id}/job",
                               json={"location_id": lid})).status_code == 200
    return lid


async def _punches(tenant):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(
            "select kind, method, geo_status, ip_status, risk_flags, accuracy_m, host(ip) as ip, location_id "
            "from hrms_punches where employee_id=$1 order by at", uuid.UUID(tenant.employee_id))
    finally:
        await conn.close()


async def test_a_required_geofence_refuses_a_punch_from_far_away(client, tenant, portal):
    await _place(client, tenant, geo_mode="require")
    r = await portal.post("/me/attendance/punch", json={"lat": FAR[0], "lng": FAR[1], "accuracy_m": 10})
    assert r.status_code == 403
    assert "m from" in r.json()["detail"]
    assert await _punches(tenant) == []                         # nothing recorded
    # The legacy check-in route is held to the same rule.
    r = await portal.post("/me/attendance/checkin", json={"lat": FAR[0], "lng": FAR[1], "accuracy_m": 10})
    assert r.status_code == 403
    r = await portal.post("/me/attendance/checkin")
    assert r.status_code == 403                                  # no coordinates: no fix


async def test_inside_the_geofence_punches_in_then_out(client, tenant, portal):
    await _place(client, tenant, geo_mode="require")
    r = await portal.post("/me/attendance/punch", json={"lat": NEAR[0], "lng": NEAR[1], "accuracy_m": 15})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "in"
    r = await portal.post("/me/attendance/punch", json={"lat": NEAR[0], "lng": NEAR[1], "accuracy_m": 15})
    assert r.json()["kind"] == "out"
    rows = await _punches(tenant)
    assert [(p["kind"], p["geo_status"]) for p in rows] == [("in", "inside"), ("out", "inside")]
    assert rows[0]["ip"] == "127.0.0.1" and rows[0]["accuracy_m"] == 15
    assert rows[0]["method"] == "self" and rows[0]["location_id"] is not None


async def test_record_mode_keeps_the_punch_and_flags_it(client, tenant, portal):
    await _place(client, tenant, geo_mode="record")
    r = await portal.post("/me/attendance/punch",
                          json={"lat": FAR[0], "lng": FAR[1], "accuracy_m": 10, "mock_gps": True})
    assert r.status_code == 201
    row = (await _punches(tenant))[0]
    assert row["geo_status"] == "outside" and "mock_gps" in row["risk_flags"]
    att = (await client.get("/hrms/attendance")).json()
    mine = next(a for a in att if a["employee_id"] == tenant.employee_id)
    assert mine["geo_status"] == "outside" and mine["fraud_flag"] == "mock_gps"


async def test_the_office_network_rule(client, tenant, portal):
    await _place(client, tenant, geo_mode="off", ip_mode="require", allowed_cidrs=["10.0.0.0/8"])
    r = await portal.post("/me/attendance/punch", json={})
    assert r.status_code == 403 and "network" in r.json()["detail"]
    lid = (await client.get(f"/hrms/employees/{tenant.employee_id}")).json()["location_id"]
    await client.patch(f"/hrms/locations/{lid}", json={"allowed_cidrs": ["127.0.0.0/8"]})
    r = await portal.post("/me/attendance/punch", json={})
    assert r.status_code == 201
    assert (await _punches(tenant))[0]["ip_status"] == "allowed"


async def test_without_a_location_punches_still_work_and_record_no_rule(client, tenant, portal):
    r = await portal.post("/me/attendance/punch", json={})
    assert r.status_code == 201
    row = (await _punches(tenant))[0]
    assert (row["geo_status"], row["ip_status"]) == ("not_required", "not_required")
