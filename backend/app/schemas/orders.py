from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import Order


class OrderLineIn(BaseModel):
    product_id: UUID
    quantity: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    payment_method: str | None = Field(default="demo", max_length=64)
    gift_wrap: bool = False
    gift_message: str | None = Field(default=None, max_length=500)


class OrderItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: UUID
    product_name: str
    quantity: int
    unit_price: float


class OrderPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    status: str
    total_amount: float
    payment_method: str | None
    gift_wrap: bool
    gift_message: str | None
    created_at: datetime
    items: list[OrderItemPublic]


def order_public(o: Order) -> OrderPublic:
    return OrderPublic(
        id=o.id,
        user_id=o.user_id,
        status=o.status,
        total_amount=float(o.total_amount),
        payment_method=o.payment_method,
        gift_wrap=bool(getattr(o, "gift_wrap", False)),
        gift_message=getattr(o, "gift_message", None),
        created_at=o.created_at,
        items=[
            OrderItemPublic(
                product_id=row.product_id,
                product_name=row.product_name,
                quantity=row.quantity,
                unit_price=float(row.unit_price),
            )
            for row in o.items
        ],
    )
