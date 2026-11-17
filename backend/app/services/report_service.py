"""Weekly insights report: pandas stats (counts) + LLM narrative (map-then-reduce)."""

import json
import logging
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.llm import chains
from app.llm.schemas import WeeklyInsights
from app.models import Review, WeeklyReport
from app.models.enums import AnalysisStatus, Sentiment, Urgency
from app.services.stats_service import compute_week_stats, week_bounds

logger = logging.getLogger(__name__)

SAMPLES_PER_GROUP = {"negative": 15, "positive": 10}

CATEGORY_LABELS = {
    "food_quality": "Food quality",
    "delivery": "Delivery",
    "price": "Price",
    "staff": "Staff",
    "packaging": "Packaging",
    "app": "App / ordering",
}


def _top(counts: dict[str, int], n: int = 3) -> list[str]:
    return [k for k, v in sorted(counts.items(), key=lambda kv: kv[1], reverse=True) if v > 0][:n]


MOSTLY_SHARE = 0.4  # a platform must hold >= 40% of a complaint's reviews to be called "mostly"


def _negative_platform_split(
    db: Session, business_id: int, start: date, end: date, categories: list[str]
) -> dict[str, dict[str, int]]:
    """Negative-review counts per complaint category and platform (SQL, never the LLM)."""
    split: dict[str, dict[str, int]] = {cat: {} for cat in categories}
    if not categories:
        return split
    rows = db.execute(
        select(Review.category, Review.platform, func.count(Review.id))
        .where(
            Review.business_id == business_id,
            Review.review_date >= start,
            Review.review_date <= end,
            Review.analysis_status == AnalysisStatus.ok,
            Review.sentiment == Sentiment.negative,
            Review.category.in_(categories),
        )
        .group_by(Review.category, Review.platform)
    ).all()
    for category, platform, count in rows:
        key = category.value if hasattr(category, "value") else str(category)
        split.setdefault(key, {})[platform] = int(count)
    return split


def platform_hint(counts: dict[str, int]) -> str:
    """
    Describe where a complaint comes from, using exact counts.

    Args:
        counts: Negative reviews per platform for one category

    Returns:
        "mostly Swiggy" / "mostly Swiggy and Zomato" when they dominate, else "spread across platforms"
    """
    total = sum(counts.values())
    if total == 0:
        return ""
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    top_name, top_count = ranked[0]
    if len(ranked) == 1:
        return f"all on {top_name}"
    second_name, second_count = ranked[1]
    if top_count / total >= MOSTLY_SHARE and top_count > second_count:
        return f"mostly {top_name}"
    if (top_count + second_count) / total >= 0.7:
        return f"mostly {top_name} and {second_name}"
    return "spread across platforms"


def _samples(db: Session, business_id: int, start: date, end: date, categories: list[str]) -> str:
    """Summaries per category and sentiment, urgent first, for the reduce prompt.

    Platform is deliberately left out: a small sample would make the LLM guess platform patterns.
    Platform facts are added to notes from SQL counts instead (see platform_hint).
    """
    lines: list[str] = []
    for sentiment, limit in SAMPLES_PER_GROUP.items():
        for cat in categories:
            rows = db.execute(
                select(Review.urgency, Review.summary)
                .where(
                    Review.business_id == business_id,
                    Review.review_date >= start,
                    Review.review_date <= end,
                    Review.analysis_status == AnalysisStatus.ok,
                    Review.sentiment == Sentiment(sentiment),
                    Review.category == cat,
                )
                .order_by((Review.urgency == Urgency.high).desc(), Review.id)
                .limit(limit)
            ).all()
            for urgency, summary in rows:
                lines.append(f"- [{sentiment}/{cat}/{urgency.value if urgency else '-'}] {summary}")
    return "\n".join(lines) or "(no analysed reviews)"


def generate_report(db: Session, business_id: int, week_start: date) -> WeeklyReport:
    """Compute stats, run the report chain and upsert the WeeklyReport."""
    start, end = week_bounds(week_start)
    stats = compute_week_stats(db, business_id, start)
    if stats.analysed == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No analysed reviews in this week")

    complaint_cats = _top(stats.negative_by_category)
    praise_cats = _top(stats.positive_by_category)
    insights: WeeklyInsights = chains.build_report_chain().invoke(
        {
            "week_start": start.isoformat(),
            "week_end": end.isoformat(),
            "stats_json": stats.model_dump_json(indent=1),
            "complaint_categories": json.dumps(complaint_cats),
            "praise_categories": json.dumps(praise_cats),
            "samples": _samples(db, business_id, start, end, sorted(set(complaint_cats + praise_cats))),
        }
    )

    # Counts and platform facts come from pandas/SQL; the LLM only supplies titles and pattern notes.
    complaint_text = {c.category: c for c in insights.complaints}
    platform_split = _negative_platform_split(db, business_id, start, end, complaint_cats)
    top_complaints = []
    for cat in complaint_cats:
        llm_note = complaint_text[cat].note.strip().rstrip(".") if cat in complaint_text else ""
        hint = platform_hint(platform_split.get(cat, {}))
        if hint and llm_note[:2].istitle():  # "Orders arrive late" -> "orders arrive late" after the hint
            llm_note = llm_note[0].lower() + llm_note[1:]
        note_parts = [p for p in (hint, llm_note) if p]
        top_complaints.append(
            {
                "category": cat,
                "title": complaint_text[cat].title if cat in complaint_text else CATEGORY_LABELS[cat],
                "note": ", ".join(note_parts),
                "count": stats.negative_by_category[cat],
            }
        )
    praise_text = {p.category: p for p in insights.praises}
    top_praises = [
        {
            "category": cat,
            "title": praise_text[cat].title if cat in praise_text else CATEGORY_LABELS[cat],
            "mentions": stats.positive_by_category[cat],
        }
        for cat in praise_cats
    ]

    report = db.scalar(
        select(WeeklyReport).where(WeeklyReport.business_id == business_id, WeeklyReport.week_start == start)
    )
    if report is None:
        report = WeeklyReport(business_id=business_id, week_start=start, week_end=end)
        db.add(report)
    report.stats = stats.model_dump(mode="json")
    report.top_complaints = top_complaints
    report.top_praises = top_praises
    report.action_items = list(insights.action_items)[:3]
    report.urgent_count = stats.urgent_count
    report.generated_at = datetime.now(UTC)
    db.commit()
    db.refresh(report)
    logger.info("Report generated for business %s week %s", business_id, start)
    return report
