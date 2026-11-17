from datetime import date
from typing import Any

from fastapi.testclient import TestClient

from app.llm import rag
from tests.conftest import register


def test_reviews_are_indexed_after_analysis(analysed: dict[str, Any]) -> None:
    store = rag.get_vector_store()
    docs = store.similarity_search("late delivery", k=300)
    assert len(docs) == 220
    assert {"business_id", "review_pk", "review_id", "review_date", "sentiment"} <= set(docs[0].metadata)


def test_ask_returns_answer_and_sources_from_business_only(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    # A second user's business with its own reviews must never leak into retrieval.
    other_headers = register(client_, "other@example.com")
    other_bid = client_.post("/api/v1/businesses", json={"name": "Other"}, headers=other_headers).json()["id"]
    client_.post(
        f"/api/v1/businesses/{other_bid}/uploads",
        files={"file": ("o.csv", b"review_id,date,platform,rating,review_text\nX-1,2026-10-01,Google,1,late cold\n")},
        headers=other_headers,
    )

    resp = client_.post(
        f"/api/v1/businesses/{business_id}/ask",
        json={"question": "Why are customers unhappy about delivery?", "history": []},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answer"]
    assert 0 < len(body["sources"]) <= 8
    assert all(s["review_id"].startswith("R-") for s in body["sources"])


def test_ask_filters(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    resp = client_.post(
        f"/api/v1/businesses/{business_id}/ask",
        json={
            "question": "What do people complain about?",
            "week_start": "2026-09-30",
            "sentiment": "negative",
            "category": "delivery",
            "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    for s in resp.json()["sources"]:
        assert s["sentiment"] == "negative" and s["category"] == "delivery"
        assert date(2026, 9, 28) <= date.fromisoformat(s["review_date"]) <= date(2026, 10, 4)


def test_ask_no_matches(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    resp = client_.post(f"/api/v1/businesses/{business_id}/ask", json={"question": "anything?"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["sources"] == []
    assert "couldn't find" in resp.json()["answer"]


def test_ask_validation_and_ownership(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    url = f"/api/v1/businesses/{business_id}/ask"
    assert client_.post(url, json={"question": ""}, headers=auth_headers).status_code == 422
    assert client_.post(url, json={"question": "x" * 501}, headers=auth_headers).status_code == 422
    other = register(client_, "intruder@example.com")
    assert client_.post(url, json={"question": "hi"}, headers=other).status_code == 404


def test_edit_reindexes_and_delete_removes_vectors(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    item = client_.get(f"/api/v1/businesses/{business_id}/reviews", headers=auth_headers).json()["items"][0]
    client_.patch(f"/api/v1/reviews/{item['id']}", json={"category": "staff"}, headers=auth_headers)
    store = rag.get_vector_store()
    doc = store.get_by_ids([str(item["id"])])[0]
    assert doc.metadata["category"] == "staff"

    assert client_.post(f"/api/v1/businesses/{business_id}/reindex", headers=auth_headers).status_code == 202
    client_.delete(f"/api/v1/businesses/{business_id}", headers=auth_headers)
    assert store.get_by_ids([str(item["id"])]) == []


def test_pgvector_filter_shape() -> None:
    flt = rag.RetrievalFilter(business_id=3, date_from=date(2026, 9, 28), date_to=date(2026, 10, 4), platform="Swiggy")
    assert flt.to_pgvector() == {
        "$and": [
            {"business_id": {"$eq": 3}},
            {"review_date": {"$between": ["2026-09-28", "2026-10-04"]}},
            {"platform": {"$eq": "Swiggy"}},
        ]
    }
    assert rag.RetrievalFilter(business_id=1).to_pgvector() == {"business_id": {"$eq": 1}}
