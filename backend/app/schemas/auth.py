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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
