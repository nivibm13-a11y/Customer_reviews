"""Enumerations shared by models, schemas and the LLM pipeline."""

from enum import Enum


class BusinessType(str, Enum):
    restaurant = "restaurant"
    online_store = "online_store"
    other = "other"


class UploadStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Sentiment(str, Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class Category(str, Enum):
    food_quality = "food_quality"
    delivery = "delivery"
    price = "price"
    staff = "staff"
    packaging = "packaging"
    app = "app"


class Urgency(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Language(str, Enum):
    English = "English"
    Tamil = "Tamil"
    Tanglish = "Tanglish"


class AnalysisStatus(str, Enum):
    pending = "pending"
    ok = "ok"
    needs_review = "needs_review"
