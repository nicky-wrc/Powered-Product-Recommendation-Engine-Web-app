from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import Order


class OrderLineIn(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: int = Field(ge=1, le=99)
    bundle_group_id: UUID | None = None
    bundle_id: UUID | None = None


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


class OrderTrackingStepPublic(BaseModel):
    key: str
    label: str
    done: bool
    current: bool = False
    at: datetime | None = None


def order_tracking_steps(o: Order) -> list[OrderTrackingStepPublic]:
    if o.status == "cancelled":
        return [
            OrderTrackingStepPublic(key="ordered", label="สั่งซื้อแล้ว", done=True, current=False, at=o.created_at),
            OrderTrackingStepPublic(key="cancelled", label="ยกเลิกคำสั่งซื้อ", done=True, current=True, at=None),
        ]

    ts = o.created_at
    ship_at = getattr(o, "shipped_at", None)
    del_at = getattr(o, "delivered_at", None)
    ship_done = ship_at is not None or o.status in ("shipped", "completed")
    del_done = del_at is not None or o.status == "completed"

    if o.status == "completed" and ship_at is None and del_at is None:
        ship_at = del_at = ts
        ship_done = del_done = True
    elif o.status == "completed" and ship_at is None and del_at is not None:
        ship_at = del_at
        ship_done = True
    else:
        if ship_done and ship_at is None:
            ship_at = ts
        if del_done and del_at is None:
            del_at = ship_at or ts

    if o.status == "processing" and not ship_done:
        ship_label = "กำลังจัดเตรียม"
    elif not ship_done:
        ship_label = "รอจัดส่ง"
    else:
        ship_label = "จัดส่งแล้ว"

    steps = [
        OrderTrackingStepPublic(key="ordered", label="สั่งซื้อแล้ว", done=True, current=False, at=ts),
        OrderTrackingStepPublic(key="shipped", label=ship_label, done=ship_done, current=False, at=ship_at),
        OrderTrackingStepPublic(key="delivered", label="ส่งถึงแล้ว", done=del_done, current=False, at=del_at),
    ]
    first_open = next((i for i, s in enumerate(steps) if not s.done), None)
    if first_open is not None:
        steps[first_open].current = True
    else:
        steps[-1].current = True
    return steps


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
    tracking_carrier: str | None = None
    tracking_number: str | None = None
    shipped_at: datetime | None = None
    delivered_at: datetime | None = None
    tracking_steps: list[OrderTrackingStepPublic] = Field(default_factory=list)
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
        tracking_carrier=getattr(o, "tracking_carrier", None),
        tracking_number=getattr(o, "tracking_number", None),
        shipped_at=getattr(o, "shipped_at", None),
        delivered_at=getattr(o, "delivered_at", None),
        tracking_steps=order_tracking_steps(o),
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
