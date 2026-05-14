import os
import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.http_errors import register_exception_handlers
from app.database import Base, SessionLocal, apply_runtime_schema_patches, engine
from app.middleware.request_id import RequestIdMiddleware
from app.models import (
    CartItem,
    GiftCard,
    Interaction,
    Order,
    OrderItem,
    Product,
    ProductAnswer,
    ProductImage,
    ProductQuestion,
    ProductReview,
    ProductVariant,
    ProductBundle,
    ProductBundleItem,
    ProductPriceSnapshot,
    PromoCode,
    Recommendation,
    User,
    UserAddress,
    PriceMatchReport,
    GiftRegistry,
    GiftRegistryItem,
)  # noqa: F401
from app.routers import (
    addresses,
    admin,
    auth,
    cart,
    events,
    gift_cards,
    gift_registries,
    health,
    loyalty,
    orders,
    payments,
    product_bundles,
    products,
    promos,
    recommendations,
)
from app.services.bootstrap_admin import ensure_bootstrap_admin
from app.services.product_gallery import backfill_product_galleries_from_legacy_image_url
from app.services.seed import (
    ensure_gift_card_products,
    ensure_welcome_promo,
    insert_missing_demo_products,
    repair_legacy_image_urls,
    seed_products_if_empty,
    sync_demo_catalog_images,
    sync_demo_installation_addons,
    sync_demo_product_videos,
)
from app.upload_paths import PRODUCT_IMAGES_DIR, PROFILE_IMAGES_DIR, REVIEW_IMAGES_DIR, UPLOADS_ROOT


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("SKIP_DB_BOOTSTRAP") != "1":
        Base.metadata.create_all(bind=engine)
        apply_runtime_schema_patches()
        db = SessionLocal()
        try:
            seed_products_if_empty(db)
            insert_missing_demo_products(db)
            repair_legacy_image_urls(db)
            sync_demo_catalog_images(db)
            sync_demo_product_videos(db)
            sync_demo_installation_addons(db)
            backfill_product_galleries_from_legacy_image_url(db)
            ensure_gift_card_products(db)
            ensure_welcome_promo(db)
            ensure_bootstrap_admin(db)
        finally:
            db.close()
    yield


# Help Windows / minimal DBs serve correct Content-Type for modern formats.
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")
mimetypes.add_type("image/svg+xml", ".svg")
PRODUCT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Recommendation Engine API", version=settings.app_version, lifespan=lifespan)
register_exception_handlers(app)

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# When cors_allow_lan_regex is true: allow loopback on any port (incl. IPv6 [::1], common on Windows)
# plus RFC1918-style LAN dev URLs, so the browser Origin always matches without enumerating ports.
_cors_regex = (
    r"https?://(?:localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?$"
    if settings.cors_allow_lan_regex
    else None
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["http://localhost:3000"],
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api")
app.include_router(addresses.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(product_bundles.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(promos.router, prefix="/api")
app.include_router(loyalty.router, prefix="/api")
app.include_router(gift_cards.router, prefix="/api")
app.include_router(gift_registries.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


app.mount("/uploads", StaticFiles(directory=str(UPLOADS_ROOT)), name="uploads")
