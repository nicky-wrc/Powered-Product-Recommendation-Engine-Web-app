"""Daily storefront unit price snapshots for PDP charts."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.product_price_snapshot import ProductPriceSnapshot
from app.models.product_variant import ProductVariant
from app.services.product_pricing import effective_unit_price


def storefront_snapshot_unit_price(db: Session, product: Product) -> Decimal:
    """Same effective unit as PDP list price: min variant price, else flash-aware parent price."""
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.product_id == product.id)
        .order_by(ProductVariant.sort_order.asc(), ProductVariant.id.asc())
    )
    vrows = list(db.scalars(stmt).all())
    if vrows:
        return min(Decimal(str(v.price)) for v in vrows)
    return effective_unit_price(product)


def upsert_product_price_snapshot(db: Session, product: Product, *, day: date | None = None) -> None:
    d = day or datetime.now(timezone.utc).date()
    price = storefront_snapshot_unit_price(db, product)
    row = db.scalar(
        select(ProductPriceSnapshot).where(
            ProductPriceSnapshot.product_id == product.id,
            ProductPriceSnapshot.day == d,
        ),
    )
    if row is None:
        db.add(ProductPriceSnapshot(product_id=product.id, day=d, unit_price=price))
    else:
        row.unit_price = price
