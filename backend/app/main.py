import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine

# Import models so Base.metadata knows all tables before create_all
from app.models import Interaction, Product, Recommendation, User  # noqa: F401


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("SKIP_DB_BOOTSTRAP") != "1":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Recommendation Engine API", version="0.1.0", lifespan=lifespan)

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
