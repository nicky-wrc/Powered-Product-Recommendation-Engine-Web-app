"""Serialize product bundles for storefront APIs."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.product import Product
from app.models.product_bundle import ProductBundle, ProductBundleItem
from app.models.product_variant import ProductVariant
from app.schemas.product_bundles import ProductBundleItemPublic, ProductBundleListRow, ProductBundlePublic
from app.schemas.products import product_public
from app.services.product_pricing import effective_unit_price
from app.services.product_variants import product_ids_requiring_variant, variant_aggregates_for_product_ids


def _bundle_item_line_total(db: Session, it: ProductBundleItem) -> Decimal:
    p = db.get(Product, it.product_id)
    if p is None:
        return Decimal("0")
    need = product_ids_requiring_variant(db, {p.id})
    if p.id in need:
        if it.variant_id is None:
            return Decimal("0")
        v = db.get(ProductVariant, it.variant_id)
        if v is None or v.product_id != p.id:
            return Decimal("0")
        return v.price * it.quantity
    if it.variant_id is not None:
        return Decimal("0")
    return effective_unit_price(p) * it.quantity


def bundle_list_subtotal(db: Session, bundle: ProductBundle) -> Decimal:
    items = sorted(bundle.items, key=lambda x: (x.sort_order, str(x.id)))
    return sum((_bundle_item_line_total(db, it) for it in items), start=Decimal("0"))


def product_bundle_list_row(db: Session, b: ProductBundle) -> ProductBundleListRow:
    ls = bundle_list_subtotal(db, b)
    bp = b.bundle_price
    sav = max(Decimal("0"), ls - bp)
    return ProductBundleListRow(
        id=b.id,
        name=b.name,
        slug=b.slug,
        description=b.description,
        bundle_price=float(bp),
        list_subtotal=float(ls),
        savings=float(sav),
    )


def product_bundle_public(db: Session, b: ProductBundle) -> ProductBundlePublic:
    items_orm = sorted(b.items, key=lambda x: (x.sort_order, str(x.id)))
    pids = [it.product_id for it in items_orm]
    agg = variant_aggregates_for_product_ids(db, list(set(pids)))
    list_sum = Decimal("0")
    items_out: list[ProductBundleItemPublic] = []
    for it in items_orm:
        p = db.get(Product, it.product_id)
        if p is None:
            continue
        lt = _bundle_item_line_total(db, it)
        list_sum += lt
        need = product_ids_requiring_variant(db, {p.id})
        if it.variant_id is not None:
            v = db.get(ProductVariant, it.variant_id)
            pub = product_public(p, variants_for_detail=[v] if v and v.product_id == p.id else None)
        elif p.id in need:
            pa = agg.get(p.id)
            pub = product_public(p, variant_aggregate=pa if pa and pa[0] > 0 else None)
        else:
            pa = agg.get(p.id)
            pub = product_public(p, variant_aggregate=pa if pa and pa[0] > 0 else None)
        items_out.append(
            ProductBundleItemPublic(
                product_id=it.product_id,
                variant_id=it.variant_id,
                quantity=it.quantity,
                product=pub,
            ),
        )
    bp = b.bundle_price
    sav = max(Decimal("0"), list_sum - bp)
    return ProductBundlePublic(
        id=b.id,
        name=b.name,
        slug=b.slug,
        description=b.description,
        bundle_price=float(bp),
        list_subtotal=float(list_sum),
        savings=float(sav),
        items=items_out,
    )


def load_bundle_for_store(db: Session, bundle_id) -> ProductBundle | None:
    return db.scalar(
        select(ProductBundle)
        .where(ProductBundle.id == bundle_id, ProductBundle.active.is_(True))
        .options(selectinload(ProductBundle.items)),
    )
