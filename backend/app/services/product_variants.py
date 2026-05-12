"""Helpers for product variants (storefront aggregates)."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product_variant import ProductVariant


def variant_aggregates_for_product_ids(db: Session, ids: list[UUID]) -> dict[UUID, tuple[int, float, int]]:
    """Map product_id -> (variant_count, min_price, sum_stock)."""
    if not ids:
        return {}
    stmt = (
        select(
            ProductVariant.product_id,
            func.count().label("c"),
            func.min(ProductVariant.price).label("minp"),
            func.sum(ProductVariant.stock).label("sums"),
        )
        .where(ProductVariant.product_id.in_(ids))
        .group_by(ProductVariant.product_id)
    )
    out: dict[UUID, tuple[int, float, int]] = {}
    for pid, c, minp, sums in db.execute(stmt):
        out[pid] = (int(c), float(minp), int(sums))
    return out


def product_ids_requiring_variant(db: Session, product_ids: set[UUID]) -> set[UUID]:
    if not product_ids:
        return set()
    stmt = select(ProductVariant.product_id).where(ProductVariant.product_id.in_(product_ids)).distinct()
    return set(db.scalars(stmt).all())
