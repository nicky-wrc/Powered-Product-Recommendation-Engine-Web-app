from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.interaction import Interaction
from app.models.order import Order
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/analytics")
def analytics(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    total_users = int(db.scalar(select(func.count()).select_from(User)) or 0)
    total_products = int(db.scalar(select(func.count()).select_from(Product)) or 0)
    views = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "view")
        )
        or 0
    )
    clicks = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "click")
        )
        or 0
    )
    purchases = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "purchase")
        )
        or 0
    )
    total_orders = int(db.scalar(select(func.count()).select_from(Order)) or 0)
    revenue_raw = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)))
    revenue = float(revenue_raw or 0)
    ctr = (clicks / views) if views else 0.0
    data = {
        "total_users": total_users,
        "total_products": total_products,
        "total_views": views,
        "total_clicks": clicks,
        "total_purchases": purchases,
        "total_orders": total_orders,
        "revenue": round(revenue, 2),
        "ctr": round(ctr, 6),
        "note": "revenue = sum(order.total_amount); purchases = interaction rows (includes pre-order demos).",
    }
    return data
