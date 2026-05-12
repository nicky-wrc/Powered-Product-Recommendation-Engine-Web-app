import math
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_answer import ProductAnswer
from app.models.product_image import ProductImage
from app.models.product_question import ProductQuestion
from app.models.product_review import ProductReview
from app.models.user import User
from app.schemas.product_qa import (
    ProductQaListResponse,
    ProductQuestionCreate,
)
from app.schemas.products import (
    ProductListResponse,
    ProductSuggestItem,
    ProductWithSimilar,
    product_public,
)
from app.schemas.reviews import (
    ProductReviewCreate,
    ProductReviewCreateResponse,
    ProductReviewEligibility,
    ProductReviewListResponse,
    ProductReviewPublic,
    ReviewSummary,
)
from app.services.bought_together import bought_together_products
from app.services.product_qa import product_qa_item_public

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


def _user_has_purchased_product(db: Session, user_id: UUID, product_id: UUID) -> bool:
    stmt = (
        select(OrderItem.id)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.user_id == user_id,
            OrderItem.product_id == product_id,
            Order.status == "completed",
        )
        .limit(1)
    )
    return db.scalar(stmt) is not None


def _review_eligibility(db: Session, product_id: UUID, viewer: User | None) -> ProductReviewEligibility:
    if viewer is None:
        return ProductReviewEligibility(can_submit_review=False, reason="login")
    has_review = (
        db.scalar(
            select(ProductReview.id).where(
                ProductReview.product_id == product_id,
                ProductReview.user_id == viewer.id,
            ).limit(1),
        )
        is not None
    )
    if has_review:
        return ProductReviewEligibility(can_submit_review=True, reason=None)
    if not _user_has_purchased_product(db, viewer.id, product_id):
        return ProductReviewEligibility(can_submit_review=False, reason="purchase")
    return ProductReviewEligibility(can_submit_review=True, reason=None)


def _review_summary(db: Session, product_id: UUID) -> ReviewSummary:
    cnt = int(
        db.scalar(
            select(func.count()).select_from(ProductReview).where(ProductReview.product_id == product_id),
        )
        or 0,
    )
    if cnt == 0:
        return ReviewSummary(average=None, count=0)
    avg_raw = db.scalar(select(func.avg(ProductReview.rating)).where(ProductReview.product_id == product_id))
    avg = round(float(avg_raw), 2) if avg_raw is not None else None
    return ReviewSummary(average=avg, count=cnt)


def _review_public(row: ProductReview, viewer_id: UUID | None) -> ProductReviewPublic:
    author = row.user.name.strip() if row.user and row.user.name else "Member"
    return ProductReviewPublic(
        id=row.id,
        rating=row.rating,
        title=row.title,
        body=row.body,
        image_urls=list(row.image_urls) if row.image_urls else [],
        author_name=author,
        created_at=row.created_at,
        is_mine=viewer_id is not None and row.user_id == viewer_id,
    )


def _ensure_product(db: Session, product_id: UUID) -> Product:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return p


@router.get("/{product_id}/reviews/can-submit", response_model=ProductReviewEligibility)
def product_review_can_submit(
    product_id: UUID,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> ProductReviewEligibility:
    _ensure_product(db, product_id)
    return _review_eligibility(db, product_id, viewer)


@router.get("/{product_id}/reviews", response_model=ProductReviewListResponse)
def list_product_reviews(
    product_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> ProductReviewListResponse:
    _ensure_product(db, product_id)
    viewer_id = viewer.id if viewer else None
    count_stmt = select(func.count()).select_from(ProductReview).where(ProductReview.product_id == product_id)
    total = int(db.scalar(count_stmt) or 0)
    total_pages = math.ceil(total / limit) if limit else 0
    avg_raw = db.scalar(select(func.avg(ProductReview.rating)).where(ProductReview.product_id == product_id))
    avg = round(float(avg_raw), 2) if total > 0 and avg_raw is not None else None
    stmt = (
        select(ProductReview)
        .where(ProductReview.product_id == product_id)
        .options(joinedload(ProductReview.user))
        .order_by(ProductReview.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = list(db.scalars(stmt).unique().all())
    return ProductReviewListResponse(
        items=[_review_public(r, viewer_id) for r in rows],
        total=total,
        page=page,
        total_pages=total_pages,
        average=avg,
    )


@router.post("/{product_id}/reviews", response_model=ProductReviewCreateResponse)
def upsert_my_product_review(
    product_id: UUID,
    body: ProductReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductReviewCreateResponse:
    _ensure_product(db, product_id)
    existing = db.scalar(
        select(ProductReview).where(
            ProductReview.product_id == product_id,
            ProductReview.user_id == user.id,
        ),
    )
    if existing is None and not _user_has_purchased_product(db, user.id, product_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "จะรีวิวได้เมื่อเคยสั่งซื้อสินค้านี้แล้วเท่านั้น (ออเดอร์สถานะสำเร็จ)",
        )
    imgs = list(body.image_urls) if body.image_urls else None
    if existing:
        existing.rating = body.rating
        existing.title = body.title
        existing.body = body.body
        existing.image_urls = imgs
    else:
        existing = ProductReview(
            product_id=product_id,
            user_id=user.id,
            rating=body.rating,
            title=body.title,
            body=body.body,
            image_urls=imgs,
        )
        db.add(existing)
    db.commit()
    rid = existing.id
    row = db.scalar(
        select(ProductReview)
        .where(ProductReview.id == rid)
        .options(joinedload(ProductReview.user)),
    )
    assert row is not None
    summ = _review_summary(db, product_id)
    return ProductReviewCreateResponse(review=_review_public(row, user.id), review_summary=summ)


@router.delete("/{product_id}/reviews/me", response_model=ReviewSummary)
def delete_my_product_review(
    product_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewSummary:
    _ensure_product(db, product_id)
    row = db.scalar(
        select(ProductReview).where(
            ProductReview.product_id == product_id,
            ProductReview.user_id == user.id,
        ),
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No review to delete")
    db.delete(row)
    db.commit()
    return _review_summary(db, product_id)


@router.get("/{product_id}/qa", response_model=ProductQaListResponse)
def list_product_qa(
    product_id: UUID,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> ProductQaListResponse:
    _ensure_product(db, product_id)
    viewer_id = viewer.id if viewer else None
    stmt = (
        select(ProductQuestion)
        .where(ProductQuestion.product_id == product_id)
        .options(
            joinedload(ProductQuestion.author),
            joinedload(ProductQuestion.answer).joinedload(ProductAnswer.author),
        )
        .order_by(ProductQuestion.created_at.desc())
    )
    rows = list(db.scalars(stmt).unique().all())
    return ProductQaListResponse(items=[product_qa_item_public(q, viewer_id) for q in rows])


@router.post(
    "/{product_id}/qa",
    response_model=ProductQaListResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_product_question(
    product_id: UUID,
    body: ProductQuestionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductQaListResponse:
    _ensure_product(db, product_id)
    q = ProductQuestion(
        product_id=product_id,
        user_id=user.id,
        body=body.body.strip(),
    )
    db.add(q)
    db.commit()
    stmt = (
        select(ProductQuestion)
        .where(ProductQuestion.product_id == product_id)
        .options(
            joinedload(ProductQuestion.author),
            joinedload(ProductQuestion.answer).joinedload(ProductAnswer.author),
        )
        .order_by(ProductQuestion.created_at.desc())
    )
    rows = list(db.scalars(stmt).unique().all())
    return ProductQaListResponse(items=[product_qa_item_public(r, user.id) for r in rows])


@router.get("/{product_id}", response_model=ProductWithSimilar)
def get_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> ProductWithSimilar:
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
        review_summary=_review_summary(db, product_id),
        review_eligibility=_review_eligibility(db, product_id, viewer),
    )
