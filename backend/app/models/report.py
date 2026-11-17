"""WeeklyReport model: LLM narrative + pandas-computed stats for one week."""

from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import JSONType

if TYPE_CHECKING:
    from app.models.business import Business


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"
    __table_args__ = (UniqueConstraint("business_id", "week_start", name="uq_reports_business_week"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    stats: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    top_complaints: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, nullable=False)
    top_praises: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, nullable=False)
    action_items: Mapped[list[str]] = mapped_column(JSONType, nullable=False)
    urgent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    business: Mapped["Business"] = relationship(back_populates="reports")
