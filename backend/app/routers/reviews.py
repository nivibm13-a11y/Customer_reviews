"""Review list / edit / export endpoints."""

import csv
import io
from collections.abc import Iterator
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_owned_business
from app.database import get_db
from app.llm import rag
from app.models import Business, Review, User
from app.models.enums import AnalysisStatus, Category, Language, Sentiment, Urgency
from app.schemas.review import ReviewFilters, ReviewOut, ReviewPage, ReviewUpdate

router = APIRouter(tags=["reviews"])

EXPORT_COLUMNS = [
    "review_id",
    "date",
    "platform",
    "rating",
    "review_text",
    "sentiment",
    "category",
    "urgency",
    "language",
    "summary",
    "suggested_reply",
    "analysis_status",
]

URGENCY_ORDER = {Urgency.high.value: 0, Urgency.medium.value: 1, Urgency.low.value: 2}


def review_filters(
    sentiment: Sentiment | None = None,
    category: Category | None = None,
    urgency: Urgency | None = None,
    platform: str | None = Query(default=None, max_length=50),
    language: Language | None = None,
    analysis_status: AnalysisStatus | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    upload_id: int | None = None,
    search: str | None = Query(default=None, max_length=200),
) -> ReviewFilters:
    """Collect filter query params."""
    return ReviewFilters(
        sentiment=sentiment,
        category=category,
        urgency=urgency,
        platform=platform,
        language=language,
        analysis_status=analysis_status,
        date_from=date_from,
        date_to=date_to,
        upload_id=upload_id,
        search=search,
    )


def _apply_filters(stmt: Select[tuple[Review]], business_id: int, f: ReviewFilters) -> Select[tuple[Review]]:
    stmt = stmt.where(Review.business_id == business_id)
    for field in ("sentiment", "category", "urgency", "language", "analysis_status", "upload_id", "platform"):
        value = getattr(f, field)
        if value is not None:
            stmt = stmt.where(getattr(Review, field) == value)
    if f.date_from:
        stmt = stmt.where(Review.review_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(Review.review_date <= f.date_to)
    if f.search:
        pattern = f"%{f.search.strip()}%"
        stmt = stmt.where(
            or_(
                Review.review_text.ilike(pattern),
                Review.summary.ilike(pattern),
                Review.review_id.ilike(pattern),
            )
        )
    return stmt


def get_owned_review(review_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Review:
    """Review owned (via its business) by the current user, else 404."""
    review = db.scalar(
        select(Review)
        .join(Business, Business.id == Review.business_id)
        .where(Review.id == review_id, Business.user_id == user.id)
    )
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    return review


@router.get("/businesses/{business_id}/reviews", response_model=ReviewPage)
async def list_reviews(
    business: Business = Depends(get_owned_business),
    filters: ReviewFilters = Depends(review_filters),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    sort: str = Query(default="-review_date", pattern="^-?(review_date|urgency|rating)$"),
    db: Session = Depends(get_db),
) -> ReviewPage:
    """Paginated, filtered reviews."""
    base = _apply_filters(select(Review), business.id, filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    desc = sort.startswith("-")
    key = sort.lstrip("-")
    if key == "urgency":
        # high < medium < low < null, so "-urgency" (desc) shows high first
        from sqlalchemy import case

        order_col = case(
            (Review.urgency == Urgency.high, 2),
            (Review.urgency == Urgency.medium, 1),
            (Review.urgency == Urgency.low, 0),
            else_=-1,
        )
    else:
        order_col = getattr(Review, key)
    ordered = base.order_by(order_col.desc() if desc else order_col.asc(), Review.id.desc())
    items = db.scalars(ordered.offset((page - 1) * page_size).limit(page_size)).all()
    return ReviewPage(items=[ReviewOut.model_validate(r) for r in items], total=total, page=page, page_size=page_size)


@router.get("/businesses/{business_id}/reviews/export.csv")
async def export_reviews(
    business: Business = Depends(get_owned_business),
    filters: ReviewFilters = Depends(review_filters),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Enriched CSV (UTF-8 with BOM so Excel shows Tamil text correctly)."""
    reviews = db.scalars(
        _apply_filters(select(Review), business.id, filters).order_by(Review.review_date, Review.id)
    ).all()

    def rows() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        buffer.write("﻿")
        writer.writerow(EXPORT_COLUMNS)
        for r in reviews:
            writer.writerow(
                [
                    r.review_id,
                    r.review_date.isoformat(),
                    r.platform,
                    r.rating if r.rating is not None else "",
                    r.review_text,
                    r.sentiment.value if r.sentiment else "",
                    r.category.value if r.category else "",
                    r.urgency.value if r.urgency else "",
                    r.language.value if r.language else "",
                    r.summary or "",
                    r.suggested_reply or "",
                    r.analysis_status.value,
                ]
            )
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
        yield buffer.getvalue()

    safe_name = "".join(ch if ch.isalnum() else "_" for ch in business.name)[:40] or "business"
    filename = f"reviewlens_{safe_name}_{date.today().isoformat()}.csv"
    return StreamingResponse(
        (chunk.encode("utf-8") for chunk in rows()),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reviews/{review_id}", response_model=ReviewOut)
async def get_review(review: Review = Depends(get_owned_review)) -> Review:
    """Get one review."""
    return review


@router.patch("/reviews/{review_id}", response_model=ReviewOut)
async def update_review(
    body: ReviewUpdate, review: Review = Depends(get_owned_review), db: Session = Depends(get_db)
) -> Review:
    """Correct AI tags; marks the review edited and re-indexes it for RAG."""
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        return review
    for field, value in changes.items():
        if value is None and field != "suggested_reply":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field} cannot be empty")
        setattr(review, field, value.strip() if isinstance(value, str) else value)
    review.is_edited = True
    review.edited_at = datetime.now(UTC)
    required = (review.sentiment, review.category, review.urgency, review.language, review.summary)
    if all(v is not None and v != "" for v in required):
        review.analysis_status = AnalysisStatus.ok
    db.commit()
    db.refresh(review)
    rag.safe_index_reviews([review])
    return review
