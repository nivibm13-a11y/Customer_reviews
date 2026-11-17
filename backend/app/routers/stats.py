"""Dashboard statistics endpoints."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_owned_business
from app.database import get_db
from app.models import Business
from app.schemas.stats import StatsResponse, WeekInfo
from app.services import stats_service

router = APIRouter(tags=["dashboard"])


@router.get("/businesses/{business_id}/weeks", response_model=list[WeekInfo])
async def list_weeks(business: Business = Depends(get_owned_business), db: Session = Depends(get_db)) -> list[WeekInfo]:
    """Weeks that contain reviews, newest first."""
    return stats_service.list_weeks(db, business.id)


@router.get("/businesses/{business_id}/stats", response_model=StatsResponse)
async def get_stats(
    week_start: date | None = None,
    business: Business = Depends(get_owned_business),
    db: Session = Depends(get_db),
) -> StatsResponse:
    """Stats for a week (default: latest) with deltas vs the previous week."""
    result = stats_service.compute_stats(db, business.id, week_start)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No reviews yet")
    return result
