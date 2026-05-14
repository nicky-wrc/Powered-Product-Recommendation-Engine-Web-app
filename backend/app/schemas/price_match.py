from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

ALLOWED_STATUSES = frozenset({"pending", "approved", "rejected", "adjusted"})


class PriceMatchReportCreate(BaseModel):
    reported_price: float = Field(gt=0)
    currency: str = Field(default="USD", max_length=8)
    competitor_url: str | None = Field(None, max_length=2048)
    notes: str | None = Field(None, max_length=4000)
    reporter_email: EmailStr | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def _norm_currency(cls, v: object) -> object:
        if v is None:
            return "USD"
        if isinstance(v, str):
            return v.strip().upper() or "USD"
        return v

    @field_validator("competitor_url", mode="before")
    @classmethod
    def _strip_url(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _strip_notes(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v


class PriceMatchReportPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    user_id: UUID | None
    reporter_email: str | None
    competitor_url: str | None
    reported_price: float
    currency: str
    notes: str | None
    storefront_unit_at_submit: float | None
    status: str
    admin_note: str | None
    created_at: datetime


class PriceMatchReportAdminRow(PriceMatchReportPublic):
    product_name: str | None = None


class PriceMatchReportListResponse(BaseModel):
    reports: list[PriceMatchReportAdminRow]
    total: int


class PriceMatchReportAdminUpdate(BaseModel):
    status: str
    admin_note: str | None = Field(None, max_length=4000)

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        s = v.strip().lower()
        if s not in ALLOWED_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(ALLOWED_STATUSES))}")
        return s

    @field_validator("admin_note", mode="before")
    @classmethod
    def _strip_admin_note(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v

