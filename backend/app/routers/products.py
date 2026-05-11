import math
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.product_image import ProductImage
from app.schemas.products import (
    ProductListResponse,
    ProductSuggestItem,
    ProductWithSimilar,
    product_public,
)
from app.services.bought_together import bought_together_products

router = APIRouter(prefix="/products", tags=["products"])


def _apply_filters(
    stmt,
    count_stmt,
    category: str | None,
    search: str | None,
    *,
    uncategorized: bool = False,
    min_price: float | None = None,
    max_price: float | None = None,
):
    if uncategorized:
        cond = or_(Product.category.is_(None), Product.category == "")
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif category:
        stmt = stmt.where(Product.category == category)
        count_stmt = count_stmt.where(Product.category == category)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(Product.name.ilike(q))
        count_stmt = count_stmt.where(Product.name.ilike(q))
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
        count_stmt = count_stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)
        count_stmt = count_stmt.where(Product.price <= max_price)
    return stmt, count_stmt


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)) -> list[str]:
    stmt = (
        select(Product.category)
        .where(Product.category.is_not(None))
        .where(Product.category != "")
        .distinct()
        .order_by(Product.category.asc())
    )
    rows = db.scalars(stmt).all()
    return [c for c in rows if c]


@router.get("", response_model=ProductListResponse)
def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = None,
    search: str | None = None,
    uncategorized: bool = Query(False, description="If true, only products with no category (null or empty)"),
    sort: Literal["newest", "price_asc", "price_desc", "name_asc"] = Query(
        "newest",
        description="Sort order: newest (created_at desc), price asc/desc, name A–Z",
    ),
    min_price: float | None = Query(None, ge=0, description="Minimum unit price inclusive"),
    max_price: float | None = Query(None, ge=0, description="Maximum unit price inclusive"),
    db: Session = Depends(get_db),
) -> ProductListResponse:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "min_price must be less than or equal to max_price",
        )
    stmt = select(Product)
    count_stmt = select(func.count()).select_from(Product)
    stmt, count_stmt = _apply_filters(
        stmt,
        count_stmt,
        category,
        search,
        uncategorized=uncategorized,
        min_price=min_price,
        max_price=max_price,
    )
    total = int(db.scalar(count_stmt) or 0)
    if sort == "price_asc":
        stmt = stmt.order_by(Product.price.asc(), Product.id.asc())
    elif sort == "price_desc":
        stmt = stmt.order_by(Product.price.desc(), Product.id.asc())
    elif sort == "name_asc":
        stmt = stmt.order_by(Product.name.asc(), Product.id.asc())
    else:
        stmt = stmt.order_by(Product.created_at.desc())
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = db.scalars(stmt).all()
    total_pages = math.ceil(total / limit) if limit else 0
    return ProductListResponse(
        products=[product_public(p) for p in rows],
        total=total,
        page=page,
        total_pages=total_pages,
    )


@router.get("/suggest", response_model=list[ProductSuggestItem])
def suggest_products(
    q: str = Query("", max_length=120),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[ProductSuggestItem]:
    """Prefix/substring match on product name for search autocomplete."""
    term = (q or "").strip()
    if len(term) < 1:
        return []
    pattern = f"%{term}%"
    stmt = select(Product).where(Product.name.ilike(pattern)).order_by(Product.name.asc()).limit(limit)
    rows = db.scalars(stmt).all()
    return [ProductSuggestItem(id=p.id, name=p.name, category=p.category) for p in rows]


@router.get("/{product_id}", response_model=ProductWithSimilar)
def get_product(product_id: UUID, db: Session = Depends(get_db)) -> ProductWithSimilar:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")

    sim_stmt = select(Product).where(Product.id != p.id)
    if p.category:
        sim_stmt = sim_stmt.where(Product.category == p.category)
    sim_stmt = sim_stmt.order_by(Product.name.asc()).limit(8)
    similar = list(db.scalars(sim_stmt).all())

    if len(similar) < 8:
        have = {x.id for x in similar}
        have.add(p.id)
        fill_stmt = (
            select(Product)
            .where(Product.id.not_in(have))
            .order_by(Product.name.asc())
            .limit(8 - len(similar))
        )
        similar.extend(db.scalars(fill_stmt).all())

    bought = bought_together_products(db, product_id, 8)

    gallery_rows = list(
        db.scalars(
            select(ProductImage)
            .where(ProductImage.product_id == product_id)
            .order_by(ProductImage.sort_order.asc(), ProductImage.id.asc()),
        ).all(),
    )
    gallery_urls = [r.image_url for r in gallery_rows] or ([p.image_url] if p.image_url else [])

    return ProductWithSimilar(
        product=product_public(p, gallery_urls=gallery_urls),
        similar_products=[product_public(x) for x in similar],
        bought_together=[product_public(x) for x in bought],
    )
