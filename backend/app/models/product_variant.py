from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProductVariant(Base):
    """Own price/stock per option combination (size, color, etc.)."""

    __tablename__ = "product_variants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(400), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="variants")
    cart_entries: Mapped[list["CartItem"]] = relationship("CartItem", back_populates="variant")
