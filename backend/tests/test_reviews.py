import csv
import io
from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import register


def test_list_filters_and_pagination(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    url = f"/api/v1/businesses/{business_id}/reviews"
    page = client_.get(url, params={"page_size": 10}, headers=auth_headers).json()
    assert page["total"] == 220 and len(page["items"]) == 10

    high = client_.get(url, params={"urgency": "high", "page_size": 200}, headers=auth_headers).json()
    assert high["total"] > 0
    assert all(r["urgency"] == "high" for r in high["items"])

    neg_delivery = client_.get(
        url, params={"sentiment": "negative", "category": "delivery", "page_size": 200}, headers=auth_headers
    ).json()
    assert all(r["sentiment"] == "negative" and r["category"] == "delivery" for r in neg_delivery["items"])

    search = client_.get(url, params={"search": "biryani"}, headers=auth_headers).json()
    assert search["total"] > 0

    by_date = client_.get(
        url, params={"date_from": "2026-09-29", "date_to": "2026-10-05", "page_size": 200}, headers=auth_headers
    ).json()
    assert all("2026-09-29" <= r["review_date"] <= "2026-10-05" for r in by_date["items"])

    sorted_urgency = client_.get(url, params={"sort": "-urgency", "page_size": 5}, headers=auth_headers).json()
    assert sorted_urgency["items"][0]["urgency"] == "high"

    assert client_.get(url, params={"sort": "drop table"}, headers=auth_headers).status_code == 422


def test_patch_review_edits_tags(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    item = client_.get(f"/api/v1/businesses/{business_id}/reviews", headers=auth_headers).json()["items"][0]
    resp = client_.patch(
        f"/api/v1/reviews/{item['id']}", json={"urgency": "high", "category": "staff"}, headers=auth_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["urgency"] == "high" and body["category"] == "staff" and body["is_edited"] is True
    bad = client_.patch(f"/api/v1/reviews/{item['id']}", json={"category": "weather"}, headers=auth_headers)
    assert bad.status_code == 422
    empty = client_.patch(f"/api/v1/reviews/{item['id']}", json={"category": None}, headers=auth_headers)
    assert empty.status_code == 400
    other = register(client_, "x@example.com")
    assert client_.get(f"/api/v1/reviews/{item['id']}", headers=other).status_code == 404
    assert client_.patch(f"/api/v1/reviews/{item['id']}", json={"urgency": "low"}, headers=other).status_code == 404


def test_export_csv_is_excel_friendly(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    resp = client_.get(
        f"/api/v1/businesses/{business_id}/reviews/export.csv", params={"urgency": "high"}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.content.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM
    assert "attachment" in resp.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(resp.content.decode("utf-8-sig"))))
    assert rows[0][0] == "review_id" and rows[0][-1] == "analysis_status"
    assert len(rows) > 1 and all(r[7] == "high" for r in rows[1:])

    full = client_.get(f"/api/v1/businesses/{business_id}/reviews/export.csv", headers=auth_headers)
    text = full.content.decode("utf-8-sig")
    assert "உணவு" in text  # Tamil survives the round trip
    assert len(list(csv.reader(io.StringIO(text)))) == 221
