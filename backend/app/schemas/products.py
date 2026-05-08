from uuid import UUID

from pydantic import BaseModel, ConfigDict

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


class ProductWithSimilar(BaseModel):
    product: ProductPublic
    similar_products: list[ProductPublic]
