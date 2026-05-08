from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.products import ProductPublic


class CartItemAdd(BaseModel):
    product_id: UUID
    quantity: int = Field(default=1, ge=1, le=99)


class CartItemPatch(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartLineResponse(BaseModel):
    product: ProductPublic
    quantity: int


class CartResponse(BaseModel):
    items: list[CartLineResponse]
    item_count: int
