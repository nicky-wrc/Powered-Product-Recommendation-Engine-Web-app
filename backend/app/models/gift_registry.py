"""Wishlist-style gift lists with shareable slug URLs."""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GiftRegistry(Base):
    __tablename__ = "gift_registries"
    __table_args__ = (UniqueConstraint("slug", name="uq_gift_registries_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    items: Mapped[list["GiftRegistryItem"]] = relationship(
        "GiftRegistryItem",
        back_populates="registry",
        cascade="all, delete-orphan",
        order_by="GiftRegistryItem.sort_order",
    )


class GiftRegistryItem(Base):
    __tablename__ = "gift_registry_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    registry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gift_registries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=True,
    )
    quantity_requested: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    registry: Mapped["GiftRegistry"] = relationship("GiftRegistry", back_populates="items")


def new_registry_slug(*, title: str, allocate_token: str) -> str:
    from app.services.brand_slug import slugify_brand

    base = slugify_brand(title)[:72]
    if not base or base == "brand":
        base = "gift-list"
    tail = allocate_token[:10] if len(allocate_token) >= 10 else secrets.token_hex(5)
    s = f"{base}-{tail}".strip("-")[:160]
    return s or f"registry-{tail}"
