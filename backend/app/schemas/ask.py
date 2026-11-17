"""Ask-your-reviews (RAG) schemas."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import Category, Sentiment, Urgency


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)
    week_start: date | None = None
    sentiment: Sentiment | None = None
    category: Category | None = None
    platform: str | None = Field(default=None, max_length=50)


class ReviewSource(BaseModel):
    id: int
    review_id: str
    review_date: date
    platform: str
    rating: int | None
    sentiment: Sentiment | None
    category: Category | None
    urgency: Urgency | None
    summary: str | None
    snippet: str


class AskResponse(BaseModel):
    answer: str
    sources: list[ReviewSource]
