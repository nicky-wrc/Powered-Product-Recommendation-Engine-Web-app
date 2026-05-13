from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewSummary(BaseModel):
    average: float | None = None
    count: int = 0


class ProductReviewEligibility(BaseModel):
    """Whether the current browser user may submit a new/updated review (PDP hints)."""

    can_submit_review: bool = False
    reason: Literal["login", "purchase"] | None = None


class ProductReviewPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rating: int
    title: str | None
    body: str | None
    image_urls: list[str] = Field(default_factory=list)
    author_name: str
    created_at: datetime
    is_mine: bool = False
    verified_purchase: bool = False


class ProductReviewListResponse(BaseModel):
    items: list[ProductReviewPublic]
    total: int
    page: int
    total_pages: int
    average: float | None = None


class ProductReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=8000)
    image_urls: list[str] | None = None

    @field_validator("title", "body", mode="before")
    @classmethod
    def _strip_opt(cls, v: object) -> object:
        if v is None or not isinstance(v, str):
            return v
        t = v.strip()
        return t or None

    @field_validator("image_urls")
    @classmethod
    def _cap_images(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [x.strip() for x in v if x and str(x).strip()][:4]
        for u in out:
            if len(u) > 2048:
                raise ValueError("Each image URL must be at most 2048 characters")
        return out or None


class ProductReviewCreateResponse(BaseModel):
    review: ProductReviewPublic
    review_summary: ReviewSummary
