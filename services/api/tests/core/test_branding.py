"""Tenant branding Level 1 (D-12, migration 0057): logo, colours, document
headers. Colours are checked and turned into theme tokens on the server so
a tenant can't make the UI unreadable."""
from __future__ import annotations

import io
import uuid

import asyncpg
import pytest
from PIL import Image

from app import branding, storage
from app.config import settings

from .test_me_permissions import _member


@pytest.fixture(autouse=True)
def _local_store(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_store", storage.LocalStorage(root=tmp_path, secret=b"t", public_base="/api"))


def _png(color=(15, 118, 110)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(buf, "PNG")
    return buf.getvalue()


async def _logo(client, data: bytes | None = None, name: str = "logo.png", purpose: str = "logo") -> str:
    r = await client.post("/files", params={"name": name, "purpose": purpose}, content=data or _png())
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Colour maths ────────────────────────────────────────────────────────────
def test_contrast_ratio_matches_wcag():
    assert round(branding.contrast("#000000", "#ffffff"), 1) == 21.0
    assert round(branding.contrast("#777777", "#ffffff"), 2) == 4.48


def test_readable_text_colour_is_picked():
    assert branding.on_color("#0f766e") == "#ffffff"
    assert branding.on_color("#facc15") == "#000000"


def test_tokens_form_a_light_to_dark_scale():
    t = branding.tokens("#0f766e", None)
    assert t["primary"] == "#0f766e" and t["on_primary"] == "#ffffff"
    lightness = [branding.oklch(t[f"primary_{s}"])[0] for s in (50, 100, 200, 300, 400, 500, 600, 700, 800, 900)]
    assert lightness == sorted(lightness, reverse=True)
    assert "accent" in t  # falls back to the primary when unset


def test_oklch_round_trip():
    for hexc in ("#0f766e", "#e11d48", "#1d4ed8", "#ffffff", "#000000"):
        assert branding.from_oklch(*branding.oklch(hexc)) == hexc


# ── API ─────────────────────────────────────────────────────────────────────
async def test_defaults(client, crm_tenant):
    r = await client.get("/org/branding")
    assert r.status_code == 200
    b = r.json()
    assert b["logo_file_id"] is None and b["primary_color"] is None and b["layout"] == "classic"
    assert b["receipt_width_mm"] == 80 and b["tokens"]["primary"].startswith("#")


async def test_colours_and_headers_round_trip(client, crm_tenant):
    r = await client.put("/org/branding", json={
        "primary_color": "#0F766E", "accent_color": "#e11d48", "receipt_header": "Karachi Mart",
        "receipt_footer": "Shukriya! Exchange within 7 days.", "invoice_header": "Karachi Mart (Pvt) Ltd",
        "invoice_footer": "Bank: Meezan 0101", "payslip_header": "Karachi Mart payroll",
        "receipt_width_mm": 58, "layout": "compact"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["primary_color"] == "#0f766e" and b["tokens"]["on_primary"] == "#ffffff"
    assert b["receipt_width_mm"] == 58 and b["layout"] == "compact"
    assert b["receipt_footer"].startswith("Shukriya")
    v1 = b["version"]
    r = await client.put("/org/branding", json={"receipt_header": "KM"})
    assert r.json()["version"] == v1 + 1 and r.json()["primary_color"] == "#0f766e"


async def test_unreadable_colours_are_refused(client, crm_tenant):
    # Pale yellow on a white page: links and borders in it would vanish.
    r = await client.put("/org/branding", json={"primary_color": "#fffbe6"})
    assert r.status_code == 422
    for bad in ({"primary_color": "teal"}, {"accent_color": "#12345"}, {"receipt_width_mm": 72},
                {"layout": "fancy"}):
        assert (await client.put("/org/branding", json=bad)).status_code == 422, bad


async def test_logo_upload_attach_replace_and_clear(client, crm_tenant):
    first = await _logo(client)
    r = await client.put("/org/branding", json={"logo_file_id": first})
    assert r.status_code == 200, r.text
    assert r.json()["logo_file_id"] == first
    # The logo is shown to everyone in the tenant, not just whoever uploaded it.
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        assert (await mate.get(f"/files/{first}")).status_code == 302
        assert (await mate.get("/org/branding")).json()["logo_file_id"] == first
    finally:
        await mate.aclose()
    assert (await client.get("/org/company")).json()["logo_file_id"] == first

    second = await _logo(client, _png((200, 10, 10)))
    r = await client.put("/org/branding", json={"logo_file_id": second})
    assert r.json()["logo_file_id"] == second
    conn = await asyncpg.connect(settings.database_url)
    try:
        old = await conn.fetchrow("select entity, draft_since from files where id=$1", uuid.UUID(first))
    finally:
        await conn.close()
    assert old["entity"] is None and old["draft_since"] is not None  # back to a draft; GC takes it

    r = await client.put("/org/branding", json={"clear_logo": True})
    assert r.json()["logo_file_id"] is None


async def test_a_logo_must_be_an_image_the_caller_uploaded(client, crm_tenant):
    pdf = await _logo(client, b"%PDF-1.7\n%%EOF\n", "x.pdf", purpose="attachment")
    assert (await client.put("/org/branding", json={"logo_file_id": pdf})).status_code == 422
    assert (await client.put("/org/branding", json={"logo_file_id": str(uuid.uuid4())})).status_code == 422


async def test_only_settings_admins_change_branding(client, crm_tenant):
    mate, _ = await _member(client, {"crm": ["write"], "settings": ["read"]})
    try:
        assert (await mate.put("/org/branding", json={"receipt_header": "x"})).status_code == 403
    finally:
        await mate.aclose()


async def test_branding_changes_are_audited(client, crm_tenant):
    await client.put("/org/branding", json={"receipt_footer": "Thanks"})
    conn = await asyncpg.connect(settings.database_url)
    try:
        n = await conn.fetchval("select count(*) from audit_log where tenant_id=$1 and entity='tenant_branding'",
                                uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()
    assert n >= 1
