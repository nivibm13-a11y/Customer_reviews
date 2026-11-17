"""Application settings loaded from environment variables / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration. Never hardcode secrets; set them in .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "ReviewLens"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql://reviewlens:reviewlens@localhost:5433/reviewlens"

    SECRET_KEY: str = "change-me-in-env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    FRONTEND_URL: str = "http://localhost:5174"
    ALLOWED_ORIGINS: str = "http://localhost:5174,http://localhost:3000"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    RAG_TOP_K: int = 8
    RAG_COLLECTION: str = "review_embeddings"
    LLM_MAX_CONCURRENCY: int = 5
    LLM_BATCH_SIZE: int = 25
    LLM_REVIEW_RETRIES: int = 2
    MAX_UPLOAD_MB: int = 5
    MAX_UPLOAD_ROWS: int = 5000

    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_ENABLED: bool = True

    @property
    def sqlalchemy_url(self) -> str:
        """DATABASE_URL normalized to the psycopg 3 driver (used by SQLAlchemy and PGVector)."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://") :]
        return url

    @property
    def allowed_origins_list(self) -> list[str]:
        """CORS origins as a list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


settings = get_settings()
