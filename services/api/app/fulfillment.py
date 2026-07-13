"""Industry-conditional fulfillment field schemas.

The values captured when a deal is won differ by industry (courier for retail,
batch/instructor for a school, possession date for real estate). The frontend
renders whatever schema this returns, so the same "Won" flow adapts per tenant.
"""
from __future__ import annotations

_FIELDS: dict[str, list[dict]] = {
    "retail": [
        {"key": "sku", "label": "Item / SKU", "type": "text"},
        {"key": "variant", "label": "Variant", "type": "text"},
        {"key": "final_price", "label": "Final price (PKR)", "type": "number"},
        {"key": "delivery_mode", "label": "Delivery", "type": "select", "options": ["Self-pickup", "Courier"]},
        {"key": "courier", "label": "Courier service", "type": "text"},
    ],
    "restaurant": [
        {"key": "order_ref", "label": "Order reference", "type": "text"},
        {"key": "items", "label": "Items", "type": "text"},
        {"key": "total", "label": "Total (PKR)", "type": "number"},
    ],
    "pharmacy": [
        {"key": "batch_no", "label": "Batch no.", "type": "text"},
        {"key": "expiry", "label": "Expiry date", "type": "date"},
        {"key": "quantity", "label": "Quantity", "type": "number"},
    ],
    "wholesale": [
        {"key": "sku", "label": "SKU", "type": "text"},
        {"key": "quantity", "label": "Quantity", "type": "number"},
        {"key": "tier_price", "label": "Tier price (PKR)", "type": "number"},
        {"key": "dispatch_date", "label": "Dispatch date", "type": "date"},
    ],
    "education": [
        {"key": "program", "label": "Course / Program", "type": "text"},
        {"key": "batch_start", "label": "Batch start", "type": "date"},
        {"key": "batch_end", "label": "Batch end", "type": "date"},
        {"key": "class_timing", "label": "Class timing", "type": "text"},
        {"key": "instructor", "label": "Instructor", "type": "text"},
    ],
    "b2b_software": [
        {"key": "project_name", "label": "Project name", "type": "text"},
        {"key": "module", "label": "Service / Module", "type": "text"},
        {"key": "kickoff_date", "label": "Kick-off date", "type": "date"},
        {"key": "delivery_date", "label": "Delivery date", "type": "date"},
    ],
    "real_estate": [
        {"key": "property", "label": "Property / Plot", "type": "text"},
        {"key": "final_price", "label": "Final price (PKR)", "type": "number"},
        {"key": "possession_date", "label": "Possession date", "type": "date"},
        {"key": "registry_date", "label": "Registry date", "type": "date"},
    ],
}

_DEFAULT = [
    {"key": "final_price", "label": "Final price (PKR)", "type": "number"},
    {"key": "notes", "label": "Notes", "type": "text"},
]


def schema_for(industry: str) -> list[dict]:
    return _FIELDS.get(industry, _DEFAULT)
