from fastapi.testclient import TestClient

from tests.conftest import register


def test_register_login_me_refresh_logout(client_: TestClient) -> None:
    headers = register(client_)
    me = client_.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"
    assert me.json()["has_password"] is True

    login = client_.post("/api/v1/auth/login", json={"email": "OWNER@example.com", "password": "Secret123!"})
    assert login.status_code == 200
    refresh_token = login.json()["refresh_token"]

    rotated = client_.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert rotated.status_code == 200
    # old token is revoked after rotation
    assert client_.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token}).status_code == 401

    new_refresh = rotated.json()["refresh_token"]
    assert client_.post("/api/v1/auth/logout", json={"refresh_token": new_refresh}).status_code == 204
    assert client_.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh}).status_code == 401


def test_register_duplicate_and_bad_login(client_: TestClient) -> None:
    register(client_)
    dup = client_.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": "Secret123!"})
    assert dup.status_code == 409
    bad = client_.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401


def test_register_validation(client_: TestClient) -> None:
    resp = client_.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "short"})
    assert resp.status_code == 422


def test_protected_requires_token(client_: TestClient) -> None:
    assert client_.get("/api/v1/auth/me").status_code == 401
    assert client_.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_update_profile_and_password(client_: TestClient) -> None:
    headers = register(client_)
    resp = client_.put("/api/v1/auth/me", json={"full_name": "New Name"}, headers=headers)
    assert resp.json()["full_name"] == "New Name"
    wrong = client_.put(
        "/api/v1/auth/me", json={"current_password": "nope", "new_password": "Another123!"}, headers=headers
    )
    assert wrong.status_code == 400
    ok = client_.put(
        "/api/v1/auth/me",
        json={"current_password": "Secret123!", "new_password": "Another123!"},
        headers=headers,
    )
    assert ok.status_code == 200
    login = client_.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "Another123!"})
    assert login.status_code == 200


def test_google_not_configured(client_: TestClient) -> None:
    assert client_.get("/api/v1/auth/google", follow_redirects=False).status_code == 503


def test_google_callback_rejects_bad_state(client_: TestClient) -> None:
    resp = client_.get("/api/v1/auth/google/callback?code=abc&state=xyz", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "error=google" in resp.headers["location"]


def test_health(client_: TestClient) -> None:
    assert client_.get("/health").json() == {"status": "healthy"}
