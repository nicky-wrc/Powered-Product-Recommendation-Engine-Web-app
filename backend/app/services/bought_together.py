"""Co-purchase ranking from completed orders (frequently bought together)."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.order import OrderItem
from app.models.product import Product
from app.services.recommendation_engine import fetch_products_in_order


def bought_together_product_ids(db: Session, product_id: UUID, limit: int = 8) -> list[UUID]:
    orders_with = select(OrderItem.order_id).where(OrderItem.product_id == product_id)
    cnt = func.count().label("cnt")
    stmt = (
        select(OrderItem.product_id, cnt)
        .where(OrderItem.order_id.in_(orders_with))
        .where(OrderItem.product_id != product_id)
        .group_by(OrderItem.product_id)
        .order_by(cnt.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [row[0] for row in rows]


def bought_together_products(db: Session, product_id: UUID, limit: int = 8) -> list[Product]:
    ids = bought_together_product_ids(db, product_id, limit)
    return fetch_products_in_order(db, ids)
