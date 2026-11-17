"""CSV upload + background analysis endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_owned_business
from app.config import settings
from app.database import get_db
from app.models import Business, Upload, User
from app.models.enums import UploadStatus
from app.schemas.upload import UploadOut
from app.services import analysis_service, csv_service

router = APIRouter(tags=["uploads"])


def get_owned_upload(upload_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Upload:
    """Upload owned (via its business) by the current user, else 404."""
    upload = db.scalar(
        select(Upload)
        .join(Business, Business.id == Upload.business_id)
        .where(Upload.id == upload_id, Business.user_id == user.id)
    )
    if upload is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    return upload


@router.post(
    "/businesses/{business_id}/uploads",
    response_model=UploadOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    business: Business = Depends(get_owned_business),
    db: Session = Depends(get_db),
) -> Upload:
    """Validate a reviews CSV and start background analysis."""
    filename = file.filename or "reviews.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please upload a .csv file")
    content = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    parsed = csv_service.parse_and_validate(content, business.id, db)
    if parsed.rows.empty:
        detail = "No new valid reviews to analyse"
        if parsed.duplicates_skipped:
            detail += f" ({parsed.duplicates_skipped} already analysed)"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail)
    upload = csv_service.create_upload(db, business.id, filename, parsed)
    background_tasks.add_task(analysis_service.run_analysis, upload.id)
    return upload


@router.get("/businesses/{business_id}/uploads", response_model=list[UploadOut])
async def list_uploads(business: Business = Depends(get_owned_business), db: Session = Depends(get_db)) -> list[Upload]:
    """Upload history, newest first."""
    return list(db.scalars(select(Upload).where(Upload.business_id == business.id).order_by(Upload.id.desc())).all())


@router.get("/uploads/{upload_id}", response_model=UploadOut)
async def get_upload(upload: Upload = Depends(get_owned_upload)) -> Upload:
    """Upload status and progress (polled by the UI)."""
    return upload


@router.post("/uploads/{upload_id}/retry", response_model=UploadOut, status_code=status.HTTP_202_ACCEPTED)
async def retry_upload(
    background_tasks: BackgroundTasks,
    upload: Upload = Depends(get_owned_upload),
    db: Session = Depends(get_db),
) -> Upload:
    """Resume analysis of the remaining reviews of a failed upload."""
    if upload.status != UploadStatus.failed:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only failed uploads can be retried")
    upload.status = UploadStatus.pending
    upload.error_message = None
    upload.completed_at = None
    db.commit()
    db.refresh(upload)
    background_tasks.add_task(analysis_service.run_analysis, upload.id)
    return upload
