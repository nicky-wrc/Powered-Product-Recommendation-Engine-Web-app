import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import CartItem, Interaction, Order, OrderItem, Product, Recommendation, User  # noqa: F401
from app.routers import admin, auth, cart, events, orders, products, recommendations
from app.services.seed import repair_legacy_image_urls, seed_products_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("SKIP_DB_BOOTSTRAP") != "1":
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_products_if_empty(db)
            repair_legacy_image_urls(db)
        finally:
            db.close()
    yield


app = FastAPI(title="Recommendation Engine API", version="0.1.0", lifespan=lifespan)

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

app.include_router(auth.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
