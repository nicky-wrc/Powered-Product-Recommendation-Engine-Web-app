from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.products import ProductPublic


class GiftRegistryCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(None, max_length=4000)
    event_date: date | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("description", mode="before")
    @classmethod
    def _strip_desc(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v


class GiftRegistryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=4000)
    event_date: date | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("description", mode="before")
    @classmethod
    def _strip_desc(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v


class GiftRegistrySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None
    event_date: date | None
    created_at: datetime
    item_count: int = 0


class GiftRegistryItemCreate(BaseModel):
    product_id: UUID
    variant_id: UUID | None = None
    quantity_requested: int = Field(default=1, ge=1, le=99)
    note: str | None = Field(None, max_length=500)

    @field_validator("note", mode="before")
    @classmethod
    def _strip_note(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v


class GiftRegistryItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    variant_id: UUID | None
    quantity_requested: int
    note: str | None
    sort_order: int
    product: ProductPublic


class GiftRegistryDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None
    event_date: date | None
    created_at: datetime
    owner_display_name: str | None = None
    items: list[GiftRegistryItemPublic] = Field(default_factory=list)


class GiftRegistryListMineResponse(BaseModel):
    registries: list[GiftRegistrySummary]
