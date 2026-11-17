"""Review model: one customer review plus its AI analysis."""

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import str_enum
from app.models.enums import AnalysisStatus, Category, Language, Sentiment, Urgency

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.upload import Upload


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("business_id", "review_id", name="uq_reviews_business_review_id"),
        Index("ix_reviews_business_date", "business_id", "review_date"),
        Index("ix_reviews_business_urgency", "business_id", "urgency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    upload_id: Mapped[int] = mapped_column(ForeignKey("uploads.id", ondelete="CASCADE"), index=True, nullable=False)
    review_id: Mapped[str] = mapped_column(String(100), nullable=False)
    review_date: Mapped[date] = mapped_column(Date, nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    review_text: Mapped[str] = mapped_column(Text, nullable=False)

    sentiment: Mapped[Sentiment | None] = mapped_column(str_enum(Sentiment, "sentiment"), nullable=True)
    category: Mapped[Category | None] = mapped_column(str_enum(Category, "category"), nullable=True)
    urgency: Mapped[Urgency | None] = mapped_column(str_enum(Urgency, "urgency"), nullable=True)
    language: Mapped[Language | None] = mapped_column(str_enum(Language, "language"), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_status: Mapped[AnalysisStatus] = mapped_column(
        str_enum(AnalysisStatus, "analysis_status"), default=AnalysisStatus.pending, nullable=False
    )
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    business: Mapped["Business"] = relationship(back_populates="reviews")
    upload: Mapped["Upload"] = relationship(back_populates="reviews")
