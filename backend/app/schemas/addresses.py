from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip_opt(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        return s if s else None
    return None


class UserAddressCreate(BaseModel):
    label: str | None = Field(default=None, max_length=64)
    recipient_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    address_line1: str = Field(min_length=1, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    province: str | None = Field(default=None, max_length=128)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=128)
    is_default: bool = False

    @field_validator("address_line1", mode="before")
    @classmethod
    def strip_line1(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("label", "recipient_name", "phone", "address_line2", "city", "province", "postal_code", "country", mode="before")
    @classmethod
    def strip_optional(cls, v: object) -> object:
        return _strip_opt(v)


class UserAddressUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=64)
    recipient_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    address_line1: str | None = Field(default=None, min_length=1, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    province: str | None = Field(default=None, max_length=128)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=128)
    is_default: bool | None = None

    @field_validator("address_line1", mode="before")
    @classmethod
    def strip_line1(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("label", "recipient_name", "phone", "address_line2", "city", "province", "postal_code", "country", mode="before")
    @classmethod
    def strip_optional(cls, v: object) -> object:
        return _strip_opt(v)


class UserAddressPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    label: str | None
    recipient_name: str | None
    phone: str | None
    address_line1: str
    address_line2: str | None
    city: str | None
    province: str | None
    postal_code: str | None
    country: str | None
    is_default: bool
    created_at: datetime
