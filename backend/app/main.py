"""ReviewLens FastAPI application."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import SessionLocal
from app.llm.client import LLMNotConfiguredError
from app.rate_limit import limiter
from app.routers import ask, auth, businesses, reports, reviews, stats, uploads
from app.services.analysis_service import fail_stale_uploads

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("reviewlens")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup: mark analysis jobs interrupted by a restart as failed (retryable)."""
    try:
        db = SessionLocal()
        try:
            count = fail_stale_uploads(db)
            if count:
                logger.warning("Marked %d interrupted uploads as failed", count)
        finally:
            db.close()
    except Exception:
        logger.exception("Startup stale-upload check failed (is the database running?)")
    yield


app = FastAPI(
    title="ReviewLens API",
    description="Customer feedback analyzer: LangChain tagging, weekly insights and RAG Q&A.",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(LLMNotConfiguredError)
async def llm_not_configured(_: Request, exc: LLMNotConfiguredError) -> JSONResponse:
    """Clear message when the OpenAI key is missing."""
    return JSONResponse(status_code=503, content={"detail": str(exc)})


for module in (auth, businesses, uploads, reviews, stats, reports, ask):
    app.include_router(module.router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "healthy"}
