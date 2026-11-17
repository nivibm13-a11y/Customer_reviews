"""Structured-output schemas the LLM must return."""

from typing import Literal

from pydantic import BaseModel, Field

SentimentLiteral = Literal["positive", "neutral", "negative"]
CategoryLiteral = Literal["food_quality", "delivery", "price", "staff", "packaging", "app"]
UrgencyLiteral = Literal["low", "medium", "high"]
LanguageLiteral = Literal["English", "Tamil", "Tanglish"]


class ReviewAnalysis(BaseModel):
    """Analysis of one customer review."""

    sentiment: SentimentLiteral = Field(description="Overall customer mood")
    category: CategoryLiteral = Field(description="Main department the review is about")
    urgency: UrgencyLiteral = Field(
        description="high = health/food safety, refund demand, abuse/rude staff, wrong order"
    )
    language: LanguageLiteral = Field(
        description=(
            "Tamil = Tamil script. Tanglish = Latin letters containing at least one Tamil word "
            "(nalla, romba, semma, konjam...). English = only English words, even if casual. "
            "Indian context or food names alone do not make a review Tanglish."
        )
    )
    summary: str = Field(
        min_length=5,
        max_length=300,
        description="Exactly one English sentence, even if the review is Tamil or Tanglish",
    )
    suggested_reply: str = Field(
        min_length=5,
        max_length=800,
        description="Polite, ready-to-post reply in English, 1-3 sentences",
    )


class ComplaintInsight(BaseModel):
    category: CategoryLiteral
    title: str = Field(description="Short complaint title, e.g. 'Late delivery'")
    note: str = Field(description="Short pattern note without platform names, e.g. '8pm to 10pm, food arrives cold'")


class PraiseInsight(BaseModel):
    category: CategoryLiteral
    title: str = Field(description="Short praise title, e.g. 'Biryani taste'")


class WeeklyInsights(BaseModel):
    """Narrative parts of the weekly report. Counts are attached in Python, not by the LLM."""

    complaints: list[ComplaintInsight] = Field(description="One item per given complaint category")
    praises: list[PraiseInsight] = Field(description="One item per given praise category")
    action_items: list[str] = Field(min_length=3, max_length=3, description="Exactly 3 actions")
