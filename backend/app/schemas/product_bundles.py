from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.products import ProductPublic


class ProductBundleItemPublic(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: int
    product: ProductPublic


class ProductBundlePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str | None = None
    description: str | None = None
    bundle_price: float
    list_subtotal: float
    savings: float
    items: list[ProductBundleItemPublic]


class ProductBundleListRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str | None = None
    description: str | None = None
    bundle_price: float
    list_subtotal: float
    savings: float


class AdminBundleItemIn(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity: int = Field(ge=1, le=99)
    sort_order: int = 0


class ProductBundleCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(None, max_length=160)
    description: str | None = None
    bundle_price: float = Field(ge=0)
    active: bool = True
    sort_order: int = 0
    items: list[AdminBundleItemIn] = Field(min_length=1)


class ProductBundleUpdateBody(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, max_length=160)
    description: str | None = None
    bundle_price: float | None = Field(None, ge=0)
    active: bool | None = None
    sort_order: int | None = None
    items: list[AdminBundleItemIn] | None = None
