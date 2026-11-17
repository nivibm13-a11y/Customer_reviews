"""Authentication endpoints: email/password, JWT refresh, Google OAuth."""

import logging
import secrets
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import google
from app.auth.dependencies import get_current_user
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import RefreshToken, User
from app.rate_limit import limiter
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    UserUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

OAUTH_STATE_COOKIE = "rl_oauth_state"


def _issue_tokens(db: Session, user: User) -> TokenResponse:
    refresh, expires_at = create_refresh_token(user.id)
    db.add(RefreshToken(user_id=user.id, token=refresh, expires_at=expires_at))
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id), refresh_token=refresh)


def _user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.has_password = user.hashed_password is not None
    return out


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Create an account and return tokens."""
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, hashed_password=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_tokens(db, user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Login with email and password."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    return _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Rotate a refresh token."""
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    payload = decode_token(body.refresh_token, "refresh")
    if payload is None:
        raise invalid
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token == body.refresh_token))
    if stored is None or stored.revoked:
        raise invalid
    expires_at = stored.expires_at if stored.expires_at.tzinfo else stored.expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise invalid
    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise invalid
    stored.revoked = True
    return _issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: Session = Depends(get_db)) -> Response:
    """Revoke a refresh token."""
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token == body.refresh_token))
    if stored is not None:
        stored.revoked = True
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    """Current user profile."""
    return _user_out(user)


@router.put("/me", response_model=UserOut)
async def update_me(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    """Update name and/or password."""
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.new_password:
        if user.hashed_password and not verify_password(body.current_password or "", user.hashed_password):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
        user.hashed_password = hash_password(body.new_password)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/google")
async def google_login() -> RedirectResponse:
    """Redirect to Google's consent screen with a CSRF state cookie."""
    if not google.is_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google login is not configured")
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(google.build_authorization_url(state))
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)
) -> RedirectResponse:
    """Verify state, upsert the Google user and hand tokens to the frontend."""
    error_url = f"{settings.FRONTEND_URL}/login?error=google"
    cookie_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if not code or not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return RedirectResponse(error_url)
    try:
        info = await google.fetch_user_info(code)
    except (httpx.HTTPError, KeyError):
        logger.exception("Google token exchange failed")
        return RedirectResponse(error_url)
    email = str(info.get("email", "")).lower()
    if not email or not info.get("email_verified", False):
        return RedirectResponse(error_url)

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name=info.get("name"), oauth_provider="google", is_verified=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        return RedirectResponse(error_url)
    else:
        user.is_verified = True
        user.oauth_provider = user.oauth_provider or "google"
    tokens = _issue_tokens(db, user)
    fragment = urlencode({"access_token": tokens.access_token, "refresh_token": tokens.refresh_token})
    response = RedirectResponse(f"{settings.FRONTEND_URL}/auth/callback#{fragment}")
    response.delete_cookie(OAUTH_STATE_COOKIE)
    return response
