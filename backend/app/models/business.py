"""Business model: one outlet or store owned by a user."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, str_enum
from app.models.enums import BusinessType

if TYPE_CHECKING:
    from app.models.report import WeeklyReport
    from app.models.review import Review
    from app.models.upload import Upload
    from app.models.user import User


class Business(Base, TimestampMixin):
    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    business_type: Mapped[BusinessType] = mapped_column(
        str_enum(BusinessType, "business_type"), default=BusinessType.restaurant, nullable=False
    )

    owner: Mapped["User"] = relationship(back_populates="businesses")
    uploads: Mapped[list["Upload"]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    reports: Mapped[list["WeeklyReport"]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
