"""Weekly report endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_owned_business
from app.database import get_db
from app.models import Business, User, WeeklyReport
from app.schemas.report import ReportCreate, ReportOut, ReportSummary
from app.services import report_service

router = APIRouter(tags=["reports"])


@router.post("/businesses/{business_id}/reports", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    body: ReportCreate, business: Business = Depends(get_owned_business), db: Session = Depends(get_db)
) -> WeeklyReport:
    """Generate (or regenerate) the weekly report. Sync def: runs the LLM call in a threadpool."""
    return report_service.generate_report(db, business.id, body.week_start)


@router.get("/businesses/{business_id}/reports", response_model=list[ReportSummary])
async def list_reports(
    business: Business = Depends(get_owned_business), db: Session = Depends(get_db)
) -> list[WeeklyReport]:
    """Reports, newest week first."""
    return list(
        db.scalars(
            select(WeeklyReport).where(WeeklyReport.business_id == business.id).order_by(WeeklyReport.week_start.desc())
        ).all()
    )


@router.get("/reports/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> WeeklyReport:
    """Get one report."""
    report = db.scalar(
        select(WeeklyReport)
        .join(Business, Business.id == WeeklyReport.business_id)
        .where(WeeklyReport.id == report_id, Business.user_id == user.id)
    )
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report
