import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.redis_cache import redis_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def liveness() -> dict:
    return {"status": "ok", "version": settings.app_version}


@router.get("/health/ready")
def readiness(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        logger.exception("readiness database check failed")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database_unavailable",
        ) from e
    return {
        "status": "ready",
        "version": settings.app_version,
        "checks": {
            "database": "ok",
            "redis": redis_status(),
        },
    }
