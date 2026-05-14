from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.product import Product
from app.schemas.product_a_plus import normalize_a_plus_modules, safe_a_plus_modules_public
from app.services.brand_slug import slugify_brand
from app.schemas.reviews import ProductReviewEligibility, ReviewSummary
from app.services.product_codes import normalize_product_code
from app.services.product_pricing import effective_unit_price, flash_sale_active


class VolumeTierPublic(BaseModel):
    min_qty: int
    unit_price: float


class VolumeTierRow(BaseModel):
    min_qty: int = Field(ge=2, le=1_000_000)
    unit_price: float = Field(ge=0)


def normalize_volume_tiers_for_db(rows: list[VolumeTierRow]) -> list[dict[str, object]]:
    cleaned = sorted(rows, key=lambda r: r.min_qty)
    return [{"min_qty": r.min_qty, "unit_price": float(round(r.unit_price, 2))} for r in cleaned]


def validate_volume_tiers_against_cap(*, cap: float, tiers: list[VolumeTierRow]) -> None:
    if len(tiers) > 12:
        raise ValueError("At most 12 volume tiers")
    mins = [t.min_qty for t in tiers]
    if len(mins) != len(set(mins)):
        raise ValueError("Duplicate min_qty in volume tiers")
    c = float(cap)
    for t in tiers:
        if t.unit_price > c + 1e-6:
            raise ValueError(
                f"Volume tier (min {t.min_qty}) unit_price cannot exceed applicable unit cap {c:.2f}",
            )


def volume_tier_price_cap_from_create_body(body: "ProductCreate") -> float:
    """Upper bound for tier unit_price: min(parent effective unit, cheapest variant)."""
    lp = float(body.price)
    sp = body.sale_price
    ends = body.sale_ends_at
    parent_eff = lp
    if sp is not None and ends is not None and sp < lp and ends > datetime.now(timezone.utc):
        parent_eff = float(sp)
    if body.variants:
        vmin = min(float(v.price) for v in body.variants)
        return min(parent_eff, vmin)
    return parent_eff


def volume_tier_price_cap_for_product(p: Product, variant_unit_prices: list[float] | None) -> float:
    parent_eff = float(effective_unit_price(p))
    if variant_unit_prices:
        return min(parent_eff, min(variant_unit_prices))
    return parent_eff


def normalize_volume_tiers_public(raw: object) -> list[VolumeTierPublic] | None:
    if not raw or not isinstance(raw, list):
        return None
    out: list[VolumeTierPublic] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        mq = row.get("min_qty")
        up = row.get("unit_price")
        if mq is None or up is None:
            continue
        try:
            mqi = int(mq)
            upf = float(up)
        except (TypeError, ValueError):
            continue
        if mqi < 2 or upf < 0:
            continue
        out.append(VolumeTierPublic(min_qty=mqi, unit_price=round(upf, 2)))
    if not out:
        return None
    out.sort(key=lambda x: x.min_qty)
    return out


class ProductVariantPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    price: float
    stock: int
    options: dict[str, str] | None = None


class ProductPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    price: float  # effective storefront unit (min variant or parent effective)
    base_price: float  # catalog / list price in DB (parent); with variants, parent list price
    compare_at_price: float | None = None
    sale_price: float | None = None
    sale_ends_at: datetime | None = None
    category: str | None
    brand: str | None = None
    brand_slug: str | None = None
    tags: list[str] | None
    image_url: str | None
    image_urls: list[str] = Field(default_factory=list)
    stock: int
    video_url: str | None = None
    has_variants: bool = False
    variants: list[ProductVariantPublic] = Field(default_factory=list)
    is_gift_card: bool = False
    product_code: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    a_plus_modules: list[dict] | None = None
    is_hazardous: bool = False
    minimum_age: int | None = None
    compliance_note: str | None = None
    volume_tiers: list[VolumeTierPublic] | None = None


def _compliance_public_fields(p: Product) -> dict[str, object]:
    ma = getattr(p, "minimum_age", None)
    note = getattr(p, "compliance_note", None)
    return {
        "is_hazardous": bool(getattr(p, "is_hazardous", False)),
        "minimum_age": int(ma) if ma is not None else None,
        "compliance_note": (str(note).strip() if note else None) or None,
    }


def _volume_tiers_public_fields(p: Product) -> dict[str, object]:
    return {"volume_tiers": normalize_volume_tiers_public(getattr(p, "volume_tiers", None))}


def _product_seo_fields(p: Product) -> dict[str, str | None]:
    return {
        "product_code": p.product_code,
        "meta_title": p.meta_title,
        "meta_description": p.meta_description,
    }


def _brand_public_fields(p: Product) -> dict[str, str | None]:
    raw = (getattr(p, "brand", None) or "").strip()
    if not raw:
        return {"brand": None, "brand_slug": None}
    return {"brand": raw, "brand_slug": slugify_brand(raw)}


def _a_plus_public_fields(p: Product) -> dict[str, list[dict] | None]:
    return {"a_plus_modules": safe_a_plus_modules_public(getattr(p, "a_plus_modules", None))}


def product_public(
    p: Product,
    *,
    gallery_urls: list[str] | None = None,
    variant_aggregate: tuple[int, float, int] | None = None,
    variants_for_detail: list | None = None,
) -> ProductPublic:
    """variant_aggregate: (count, min_price, sum_stock) for list/cards. variants_for_detail: ORM rows for PDP."""
    if gallery_urls is not None:
        urls = list(gallery_urls)
    else:
        urls = [p.image_url] if p.image_url else []

    v_detail_list: list = list(variants_for_detail) if variants_for_detail else []
    if v_detail_list:
        min_p = min(float(v.price) for v in v_detail_list)
        sum_s = sum(int(v.stock) for v in v_detail_list)
        base = float(p.price)
        eff = Decimal(str(min_p))
        variant_pub = [
            ProductVariantPublic(
                id=v.id,
                label=v.label,
                price=float(v.price),
                stock=int(v.stock),
                options=dict(v.options) if v.options else None,
            )
            for v in sorted(v_detail_list, key=lambda x: (x.sort_order, str(x.id)))
        ]
        return ProductPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            price=float(eff),
            base_price=base,
            compare_at_price=None,
            sale_price=None,
            sale_ends_at=None,
            category=p.category,
            **_brand_public_fields(p),
            tags=list(p.tags) if p.tags is not None else None,
            image_url=p.image_url,
            image_urls=urls,
            stock=int(sum_s),
            video_url=p.video_url,
            has_variants=True,
            variants=variant_pub,
            is_gift_card=bool(getattr(p, "is_gift_card", False)),
            **_a_plus_public_fields(p),
            **_compliance_public_fields(p),
            **_volume_tiers_public_fields(p),
            **_product_seo_fields(p),
        )

    if variant_aggregate and variant_aggregate[0] > 0:
        cnt, min_p, sum_s = variant_aggregate
        _ = cnt
        return ProductPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            price=float(min_p),
            base_price=float(p.price),
            compare_at_price=None,
            sale_price=None,
            sale_ends_at=None,
            category=p.category,
            **_brand_public_fields(p),
            tags=list(p.tags) if p.tags is not None else None,
            image_url=p.image_url,
            image_urls=urls,
            stock=int(sum_s),
            video_url=p.video_url,
            has_variants=True,
            variants=[],
            is_gift_card=bool(getattr(p, "is_gift_card", False)),
            **_a_plus_public_fields(p),
            **_compliance_public_fields(p),
            **_volume_tiers_public_fields(p),
            **_product_seo_fields(p),
        )

    active = flash_sale_active(p)
    eff = effective_unit_price(p)
    base = float(p.price)
    return ProductPublic(
        id=p.id,
        name=p.name,
        description=p.description,
        price=float(eff),
        base_price=base,
        compare_at_price=base if active else None,
        sale_price=float(p.sale_price) if p.sale_price is not None else None,
        sale_ends_at=p.sale_ends_at,
        category=p.category,
        **_brand_public_fields(p),
        tags=list(p.tags) if p.tags is not None else None,
        image_url=p.image_url,
        image_urls=urls,
        stock=p.stock,
        video_url=p.video_url,
        has_variants=False,
        variants=[],
        is_gift_card=bool(getattr(p, "is_gift_card", False)),
        **_a_plus_public_fields(p),
        **_compliance_public_fields(p),
        **_volume_tiers_public_fields(p),
        **_product_seo_fields(p),
    )


class ProductListResponse(BaseModel):
    products: list[ProductPublic]
    total: int
    page: int
    total_pages: int


class ProductBrandRow(BaseModel):
    name: str
    slug: str
    product_count: int


class ProductPriceHistoryPoint(BaseModel):
    day: date
    unit_price: float


class ProductPriceHistoryResponse(BaseModel):
    product_id: UUID
    currency: str = "USD"
    points: list[ProductPriceHistoryPoint]
    period_low: float | None = None
    period_high: float | None = None


class ProductSuggestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str | None = None


class ProductWithSimilar(BaseModel):
    product: ProductPublic
    similar_products: list[ProductPublic]
    bought_together: list[ProductPublic] = Field(default_factory=list)
    review_summary: ReviewSummary = Field(default_factory=ReviewSummary)
    review_eligibility: ProductReviewEligibility = Field(default_factory=ProductReviewEligibility)


class ProductGalleryRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    image_url: str
    sort_order: int


class AdminProductDetailResponse(BaseModel):
    product: ProductPublic
    images: list[ProductGalleryRow]


class ProductImageAddBody(BaseModel):
    image_url: str = Field(min_length=1, max_length=2048)

    @field_validator("image_url", mode="before")
    @classmethod
    def _strip_url(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class ProductImageReorderBody(BaseModel):
    image_ids: list[UUID] = Field(min_length=1)


class ProductVariantUpsert(BaseModel):
    id: UUID | None = None
    label: str = Field(min_length=1, max_length=400)
    price: float = Field(ge=0)
    stock: int = Field(ge=0, default=0)
    sort_order: int = Field(default=0)
    options: dict[str, str] | None = None


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    price: float = Field(ge=0)
    category: str | None = Field(None, max_length=100)
    brand: str | None = Field(None, max_length=120)
    tags: list[str] | None = None
    image_url: str | None = Field(None, max_length=2048)
    video_url: str | None = Field(None, max_length=2048)
    stock: int = Field(default=0, ge=0)
    sale_price: float | None = Field(None, ge=0)
    sale_ends_at: datetime | None = None
    variants: list[ProductVariantUpsert] | None = None
    product_code: str | None = Field(None, max_length=40)
    meta_title: str | None = Field(None, max_length=300)
    meta_description: str | None = Field(None, max_length=500)
    a_plus_modules: list[dict] | None = None
    is_hazardous: bool = False
    minimum_age: int | None = Field(None, ge=1, le=99)
    compliance_note: str | None = Field(None, max_length=2000)
    volume_tiers: list[VolumeTierRow] | None = None

    @field_validator("product_code", mode="before")
    @classmethod
    def _norm_product_code_create(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        if not isinstance(v, str):
            raise ValueError("product_code must be a string")
        return normalize_product_code(v)

    @field_validator("compliance_note", mode="before")
    @classmethod
    def _strip_compliance_note_create(cls, v: object) -> object:
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        s = v.strip()
        return s or None

    @field_validator("meta_title", "meta_description", mode="before")
    @classmethod
    def _strip_meta_create(cls, v: object) -> object:
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        s = v.strip()
        return s or None

    @model_validator(mode="after")
    def _validate_flash_create(self) -> ProductCreate:
        has_s = self.sale_price is not None
        has_e = self.sale_ends_at is not None
        if has_s != has_e:
            raise ValueError("sale_price and sale_ends_at must both be set, or both omitted")
        if has_s and self.sale_price is not None and self.sale_price >= self.price:
            raise ValueError("sale_price must be less than list price")
        return self

    @model_validator(mode="after")
    def _validate_volume_tiers_create(self) -> ProductCreate:
        if not self.volume_tiers:
            return self
        cap = volume_tier_price_cap_from_create_body(self)
        validate_volume_tiers_against_cap(cap=cap, tiers=list(self.volume_tiers))
        return self

    @field_validator("image_url", "video_url", mode="before")
    @classmethod
    def _strip_optional_url(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("tags")
    @classmethod
    def _normalize_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [t.strip() for t in v if t and str(t).strip()]
        return out or None

    @field_validator("brand", mode="before")
    @classmethod
    def _strip_brand_create(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("a_plus_modules", mode="before")
    @classmethod
    def _coerce_a_plus_modules_create(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, list):
            return v
        raise ValueError("a_plus_modules must be a list or null")

    @field_validator("a_plus_modules")
    @classmethod
    def _normalize_a_plus_modules_create(cls, v: list | None) -> list[dict] | None:
        if v is None:
            return None
        return normalize_a_plus_modules(v)


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    price: float | None = Field(None, ge=0)
    category: str | None = Field(None, max_length=100)
    brand: str | None = Field(None, max_length=120)
    tags: list[str] | None = None
    image_url: str | None = Field(None, max_length=2048)
    video_url: str | None = Field(None, max_length=2048)
    stock: int | None = Field(None, ge=0)
    sale_price: float | None = Field(None, ge=0)
    sale_ends_at: datetime | None = None
    variants: list[ProductVariantUpsert] | None = None
    product_code: str | None = Field(None, max_length=40)
    meta_title: str | None = Field(None, max_length=300)
    meta_description: str | None = Field(None, max_length=500)
    a_plus_modules: list[dict] | None = None
    is_hazardous: bool | None = None
    minimum_age: int | None = Field(None, ge=1, le=99)
    compliance_note: str | None = Field(None, max_length=2000)
    volume_tiers: list[VolumeTierRow] | None = None

    @field_validator("product_code", mode="before")
    @classmethod
    def _norm_product_code_update(cls, v: object) -> object:
        if v is None:
            return None
        if v == "":
            return None
        if not isinstance(v, str):
            raise ValueError("product_code must be a string")
        return normalize_product_code(v)

    @field_validator("compliance_note", mode="before")
    @classmethod
    def _strip_compliance_note_update(cls, v: object) -> object:
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        s = v.strip()
        return s or None

    @field_validator("meta_title", "meta_description", mode="before")
    @classmethod
    def _strip_meta_update(cls, v: object) -> object:
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        s = v.strip()
        return s or None

    @field_validator("image_url", "video_url", mode="before")
    @classmethod
    def _strip_optional_url_update(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("tags")
    @classmethod
    def _normalize_tags_update(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [t.strip() for t in v if t and str(t).strip()]
        return out or None

    @field_validator("brand", mode="before")
    @classmethod
    def _strip_brand_update(cls, v: object) -> object:
        if v is None:
            return None
        if v == "":
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("a_plus_modules", mode="before")
    @classmethod
    def _coerce_a_plus_modules_update(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, list):
            return v
        raise ValueError("a_plus_modules must be a list or null")

    @field_validator("a_plus_modules")
    @classmethod
    def _normalize_a_plus_modules_update(cls, v: list | None) -> list[dict] | None:
        if v is None:
            return None
        return normalize_a_plus_modules(v)
