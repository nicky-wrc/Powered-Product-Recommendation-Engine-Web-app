from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.interaction import Interaction
from app.models.product import Product
from app.models.user import User
from app.schemas.products import ProductPublic, product_public
from app.schemas.recommendations import RecommendationFeed, RecommendationMeta
from app.services.recommendation_engine import (
    collaborative_product_scores,
    content_product_scores,
    fetch_products_in_order,
    hybrid_product_order,
    purchased_product_ids,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _score_subquery():
    return (
        select(Interaction.product_id.label("pid"), func.sum(Interaction.weight).label("score"))
        .group_by(Interaction.product_id)
        .subquery()
    )


def _popular_products(db: Session, limit: int) -> list[Product]:
    score_sq = _score_subquery()
    stmt = (
        select(Product)
        .join(score_sq, Product.id == score_sq.c.pid)
        .order_by(score_sq.c.score.desc())
        .limit(limit)
    )
    rows = list(db.scalars(stmt).all())
    if not rows:
        rows = list(db.scalars(select(Product).order_by(Product.created_at.desc()).limit(limit)).all())
    return rows


def _exclude_for_user(db: Session, user_id: UUID) -> set[UUID]:
    return purchased_product_ids(db, user_id)


def _fill_from_popular(
    db: Session,
    primary: list[Product],
    *,
    limit: int,
    exclude: set[UUID],
) -> tuple[list[Product], bool]:
    out = list(primary)
    seen = {p.id for p in out}
    if len(out) >= limit:
        return out[:limit], False

    initial_len = len(out)
    for p in _popular_products(db, limit * 3):
        if p.id in exclude or p.id in seen:
            continue
        out.append(p)
        seen.add(p.id)
        if len(out) >= limit:
            break
    fallback = len(out) > initial_len
    return out[:limit], fallback


@router.get("/popular", response_model=list[ProductPublic])
def popular(
    limit: int = Query(12, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[ProductPublic]:
    return [product_public(p) for p in _popular_products(db, limit)]


@router.get("/me", response_model=RecommendationFeed)
def for_me(
    limit: int = Query(12, ge=1, le=50),
    mode: Literal["popular", "collaborative", "content", "hybrid"] = Query("hybrid"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecommendationFeed:
    exclude = _exclude_for_user(db, user.id)
    used_collaborative = False
    used_content = False
    fallback_popular = False

    if mode == "popular":
        rows = _popular_products(db, limit)
        rows, fb = _fill_from_popular(db, rows, limit=limit, exclude=exclude)
        fallback_popular = fb
        return RecommendationFeed(
            products=[product_public(p) for p in rows],
            meta=RecommendationMeta(
                mode=mode,
                used_collaborative=False,
                used_content=False,
                fallback_popular=fallback_popular,
            ),
        )

    if mode == "collaborative":
        collab = collaborative_product_scores(db, user.id, exclude=exclude)
        used_collaborative = len(collab) > 0
        ids = [pid for pid, _ in collab[:limit]]
        rows = fetch_products_in_order(db, ids)
        rows, fb = _fill_from_popular(db, rows, limit=limit, exclude=exclude)
        fallback_popular = fb
        return RecommendationFeed(
            products=[product_public(p) for p in rows],
            meta=RecommendationMeta(
                mode=mode,
                used_collaborative=used_collaborative,
                used_content=False,
                fallback_popular=fallback_popular,
            ),
        )

    if mode == "content":
        ct = content_product_scores(db, user.id, exclude=exclude)
        used_content = len(ct) > 0
        ids = [pid for pid, _ in ct[:limit]]
        rows = fetch_products_in_order(db, ids)
        rows, fb = _fill_from_popular(db, rows, limit=limit, exclude=exclude)
        fallback_popular = fb
        return RecommendationFeed(
            products=[product_public(p) for p in rows],
            meta=RecommendationMeta(
                mode=mode,
                used_collaborative=False,
                used_content=used_content,
                fallback_popular=fallback_popular,
            ),
        )

    hyb = hybrid_product_order(db, user.id, exclude=exclude)
    used_collaborative = hyb.used_collaborative
    used_content = hyb.used_content
    rows = fetch_products_in_order(db, hyb.product_ids[:limit])
    rows, fb = _fill_from_popular(db, rows, limit=limit, exclude=exclude)
    fallback_popular = fb
    return RecommendationFeed(
        products=[product_public(p) for p in rows],
        meta=RecommendationMeta(
            mode="hybrid",
            used_collaborative=used_collaborative,
            used_content=used_content,
            fallback_popular=fallback_popular,
        ),
    )
