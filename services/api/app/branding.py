"""Tenant branding Level 1 (D-12, migration 0057): logo, colours, document
headers, and the theme tokens the web injects as CSS variables.

Colours are checked here so a tenant can't make the UI unreadable:
  * a brand colour must stand out from a white page by at least 3:1
    (WCAG 1.4.11, non-text contrast: links, borders, focus rings);
  * the text drawn on it (`on_primary`) is white or black, whichever reads
    better, and that pair always clears 4.5:1 for these colours.
The 50–900 scale keeps the colour's hue and chroma (OKLCH) and steps its
lightness, so tints look like the same colour.
"""
from __future__ import annotations

import math
from typing import Any

import asyncpg

from . import files

DEFAULT_PRIMARY = "#0f766e"   # the shell's teal (D-90)
MIN_PAGE_CONTRAST = 3.0
_STEPS = {50: 0.97, 100: 0.93, 200: 0.87, 300: 0.79, 400: 0.70, 500: 0.61, 600: 0.53, 700: 0.45,
          800: 0.37, 900: 0.29}


# ── sRGB, luminance, contrast ───────────────────────────────────────────────
def _rgb(hexc: str) -> tuple[float, float, float]:
    h = hexc.lstrip("#")
    return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gamma(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def luminance(hexc: str) -> float:
    r, g, b = (_lin(c) for c in _rgb(hexc))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def on_color(hexc: str) -> str:
    return "#ffffff" if contrast(hexc, "#ffffff") >= contrast(hexc, "#000000") else "#000000"


def check(hexc: str) -> None:
    """ValueError when a brand colour would disappear on a white page."""
    if contrast(hexc, "#ffffff") < MIN_PAGE_CONTRAST:
        raise ValueError(f"{hexc} is too light to read on a white page; pick a deeper shade")


# ── OKLCH (Björn Ottosson's OKLab) ──────────────────────────────────────────
def oklch(hexc: str) -> tuple[float, float, float]:
    r, g, b = (_lin(c) for c in _rgb(hexc))
    lm = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    mm = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    sm = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (lm, mm, sm))
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def _oklch_to_linear(L: float, C: float, H: float) -> tuple[float, float, float]:
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    lc, mc, sc = l_ ** 3, m_ ** 3, s_ ** 3
    return (4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
            -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
            -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc)


def _in_gamut(rgb: tuple[float, float, float]) -> bool:
    return all(-1e-6 <= c <= 1 + 1e-6 for c in rgb)


def from_oklch(L: float, C: float, H: float) -> str:
    """Hex for an OKLCH colour, reducing chroma until it fits sRGB."""
    rgb = _oklch_to_linear(L, C, H)
    if not _in_gamut(rgb):
        lo, hi = 0.0, C
        for _ in range(24):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if _in_gamut(_oklch_to_linear(L, mid, H)) else (lo, mid)
        rgb = _oklch_to_linear(L, lo, H)
    return "#" + "".join(f"{round(min(1.0, max(0.0, _gamma(max(0.0, c)))) * 255):02x}" for c in rgb)


def scale(hexc: str, name: str) -> dict[str, str]:
    _, c, h = oklch(hexc)
    out = {}
    for step, lightness in _STEPS.items():
        # Tints near white or black can't carry full chroma; ease it off.
        ease = min(1.0, (1 - lightness) * 4, lightness * 2.5)
        out[f"{name}_{step}"] = from_oklch(lightness, c * ease, h)
    return out


def tokens(primary: str | None, accent: str | None) -> dict[str, str]:
    p = primary or DEFAULT_PRIMARY
    a = accent or p
    return {"primary": p, "on_primary": on_color(p), **scale(p, "primary"),
            "accent": a, "on_accent": on_color(a), **scale(a, "accent")}


# ── Persistence ─────────────────────────────────────────────────────────────
_DEFAULTS: dict[str, Any] = {
    "logo_file_id": None, "primary_color": None, "accent_color": None, "receipt_header": "",
    "receipt_footer": "", "invoice_header": "", "invoice_footer": "", "payslip_header": "",
    "receipt_width_mm": 80, "layout": "classic", "version": 0,
}
_COLS = ", ".join(_DEFAULTS)


async def load(conn: asyncpg.Connection) -> dict[str, Any]:
    row = await conn.fetchrow(
        f"select {_COLS} from tenant_branding where tenant_id = current_setting('app.tenant_id')::uuid")
    data = dict(row) if row else dict(_DEFAULTS)
    data["logo_file_id"] = str(data["logo_file_id"]) if data["logo_file_id"] else None
    data["tokens"] = tokens(data["primary_color"], data["accent_color"])
    return data


async def save(conn: asyncpg.Connection, fields: dict[str, Any], *, user_id: str) -> dict[str, Any]:
    """Apply a partial update. ValueError (-> 422) for an unreadable colour or
    a logo that isn't one of the caller's uploaded images."""
    fields = dict(fields)
    for k in ("primary_color", "accent_color"):
        if fields.get(k):
            check(fields[k])
        elif k in fields:
            fields[k] = None
    tenant_id: str = await conn.fetchval("select current_setting('app.tenant_id')")
    clear = fields.pop("clear_logo", False)
    new_logo = fields.pop("logo_file_id", None)
    if new_logo or clear:
        await files.detach(conn, entity="tenant_branding", entity_id=tenant_id, field="logo")
        fields["logo_file_id"] = None
    if new_logo:
        row = await files.attach(conn, new_logo, entity="tenant_branding", entity_id=tenant_id,
                                 field="logo", user_id=user_id)
        if row is None or row["mime"] not in files.IMAGE_MIMES:
            raise ValueError("Upload the logo as a PNG, JPEG or WebP image first")
        fields["logo_file_id"] = new_logo
    if fields:
        cols = list(fields)
        await conn.execute(
            f"""insert into tenant_branding (tenant_id, {', '.join(cols)})
                values ($1, {', '.join(f'${i + 2}' for i in range(len(cols)))})
                on conflict (tenant_id) do update
                set {', '.join(f'{c} = excluded.{c}' for c in cols)},
                    version = tenant_branding.version + 1, updated_at = now()""",
            tenant_id, *fields.values())
    return await load(conn)
