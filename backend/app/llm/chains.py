"""LCEL chains: per-review classification (map) and weekly report (reduce)."""

from typing import Any

from langchain_core.runnables import Runnable

from app.llm import client
from app.llm.prompts import CLASSIFY_PROMPT, REPORT_PROMPT
from app.llm.schemas import ReviewAnalysis, WeeklyInsights


def build_classify_chain() -> Runnable[dict[str, Any], Any]:
    """prompt | llm.with_structured_output(ReviewAnalysis)."""
    return CLASSIFY_PROMPT | client.get_chat_model().with_structured_output(ReviewAnalysis, method="function_calling")


def build_report_chain() -> Runnable[dict[str, Any], Any]:
    """prompt | llm.with_structured_output(WeeklyInsights)."""
    return REPORT_PROMPT | client.get_chat_model().with_structured_output(WeeklyInsights, method="function_calling")
