"""Business CRUD."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_owned_business
from app.database import get_db
from app.llm import rag
from app.models import Business, Review, User
from app.schemas.business import BusinessCreate, BusinessOut, BusinessUpdate

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("", response_model=list[BusinessOut])
async def list_businesses(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Business]:
    """List the current user's businesses."""
    return list(db.scalars(select(Business).where(Business.user_id == user.id).order_by(Business.name)).all())


@router.post("", response_model=BusinessOut, status_code=status.HTTP_201_CREATED)
async def create_business(
    body: BusinessCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Business:
    """Create a business."""
    business = Business(user_id=user.id, name=body.name.strip(), business_type=body.business_type)
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@router.get("/{business_id}", response_model=BusinessOut)
async def get_business(business: Business = Depends(get_owned_business)) -> Business:
    """Get one business."""
    return business


@router.put("/{business_id}", response_model=BusinessOut)
async def update_business(
    body: BusinessUpdate,
    business: Business = Depends(get_owned_business),
    db: Session = Depends(get_db),
) -> Business:
    """Update a business."""
    if body.name is not None:
        business.name = body.name.strip()
    if body.business_type is not None:
        business.business_type = body.business_type
    db.commit()
    db.refresh(business)
    return business


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(business: Business = Depends(get_owned_business), db: Session = Depends(get_db)) -> Response:
    """Delete a business with its uploads, reviews, reports and RAG vectors."""
    review_pks = list(db.scalars(select(Review.id).where(Review.business_id == business.id)).all())
    rag.delete_review_vectors(review_pks)
    db.delete(business)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
