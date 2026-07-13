"""Lead scoring (1-100). Deterministic heuristic — works with no AI key.

Signals: source quality, contactability (phone/email), whether it's a company,
and deal value. When an AI key is configured the gateway can refine this later;
the heuristic is the reliable, zero-cost baseline.
"""
from __future__ import annotations

# Warm inbound (referral/ads) outranks a cold manual entry.
_SOURCE_WEIGHT = {"referral": 30, "whatsapp": 25, "facebook": 20, "google": 20, "manual": 10}


def score_lead(*, source: str, company: str, phone: str, email: str, value_minor: int) -> int:
    score = 20  # base
    score += _SOURCE_WEIGHT.get(source, 10)
    if company.strip():
        score += 10
    if phone.strip():
        score += 10
    if email.strip():
        score += 8
    if value_minor > 0:
        # ~1 point per PKR 5,000 of deal value, capped at 22.
        score += min(22, value_minor // 100 // 5000)
    return max(1, min(100, score))
