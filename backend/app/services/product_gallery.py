from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.product_image import ProductImage


def sync_product_cover(db: Session, product_id: UUID) -> None:
    """Set products.image_url to the first gallery image when gallery rows exist."""
    p = db.get(Product, product_id)
    if p is None:
        return
    first = db.scalar(
        select(ProductImage)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order.asc(), ProductImage.id.asc())
        .limit(1),
    )
    if first is not None:
        p.image_url = first.image_url


def backfill_product_galleries_from_legacy_image_url(db: Session) -> None:
    """Create one product_images row for products that only had image_url (dev convenience)."""
    rows = list(db.scalars(select(Product).where(Product.image_url.isnot(None))).all())
    for p in rows:
        if not p.image_url or not str(p.image_url).strip():
            continue
        n = int(db.scalar(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == p.id)) or 0)
        if n == 0:
            db.add(ProductImage(product_id=p.id, image_url=(p.image_url or "").strip(), sort_order=0))
    if rows:
        db.commit()
