"""Review schemas."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AnalysisStatus, Category, Language, Sentiment, Urgency


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    upload_id: int
    review_id: str
    review_date: date
    platform: str
    rating: int | None
    review_text: str
    sentiment: Sentiment | None
    category: Category | None
    urgency: Urgency | None
    language: Language | None
    summary: str | None
    suggested_reply: str | None
    analysis_status: AnalysisStatus
    is_edited: bool
    edited_at: datetime | None
    created_at: datetime


class ReviewUpdate(BaseModel):
    sentiment: Sentiment | None = None
    category: Category | None = None
    urgency: Urgency | None = None
    language: Language | None = None
    summary: str | None = Field(default=None, max_length=500)
    suggested_reply: str | None = Field(default=None, max_length=2000)


class ReviewPage(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int


class ReviewFilters(BaseModel):
    """Query filters shared by the list and export endpoints."""

    sentiment: Sentiment | None = None
    category: Category | None = None
    urgency: Urgency | None = None
    platform: str | None = None
    language: Language | None = None
    analysis_status: AnalysisStatus | None = None
    date_from: date | None = None
    date_to: date | None = None
    upload_id: int | None = None
    search: str | None = Field(default=None, max_length=200)
