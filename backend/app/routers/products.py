import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.schemas.products import ProductListResponse, ProductPublic, ProductWithSimilar, product_public
from app.services.bought_together import bought_together_products

router = APIRouter(prefix="/products", tags=["products"])


def _apply_filters(
    stmt,
    count_stmt,
    category: str | None,
    search: str | None,
    *,
    uncategorized: bool = False,
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
    db: Session = Depends(get_db),
) -> ProductListResponse:
    stmt = select(Product)
    count_stmt = select(func.count()).select_from(Product)
    stmt, count_stmt = _apply_filters(stmt, count_stmt, category, search, uncategorized=uncategorized)
    total = int(db.scalar(count_stmt) or 0)
    stmt = stmt.order_by(Product.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = db.scalars(stmt).all()
    total_pages = math.ceil(total / limit) if limit else 0
    return ProductListResponse(
        products=[product_public(p) for p in rows],
        total=total,
        page=page,
        total_pages=total_pages,
    )


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

    return ProductWithSimilar(
        product=product_public(p),
        similar_products=[product_public(x) for x in similar],
        bought_together=[product_public(x) for x in bought],
    )
