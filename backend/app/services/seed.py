from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.product import Product

# Unsplash (stable CDN). Tailored to product names. next.config allows images.unsplash.com.
_U = "https://images.unsplash.com/{path}?auto=format&fit=crop&w=800&q=80"

_SAMPLE: list[dict] = [
    {
        "name": "Urban Runner Sneakers",
        "description": "Lightweight daily trainers with cushioned sole.",
        "price": "89.00",
        "category": "shoes",
        "tags": ["sport", "running", "urban"],
        "image_url": _U.format(path="photo-1542291026-7eec264c27ff"),
        "stock": 40,
        "video_url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    },
    {
        "name": "Court Classic Lo",
        "description": "Leather low-top sneakers for everyday wear.",
        "price": "72.50",
        "category": "shoes",
        "tags": ["casual", "leather", "white"],
        "image_url": _U.format(path="photo-1595950653106-6c9ebd614d3a"),
        "stock": 30,
    },
    {
        "name": "Trail Grip Hikers",
        "description": "Water-resistant boots for light trail use.",
        "price": "129.00",
        "category": "shoes",
        "tags": ["outdoor", "hiking", "grip"],
        "image_url": _U.format(path="photo-1608256246200-53e6357745ad"),
        "stock": 22,
    },
    {
        "name": "Minimal Tote Bag",
        "description": "Canvas tote with inner pocket.",
        "price": "45.00",
        "category": "bags",
        "tags": ["canvas", "minimal", "everyday"],
        "image_url": _U.format(path="photo-1590874103328-eac38a683ce7"),
        "stock": 55,
    },
    {
        "name": "Commuter Backpack",
        "description": "Laptop sleeve and USB pass-through.",
        "price": "95.00",
        "category": "bags",
        "tags": ["work", "laptop", "travel"],
        "image_url": _U.format(path="photo-1622560480605-d83c853bc5c3"),
        "stock": 28,
    },
    {
        "name": "Crossbody Sling",
        "description": "Compact sling for phone, wallet, keys.",
        "price": "38.00",
        "category": "bags",
        "tags": ["compact", "city", "sling"],
        "image_url": _U.format(path="photo-1590874015727-5480381a6a08"),
        "stock": 36,
    },
    {
        "name": "Merino Crew Tee",
        "description": "Temperature-regulating base layer.",
        "price": "34.00",
        "category": "apparel",
        "tags": ["merino", "basics", "breathable"],
        "image_url": _U.format(path="photo-1521572163474-6864f9cf17ab"),
        "stock": 80,
    },
    {
        "name": "Technical Zip Hoodie",
        "description": "Stretch fleece with secure zip pockets.",
        "price": "78.00",
        "category": "apparel",
        "tags": ["layer", "sport", "fleece"],
        "image_url": _U.format(path="photo-1556821840-3a63f95609a7"),
        "stock": 44,
    },
    {
        "name": "Everyday Denim",
        "description": "Slim straight cut, mid-rise.",
        "price": "69.00",
        "category": "apparel",
        "tags": ["denim", "casual", "classic"],
        "image_url": _U.format(path="photo-1542272604-787c3835535d"),
        "stock": 50,
    },
    {
        "name": "Steel Bottle 750ml",
        "description": "Double-wall insulated bottle.",
        "price": "28.00",
        "category": "accessories",
        "tags": ["hydration", "eco", "outdoor"],
        "image_url": _U.format(path="photo-1602143407151-7111542de6e8"),
        "stock": 120,
    },
    {
        "name": "Noise-Cancel Earbuds",
        "description": "Compact earbuds with ANC and charging case.",
        "price": "149.00",
        "category": "electronics",
        "tags": ["audio", "travel", "wireless"],
        "image_url": _U.format(path="photo-1590658268037-6bf12165a8df"),
        "stock": 18,
    },
    {
        "name": "Mechanical Keyboard 75%",
        "description": "Hot-swap switches, PBT keycaps.",
        "price": "119.00",
        "category": "electronics",
        "tags": ["desk", "typing", "rgb"],
        "image_url": _U.format(path="photo-1587829741301-d79d578b5ea7"),
        "stock": 25,
    },
    {
        "name": "USB-C Hub 6-in-1",
        "description": "HDMI, USB-A, SD, PD pass-through.",
        "price": "54.00",
        "category": "electronics",
        "tags": ["laptop", "office", "usb-c"],
        "image_url": _U.format(path="photo-1625723044792-44de176ccb68"),
        "stock": 60,
    },
    {
        "name": "Ceramic Pour-Over Set",
        "description": "Dripper, server, and filters starter kit.",
        "price": "42.00",
        "category": "home",
        "tags": ["coffee", "kitchen", "manual-brew"],
        "image_url": _U.format(path="photo-1497935586351-b67a49e012bf"),
        "stock": 33,
    },
    {
        "name": "Linen Throw Blanket",
        "description": "Breathable blend for sofa or bed.",
        "price": "58.00",
        "category": "home",
        "tags": ["linen", "cozy", "decor"],
        "image_url": _U.format(path="photo-1555041469-a586c61ea9bc"),
        "stock": 27,
    },
    # Hats & headwear
    {
        "name": "Classic Baseball Cap",
        "description": "Cotton twill cap with adjustable strap.",
        "price": "24.00",
        "category": "hats",
        "tags": ["cap", "casual", "sun"],
        "image_url": _U.format(path="photo-1588850561407-ed78c282e89b"),
        "stock": 70,
    },
    {
        "name": "Merino Wool Beanie",
        "description": "Soft knit beanie for cold days.",
        "price": "32.00",
        "category": "hats",
        "tags": ["wool", "winter", "warm"],
        "image_url": _U.format(path="photo-1575429198097-0414ec08e8cd"),
        "stock": 55,
    },
    {
        "name": "Wide-Brim Sun Hat",
        "description": "Packable straw hat for beach and travel.",
        "price": "41.00",
        "category": "hats",
        "tags": ["summer", "sun", "straw"],
        "image_url": _U.format(path="photo-1514327605112-b887c0e61c0a"),
        "stock": 40,
    },
    {
        "name": "Running Visor",
        "description": "Lightweight visor, sweat-wicking band.",
        "price": "19.00",
        "category": "hats",
        "tags": ["sport", "run", "visor"],
        "image_url": _U.format(path="photo-1534385671552-c34cd64cb18b"),
        "stock": 65,
    },
    {
        "name": "Denim Trucker Hat",
        "description": "Mesh-back trucker with curved brim.",
        "price": "27.00",
        "category": "hats",
        "tags": ["street", "denim", "trucker"],
        "image_url": _U.format(path="photo-1521369909029-2afed882baee"),
        "stock": 48,
    },
    {
        "name": "Bucket Hat Cotton",
        "description": "Reversible cotton bucket hat.",
        "price": "29.00",
        "category": "hats",
        "tags": ["street", "bucket", "cotton"],
        "image_url": _U.format(path="photo-1596755094514-87b38081521d"),
        "stock": 52,
    },
    # More apparel & gear
    {
        "name": "Pique Polo Shirt",
        "description": "Breathable cotton blend, rib collar.",
        "price": "44.00",
        "category": "apparel",
        "tags": ["polo", "office", "classic"],
        "image_url": _U.format(path="photo-1586790170083-2f17ccad2e09"),
        "stock": 62,
    },
    {
        "name": "Oxford Button Shirt",
        "description": "Crisp oxford cloth for work or weekend.",
        "price": "56.00",
        "category": "apparel",
        "tags": ["shirt", "formal", "cotton"],
        "image_url": _U.format(path="photo-1602810318383-e386cc2a3ccf"),
        "stock": 45,
    },
    {
        "name": "Chino Shorts",
        "description": "Mid-length chino shorts with stretch.",
        "price": "49.00",
        "category": "apparel",
        "tags": ["summer", "casual", "shorts"],
        "image_url": _U.format(path="photo-1591195853828-11db59a44d0f"),
        "stock": 58,
    },
    {
        "name": "Lightweight Parka",
        "description": "Packable shell with water-resistant coating.",
        "price": "118.00",
        "category": "apparel",
        "tags": ["rain", "layer", "travel"],
        "image_url": _U.format(path="photo-1544022613-e87ca75a784a"),
        "stock": 34,
    },
    {
        "name": "Leather Belt Brown",
        "description": "Full-grain leather with brass buckle.",
        "price": "46.00",
        "category": "accessories",
        "tags": ["leather", "belt", "classic"],
        "image_url": _U.format(path="photo-1624222247344-550fb60583fd"),
        "stock": 44,
    },
    {
        "name": "Polarized Sunglasses",
        "description": "Lightweight frames with UV400 lenses.",
        "price": "68.00",
        "category": "accessories",
        "tags": ["sun", "sport", "uv"],
        "image_url": _U.format(path="photo-1572635196237-14b3f281503f"),
        "stock": 36,
    },
    {
        "name": "Wool Scarf Plaid",
        "description": "Soft plaid scarf for autumn and winter.",
        "price": "39.00",
        "category": "accessories",
        "tags": ["wool", "scarf", "gift"],
        "image_url": _U.format(path="photo-1520903920243-92d18b3e33f8"),
        "stock": 41,
    },
    # Electronics & home extras
    {
        "name": "Power Bank 20000mAh",
        "description": "Fast-charge USB-C and USB-A outputs.",
        "price": "52.00",
        "category": "electronics",
        "tags": ["charge", "travel", "usb-c"],
        "image_url": _U.format(path="photo-1609091839311-d5365f9ff1c5"),
        "stock": 47,
    },
    {
        "name": "Bluetooth Speaker Mini",
        "description": "Waterproof IPX7 with 12h playback.",
        "price": "64.00",
        "category": "electronics",
        "tags": ["audio", "outdoor", "wireless"],
        "image_url": _U.format(path="photo-1608043152269-423dbba4e7e1"),
        "stock": 39,
    },
    {
        "name": "LED Desk Lamp",
        "description": "Dimmable LED with warm and cool modes.",
        "price": "48.00",
        "category": "home",
        "tags": ["desk", "light", "office"],
        "image_url": _U.format(path="photo-1507473885765-e6ed057f782c"),
        "stock": 53,
    },
    {
        "name": "Yoga Mat Pro",
        "description": "Non-slip TPE mat with carry strap.",
        "price": "36.00",
        "category": "home",
        "tags": ["yoga", "fitness", "grip"],
        "image_url": _U.format(path="photo-1601925260368-ae2f83cf8b7f"),
        "stock": 66,
    },
    {
        "name": "Ceramic Planter Duo",
        "description": "Two matte ceramic planters with trays.",
        "price": "33.00",
        "category": "home",
        "tags": ["plants", "decor", "ceramic"],
        "image_url": _U.format(path="photo-1485955900006-10f4d324d411"),
        "stock": 72,
    },
    # Fashion / jewelry (Thai category label used in storefront)
    {
        "name": "Layered Chain Necklace",
        "description": "Stainless steel layered chains, hypoallergenic.",
        "price": "31.00",
        "category": "แฟชั่นและเครื่องประดับ",
        "tags": ["jewelry", "necklace", "layered"],
        "image_url": _U.format(path="photo-1599643478518-a784e5dc4c8f"),
        "stock": 88,
    },
    {
        "name": "Minimal Hoop Earrings",
        "description": "Slim hoops for everyday wear.",
        "price": "26.00",
        "category": "แฟชั่นและเครื่องประดับ",
        "tags": ["earrings", "gold-tone", "minimal"],
        "image_url": _U.format(path="photo-1515562141207-7a88fb7ce338"),
        "stock": 95,
    },
    {
        "name": "Silk Scarf Square",
        "description": "Printed silk scarf, gift-ready box.",
        "price": "54.00",
        "category": "แฟชั่นและเครื่องประดับ",
        "tags": ["silk", "scarf", "print"],
        "image_url": _U.format(path="photo-1584917865442-de89dd76afd9"),
        "stock": 42,
    },
    {
        "name": "Leather Cuff Bracelet",
        "description": "Hand-stitched leather cuff, adjustable snaps.",
        "price": "35.00",
        "category": "แฟชั่นและเครื่องประดับ",
        "tags": ["leather", "bracelet", "unisex"],
        "image_url": _U.format(path="photo-1523170335258-f5e318867116"),
        "stock": 57,
    },
    {
        "name": "Canvas Tote Mini",
        "description": "Small canvas tote for daily essentials.",
        "price": "29.00",
        "category": "แฟชั่นและเครื่องประดับ",
        "tags": ["tote", "mini", "canvas"],
        "image_url": _U.format(path="photo-1553062407-98eeb64c6a62"),
        "stock": 61,
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


def insert_missing_demo_products(db: Session) -> int:
    """Add catalog rows that are not yet in DB (safe for existing databases)."""
    names = set(db.scalars(select(Product.name)).all())
    to_add: list[Product] = []
    for s in _SAMPLE:
        if s["name"] in names:
            continue
        to_add.append(
            Product(
                name=s["name"],
                description=s["description"],
                price=Decimal(s["price"]),
                category=s["category"],
                tags=s["tags"],
                image_url=s["image_url"],
                stock=int(s["stock"]),
                video_url=s.get("video_url"),
            )
        )
    if not to_add:
        return 0
    db.add_all(to_add)
    db.commit()
    return len(to_add)


def sync_demo_catalog_images(db: Session) -> int:
    """
    Refresh image_url for known demo product names to match the catalog.
    Skips rows using local uploads (/uploads/) so admin-uploaded photos stay put.
    """
    by_name = {s["name"]: s["image_url"] for s in _SAMPLE}
    rows = db.scalars(select(Product).where(Product.name.in_(list(by_name.keys())))).all()
    updated = 0
    for p in rows:
        url = by_name.get(p.name)
        if not url:
            continue
        if p.image_url and "/uploads/" in p.image_url:
            continue
        if p.image_url == url:
            continue
        p.image_url = url
        updated += 1
    if updated:
        db.commit()
    return updated


def sync_demo_product_videos(db: Session) -> int:
    """Set video_url from catalog sample for known demo product names (fills new column on existing DBs)."""
    by_name = {s["name"]: s["video_url"] for s in _SAMPLE if s.get("video_url")}
    if not by_name:
        return 0
    rows = db.scalars(select(Product).where(Product.name.in_(list(by_name.keys())))).all()
    updated = 0
    for p in rows:
        want = by_name.get(p.name)
        if not want:
            continue
        if p.video_url == want:
            continue
        p.video_url = want
        updated += 1
    if updated:
        db.commit()
    return updated


def repair_legacy_image_urls(db: Session) -> int:
    """
    Point legacy Unsplash rows at stable Picsum URLs (avoids broken hotlinks).

    Skips curated demo product names: those URLs are maintained in _SAMPLE and
    reapplied by sync_demo_catalog_images; rewriting them here previously left
    random Picsum images that did not match product titles.
    """
    demo_names = [s["name"].replace("'", "''") for s in _SAMPLE]
    in_list = ", ".join(f"'{n}'" for n in demo_names)
    result = db.execute(
        text(
            f"""
            UPDATE products
            SET image_url = 'https://picsum.photos/seed/p-' || replace(id::text, '-', '') || '/800/600'
            WHERE image_url IS NOT NULL
              AND image_url ILIKE '%unsplash%'
              AND name NOT IN ({in_list})
            """
        )
    )
    db.commit()
    return int(result.rowcount or 0)
