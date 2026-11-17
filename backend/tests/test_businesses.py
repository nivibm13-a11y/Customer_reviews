from fastapi.testclient import TestClient

from tests.conftest import register


def test_business_crud(client_: TestClient, auth_headers: dict[str, str]) -> None:
    created = client_.post(
        "/api/v1/businesses", json={"name": " Anna Biryani ", "business_type": "restaurant"}, headers=auth_headers
    )
    assert created.status_code == 201
    bid = created.json()["id"]
    assert created.json()["name"] == "Anna Biryani"

    assert len(client_.get("/api/v1/businesses", headers=auth_headers).json()) == 1
    updated = client_.put(f"/api/v1/businesses/{bid}", json={"name": "Anna Mess"}, headers=auth_headers)
    assert updated.json()["name"] == "Anna Mess"
    assert client_.get(f"/api/v1/businesses/{bid}", headers=auth_headers).status_code == 200
    assert client_.delete(f"/api/v1/businesses/{bid}", headers=auth_headers).status_code == 204
    assert client_.get(f"/api/v1/businesses/{bid}", headers=auth_headers).status_code == 404


def test_other_users_business_is_404(client_: TestClient, auth_headers: dict[str, str], business_id: int) -> None:
    other = register(client_, "intruder@example.com")
    assert client_.get(f"/api/v1/businesses/{business_id}", headers=other).status_code == 404
    assert client_.delete(f"/api/v1/businesses/{business_id}", headers=other).status_code == 404
    assert client_.get(f"/api/v1/businesses/{business_id}/reviews", headers=other).status_code == 404
    assert client_.get("/api/v1/businesses", headers=other).json() == []


def test_business_validation(client_: TestClient, auth_headers: dict[str, str]) -> None:
    assert client_.post("/api/v1/businesses", json={"name": ""}, headers=auth_headers).status_code == 422
    bad_type = client_.post("/api/v1/businesses", json={"name": "X", "business_type": "bank"}, headers=auth_headers)
    assert bad_type.status_code == 422
