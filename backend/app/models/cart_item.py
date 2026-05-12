import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    user: Mapped["User"] = relationship("User", back_populates="cart_items")
    product: Mapped["Product"] = relationship("Product", back_populates="cart_entries")
    variant: Mapped["ProductVariant | None"] = relationship("ProductVariant", back_populates="cart_entries")
