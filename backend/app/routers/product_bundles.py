from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.product_bundle import ProductBundle
from app.schemas.product_bundles import ProductBundleListRow, ProductBundlePublic
from app.services.product_bundles_public import load_bundle_for_store, product_bundle_list_row, product_bundle_public

router = APIRouter(prefix="/product-bundles", tags=["product-bundles"])


@router.get("", response_model=list[ProductBundleListRow])
def list_product_bundles(db: Session = Depends(get_db)) -> list[ProductBundleListRow]:
    rows = list(
        db.scalars(
            select(ProductBundle)
            .where(ProductBundle.active.is_(True))
            .options(selectinload(ProductBundle.items))
            .order_by(ProductBundle.sort_order.asc(), ProductBundle.name.asc()),
        ).all(),
    )
    return [product_bundle_list_row(db, b) for b in rows]


@router.get("/{bundle_id}", response_model=ProductBundlePublic)
def get_product_bundle(bundle_id: UUID, db: Session = Depends(get_db)) -> ProductBundlePublic:
    b = load_bundle_for_store(db, bundle_id)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bundle not found")
    return product_bundle_public(db, b)
