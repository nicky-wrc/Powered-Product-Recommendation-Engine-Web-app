"""
Collaborative (matrix factorization-style) + content-based (TF-IDF) recommendations.
Fits small/medium catalogs in-process; swap for batch + MLflow later as traffic grows.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from uuid import UUID

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.interaction import Interaction
from app.models.product import Product

logger = logging.getLogger(__name__)


def _aggregated_user_item_rows(db: Session) -> list[tuple[UUID, UUID, float]]:
    q = (
        select(Interaction.user_id, Interaction.product_id, func.sum(Interaction.weight))
        .group_by(Interaction.user_id, Interaction.product_id)
    )
    return [(u, p, float(w or 0)) for u, p, w in db.execute(q).all() if (w or 0) > 0]


def purchased_product_ids(db: Session, user_id: UUID) -> set[UUID]:
    rows = db.scalars(
        select(Interaction.product_id)
        .where(Interaction.user_id == user_id, Interaction.event_type == "purchase")
        .distinct()
    ).all()
    return set(rows)


def collaborative_product_scores(
    db: Session,
    user_id: UUID,
    *,
    exclude: set[UUID] | None = None,
) -> list[tuple[UUID, float]]:
    exclude = exclude or set()
    rows = _aggregated_user_item_rows(db)
    if len(rows) < 4:
        return []

    users = sorted({r[0] for r in rows})
    items = sorted({r[1] for r in rows})
    if len(users) < 2 or len(items) < 2:
        return []

    user_idx = {u: i for i, u in enumerate(users)}
    item_idx = {it: j for j, it in enumerate(items)}
    if user_id not in user_idx:
        return []

    ind_u: list[int] = []
    ind_p: list[int] = []
    data: list[float] = []
    for u, p, w in rows:
        ind_u.append(user_idx[u])
        ind_p.append(item_idx[p])
        data.append(math.log1p(w))

    mat = csr_matrix((data, (ind_u, ind_p)), shape=(len(users), len(items)))

    # TruncatedSVD requires 1 <= n_components < min(n_samples, n_features)
    max_n = min(16, min(mat.shape[0], mat.shape[1]) - 1)
    if max_n < 1:
        return []
    try:
        svd = TruncatedSVD(n_components=max_n, random_state=42)
        latent = svd.fit_transform(mat)
        rec = np.dot(latent, svd.components_)
    except Exception as e:  # pragma: no cover — numerical edge cases on tiny/noisy data
        logger.warning("Collaborative fit failed: %s", e)
        return []

    u_row = user_idx[user_id]
    scores = rec[u_row]
    ranked: list[tuple[UUID, float]] = []
    for j, pid in enumerate(items):
        if pid in exclude:
            continue
        ranked.append((pid, float(scores[j])))
    ranked.sort(key=lambda t: t[1], reverse=True)
    return ranked


def content_product_scores(
    db: Session,
    user_id: UUID,
    *,
    exclude: set[UUID] | None = None,
) -> list[tuple[UUID, float]]:
    exclude = exclude or set()
    products = list(db.scalars(select(Product).order_by(Product.created_at.asc())).all())
    if not products:
        return []

    pid_to_i = {p.id: i for i, p in enumerate(products)}
    corpus: list[str] = []
    for p in products:
        tag_part = " ".join(p.tags or [])
        corpus.append(" ".join(filter(None, [p.name, p.description or "", tag_part])))

    vec = TfidfVectorizer(max_features=800, stop_words="english", min_df=1)
    try:
        X = vec.fit_transform(corpus)
    except ValueError:
        return []

    inter = (
        db.execute(
            select(Interaction.product_id, func.sum(Interaction.weight))
            .where(Interaction.user_id == user_id)
            .group_by(Interaction.product_id)
        )
        .all()
    )
    if not inter:
        return []

    u_prof = np.zeros(X.shape[1], dtype=np.float64)
    total_w = 0.0
    for pid, w in inter:
        w = float(w or 0)
        if w <= 0 or pid not in pid_to_i:
            continue
        row = X[pid_to_i[pid]]
        u_prof += w * row.toarray().ravel()
        total_w += w
    if total_w <= 0:
        return []
    u_prof /= total_w

    sims = linear_kernel(X, u_prof.reshape(1, -1)).ravel()
    ranked: list[tuple[UUID, float]] = []
    for i, p in enumerate(products):
        if p.id in exclude:
            continue
        ranked.append((p.id, float(sims[i])))
    ranked.sort(key=lambda t: t[1], reverse=True)
    return ranked


@dataclass(frozen=True)
class HybridOrderResult:
    product_ids: list[UUID]
    used_collaborative: bool
    used_content: bool


def hybrid_product_order(
    db: Session,
    user_id: UUID,
    *,
    exclude: set[UUID] | None = None,
    collab_weight: float = 0.55,
    content_weight: float = 0.45,
) -> HybridOrderResult:
    exclude = exclude or set()
    collab = collaborative_product_scores(db, user_id, exclude=exclude)
    content = content_product_scores(db, user_id, exclude=exclude)

    norm_rank_score: dict[UUID, float] = {}

    def _inject(ranked: list[tuple[UUID, float]], weight: float) -> None:
        if not ranked:
            return
        mx = max(s for _, s in ranked)
        mn = min(s for _, s in ranked)
        span = (mx - mn) or 1.0
        for idx, (pid, score) in enumerate(ranked):
            rank_bonus = (len(ranked) - idx) / max(len(ranked), 1)
            norm = ((score - mn) / span) + 0.01 * rank_bonus
            norm_rank_score[pid] = norm_rank_score.get(pid, 0.0) + weight * float(norm)

    _inject(collab, collab_weight)
    _inject(content, content_weight)

    ordered = sorted(norm_rank_score.keys(), key=lambda p: -norm_rank_score[p])
    return HybridOrderResult(
        product_ids=ordered,
        used_collaborative=len(collab) > 0,
        used_content=len(content) > 0,
    )


def fetch_products_in_order(db: Session, ids: list[UUID]) -> list[Product]:
    if not ids:
        return []
    rows = list(db.scalars(select(Product).where(Product.id.in_(ids))).all())
    by_id = {p.id: p for p in rows}
    return [by_id[i] for i in ids if i in by_id]
