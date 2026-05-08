from typing import Literal

from pydantic import BaseModel

from app.schemas.products import ProductPublic

RecoMode = Literal["popular", "collaborative", "content", "hybrid"]


class RecommendationMeta(BaseModel):
    mode: RecoMode
    used_collaborative: bool
    used_content: bool
    fallback_popular: bool = False


class RecommendationFeed(BaseModel):
    products: list[ProductPublic]
    meta: RecommendationMeta
