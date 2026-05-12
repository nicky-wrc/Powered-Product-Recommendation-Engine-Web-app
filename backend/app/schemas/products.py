from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.product import Product
from app.schemas.reviews import ProductReviewEligibility, ReviewSummary


class ProductPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    price: float
    category: str | None
    tags: list[str] | None
    image_url: str | None
    image_urls: list[str] = Field(default_factory=list)
    stock: int


def product_public(p: Product, *, gallery_urls: list[str] | None = None) -> ProductPublic:
    if gallery_urls is not None:
        urls = list(gallery_urls)
    else:
        urls = [p.image_url] if p.image_url else []
    return ProductPublic(
        id=p.id,
        name=p.name,
        description=p.description,
        price=float(p.price),
        category=p.category,
        tags=list(p.tags) if p.tags is not None else None,
        image_url=p.image_url,
        image_urls=urls,
        stock=p.stock,
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


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    price: float = Field(ge=0)
    category: str | None = Field(None, max_length=100)
    tags: list[str] | None = None
    image_url: str | None = Field(None, max_length=2048)
    stock: int = Field(default=0, ge=0)

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
    stock: int | None = Field(None, ge=0)

    @field_validator("tags")
    @classmethod
    def _normalize_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [t.strip() for t in v if t and str(t).strip()]
        return out or None
