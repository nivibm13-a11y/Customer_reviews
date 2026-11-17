"""Weekly report schemas."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ReportCreate(BaseModel):
    week_start: date


class ComplaintOut(BaseModel):
    title: str
    category: str
    count: int
    note: str


class PraiseOut(BaseModel):
    title: str
    category: str
    mentions: int


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    week_start: date
    week_end: date
    stats: dict[str, Any]
    top_complaints: list[ComplaintOut]
    top_praises: list[PraiseOut]
    action_items: list[str]
    urgent_count: int
    generated_at: datetime


class ReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_start: date
    week_end: date
    urgent_count: int
    generated_at: datetime
