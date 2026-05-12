from uuid import UUID

from app.models.product_question import ProductQuestion
from app.models.user import User
from app.schemas.product_qa import ProductQaAnswerPublic, ProductQaItemPublic


def _display_name(u: User | None) -> str:
    if u is None:
        return "Member"
    return u.name.strip() if u.name and u.name.strip() else "Member"


def product_qa_item_public(q: ProductQuestion, viewer_id: UUID | None) -> ProductQaItemPublic:
    ans_public = None
    if q.answer:
        ans_public = ProductQaAnswerPublic(
            id=q.answer.id,
            body=q.answer.body,
            author_name=_display_name(q.answer.author),
            created_at=q.answer.created_at,
        )
    return ProductQaItemPublic(
        id=q.id,
        question=q.body,
        asker_name=_display_name(q.author),
        created_at=q.created_at,
        is_mine=viewer_id is not None and q.user_id == viewer_id,
        answer=ans_public,
    )
