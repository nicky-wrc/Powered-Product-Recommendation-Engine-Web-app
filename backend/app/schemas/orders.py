from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import Order


class OrderLineIn(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)
    payment_method: str | None = Field(default="direct", max_length=64)
    gift_wrap: bool = False
    gift_message: str | None = Field(default=None, max_length=500)
    promo_code: str | None = Field(default=None, max_length=64)
    redeem_loyalty_points: int | None = Field(default=None, ge=0, le=500_000)
    gift_card_code: str | None = Field(default=None, max_length=40)
    gift_cards_recipient_email: str | None = Field(default=None, max_length=255)
    gift_cards_message: str | None = Field(default=None, max_length=2000)


class OrderItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: UUID
    product_name: str
    quantity: int
    unit_price: float
    variant_id: UUID | None = None
    variant_label: str | None = None


class OrderPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    status: str
    total_amount: float
    payment_method: str | None
    gift_wrap: bool
    gift_message: str | None
    promo_code: str | None = None
    promo_discount: float | None = None
    loyalty_points_redeemed: int | None = None
    loyalty_discount: float | None = None
    loyalty_points_earned: int | None = None
    gift_card_code: str | None = None
    gift_card_discount: float | None = None
    created_at: datetime
    items: list[OrderItemPublic]


def order_public(o: Order) -> OrderPublic:
    pd = getattr(o, "promo_discount", None)
    ld = getattr(o, "loyalty_discount", None)
    gcd = getattr(o, "gift_card_discount", None)
    return OrderPublic(
        id=o.id,
        user_id=o.user_id,
        status=o.status,
        total_amount=float(o.total_amount),
        payment_method=o.payment_method,
        gift_wrap=bool(getattr(o, "gift_wrap", False)),
        gift_message=getattr(o, "gift_message", None),
        promo_code=getattr(o, "promo_code", None),
        promo_discount=float(pd) if pd is not None else None,
        loyalty_points_redeemed=getattr(o, "loyalty_points_redeemed", None),
        loyalty_discount=float(ld) if ld is not None else None,
        loyalty_points_earned=getattr(o, "loyalty_points_earned", None),
        gift_card_code=getattr(o, "gift_card_code", None),
        gift_card_discount=float(gcd) if gcd is not None else None,
        created_at=o.created_at,
        items=[
            OrderItemPublic(
                product_id=row.product_id,
                product_name=row.product_name,
                quantity=row.quantity,
                unit_price=float(row.unit_price),
                variant_id=getattr(row, "variant_id", None),
                variant_label=getattr(row, "variant_label", None),
            )
            for row in o.items
        ],
    )
