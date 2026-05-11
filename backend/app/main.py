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
    Interaction,
    Order,
    OrderItem,
    Product,
    Recommendation,
    User,
    UserAddress,
)  # noqa: F401
from app.routers import addresses, admin, auth, cart, events, health, orders, payments, products, recommendations
from app.services.bootstrap_admin import ensure_bootstrap_admin
from app.services.seed import (
    insert_missing_demo_products,
    repair_legacy_image_urls,
    seed_products_if_empty,
    sync_demo_catalog_images,
)
from app.upload_paths import PRODUCT_IMAGES_DIR, PROFILE_IMAGES_DIR, UPLOADS_ROOT


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
app.include_router(cart.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


app.mount("/uploads", StaticFiles(directory=str(UPLOADS_ROOT)), name="uploads")
