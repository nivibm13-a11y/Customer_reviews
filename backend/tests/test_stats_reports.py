from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.services.report_service import platform_hint
from tests.conftest import FIXTURES


def _week_df(week_start: str) -> pd.DataFrame:
    df = pd.read_csv(FIXTURES / "reviews_week40.csv", dtype=str, keep_default_na=False)
    df = df[df["review_text"].str.strip() != ""]
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).drop_duplicates("review_id")
    start = pd.Timestamp(week_start)
    return df[(df["date"] >= start) & (df["date"] <= start + pd.Timedelta(days=6))]


def test_weeks_and_stats_match_table(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    weeks = client_.get(f"/api/v1/businesses/{business_id}/weeks", headers=auth_headers).json()
    assert len(weeks) >= 2
    assert [w["week_start"] for w in weeks] == sorted((w["week_start"] for w in weeks), reverse=True)

    latest = weeks[0]["week_start"]
    stats = client_.get(f"/api/v1/businesses/{business_id}/stats", headers=auth_headers).json()
    cur = stats["current"]
    assert cur["week_start"] == latest
    expected_total = len(_week_df(latest))
    assert cur["total"] == expected_total == weeks[0]["review_count"]
    assert sum(v["count"] for v in cur["sentiment"].values()) == cur["analysed"]
    assert round(sum(v["pct"] for v in cur["sentiment"].values())) == 100
    assert sum(cur["category"].values()) == cur["analysed"]
    assert cur["urgent_count"] == cur["urgency"]["high"]

    # urgent count equals what the reviews table returns for that week
    high = client_.get(
        f"/api/v1/businesses/{business_id}/reviews",
        params={"urgency": "high", "date_from": cur["week_start"], "date_to": cur["week_end"]},
        headers=auth_headers,
    ).json()
    assert high["total"] == cur["urgent_count"]

    assert stats["previous"] is not None
    assert stats["deltas"]["total"] == cur["total"] - stats["previous"]["total"]


def test_stats_no_reviews(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    assert client_.get(f"/api/v1/businesses/{business_id}/stats", headers=auth_headers).status_code == 404


def test_report_counts_come_from_stats(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    stats = client_.get(f"/api/v1/businesses/{business_id}/stats", headers=auth_headers).json()["current"]
    resp = client_.post(
        f"/api/v1/businesses/{business_id}/reports", json={"week_start": stats["week_start"]}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    report = resp.json()
    assert len(report["action_items"]) == 3
    assert report["urgent_count"] == stats["urgent_count"]
    assert 1 <= len(report["top_complaints"]) <= 3
    for c in report["top_complaints"]:
        assert c["count"] == stats["negative_by_category"][c["category"]]
        # platform part of the note is computed from counts, LLM pattern note is kept after it
        assert c["note"].endswith("mostly evenings")
    counts = [c["count"] for c in report["top_complaints"]]
    assert counts == sorted(counts, reverse=True)
    for p in report["top_praises"]:
        assert p["mentions"] == stats["positive_by_category"][p["category"]]

    # regenerate overwrites (one report per week)
    again = client_.post(
        f"/api/v1/businesses/{business_id}/reports", json={"week_start": stats["week_end"]}, headers=auth_headers
    )
    assert again.json()["id"] == report["id"]
    listed = client_.get(f"/api/v1/businesses/{business_id}/reports", headers=auth_headers).json()
    assert len(listed) == 1
    assert client_.get(f"/api/v1/reports/{report['id']}", headers=auth_headers).status_code == 200


def test_report_empty_week(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    resp = client_.post(
        f"/api/v1/businesses/{business_id}/reports", json={"week_start": "2020-01-06"}, headers=auth_headers
    )
    assert resp.status_code == 400


@pytest.mark.parametrize(
    ("counts", "expected"),
    [
        ({"Google": 9, "Swiggy": 8, "Zomato": 8, "Amazon": 6}, "spread across platforms"),
        ({"Swiggy": 20, "Zomato": 5, "Google": 5}, "mostly Swiggy"),
        ({"Swiggy": 10, "Zomato": 10, "Google": 2}, "mostly Swiggy and Zomato"),
        ({"Amazon": 4}, "all on Amazon"),
        ({}, ""),
    ],
)
def test_platform_hint_uses_exact_counts(counts: dict[str, int], expected: str) -> None:
    assert platform_hint(counts) == expected
