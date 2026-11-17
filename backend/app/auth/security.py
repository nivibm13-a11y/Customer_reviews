"""Password hashing and JWT helpers."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Check a plain password against a bcrypt hash (False for OAuth-only users)."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _encode(payload: dict[str, Any], expires: timedelta, token_type: str) -> str:
    now = datetime.now(UTC)
    data = {
        **payload,
        "iat": now,
        "exp": now + expires,
        "type": token_type,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int) -> str:
    """Create a short-lived access token."""
    return _encode({"sub": str(user_id)}, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), "access")


def create_refresh_token(user_id: int) -> tuple[str, datetime]:
    """Create a refresh token; returns (token, expires_at)."""
    expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _encode({"sub": str(user_id)}, expires, "refresh"), datetime.now(UTC) + expires


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    """Decode and validate a JWT of the expected type; None if invalid."""
    try:
        payload: dict[str, Any] = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type or not payload.get("sub"):
        return None
    return payload
