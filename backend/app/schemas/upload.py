"""Upload schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.enums import UploadStatus


class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    filename: str
    status: UploadStatus
    total_rows: int
    valid_rows: int
    dropped_rows: int
    duplicates_skipped: int
    processed_count: int
    needs_review_count: int
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def progress_pct(self) -> float:
        """Percentage of valid rows analysed so far."""
        if self.valid_rows == 0:
            return 100.0 if self.status == UploadStatus.completed else 0.0
        return round(min(self.processed_count / self.valid_rows, 1.0) * 100, 1)
