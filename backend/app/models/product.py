import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, JSON, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.product_variant import ProductVariant


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    brand: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(64)), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    # YouTube or Vimeo page URL; PDP resolves nocookie / Vimeo player embed.
    video_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    # Flash deal: when active (sale_ends_at in future, sale_price < price), storefront uses sale_price.
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sale_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_gift_card: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_hazardous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    minimum_age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    compliance_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stable storefront / SEO code (ASIN-style), e.g. REC-<uuidhex>. Unique when set.
    product_code: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)
    meta_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Amazon-style A+ modules: JSON list of { type: banner | feature_list | image_text, ... }
    a_plus_modules: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    # Quantity breaks: [{ "min_qty": 3, "unit_price": "12.00" }, ...] — min_qty ≥ 2 ; unit_price ≤ list at time of save
    volume_tiers: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    # Optional installation / add-on service (per unit at checkout when customer opts in).
    installation_service_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    installation_service_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    images: Mapped[list["ProductImage"]] = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    interactions: Mapped[list["Interaction"]] = relationship("Interaction", back_populates="product")
    recommendations: Mapped[list["Recommendation"]] = relationship("Recommendation", back_populates="product")
    cart_entries: Mapped[list["CartItem"]] = relationship("CartItem", back_populates="product")

    variants: Mapped[list["ProductVariant"]] = relationship(
        ProductVariant,
        back_populates="product",
        cascade="all, delete-orphan",
        order_by=ProductVariant.sort_order,
    )
    order_lines: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="product")
    reviews: Mapped[list["ProductReview"]] = relationship(
        "ProductReview",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    qa_questions: Mapped[list["ProductQuestion"]] = relationship(
        "ProductQuestion",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    price_snapshots: Mapped[list["ProductPriceSnapshot"]] = relationship(
        "ProductPriceSnapshot",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductPriceSnapshot.day",
    )
