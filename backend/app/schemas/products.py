from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.product import Product
from app.schemas.reviews import ProductReviewEligibility, ReviewSummary
from app.services.product_pricing import effective_unit_price, flash_sale_active


class ProductVariantPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    price: float
    stock: int
    options: dict[str, str] | None = None


class ProductPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    price: float  # effective storefront unit (min variant or parent effective)
    base_price: float  # catalog / list price in DB (parent); with variants, parent list price
    compare_at_price: float | None = None
    sale_price: float | None = None
    sale_ends_at: datetime | None = None
    category: str | None
    tags: list[str] | None
    image_url: str | None
    image_urls: list[str] = Field(default_factory=list)
    stock: int
    video_url: str | None = None
    has_variants: bool = False
    variants: list[ProductVariantPublic] = Field(default_factory=list)
    is_gift_card: bool = False


def product_public(
    p: Product,
    *,
    gallery_urls: list[str] | None = None,
    variant_aggregate: tuple[int, float, int] | None = None,
    variants_for_detail: list | None = None,
) -> ProductPublic:
    """variant_aggregate: (count, min_price, sum_stock) for list/cards. variants_for_detail: ORM rows for PDP."""
    if gallery_urls is not None:
        urls = list(gallery_urls)
    else:
        urls = [p.image_url] if p.image_url else []

    v_detail_list: list = list(variants_for_detail) if variants_for_detail else []
    if v_detail_list:
        min_p = min(float(v.price) for v in v_detail_list)
        sum_s = sum(int(v.stock) for v in v_detail_list)
        base = float(p.price)
        eff = Decimal(str(min_p))
        variant_pub = [
            ProductVariantPublic(
                id=v.id,
                label=v.label,
                price=float(v.price),
                stock=int(v.stock),
                options=dict(v.options) if v.options else None,
            )
            for v in sorted(v_detail_list, key=lambda x: (x.sort_order, str(x.id)))
        ]
        return ProductPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            price=float(eff),
            base_price=base,
            compare_at_price=None,
            sale_price=None,
            sale_ends_at=None,
            category=p.category,
            tags=list(p.tags) if p.tags is not None else None,
            image_url=p.image_url,
            image_urls=urls,
            stock=int(sum_s),
            video_url=p.video_url,
            has_variants=True,
            variants=variant_pub,
            is_gift_card=bool(getattr(p, "is_gift_card", False)),
        )

    if variant_aggregate and variant_aggregate[0] > 0:
        cnt, min_p, sum_s = variant_aggregate
        _ = cnt
        return ProductPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            price=float(min_p),
            base_price=float(p.price),
            compare_at_price=None,
            sale_price=None,
            sale_ends_at=None,
            category=p.category,
            tags=list(p.tags) if p.tags is not None else None,
            image_url=p.image_url,
            image_urls=urls,
            stock=int(sum_s),
            video_url=p.video_url,
            has_variants=True,
            variants=[],
            is_gift_card=bool(getattr(p, "is_gift_card", False)),
        )

    active = flash_sale_active(p)
    eff = effective_unit_price(p)
    base = float(p.price)
    return ProductPublic(
        id=p.id,
        name=p.name,
        description=p.description,
        price=float(eff),
        base_price=base,
        compare_at_price=base if active else None,
        sale_price=float(p.sale_price) if p.sale_price is not None else None,
        sale_ends_at=p.sale_ends_at,
        category=p.category,
        tags=list(p.tags) if p.tags is not None else None,
        image_url=p.image_url,
        image_urls=urls,
        stock=p.stock,
        video_url=p.video_url,
        has_variants=False,
        variants=[],
        is_gift_card=bool(getattr(p, "is_gift_card", False)),
    )


class ProductListResponse(BaseModel):
    products: list[ProductPublic]
    total: int
    page: int
    total_pages: int


class ProductSuggestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str | None = None


class ProductWithSimilar(BaseModel):
    product: ProductPublic
    similar_products: list[ProductPublic]
    bought_together: list[ProductPublic] = Field(default_factory=list)
    review_summary: ReviewSummary = Field(default_factory=ReviewSummary)
    review_eligibility: ProductReviewEligibility = Field(default_factory=ProductReviewEligibility)


class ProductGalleryRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_url: str
    sort_order: int


class AdminProductDetailResponse(BaseModel):
    product: ProductPublic
    images: list[ProductGalleryRow]


class ProductImageAddBody(BaseModel):
    image_url: str = Field(min_length=1, max_length=2048)

    @field_validator("image_url", mode="before")
    @classmethod
    def _strip_url(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class ProductImageReorderBody(BaseModel):
    image_ids: list[UUID] = Field(min_length=1)


class ProductVariantUpsert(BaseModel):
    id: UUID | None = None
    label: str = Field(min_length=1, max_length=400)
    price: float = Field(ge=0)
    stock: int = Field(ge=0, default=0)
    sort_order: int = Field(default=0)
    options: dict[str, str] | None = None


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    price: float = Field(ge=0)
    category: str | None = Field(None, max_length=100)
    tags: list[str] | None = None
    image_url: str | None = Field(None, max_length=2048)
    video_url: str | None = Field(None, max_length=2048)
    stock: int = Field(default=0, ge=0)
    sale_price: float | None = Field(None, ge=0)
    sale_ends_at: datetime | None = None
    variants: list[ProductVariantUpsert] | None = None

    @model_validator(mode="after")
    def _validate_flash_create(self) -> ProductCreate:
        has_s = self.sale_price is not None
        has_e = self.sale_ends_at is not None
        if has_s != has_e:
            raise ValueError("sale_price and sale_ends_at must both be set, or both omitted")
        if has_s and self.sale_price is not None and self.sale_price >= self.price:
            raise ValueError("sale_price must be less than list price")
        return self

    @field_validator("image_url", "video_url", mode="before")
    @classmethod
    def _strip_optional_url(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("tags")
    @classmethod
    def _normalize_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [t.strip() for t in v if t and str(t).strip()]
        return out or None


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    price: float | None = Field(None, ge=0)
    category: str | None = Field(None, max_length=100)
    tags: list[str] | None = None
    image_url: str | None = Field(None, max_length=2048)
    video_url: str | None = Field(None, max_length=2048)
    stock: int | None = Field(None, ge=0)
    sale_price: float | None = Field(None, ge=0)
    sale_ends_at: datetime | None = None
    variants: list[ProductVariantUpsert] | None = None

    @field_validator("image_url", "video_url", mode="before")
    @classmethod
    def _strip_optional_url(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("tags")
    @classmethod
    def _normalize_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [t.strip() for t in v if t and str(t).strip()]
        return out or None
