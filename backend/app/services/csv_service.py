"""CSV parsing and validation with pandas."""

import io
import logging
from dataclasses import dataclass

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Review, Upload
from app.models.enums import UploadStatus

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = ["review_id", "date", "platform", "rating", "review_text"]


@dataclass
class ParsedCsv:
    rows: pd.DataFrame
    total_rows: int
    dropped_rows: int
    duplicates_skipped: int


def _read_csv(content: bytes) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(content), dtype=str, encoding=encoding, keep_default_na=False)
        except UnicodeDecodeError:
            continue
        except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not read CSV: {exc}") from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not decode CSV file")


def parse_and_validate(content: bytes, business_id: int, db: Session) -> ParsedCsv:
    """Validate columns, drop bad rows and remove review_ids already stored for the business."""
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"CSV larger than {settings.MAX_UPLOAD_MB} MB")
    df = _read_csv(content)
    df.columns = [str(c).strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing required columns: {', '.join(missing)}")
    total = len(df)
    if total > settings.MAX_UPLOAD_ROWS:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"CSV has {total} rows; the limit is {settings.MAX_UPLOAD_ROWS}",
        )

    df = df[REQUIRED_COLUMNS].copy()
    for col in REQUIRED_COLUMNS:
        df[col] = df[col].astype(str).str.strip()
    df = df[(df["review_text"] != "") & (df["review_id"] != "")]
    df["review_id"] = df["review_id"].str.slice(0, 100)
    df["platform"] = df["platform"].replace("", "Unknown").str.slice(0, 50)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df[df["date"].notna()]
    rating = pd.to_numeric(df["rating"], errors="coerce").round()
    df["rating"] = rating.where(rating.between(1, 5)).astype("Int64")
    df = df.drop_duplicates(subset="review_id", keep="first")
    after_clean = len(df)

    existing: set[str] = set()
    ids = df["review_id"].tolist()
    for start in range(0, len(ids), 1000):
        chunk = ids[start : start + 1000]
        existing.update(
            db.scalars(
                select(Review.review_id).where(Review.business_id == business_id, Review.review_id.in_(chunk))
            ).all()
        )
    df = df[~df["review_id"].isin(existing)]

    return ParsedCsv(
        rows=df,
        total_rows=total,
        dropped_rows=total - after_clean,
        duplicates_skipped=after_clean - len(df),
    )


def create_upload(db: Session, business_id: int, filename: str, parsed: ParsedCsv) -> Upload:
    """Persist the Upload and its pending Review rows in one transaction."""
    upload = Upload(
        business_id=business_id,
        filename=filename[:255],
        status=UploadStatus.pending,
        total_rows=parsed.total_rows,
        valid_rows=len(parsed.rows),
        dropped_rows=parsed.dropped_rows,
        duplicates_skipped=parsed.duplicates_skipped,
    )
    db.add(upload)
    db.flush()
    db.add_all(
        Review(
            business_id=business_id,
            upload_id=upload.id,
            review_id=row.review_id,
            review_date=row.date,
            platform=row.platform,
            rating=None if pd.isna(row.rating) else int(row.rating),
            review_text=row.review_text,
        )
        for row in parsed.rows.itertuples(index=False)
    )
    db.commit()
    db.refresh(upload)
    logger.info("Upload %s created with %s reviews", upload.id, upload.valid_rows)
    return upload
