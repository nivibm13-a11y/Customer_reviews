"""Business schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BusinessType


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    business_type: BusinessType = BusinessType.restaurant


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    business_type: BusinessType | None = None


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    business_type: BusinessType
    created_at: datetime
    updated_at: datetime | None
