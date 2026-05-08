from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.cart_item import CartItem
from app.models.interaction import Interaction
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.user import User
from app.schemas.orders import OrderCreate, OrderPublic, order_public
from app.services.interaction_weights import interaction_weight

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderPublic)
def create_order(
    body: OrderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    qty_map: dict[UUID, int] = defaultdict(int)
    for row in body.items:
        qty_map[row.product_id] += row.quantity

    pid_list = sorted(qty_map.keys(), key=lambda x: str(x))
    products: dict[UUID, Product] = {}

    try:
        for pid in pid_list:
            p = db.scalar(select(Product).where(Product.id == pid).with_for_update())
            if p is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
            products[pid] = p

        for pid, q in qty_map.items():
            if products[pid].stock < q:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Insufficient stock for {products[pid].name}",
                )

        total = Decimal("0")
        for pid, q in qty_map.items():
            total += products[pid].price * q

        order = Order(
            user_id=user.id,
            status="completed",
            total_amount=total,
            payment_method=body.payment_method or "demo",
        )
        db.add(order)
        db.flush()

        for pid, q in qty_map.items():
            p = products[pid]
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=pid,
                    product_name=p.name,
                    quantity=q,
                    unit_price=p.price,
                ),
            )
            p.stock -= q
            w = interaction_weight("purchase", {"quantity": q})
            db.add(
                Interaction(
                    user_id=user.id,
                    product_id=pid,
                    event_type="purchase",
                    weight=w,
                    event_metadata={"quantity": q, "source": "order", "order_id": str(order.id)},
                ),
            )

        db.execute(delete(CartItem).where(CartItem.user_id == user.id))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    o = db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Order persist failed")
    return order_public(o)


@router.get("/me", response_model=list[OrderPublic])
def list_my_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> list[OrderPublic]:
    stmt = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    rows = list(db.scalars(stmt).all())
    return [order_public(o) for o in rows]


@router.get("/{order_id}", response_model=OrderPublic)
def get_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderPublic:
    o = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user.id)
        .options(selectinload(Order.items)),
    )
    if o is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order_public(o)
