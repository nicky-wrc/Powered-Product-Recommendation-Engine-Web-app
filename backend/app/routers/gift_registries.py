from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models.gift_registry import GiftRegistry, GiftRegistryItem, new_registry_slug
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.schemas.gift_registry import (
    GiftRegistryCreate,
    GiftRegistryDetail,
    GiftRegistryItemCreate,
    GiftRegistryItemPublic,
    GiftRegistryListMineResponse,
    GiftRegistrySummary,
    GiftRegistryUpdate,
)
from app.schemas.products import ProductPublic, product_public
from app.services.product_variants import product_ids_requiring_variant

router = APIRouter(prefix="/gift-registries", tags=["gift-registries"])


def _ensure_owner(reg: GiftRegistry, user: User) -> None:
    if reg.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your registry")


def _item_product_public(db: Session, item: GiftRegistryItem) -> ProductPublic:
    p = db.get(Product, item.product_id)
    if p is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Missing product for registry item")
    if item.variant_id:
        v = db.get(ProductVariant, item.variant_id)
        if v is None or v.product_id != item.product_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid variant for this product line")
        return product_public(p, variants_for_detail=[v])
    need = product_ids_requiring_variant(db, {item.product_id})
    if item.product_id in need:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This line requires a variant")
    return product_public(p)


def _registry_owner_name(db: Session, user_id: UUID) -> str | None:
    u = db.get(User, user_id)
    return u.name.strip() if u and u.name else None


def _registry_detail(db: Session, reg: GiftRegistry) -> GiftRegistryDetail:
    owner_display_name = _registry_owner_name(db, reg.user_id)
    item_rows = list(
        db.scalars(
            select(GiftRegistryItem)
            .where(GiftRegistryItem.registry_id == reg.id)
            .order_by(GiftRegistryItem.sort_order.asc(), GiftRegistryItem.id.asc()),
        ).all(),
    )
    items: list[GiftRegistryItemPublic] = []
    for it in item_rows:
        items.append(
            GiftRegistryItemPublic(
                id=it.id,
                product_id=it.product_id,
                variant_id=it.variant_id,
                quantity_requested=it.quantity_requested,
                note=it.note,
                sort_order=it.sort_order,
                product=_item_product_public(db, it),
            ),
        )
    return GiftRegistryDetail(
        id=reg.id,
        title=reg.title,
        slug=reg.slug,
        description=reg.description,
        event_date=reg.event_date,
        created_at=reg.created_at,
        owner_display_name=owner_display_name,
        items=items,
    )


def _validate_item_payload(db: Session, body: GiftRegistryItemCreate) -> None:
    p = db.get(Product, body.product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    need = product_ids_requiring_variant(db, {body.product_id})
    if body.product_id in need:
        if body.variant_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "variant_id is required for this product")
        v = db.get(ProductVariant, body.variant_id)
        if v is None or v.product_id != body.product_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid variant_id")
    elif body.variant_id is not None:
        v = db.get(ProductVariant, body.variant_id)
        if v is None or v.product_id != body.product_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid variant_id")


@router.post("", response_model=GiftRegistryDetail, status_code=status.HTTP_201_CREATED)
def create_registry(
    body: GiftRegistryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryDetail:
    for _ in range(10):
        slug = new_registry_slug(title=body.title, allocate_token=uuid4().hex)
        reg = GiftRegistry(
            user_id=user.id,
            title=body.title.strip(),
            slug=slug,
            description=body.description,
            event_date=body.event_date,
        )
        db.add(reg)
        try:
            db.commit()
            db.refresh(reg)
            return _registry_detail(db, reg)
        except IntegrityError:
            db.rollback()
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate URL slug — try again")


@router.get("/mine", response_model=GiftRegistryListMineResponse)
def list_my_registries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryListMineResponse:
    rows = list(
        db.scalars(
            select(GiftRegistry)
            .where(GiftRegistry.user_id == user.id)
            .order_by(GiftRegistry.created_at.desc()),
        ).all(),
    )
    counts: dict[UUID, int] = {}
    if rows:
        stmt = (
            select(GiftRegistryItem.registry_id, func.count())
            .where(GiftRegistryItem.registry_id.in_([r.id for r in rows]))
            .group_by(GiftRegistryItem.registry_id)
        )
        for rid, c in db.execute(stmt):
            counts[rid] = int(c)
    summaries = [
        GiftRegistrySummary(
            id=r.id,
            title=r.title,
            slug=r.slug,
            description=r.description,
            event_date=r.event_date,
            created_at=r.created_at,
            item_count=counts.get(r.id, 0),
        )
        for r in rows
    ]
    return GiftRegistryListMineResponse(registries=summaries)


@router.get("/slug/{slug}", response_model=GiftRegistryDetail)
def get_registry_public(
    slug: str,
    db: Session = Depends(get_db),
    _viewer: User | None = Depends(get_current_user_optional),
) -> GiftRegistryDetail:
    key = (slug or "").strip()
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid slug")
    reg = db.scalar(select(GiftRegistry).where(GiftRegistry.slug == key))
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    return _registry_detail(db, reg)


@router.get("/{registry_id}", response_model=GiftRegistryDetail)
def get_registry_owned(
    registry_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryDetail:
    reg = db.get(GiftRegistry, registry_id)
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    _ensure_owner(reg, user)
    return _registry_detail(db, reg)


@router.put("/{registry_id}", response_model=GiftRegistryDetail)
def update_registry(
    registry_id: UUID,
    body: GiftRegistryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryDetail:
    reg = db.get(GiftRegistry, registry_id)
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    _ensure_owner(reg, user)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        reg.title = str(data["title"]).strip()
    if "description" in data:
        reg.description = data["description"]
    if "event_date" in data:
        reg.event_date = data["event_date"]
    db.commit()
    db.refresh(reg)
    return _registry_detail(db, reg)


@router.delete("/{registry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_registry(
    registry_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    reg = db.get(GiftRegistry, registry_id)
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    _ensure_owner(reg, user)
    db.delete(reg)
    db.commit()


@router.post("/{registry_id}/items", response_model=GiftRegistryDetail, status_code=status.HTTP_201_CREATED)
def add_registry_item(
    registry_id: UUID,
    body: GiftRegistryItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryDetail:
    reg = db.get(GiftRegistry, registry_id)
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    _ensure_owner(reg, user)
    _validate_item_payload(db, body)
    max_so = db.scalar(
        select(func.max(GiftRegistryItem.sort_order)).where(GiftRegistryItem.registry_id == registry_id),
    )
    next_so = (max_so if max_so is not None else -1) + 1
    db.add(
        GiftRegistryItem(
            registry_id=registry_id,
            product_id=body.product_id,
            variant_id=body.variant_id,
            quantity_requested=int(body.quantity_requested),
            note=body.note,
            sort_order=next_so,
        ),
    )
    db.commit()
    db.refresh(reg)
    return _registry_detail(db, reg)


@router.delete("/{registry_id}/items/{item_id}", response_model=GiftRegistryDetail)
def remove_registry_item(
    registry_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GiftRegistryDetail:
    reg = db.get(GiftRegistry, registry_id)
    if reg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registry not found")
    _ensure_owner(reg, user)
    row = db.get(GiftRegistryItem, item_id)
    if row is None or row.registry_id != registry_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    db.delete(row)
    db.commit()
    db.refresh(reg)
    return _registry_detail(db, reg)
