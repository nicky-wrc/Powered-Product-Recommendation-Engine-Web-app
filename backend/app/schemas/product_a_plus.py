"""Validated A+ / rich content blocks for product detail pages."""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


class APlusBannerModule(BaseModel):
    type: Literal["banner"] = "banner"
    headline: str = Field(max_length=200)
    body: str | None = Field(None, max_length=8000)
    image_url: str | None = Field(None, max_length=2048)


class APlusFeatureListModule(BaseModel):
    type: Literal["feature_list"] = "feature_list"
    title: str | None = Field(None, max_length=200)
    items: list[str] = Field(default_factory=list, max_length=24)


class APlusImageTextModule(BaseModel):
    type: Literal["image_text"] = "image_text"
    title: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=8000)
    image_url: str | None = Field(None, max_length=2048)
    image_align: Literal["left", "right"] = "left"


APlusModule = Annotated[
    Union[APlusBannerModule, APlusFeatureListModule, APlusImageTextModule],
    Field(discriminator="type"),
]

_a_plus_list_adapter = TypeAdapter(list[APlusModule])


def normalize_a_plus_modules(raw: object) -> list[dict] | None:
    """Parse and validate modules; return None for empty. Raises ValueError on invalid payload."""
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise ValueError("a_plus_modules must be a list")
    if len(raw) == 0:
        return None
    validated = _a_plus_list_adapter.validate_python(raw)
    out: list[dict] = []
    for m in validated:
        d = m.model_dump(mode="json")
        out.append(d)
    return out


def safe_a_plus_modules_public(raw: object) -> list[dict] | None:
    """Best-effort validation for API responses; drop invalid modules rather than failing."""
    try:
        return normalize_a_plus_modules(raw)
    except Exception:
        return None
