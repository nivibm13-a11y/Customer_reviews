from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Review, Upload
from app.models.enums import AnalysisStatus, UploadStatus
from app.services.analysis_service import correct_language, fail_stale_uploads
from tests.conftest import FIXTURES, register, upload_csv

HEADER = "review_id,date,platform,rating,review_text\n"


def test_upload_200_plus_rows(analysed: dict[str, Any]) -> None:
    assert analysed["status"] == "completed"
    assert analysed["total_rows"] == 223
    assert analysed["valid_rows"] == 220
    assert analysed["dropped_rows"] == 3  # blank text, bad date, in-file duplicate id
    assert analysed["processed_count"] == 220
    assert analysed["progress_pct"] == 100.0
    assert analysed["needs_review_count"] == 0


def test_every_review_has_all_fields_from_allowed_lists(analysed: dict[str, Any]) -> None:
    with SessionLocal() as db:
        reviews = db.scalars(select(Review)).all()
    assert len(reviews) == 220
    for r in reviews:
        assert r.analysis_status == AnalysisStatus.ok
        assert r.sentiment and r.category and r.urgency and r.language
        assert r.summary and r.suggested_reply
    languages = {r.language.value for r in reviews if r.language}
    assert {"English", "Tamil", "Tanglish"} <= languages


def test_duplicates_skipped_on_reupload(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    content = (FIXTURES / "reviews_week40.csv").read_bytes()
    resp = upload_csv(client_, auth_headers, business_id, content)
    assert resp.status_code == 400
    assert "already analysed" in resp.json()["detail"]

    extra = content + b"R-5000,2026-10-02,Swiggy,1,Ordered at 8pm came cold\n"
    resp = upload_csv(client_, auth_headers, business_id, extra)
    assert resp.status_code == 202
    assert resp.json()["valid_rows"] == 1
    assert resp.json()["duplicates_skipped"] == 220


def test_missing_columns(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    resp = upload_csv(client_, auth_headers, business_id, b"review_id,text\nR-1,hello\n")
    assert resp.status_code == 400
    assert "date" in resp.json()["detail"] and "review_text" in resp.json()["detail"]


def test_rejects_non_csv_and_empty(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    assert upload_csv(client_, auth_headers, business_id, b"x", "notes.txt").status_code == 400
    assert upload_csv(client_, auth_headers, business_id, HEADER.encode()).status_code == 400
    blank = (HEADER + "R-1,2026-10-01,Google,5,   \n").encode()
    assert upload_csv(client_, auth_headers, business_id, blank).status_code == 400


def test_invalid_llm_output_marked_needs_review_and_retry_works(
    client_: TestClient, auth_headers: dict[str, str], business_id: int
) -> None:
    csv = (
        HEADER
        + "R-1,2026-10-01,Google,1,INVALID output please\n"
        + "R-2,2026-10-01,Google,1,FLAKY late delivery\n"
        + "R-3,2026-10-01,Google,5,Lovely biryani\n"
    ).encode()
    resp = upload_csv(client_, auth_headers, business_id, csv)
    upload = client_.get(f"/api/v1/uploads/{resp.json()['id']}", headers=auth_headers).json()
    assert upload["status"] == "completed"
    assert upload["needs_review_count"] == 1
    with SessionLocal() as db:
        statuses = {r.review_id: r.analysis_status for r in db.scalars(select(Review)).all()}
    assert statuses == {
        "R-1": AnalysisStatus.needs_review,
        "R-2": AnalysisStatus.ok,  # succeeded on automatic retry
        "R-3": AnalysisStatus.ok,
    }


def test_upload_list_get_and_ownership(
    client_: TestClient, auth_headers: dict[str, str], business_id: int, analysed: dict[str, Any]
) -> None:
    listed = client_.get(f"/api/v1/businesses/{business_id}/uploads", headers=auth_headers).json()
    assert [u["id"] for u in listed] == [analysed["id"]]
    other = register(client_, "other@example.com")
    assert client_.get(f"/api/v1/uploads/{analysed['id']}", headers=other).status_code == 404


def test_stale_upload_retry(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    with SessionLocal() as db:
        upload = Upload(business_id=business_id, filename="x.csv", status=UploadStatus.processing, valid_rows=1)
        db.add(upload)
        db.flush()
        from datetime import date

        db.add(
            Review(
                business_id=business_id,
                upload_id=upload.id,
                review_id="R-77",
                review_date=date(2026, 10, 1),
                platform="Google",
                rating=5,
                review_text="Great food",
            )
        )
        db.commit()
        upload_id = upload.id
        assert fail_stale_uploads(db) == 1

    not_failed_yet = client_.get(f"/api/v1/uploads/{upload_id}", headers=auth_headers).json()
    assert not_failed_yet["status"] == "failed"
    retried = client_.post(f"/api/v1/uploads/{upload_id}/retry", headers=auth_headers)
    assert retried.status_code == 202
    final = client_.get(f"/api/v1/uploads/{upload_id}", headers=auth_headers).json()
    assert final["status"] == "completed"
    assert final["processed_count"] == 1
    again = client_.post(f"/api/v1/uploads/{upload_id}/retry", headers=auth_headers)
    assert again.status_code == 409


@pytest.mark.parametrize(
    ("text", "llm_language", "expected"),
    [
        ("Box udanju cake ellam kalanju pochu", "Tamil", "Tanglish"),
        ("கேக்கில் முடி இருந்தது, மிகவும் மோசம்", "Tanglish", "Tamil"),
        ("கேக் was super, thanks", "Tamil", "Tanglish"),
        ("Neat packing, puffs were crisp", "English", "English"),
        ("Biryani semma taste", "Tanglish", "Tanglish"),
        ("12345 !!!", "English", "English"),
    ],
)
def test_correct_language_uses_script(text: str, llm_language: str, expected: str) -> None:
    assert correct_language(text, llm_language) == expected
