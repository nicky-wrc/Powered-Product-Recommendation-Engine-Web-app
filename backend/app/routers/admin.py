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
from app.models.user import User
from app.upload_paths import PRODUCT_IMAGES_DIR
from app.schemas.products import (
    ProductCreate,
    ProductPublic,
    ProductUpdate,
    product_public,
)

router = APIRouter(prefix="/admin", tags=["admin"])


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
