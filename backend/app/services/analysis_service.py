"""Background analysis job: classify reviews in batches with retries, then index for RAG."""

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from langchain_core.runnables import Runnable
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.llm import chains, rag
from app.llm.schemas import ReviewAnalysis
from app.models import Review, Upload
from app.models.enums import (
    AnalysisStatus,
    Category,
    Language,
    Sentiment,
    UploadStatus,
    Urgency,
)

logger = logging.getLogger(__name__)


def review_to_input(review: Review) -> dict[str, Any]:
    """Chain input for one review."""
    return {
        "platform": review.platform,
        "rating": review.rating if review.rating is not None else "not given",
        "review_text": review.review_text,
    }


def _coerce(result: object) -> ReviewAnalysis | None:
    """Return a valid ReviewAnalysis or None (invalid values / exceptions)."""
    if isinstance(result, ReviewAnalysis):
        return result
    if isinstance(result, dict):
        try:
            return ReviewAnalysis.model_validate(result)
        except ValidationError:
            return None
    return None


def _classify_with_retry(chain: Runnable[dict[str, Any], Any], review: Review, first: object) -> ReviewAnalysis | None:
    """Use the batch result if valid, otherwise retry this review up to LLM_REVIEW_RETRIES times."""
    analysis = _coerce(first)
    attempt = 0
    while analysis is None and attempt < settings.LLM_REVIEW_RETRIES:
        attempt += 1
        try:
            analysis = _coerce(chain.invoke(review_to_input(review)))
        except Exception:
            logger.warning("Retry %d failed for review %s", attempt, review.review_id, exc_info=True)
    return analysis


def apply_analysis(review: Review, analysis: ReviewAnalysis | None) -> None:
    """Write analysis fields onto the review or mark it needs_review."""
    if analysis is None:
        review.analysis_status = AnalysisStatus.needs_review
        return
    review.sentiment = Sentiment(analysis.sentiment)
    review.category = Category(analysis.category)
    review.urgency = Urgency(analysis.urgency)
    review.language = Language(analysis.language)
    review.summary = analysis.summary.strip()
    review.suggested_reply = analysis.suggested_reply.strip()
    review.analysis_status = AnalysisStatus.ok


def _process_chunk(
    db: Session, upload: Upload, chain: Runnable[dict[str, Any], Any], reviews: Sequence[Review]
) -> None:
    results = chain.batch(
        [review_to_input(r) for r in reviews],
        config={"max_concurrency": settings.LLM_MAX_CONCURRENCY},
        return_exceptions=True,
    )
    for review, result in zip(reviews, results, strict=True):
        analysis = _classify_with_retry(chain, review, result)
        apply_analysis(review, analysis)
        if analysis is None:
            upload.needs_review_count += 1
    upload.processed_count += len(reviews)
    db.commit()
    rag.safe_index_reviews(reviews)


def run_analysis(upload_id: int) -> None:
    """Analyse every pending review of an upload. Runs in a FastAPI background task."""
    db = SessionLocal()
    try:
        upload = db.get(Upload, upload_id)
        if upload is None:
            logger.error("Upload %s not found", upload_id)
            return
        upload.status = UploadStatus.processing
        db.commit()

        chain = chains.build_classify_chain()
        pending_ids = db.scalars(
            select(Review.id)
            .where(Review.upload_id == upload_id, Review.analysis_status == AnalysisStatus.pending)
            .order_by(Review.id)
        ).all()
        size = max(settings.LLM_BATCH_SIZE, 1)
        for start in range(0, len(pending_ids), size):
            chunk_ids = pending_ids[start : start + size]
            reviews = db.scalars(select(Review).where(Review.id.in_(chunk_ids)).order_by(Review.id)).all()
            _process_chunk(db, upload, chain, reviews)
            logger.info("Upload %s: %s/%s analysed", upload_id, upload.processed_count, upload.valid_rows)

        upload.status = UploadStatus.completed
        upload.completed_at = datetime.now(UTC)
        db.commit()
    except Exception as exc:
        logger.exception("Analysis failed for upload %s", upload_id)
        db.rollback()
        upload = db.get(Upload, upload_id)
        if upload is not None:
            upload.status = UploadStatus.failed
            upload.error_message = f"Analysis failed: {exc.__class__.__name__}: {exc}"[:1000]
            upload.completed_at = datetime.now(UTC)
            db.commit()
    finally:
        db.close()


def fail_stale_uploads(db: Session) -> int:
    """Mark uploads left pending/processing by a server restart as failed."""
    result = db.execute(
        update(Upload)
        .where(Upload.status.in_([UploadStatus.pending, UploadStatus.processing]))
        .values(
            status=UploadStatus.failed,
            error_message="Server restarted during analysis. Click Retry to continue.",
        )
    )
    db.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]
