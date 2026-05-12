from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_admin_user
from app.image_upload import read_image_upload
from app.models.interaction import Interaction
from app.models.order import Order
from app.models.product import Product
from app.models.product_answer import ProductAnswer
from app.models.product_image import ProductImage
from app.models.product_question import ProductQuestion
from app.models.product_review import ProductReview
from app.models.product_variant import ProductVariant
from app.models.promo_code import PromoCode
from app.models.user import User
from app.schemas.product_qa import ProductAnswerBody, ProductQaItemPublic
from app.schemas.products import (
    AdminProductDetailResponse,
    ProductCreate,
    ProductGalleryRow,
    ProductImageAddBody,
    ProductImageReorderBody,
    ProductPublic,
    ProductUpdate,
    product_public,
)
from app.services.product_gallery import sync_product_cover
from app.services.product_qa import product_qa_item_public
from app.upload_paths import PRODUCT_IMAGES_DIR

router = APIRouter(prefix="/admin", tags=["admin"])


def _validate_product_flash(p: Product) -> None:
    has_s = p.sale_price is not None
    has_e = p.sale_ends_at is not None
    if has_s != has_e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "sale_price and sale_ends_at must both be set or both cleared",
        )
    if has_s and p.sale_price is not None and p.sale_price >= p.price:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "sale_price must be less than list price",
        )


def _admin_product_detail(db: Session, p: Product) -> AdminProductDetailResponse:
    imgs = list(
        db.scalars(
            select(ProductImage)
            .where(ProductImage.product_id == p.id)
            .order_by(ProductImage.sort_order.asc(), ProductImage.id.asc()),
        ).all(),
    )
    urls = [i.image_url for i in imgs] or ([p.image_url] if p.image_url else [])
    
    variant_rows = list(
        db.scalars(
            select(ProductVariant)
            .where(ProductVariant.product_id == p.id)
            .order_by(ProductVariant.sort_order.asc(), ProductVariant.id.asc()),
        ).all(),
    )
    return AdminProductDetailResponse(
        product=product_public(p, gallery_urls=urls, variants_for_detail=variant_rows or None),
        images=[ProductGalleryRow.model_validate(i) for i in imgs],
    )


@router.get("/analytics")
def analytics(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    total_users = int(db.scalar(select(func.count()).select_from(User)) or 0)
    total_products = int(db.scalar(select(func.count()).select_from(Product)) or 0)
    views = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "view")
        )
        or 0
    )
    clicks = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "click")
        )
        or 0
    )
    purchases = int(
        db.scalar(
            select(func.count()).select_from(Interaction).where(Interaction.event_type == "purchase")
        )
        or 0
    )
    total_orders = int(db.scalar(select(func.count()).select_from(Order)) or 0)
    revenue_raw = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)))
    revenue = float(revenue_raw or 0)
    ctr = (clicks / views) if views else 0.0
    data = {
        "total_users": total_users,
        "total_products": total_products,
        "total_views": views,
        "total_clicks": clicks,
        "total_purchases": purchases,
        "total_orders": total_orders,
        "revenue": round(revenue, 2),
        "ctr": round(ctr, 6),
        "note": "revenue = sum(order.total_amount); purchases = interaction rows (includes pre-orders).",
    }
    return data


@router.post("/upload/product-image")
async def upload_product_image(
    file: UploadFile = File(...),
    _admin: User = Depends(get_admin_user),
) -> dict[str, str]:
    data, ext = await read_image_upload(file)
    name = f"{uuid4().hex}{ext}"
    dest = PRODUCT_IMAGES_DIR / name
    dest.write_bytes(data)
    return {"url": f"/uploads/products/{name}"}


@router.post("/products", response_model=ProductPublic, status_code=status.HTTP_201_CREATED)
def create_product(
    body: ProductCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> ProductPublic:
    variants_in = list(body.variants) if body.variants else []
    p = Product(
        name=body.name.strip(),
        description=(body.description.strip() if body.description else None) or None,
        price=Decimal(str(body.price)),
        category=(body.category.strip() if body.category else None) or None,
        tags=body.tags,
        image_url=(body.image_url.strip() if body.image_url else None) or None,
        video_url=body.video_url,
        stock=body.stock,
        sale_price=Decimal(str(body.sale_price)) if body.sale_price is not None else None,
        sale_ends_at=body.sale_ends_at,
    )
    _validate_product_flash(p)
    db.add(p)
    db.commit()
    db.refresh(p)
    if p.image_url:
        db.add(ProductImage(product_id=p.id, image_url=p.image_url, sort_order=0))
        db.commit()
        db.refresh(p)
    if variants_in:
        for i, spec in enumerate(variants_in):
            db.add(
                ProductVariant(
                    product_id=p.id,
                    label=spec.label.strip(),
                    price=Decimal(str(spec.price)),
                    stock=int(spec.stock),
                    sort_order=i,
                    options=spec.options,
                ),
            )
        db.commit()
        db.refresh(p)
    vrows = list(
        db.scalars(
            select(ProductVariant)
            .where(ProductVariant.product_id == p.id)
            .order_by(ProductVariant.sort_order.asc(), ProductVariant.id.asc()),
        ).all(),
    )
    return product_public(p, variants_for_detail=vrows if vrows else None)


@router.put("/products/{product_id}", response_model=ProductPublic)
def update_product(
    product_id: UUID,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> ProductPublic:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    data = body.model_dump(exclude_unset=True)
    variants_payload = data.pop("variants", None)

    img_count = int(
        db.scalar(select(func.count()).select_from(ProductImage).where(ProductImage.product_id == product_id)) or 0,
    )
    if "image_url" in data and img_count > 0:
        data.pop("image_url", None)
    if "name" in data:
        p.name = str(data["name"]).strip()
    if "description" in data:
        d = data["description"]
        if d is None:
            p.description = None
        else:
            p.description = str(d).strip() or None
    if "price" in data and data["price"] is not None:
        p.price = Decimal(str(data["price"]))
    if "category" in data:
        c = data["category"]
        if c is None:
            p.category = None
        else:
            p.category = str(c).strip() or None
    if "tags" in data:
        p.tags = data["tags"]
    if "image_url" in data:
        u = data["image_url"]
        if u is None:
            p.image_url = None
        else:
            p.image_url = str(u).strip() or None
    if "stock" in data and data["stock"] is not None:
        p.stock = int(data["stock"])
    if "video_url" in data:
        u = data["video_url"]
        if u is None:
            p.video_url = None
        else:
            p.video_url = str(u).strip() or None
    if "sale_price" in data:
        sp = data["sale_price"]
        p.sale_price = Decimal(str(sp)) if sp is not None else None
    if "sale_ends_at" in data:
        p.sale_ends_at = data["sale_ends_at"]
    _validate_product_flash(p)
    if variants_payload is not None:
        cur = {v.id: v for v in db.scalars(select(ProductVariant).where(ProductVariant.product_id == product_id)).all()}
        incoming_with_id = {s["id"] for s in variants_payload if s.get("id")}
        for vid, v in cur.items():
            if vid not in incoming_with_id:
                db.delete(v)
        for spec in variants_payload:
            vid = spec.get("id")
            label = str(spec["label"]).strip()
            price_d = Decimal(str(spec["price"]))
            stock_i = int(spec["stock"])
            so = int(spec.get("sort_order") or 0)
            opts = spec.get("options")
            if vid:
                if vid not in cur:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown variant id {vid}")
                v = cur[vid]
                v.label = label
                v.price = price_d
                v.stock = stock_i
                v.sort_order = so
                v.options = opts
            else:
                db.add(
                    ProductVariant(
                        product_id=p.id,
                        label=label,
                        price=price_d,
                        stock=stock_i,
                        sort_order=so,
                        options=opts,
                    ),
                )
        db.flush()
    db.commit()
    db.refresh(p)
    vrows = list(
        db.scalars(select(ProductVariant).where(ProductVariant.product_id == p.id)).all(),
    )
    return product_public(p, variants_for_detail=vrows if vrows else None)


@router.get("/products/{product_id}/detail", response_model=AdminProductDetailResponse)
def admin_get_product_detail(
    product_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> AdminProductDetailResponse:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return _admin_product_detail(db, p)


@router.post("/products/{product_id}/images", response_model=AdminProductDetailResponse)
def admin_add_product_image(
    product_id: UUID,
    body: ProductImageAddBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> AdminProductDetailResponse:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    max_so = db.scalar(select(func.max(ProductImage.sort_order)).where(ProductImage.product_id == product_id))
    next_ord = (max_so if max_so is not None else -1) + 1
    db.add(ProductImage(product_id=product_id, image_url=body.image_url, sort_order=next_ord))
    db.flush()
    sync_product_cover(db, product_id)
    db.commit()
    db.refresh(p)
    return _admin_product_detail(db, p)


@router.delete("/products/{product_id}/images/{image_id}", response_model=AdminProductDetailResponse)
def admin_delete_product_image(
    product_id: UUID,
    image_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> AdminProductDetailResponse:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    row = db.get(ProductImage, image_id)
    if row is None or row.product_id != product_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    db.delete(row)
    db.flush()
    sync_product_cover(db, product_id)
    db.commit()
    db.refresh(p)
    return _admin_product_detail(db, p)


@router.put("/products/{product_id}/images/order", response_model=AdminProductDetailResponse)
def admin_reorder_product_images(
    product_id: UUID,
    body: ProductImageReorderBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> AdminProductDetailResponse:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    existing = list(db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)).all())
    if not existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product has no gallery images")
    by_id = {i.id for i in existing}
    if len(body.image_ids) != len(by_id) or set(body.image_ids) != by_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "image_ids must list each gallery image exactly once",
        )
    for idx, iid in enumerate(body.image_ids):
        row = db.get(ProductImage, iid)
        if row is not None:
            row.sort_order = idx
    db.flush()
    sync_product_cover(db, product_id)
    db.commit()
    db.refresh(p)
    return _admin_product_detail(db, p)


@router.delete("/products/{product_id}/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_product_review(
    product_id: UUID,
    review_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> None:
    row = db.get(ProductReview, review_id)
    if row is None or row.product_id != product_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    db.delete(row)
    db.commit()


@router.post(
    "/products/{product_id}/qa/{question_id}/answer",
    response_model=ProductQaItemPublic,
)
def admin_answer_product_question(
    product_id: UUID,
    question_id: UUID,
    body: ProductAnswerBody,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> ProductQaItemPublic:
    q = db.scalar(
        select(ProductQuestion)
        .where(ProductQuestion.id == question_id, ProductQuestion.product_id == product_id)
        .options(
            joinedload(ProductQuestion.author),
            joinedload(ProductQuestion.answer).joinedload(ProductAnswer.author),
        ),
    )
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    text = body.body.strip()
    if q.answer:
        q.answer.body = text
        q.answer.user_id = admin.id
    else:
        db.add(ProductAnswer(question_id=q.id, user_id=admin.id, body=text))
    db.commit()
    row = db.scalar(
        select(ProductQuestion)
        .where(ProductQuestion.id == question_id)
        .options(
            joinedload(ProductQuestion.author),
            joinedload(ProductQuestion.answer).joinedload(ProductAnswer.author),
        ),
    )
    assert row is not None
    return product_qa_item_public(row, admin.id)


@router.delete("/products/{product_id}/qa/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_product_question(
    product_id: UUID,
    question_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> None:
    q = db.scalar(
        select(ProductQuestion).where(
            ProductQuestion.id == question_id,
            ProductQuestion.product_id == product_id,
        ),
    )
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    db.delete(q)
    db.commit()


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> None:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    try:
        db.delete(p)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete product that appears on orders. Remove or archive it instead.",
        ) from None


class PromoCodeAdminCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    kind: Literal["percent", "fixed"]
    value: float = Field(ge=0)
    min_subtotal: float | None = Field(None, ge=0)
    max_uses: int | None = Field(None, ge=1)
    active: bool = True


class PromoCodeAdminPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    kind: str
    value: float
    min_subtotal: float | None
    max_uses: int | None
    uses_count: int
    active: bool


@router.get("/promos", response_model=list[PromoCodeAdminPublic])
def admin_list_promos(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> list[PromoCodeAdminPublic]:
    rows = list(db.scalars(select(PromoCode).order_by(PromoCode.code.asc())).all())
    return [PromoCodeAdminPublic.model_validate(r) for r in rows]


@router.post("/promos", response_model=PromoCodeAdminPublic, status_code=status.HTTP_201_CREATED)
def admin_create_promo(
    body: PromoCodeAdminCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> PromoCodeAdminPublic:
    code = body.code.strip().upper()
    if body.kind == "percent" and body.value > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Percent cannot exceed 100")
    if db.scalar(select(PromoCode).where(PromoCode.code == code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Promo code already exists")
    row = PromoCode(
        code=code,
        kind=body.kind,
        value=Decimal(str(body.value)),
        min_subtotal=Decimal(str(body.min_subtotal)) if body.min_subtotal is not None else None,
        max_uses=body.max_uses,
        uses_count=0,
        active=body.active,
        valid_from=None,
        valid_until=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return PromoCodeAdminPublic.model_validate(row)


@router.delete("/promos/{promo_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_promo(
    promo_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> None:
    row = db.get(PromoCode, promo_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promo not found")
    db.delete(row)
    db.commit()
