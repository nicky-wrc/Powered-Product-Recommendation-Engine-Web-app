import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.product_answer import ProductAnswer
    from app.models.user import User


class ProductQuestion(Base):
    __tablename__ = "product_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    product: Mapped["Product"] = relationship("Product", back_populates="qa_questions")
    author: Mapped["User"] = relationship("User", back_populates="product_questions")
    answer: Mapped["ProductAnswer | None"] = relationship(
        "ProductAnswer",
        back_populates="question",
        uselist=False,
        cascade="all, delete-orphan",
    )
