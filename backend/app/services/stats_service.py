"""Weekly statistics computed with pandas (never by the LLM)."""

from datetime import date, timedelta

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Review
from app.models.enums import Category, Language, Sentiment, Urgency
from app.schemas.stats import CountPct, StatsResponse, WeekDeltas, WeekInfo, WeekStats

STAT_COLUMNS = [
    Review.review_id,
    Review.review_date,
    Review.platform,
    Review.rating,
    Review.sentiment,
    Review.category,
    Review.urgency,
    Review.language,
    Review.analysis_status,
]


def week_bounds(day: date) -> tuple[date, date]:
    """Monday..Sunday week containing `day`."""
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def load_week_frame(db: Session, business_id: int, week_start: date) -> pd.DataFrame:
    """Load one week's reviews (selected columns only) into a DataFrame of plain strings."""
    start, end = week_bounds(week_start)
    rows = db.execute(
        select(*STAT_COLUMNS).where(
            Review.business_id == business_id,
            Review.review_date >= start,
            Review.review_date <= end,
        )
    ).all()
    df = pd.DataFrame(rows, columns=[c.key for c in STAT_COLUMNS])
    for col in ("sentiment", "category", "urgency", "language", "analysis_status"):
        df[col] = df[col].map(lambda v: v.value if hasattr(v, "value") else v)
    return df


def _counts(series: pd.Series, keys: list[str]) -> dict[str, int]:
    vc = series.dropna().value_counts()
    return {k: int(vc.get(k, 0)) for k in keys}


def compute_week_stats(db: Session, business_id: int, week_start: date) -> WeekStats:
    """All dashboard/report numbers for one week."""
    start, end = week_bounds(week_start)
    df = load_week_frame(db, business_id, start)
    sentiments = [s.value for s in Sentiment]
    categories = [c.value for c in Category]
    analysed_df = df[df["analysis_status"] == "ok"]
    analysed = len(analysed_df)
    sent_counts = _counts(analysed_df["sentiment"], sentiments)
    sentiment = {
        k: CountPct(count=v, pct=round(v / analysed * 100, 1) if analysed else 0.0) for k, v in sent_counts.items()
    }
    negative = analysed_df[analysed_df["sentiment"] == "negative"]
    positive = analysed_df[analysed_df["sentiment"] == "positive"]
    ratings = pd.to_numeric(df["rating"], errors="coerce").dropna()
    urgency = _counts(analysed_df["urgency"], [u.value for u in Urgency])
    return WeekStats(
        week_start=start,
        week_end=end,
        total=len(df),
        analysed=analysed,
        needs_review=int((df["analysis_status"] == "needs_review").sum()),
        sentiment=sentiment,
        category=_counts(analysed_df["category"], categories),
        urgency=urgency,
        platform={str(k): int(v) for k, v in df["platform"].value_counts().items()},
        language=_counts(analysed_df["language"], [lang.value for lang in Language]),
        negative_by_category=_counts(negative["category"], categories),
        positive_by_category=_counts(positive["category"], categories),
        negative_by_platform={str(k): int(v) for k, v in negative["platform"].value_counts().items()},
        urgent_count=urgency["high"],
        avg_rating=round(float(ratings.mean()), 2) if len(ratings) else None,
    )


def compute_stats(db: Session, business_id: int, week_start: date | None) -> StatsResponse | None:
    """Stats for the requested (or latest) week plus deltas vs the previous week."""
    if week_start is None:
        latest = db.scalar(select(func.max(Review.review_date)).where(Review.business_id == business_id))
        if latest is None:
            return None
        week_start = latest
    current = compute_week_stats(db, business_id, week_start)
    previous = compute_week_stats(db, business_id, current.week_start - timedelta(days=7))
    if previous.total == 0:
        return StatsResponse(current=current, previous=None, deltas=None)
    deltas = WeekDeltas(
        total=current.total - previous.total,
        positive_pct=round(current.sentiment["positive"].pct - previous.sentiment["positive"].pct, 1),
        negative_pct=round(current.sentiment["negative"].pct - previous.sentiment["negative"].pct, 1),
        urgent_count=current.urgent_count - previous.urgent_count,
        avg_rating=(
            round(current.avg_rating - previous.avg_rating, 2)
            if current.avg_rating is not None and previous.avg_rating is not None
            else None
        ),
    )
    return StatsResponse(current=current, previous=previous, deltas=deltas)


def list_weeks(db: Session, business_id: int) -> list[WeekInfo]:
    """Weeks (Mon-Sun) that contain reviews, newest first."""
    rows = db.execute(
        select(Review.review_date, func.count(Review.id))
        .where(Review.business_id == business_id)
        .group_by(Review.review_date)
    ).all()
    weeks: dict[date, int] = {}
    for day, count in rows:
        start, _ = week_bounds(day)
        weeks[start] = weeks.get(start, 0) + int(count)
    return [
        WeekInfo(week_start=s, week_end=s + timedelta(days=6), review_count=c)
        for s, c in sorted(weeks.items(), reverse=True)
    ]
