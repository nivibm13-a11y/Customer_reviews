"""Test fixtures: SQLite DB, fake LLM chains, in-memory vector store. No OpenAI calls."""

import os
import tempfile
from collections.abc import Generator, Iterator
from pathlib import Path
from typing import Any

_DB_FILE = Path(tempfile.gettempdir()) / "reviewlens_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE.as_posix()}"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["LLM_BATCH_SIZE"] = "20"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from langchain_core.embeddings import DeterministicFakeEmbedding  # noqa: E402
from langchain_core.language_models.fake_chat_models import FakeListChatModel  # noqa: E402
from langchain_core.runnables import RunnableLambda  # noqa: E402
from langchain_core.vectorstores import InMemoryVectorStore  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.llm import chains, client, rag  # noqa: E402
from app.llm.schemas import ComplaintInsight, PraiseInsight, ReviewAnalysis, WeeklyInsights  # noqa: E402
from app.main import app  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"

_flaky_seen: set[str] = set()


def fake_classify(inp: dict[str, Any]) -> ReviewAnalysis:
    """Deterministic keyword classifier standing in for the LLM."""
    text = str(inp["review_text"])
    low = text.lower()
    if "invalid" in low:
        raise ValueError("LLM returned a category outside the allowed list")
    if "flaky" in low and text not in _flaky_seen:
        _flaky_seen.add(text)
        raise ValueError("transient failure")
    if any("஀" <= ch <= "௿" for ch in text):
        language = "Tamil"
    elif any(w in low for w in ("nalla", "romba", "semma", "konjam", "saapadu", "aayiduchu")):
        language = "Tanglish"
    else:
        language = "English"
    rating = inp.get("rating")
    rating_num = rating if isinstance(rating, int) else 3
    sentiment = "positive" if rating_num >= 4 else "negative" if rating_num <= 2 else "neutral"
    if any(w in low for w in ("late", "cold", "rider", "delivery", "தாமதம்")):
        category = "delivery"
    elif any(w in low for w in ("charge", "price", "bill", "portion")):
        category = "price"
    elif "staff" in low and sentiment == "negative":
        category = "staff"
    elif any(w in low for w in ("pack", "container", "leak")):
        category = "packaging"
    elif "app" in low or "payment" in low:
        category = "app"
    else:
        category = "food_quality"
    high = any(w in low for w in ("poisoning", "wrong order", "rude", "debited"))
    urgency = "high" if high else "medium" if sentiment == "negative" else "low"
    return ReviewAnalysis(
        sentiment=sentiment,
        category=category,
        urgency=urgency,
        language=language,
        summary=f"Customer review about {category.replace('_', ' ')}.",
        suggested_reply="Thank you for your feedback. Please DM us your order ID so we can help.",
    )


def fake_report(inp: dict[str, Any]) -> WeeklyInsights:
    import json

    complaints = json.loads(inp["complaint_categories"])
    praises = json.loads(inp["praise_categories"])
    return WeeklyInsights(
        complaints=[ComplaintInsight(category=c, title=f"{c} issues", note="mostly evenings") for c in complaints],
        praises=[PraiseInsight(category=c, title=f"Great {c}") for c in praises],
        action_items=["Add a rider for 8-10pm.", "Show charges on the menu.", "Reply to urgent reviews today."],
    )


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    _flaky_seen.clear()
    monkeypatch.setattr(chains, "build_classify_chain", lambda: RunnableLambda(fake_classify))
    monkeypatch.setattr(chains, "build_report_chain", lambda: RunnableLambda(fake_report))
    monkeypatch.setattr(
        client,
        "get_chat_model",
        lambda: FakeListChatModel(responses=["Customers mention late delivery [R-1002]."]),
    )
    rag.set_vector_store(InMemoryVectorStore(DeterministicFakeEmbedding(size=32)))
    yield
    rag.set_vector_store(None)


@pytest.fixture(autouse=True)
def _db() -> Iterator[None]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client_() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


def register(c: TestClient, email: str = "owner@example.com") -> dict[str, str]:
    resp = c.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "full_name": "Owner"})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def auth_headers(client_: TestClient) -> dict[str, str]:
    return register(client_)


@pytest.fixture
def business_id(client_: TestClient, auth_headers: dict[str, str]) -> int:
    resp = client_.post("/api/v1/businesses", json={"name": "Anna Biryani"}, headers=auth_headers)
    assert resp.status_code == 201
    return int(resp.json()["id"])


def upload_csv(c: TestClient, headers: dict[str, str], business_id: int, content: bytes, name: str = "r.csv"):
    return c.post(
        f"/api/v1/businesses/{business_id}/uploads",
        files={"file": (name, content, "text/csv")},
        headers=headers,
    )


@pytest.fixture
def analysed(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> dict[str, Any]:
    """Upload the 220-row fixture; TestClient runs the background job before returning."""
    content = (FIXTURES / "reviews_week40.csv").read_bytes()
    resp = upload_csv(client_, auth_headers, business_id, content, "reviews_week40.csv")
    assert resp.status_code == 202, resp.text
    upload = client_.get(f"/api/v1/uploads/{resp.json()['id']}", headers=auth_headers).json()
    return upload
