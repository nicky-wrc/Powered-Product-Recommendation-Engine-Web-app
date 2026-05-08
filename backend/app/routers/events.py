from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.interaction import Interaction
from app.models.product import Product
from app.models.user import User
from app.schemas.events import EventCreate, EventPublic
from app.services.interaction_weights import interaction_weight

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventPublic)
def track_event(
    body: EventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventPublic:
    if db.get(Product, body.product_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    w = interaction_weight(body.event_type, body.metadata)
    ev = Interaction(
        user_id=user.id,
        product_id=body.product_id,
        event_type=body.event_type,
        weight=w,
        event_metadata=body.metadata,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return EventPublic(
        id=ev.id,
        product_id=ev.product_id,
        event_type=ev.event_type,
        weight=ev.weight,
    )
