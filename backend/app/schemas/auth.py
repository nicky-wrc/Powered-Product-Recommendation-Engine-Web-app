from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

    @field_validator("name", "email", mode="before")
    @classmethod
    def strip_outer_whitespace(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class UserPublic(BaseModel):
    id: UUID
    email: str
    name: str
    is_admin: bool
    avatar_url: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    province: str | None = Field(default=None, max_length=128)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def name_strip(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator(
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "province",
        "postal_code",
        "country",
        mode="before",
    )
    @classmethod
    def empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and v.strip() == "":
            return None
        if isinstance(v, str):
            return v.strip()
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
