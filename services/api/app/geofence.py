"""Where a punch came from, judged on the server (D-43, St03 §6.3, TR-DOM-52).

The client sends what the browser's Geolocation API reported (latitude,
longitude, accuracy) and whether it suspects a mocked location. None of it is
trusted as a verdict: the server measures the distance to the employee's work
location, compares the request's IP with the location's networks, and per the
location's modes either records the result (`record`) or refuses the punch
(`require`). `mock_gps` is stored as a risk flag for review, never a pass.
"""
from __future__ import annotations

import ipaddress
import math
from dataclasses import dataclass, field

_EARTH_M = 6_371_000.0


@dataclass(frozen=True)
class Site:
    """The parts of an hrms_locations row the checks need."""
    name: str
    lat: float | None
    lng: float | None
    radius_m: int
    allowed_cidrs: list[str]
    geo_mode: str            # off | record | require
    ip_mode: str             # off | record | require


@dataclass(frozen=True)
class Verdict:
    geo_status: str          # inside | outside | no_fix | not_required
    ip_status: str           # allowed | outside | not_required
    risk_flags: list[str] = field(default_factory=list)
    distance_m: int | None = None
    refusal: str | None = None   # set when a `require` rule fails: the punch is refused


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle (haversine) distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_M * math.asin(math.sqrt(a))


def ip_allowed(ip: str, cidrs: list[str]) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in ipaddress.ip_network(c, strict=False) for c in cidrs)


def check(site: Site | None, *, lat: float | None, lng: float | None, accuracy_m: float | None,
          ip: str, mock_gps: bool = False) -> Verdict:
    flags = ["mock_gps"] if mock_gps else []
    if site is None:
        return Verdict("not_required", "not_required", flags)

    geo, dist = "not_required", None
    if site.geo_mode != "off" and site.lat is not None and site.lng is not None:
        if lat is None or lng is None or accuracy_m is None or accuracy_m > site.radius_m:
            geo = "no_fix"    # an unreadable or too-vague fix is never "inside"
        else:
            dist = round(distance_m(site.lat, site.lng, lat, lng))
            geo = "inside" if dist <= site.radius_m else "outside"

    net = "not_required"
    if site.ip_mode != "off" and site.allowed_cidrs:
        net = "allowed" if ip_allowed(ip, site.allowed_cidrs) else "outside"

    refusal = None
    if site.geo_mode == "require" and geo == "outside":
        refusal = (f"You're {dist} m from {site.name}; punches are accepted within "
                   f"{site.radius_m} m.")
    elif site.geo_mode == "require" and geo == "no_fix":
        refusal = (f"Your location couldn't be read accurately enough to check you're at {site.name}. "
                   "Turn on location for this site and try again.")
    elif site.ip_mode == "require" and net == "outside":
        refusal = f"You're not on {site.name}'s network. Connect to the office Wi-Fi and try again."
    return Verdict(geo, net, flags, dist, refusal)
