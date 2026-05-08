from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.product import Product

# Stable placeholder images (Lorem Picsum). Avoids broken Unsplash hotlinks for local/demo.
_SAMPLE: list[dict] = [
    {
        "name": "Urban Runner Sneakers",
        "description": "Lightweight daily trainers with cushioned sole.",
        "price": "89.00",
        "category": "shoes",
        "tags": ["sport", "running", "urban"],
        "image_url": "https://picsum.photos/seed/recengine-01/800/600",
        "stock": 40,
    },
    {
        "name": "Court Classic Lo",
        "description": "Leather low-top sneakers for everyday wear.",
        "price": "72.50",
        "category": "shoes",
        "tags": ["casual", "leather", "white"],
        "image_url": "https://picsum.photos/seed/recengine-02/800/600",
        "stock": 30,
    },
    {
        "name": "Trail Grip Hikers",
        "description": "Water-resistant boots for light trail use.",
        "price": "129.00",
        "category": "shoes",
        "tags": ["outdoor", "hiking", "grip"],
        "image_url": "https://picsum.photos/seed/recengine-03/800/600",
        "stock": 22,
    },
    {
        "name": "Minimal Tote Bag",
        "description": "Canvas tote with inner pocket.",
        "price": "45.00",
        "category": "bags",
        "tags": ["canvas", "minimal", "everyday"],
        "image_url": "https://picsum.photos/seed/recengine-04/800/600",
        "stock": 55,
    },
    {
        "name": "Commuter Backpack",
        "description": "Laptop sleeve and USB pass-through.",
        "price": "95.00",
        "category": "bags",
        "tags": ["work", "laptop", "travel"],
        "image_url": "https://picsum.photos/seed/recengine-05/800/600",
        "stock": 28,
    },
    {
        "name": "Crossbody Sling",
        "description": "Compact sling for phone, wallet, keys.",
        "price": "38.00",
        "category": "bags",
        "tags": ["compact", "city", "sling"],
        "image_url": "https://picsum.photos/seed/recengine-06/800/600",
        "stock": 36,
    },
    {
        "name": "Merino Crew Tee",
        "description": "Temperature-regulating base layer.",
        "price": "34.00",
        "category": "apparel",
        "tags": ["merino", "basics", "breathable"],
        "image_url": "https://picsum.photos/seed/recengine-07/800/600",
        "stock": 80,
    },
    {
        "name": "Technical Zip Hoodie",
        "description": "Stretch fleece with secure zip pockets.",
        "price": "78.00",
        "category": "apparel",
        "tags": ["layer", "sport", "fleece"],
        "image_url": "https://picsum.photos/seed/recengine-08/800/600",
        "stock": 44,
    },
    {
        "name": "Everyday Denim",
        "description": "Slim straight cut, mid-rise.",
        "price": "69.00",
        "category": "apparel",
        "tags": ["denim", "casual", "classic"],
        "image_url": "https://picsum.photos/seed/recengine-09/800/600",
        "stock": 50,
    },
    {
        "name": "Steel Bottle 750ml",
        "description": "Double-wall insulated bottle.",
        "price": "28.00",
        "category": "accessories",
        "tags": ["hydration", "eco", "outdoor"],
        "image_url": "https://picsum.photos/seed/recengine-10/800/600",
        "stock": 120,
    },
    {
        "name": "Noise-Cancel Earbuds",
        "description": "Compact earbuds with ANC and charging case.",
        "price": "149.00",
        "category": "electronics",
        "tags": ["audio", "travel", "wireless"],
        "image_url": "https://picsum.photos/seed/recengine-11/800/600",
        "stock": 18,
    },
    {
        "name": "Mechanical Keyboard 75%",
        "description": "Hot-swap switches, PBT keycaps.",
        "price": "119.00",
        "category": "electronics",
        "tags": ["desk", "typing", "rgb"],
        "image_url": "https://picsum.photos/seed/recengine-12/800/600",
        "stock": 25,
    },
    {
        "name": "USB-C Hub 6-in-1",
        "description": "HDMI, USB-A, SD, PD pass-through.",
        "price": "54.00",
        "category": "electronics",
        "tags": ["laptop", "office", "usb-c"],
        "image_url": "https://picsum.photos/seed/recengine-13/800/600",
        "stock": 60,
    },
    {
        "name": "Ceramic Pour-Over Set",
        "description": "Dripper, server, and filters starter kit.",
        "price": "42.00",
        "category": "home",
        "tags": ["coffee", "kitchen", "manual-brew"],
        "image_url": "https://picsum.photos/seed/recengine-14/800/600",
        "stock": 33,
    },
    {
        "name": "Linen Throw Blanket",
        "description": "Breathable blend for sofa or bed.",
        "price": "58.00",
        "category": "home",
        "tags": ["linen", "cozy", "decor"],
        "image_url": "https://picsum.photos/seed/recengine-15/800/600",
        "stock": 27,
    },
]


def seed_products_if_empty(db: Session) -> int:
    n = db.scalar(select(func.count()).select_from(Product)) or 0
    if n > 0:
        return 0
    rows: list[Product] = []
    for s in _SAMPLE:
        rows.append(
            Product(
                name=s["name"],
                description=s["description"],
                price=Decimal(s["price"]),
                category=s["category"],
                tags=s["tags"],
                image_url=s["image_url"],
                stock=int(s["stock"]),
            )
        )
    db.add_all(rows)
    db.commit()
    return len(rows)


def repair_legacy_image_urls(db: Session) -> int:
    """Point old Unsplash hotlinks at stable Picsum URLs so Next/Image stops 404ing."""
    result = db.execute(
        text(
            """
            UPDATE products
            SET image_url = 'https://picsum.photos/seed/p-' || replace(id::text, '-', '') || '/800/600'
            WHERE image_url IS NOT NULL
              AND image_url ILIKE '%unsplash%'
            """
        )
    )
    db.commit()
    return int(result.rowcount or 0)
