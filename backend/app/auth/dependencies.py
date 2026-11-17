"""Auth and ownership dependencies."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.database import get_db
from app.models import Business, User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the Bearer access token."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    payload = decode_token(credentials.credentials, "access")
    if payload is None:
        raise unauthorized
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise unauthorized
    return user


def get_owned_business(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Business:
    """Return the business if it belongs to the current user, else 404."""
    business = db.scalar(select(Business).where(Business.id == business_id, Business.user_id == user.id))
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business
