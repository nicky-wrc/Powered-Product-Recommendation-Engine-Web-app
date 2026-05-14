from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.products import ProductPublic


class CartItemAdd(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: int = Field(default=1, ge=1, le=99)


class CartItemPatch(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartLineResponse(BaseModel):
    product: ProductPublic
    quantity: int
    variant_id: UUID | None = None
    variant_label: str | None = None
    unit_price: float
    list_unit_price: float | None = None
    bundle_id: UUID | None = None
    bundle_group_id: UUID | None = None
    bundle_name: str | None = None


class CartResponse(BaseModel):
    items: list[CartLineResponse]
    item_count: int
    merchandise_subtotal: float = 0.0
