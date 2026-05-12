from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.image_upload import read_image_upload
from app.models.interaction import Interaction
from app.models.order import Order
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_review import ProductReview
from app.models.user import User
from app.services.product_gallery import sync_product_cover
from app.upload_paths import PRODUCT_IMAGES_DIR
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

router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_product_detail(db: Session, p: Product) -> AdminProductDetailResponse:
    imgs = list(
        db.scalars(
            select(ProductImage)
            .where(ProductImage.product_id == p.id)
            .order_by(ProductImage.sort_order.asc(), ProductImage.id.asc()),
        ).all(),
    )
    urls = [i.image_url for i in imgs] or ([p.image_url] if p.image_url else [])
    return AdminProductDetailResponse(
        product=product_public(p, gallery_urls=urls),
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
        "note": "revenue = sum(order.total_amount); purchases = interaction rows (includes pre-order demos).",
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
    p = Product(
        name=body.name.strip(),
        description=(body.description.strip() if body.description else None) or None,
        price=Decimal(str(body.price)),
        category=(body.category.strip() if body.category else None) or None,
        tags=body.tags,
        image_url=(body.image_url.strip() if body.image_url else None) or None,
        stock=body.stock,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    if p.image_url:
        db.add(ProductImage(product_id=p.id, image_url=p.image_url, sort_order=0))
        db.commit()
        db.refresh(p)
    return product_public(p)


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
    db.commit()
    db.refresh(p)
    return product_public(p)


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
