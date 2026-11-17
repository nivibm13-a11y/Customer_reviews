"""Ask-your-reviews (LangChain RAG) endpoints."""

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from sqlalchemy import select

from app.auth.dependencies import get_owned_business
from app.database import SessionLocal
from app.llm import rag
from app.models import Business, Review
from app.models.enums import AnalysisStatus
from app.rate_limit import limiter
from app.schemas.ask import AskRequest, AskResponse, ReviewSource
from app.services.stats_service import week_bounds

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ask"])


def _to_source(content: str, md: dict[str, Any]) -> ReviewSource:
    """Build a source card from a retrieved document."""
    text, _, summary = content.partition("\nSummary: ")
    return ReviewSource(
        id=md["review_pk"],
        review_id=md["review_id"],
        review_date=date.fromisoformat(md["review_date"]),
        platform=md["platform"],
        rating=md.get("rating"),
        sentiment=md.get("sentiment"),
        category=md.get("category"),
        urgency=md.get("urgency"),
        summary=summary or None,
        snippet=text[:300],
    )


@router.post("/businesses/{business_id}/ask", response_model=AskResponse)
@limiter.limit("20/minute")
def ask_reviews(
    request: Request,
    body: AskRequest,
    business: Business = Depends(get_owned_business),
) -> AskResponse:
    """Answer a question using only this business's reviews (retrieval-augmented generation)."""
    date_from: date | None = None
    date_to: date | None = None
    if body.week_start:
        date_from, date_to = week_bounds(body.week_start)
    flt = rag.RetrievalFilter(
        business_id=business.id,
        date_from=date_from,
        date_to=date_to,
        sentiment=body.sentiment.value if body.sentiment else None,
        category=body.category.value if body.category else None,
        platform=body.platform,
    )
    answer, docs = rag.ask(body.question, [t.model_dump() for t in body.history], flt)
    sources = [_to_source(doc.page_content, doc.metadata) for doc in docs]
    return AskResponse(answer=answer, sources=sources)


def _reindex_business(business_id: int) -> None:
    db = SessionLocal()
    try:
        reviews = db.scalars(
            select(Review).where(Review.business_id == business_id, Review.analysis_status == AnalysisStatus.ok)
        ).all()
        for start in range(0, len(reviews), 100):
            rag.index_reviews(reviews[start : start + 100])
        logger.info("Re-indexed %d reviews for business %s", len(reviews), business_id)
    except Exception:
        logger.exception("Re-index failed for business %s", business_id)
    finally:
        db.close()


@router.post("/businesses/{business_id}/reindex", status_code=status.HTTP_202_ACCEPTED)
def reindex(
    background_tasks: BackgroundTasks,
    business: Business = Depends(get_owned_business),
) -> dict[str, str]:
    """Rebuild RAG embeddings for all analysed reviews of a business."""
    background_tasks.add_task(_reindex_business, business.id)
    return {"status": "reindex started"}
