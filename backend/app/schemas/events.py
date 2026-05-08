from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class EventCreate(BaseModel):
    product_id: UUID
    event_type: Literal["view", "click", "add_to_cart", "purchase", "search"]
    metadata: dict[str, Any] | None = None


class EventPublic(BaseModel):
    id: UUID
    product_id: UUID
    event_type: str
    weight: int
