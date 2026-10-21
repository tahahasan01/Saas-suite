"""Seed global terminology (the per-industry label map that re-skins the UI).
Idempotent. Run: python -m scripts.seed  (from services/api)."""
from __future__ import annotations

import asyncio

import asyncpg

from app.config import settings

# key -> label, per industry. Same keys everywhere; only the words change.
TERMS: dict[str, dict[str, str]] = {
    "retail": {
        "lead": "Customer", "leads": "Customers",
        "product": "Item", "products": "Items",
        "deal": "Order", "deals": "Orders",
        "fulfillment": "Courier Dispatch",
        "contact": "Customer", "contacts": "Customers",  # 0059 inserts the same rows
    },
    "restaurant": {
        "lead": "Guest", "leads": "Guests",
        "product": "Menu Item", "products": "Menu",
        "deal": "Order", "deals": "Orders",
        "fulfillment": "Kitchen Ticket",
        "contact": "Guest", "contacts": "Guests",  # 0059 inserts the same rows
    },
    "pharmacy": {
        "lead": "Patient", "leads": "Patients",
        "product": "Medicine", "products": "Medicines",
        "deal": "Sale", "deals": "Sales",
        "fulfillment": "Dispense",
        "contact": "Patient", "contacts": "Patients",  # 0059 inserts the same rows
    },
    "wholesale": {
        "lead": "Buyer", "leads": "Buyers",
        "product": "SKU", "products": "Catalog",
        "deal": "Order", "deals": "Orders",
        "fulfillment": "Dispatch",
        "contact": "Customer", "contacts": "Customers",  # 0059 inserts the same rows
    },
    "education": {
        "lead": "Student", "leads": "Students",
        "product": "Course", "products": "Courses",
        "deal": "Admission", "deals": "Admissions",
        "fulfillment": "Batch Start",
        "contact": "Student", "contacts": "Students",  # 0059 inserts the same rows
    },
    "b2b_software": {
        "lead": "Client", "leads": "Clients",
        "product": "Service", "products": "Services",
        "deal": "Project", "deals": "Projects",
        "fulfillment": "Delivery Date",
        "contact": "Client", "contacts": "Clients",  # 0059 inserts the same rows
    },
    "real_estate": {
        "lead": "Buyer", "leads": "Buyers",
        "product": "Property", "products": "Properties",
        "deal": "Booking", "deals": "Bookings",
        "fulfillment": "Possession Date",
        "contact": "Client", "contacts": "Clients",  # 0059 inserts the same rows
    },
}


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        count = 0
        for industry, labels in TERMS.items():
            for key, label in labels.items():
                await conn.execute(
                    """insert into terminology (industry_type, key, locale, label)
                       values ($1,$2,'en',$3)
                       on conflict (industry_type, key, locale)
                       do update set label = excluded.label""",
                    industry, key, label,
                )
                count += 1
        print(f"Seeded {count} terminology rows across {len(TERMS)} industries.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
