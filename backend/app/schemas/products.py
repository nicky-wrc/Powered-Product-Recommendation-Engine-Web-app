from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.product import Product


class ProductPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    price: float
    category: str | None
    tags: list[str] | None
    image_url: str | None
    stock: int


def product_public(p: Product) -> ProductPublic:
    return ProductPublic(
        id=p.id,
        name=p.name,
        description=p.description,
        price=float(p.price),
        category=p.category,
        tags=list(p.tags) if p.tags is not None else None,
        image_url=p.image_url,
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
