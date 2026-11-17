"""Dashboard statistics schemas (all numbers computed in pandas, never by the LLM)."""

from datetime import date

from pydantic import BaseModel


class CountPct(BaseModel):
    count: int
    pct: float


class WeekStats(BaseModel):
    week_start: date
    week_end: date
    total: int
    analysed: int
    needs_review: int
    sentiment: dict[str, CountPct]
    category: dict[str, int]
    urgency: dict[str, int]
    platform: dict[str, int]
    language: dict[str, int]
    negative_by_category: dict[str, int]
    positive_by_category: dict[str, int]
    negative_by_platform: dict[str, int]
    urgent_count: int
    avg_rating: float | None


class WeekDeltas(BaseModel):
    total: int
    positive_pct: float
    negative_pct: float
    urgent_count: int
    avg_rating: float | None


class StatsResponse(BaseModel):
    current: WeekStats
    previous: WeekStats | None
    deltas: WeekDeltas | None


class WeekInfo(BaseModel):
    week_start: date
    week_end: date
    review_count: int
