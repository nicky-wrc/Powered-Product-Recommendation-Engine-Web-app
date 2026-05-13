from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProductQaAnswerPublic(BaseModel):
    id: UUID
    body: str
    author_name: str
    created_at: datetime
    is_official: bool = False


class ProductQaItemPublic(BaseModel):
    id: UUID
    question: str
    asker_name: str
    created_at: datetime
    is_mine: bool
    answer: ProductQaAnswerPublic | None


class ProductQaListResponse(BaseModel):
    items: list[ProductQaItemPublic]


class ProductQuestionCreate(BaseModel):
    body: str = Field(min_length=3, max_length=4000)


class ProductAnswerBody(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
