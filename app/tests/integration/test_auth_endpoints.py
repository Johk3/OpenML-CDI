from dataclasses import replace
import uuid
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.config import AuthSettings
from app.database import models
from app.database.models import Roles
from app.security import decode_refresh_JWT


def _login_user(
    client: TestClient,
    monkeypatch,
    *,
    email: str = "user@example.com",
    username: str = "user1",
    first_name: str = "Test",
    last_name: str = "User",
):
    monkeypatch.setenv("AUTH_DEV_MODE_APPROVE_ALL_LOGINS", "true")
    monkeypatch.setenv("AUTH_DEV_LOGIN_EMAIL", email)
    monkeypatch.setenv("AUTH_DEV_LOGIN_USERNAME", username)
    monkeypatch.setenv("AUTH_DEV_LOGIN_FIRST_NAME", first_name)
    monkeypatch.setenv("AUTH_DEV_LOGIN_LAST_NAME", last_name)

    login_redirect = client.get("/api/auth/github/login", follow_redirects=False)
    assert login_redirect.status_code in {302, 307}

    callback_url = login_redirect.headers.get("location")
    assert callback_url
    query = parse_qs(urlparse(callback_url).query)
    code = query.get("code", [None])[0]
    state = query.get("state", [None])[0]
    assert code
    assert state

    callback_response = client.get(
        "/api/auth/github/callback",
        params={"code": code, "state": state},
    )
    assert callback_response.status_code == 200
    return callback_response


def test_dev_mode_login_creates_user_and_sets_refresh_cookie(
    client, db_test_session, monkeypatch
):
    monkeypatch.setattr(
        "app.routers.auth.resolve_github_repository_role", lambda _: Roles.USER
    )

    response = _login_user(
        client,
        monkeypatch,
        email="  New.User@Example.com ",
        username="  New_User  ",
        first_name="  New  ",
        last_name="  User  ",
    )

    assert set(response.json()) == {"access_token", "token_type"}
    assert response.json()["token_type"] == "bearer"
    assert response.cookies.get("refresh_token")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Path=/auth/refresh" in response.headers["set-cookie"]

    stored_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "new.user@example.com")
        .one()
    )
    assert stored_user.username == "new_user"
    assert stored_user.first_name == "New"
    assert stored_user.last_name == "User"
    assert stored_user.role == Roles.USER


def test_auth_cookies_are_secure_when_configured(client, monkeypatch):
    client.app.state.settings = replace(
        client.app.state.settings,
        auth=AuthSettings(cookie_secure=True),
    )

    monkeypatch.setattr(
        "app.routers.auth.resolve_github_repository_role", lambda _: Roles.USER
    )

    login_redirect = client.get("/api/auth/github/login", follow_redirects=False)
    assert "Secure" in login_redirect.headers["set-cookie"]

    callback_url = login_redirect.headers["location"]
    query = parse_qs(urlparse(callback_url).query)
    callback_response = client.get(
        "/api/auth/github/callback",
        params={
            "code": query["code"][0],
            "state": query["state"][0],
        },
        cookies={"oauth_state": query["state"][0]},
    )

    set_cookie_headers = callback_response.headers.get_list("set-cookie")
    assert any(
        header.startswith("oauth_state=") and "Secure" in header
        for header in set_cookie_headers
    )
    assert any(
        header.startswith("refresh_token=") and "Secure" in header
        for header in set_cookie_headers
    )


def test_auth_cookies_can_disable_secure_for_local_http(client, monkeypatch):
    client.app.state.settings = replace(
        client.app.state.settings,
        auth=AuthSettings(cookie_secure=False),
    )

    monkeypatch.setattr(
        "app.routers.auth.resolve_github_repository_role", lambda _: Roles.USER
    )

    login_redirect = client.get("/api/auth/github/login", follow_redirects=False)
    assert "Secure" not in login_redirect.headers["set-cookie"]

    callback_response = _login_user(
        client,
        monkeypatch,
        email="local-cookie@example.com",
        username="local-cookie",
    )
    assert "Secure" not in callback_response.headers["set-cookie"]


def test_login_assigns_expert_for_github_maintainer(
    client, db_test_session, monkeypatch
):
    resolved_usernames: list[str] = []

    def fake_resolve_role(username: str) -> Roles:
        resolved_usernames.append(username)
        return Roles.EXPERT

    monkeypatch.setattr(
        "app.routers.auth.resolve_github_repository_role", fake_resolve_role
    )

    response = _login_user(
        client,
        monkeypatch,
        email="maintainer@example.com",
        username="maintainer",
    )
    access_token = response.json()["access_token"]

    stored_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "maintainer@example.com")
        .one()
    )
    assert stored_user.role == Roles.EXPERT
    assert resolved_usernames == ["maintainer"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["role"] == "expert"


def test_login_downgrades_expert_after_github_permission_removal(
    client, db_test_session, monkeypatch
):
    resolved_roles = iter([Roles.EXPERT, Roles.USER])
    monkeypatch.setattr(
        "app.routers.auth.resolve_github_repository_role",
        lambda _username: next(resolved_roles),
    )

    _login_user(
        client,
        monkeypatch,
        email="sync@example.com",
        username="sync-user",
    )
    first_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "sync@example.com")
        .one()
    )
    assert first_user.role == Roles.EXPERT

    _login_user(
        client,
        monkeypatch,
        email="sync@example.com",
        username="sync-user",
    )

    db_test_session.refresh(first_user)
    assert first_user.role == Roles.USER


def test_login_redirects_to_github_when_dev_mode_disabled(client, monkeypatch):
    monkeypatch.setenv("AUTH_DEV_MODE_APPROVE_ALL_LOGINS", "false")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("GITHUB_CLIENT_ID", "example-client-id")
    monkeypatch.setenv("GITHUB_SECRET", "example-secret")
    monkeypatch.setenv("GITHUB_REDIRECT", "http://localhost:5173/login/callback")

    response = client.get("/api/auth/github/login", follow_redirects=False)

    assert response.status_code in {302, 307}
    location = response.headers["location"]
    assert location.startswith("https://github.com/login/oauth/authorize")


def test_legacy_auth_endpoints_are_removed(client):
    token_response = client.post("/api/auth/token")
    register_response = client.post("/api/auth/register")
    update_password_response = client.post("/api/user/update_password")

    assert token_response.status_code in {404, 405}
    assert register_response.status_code in {404, 405}
    assert update_password_response.status_code in {404, 405}


def test_refresh_rejects_missing_cookie(client):
    response = client.post("/api/auth/refresh")

    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token missing"}


def test_refresh_rejects_invalid_token_cookie(client):
    response = client.post("/api/auth/refresh", cookies={"refresh_token": "not-a-jwt"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}


def test_refresh_rotates_refresh_token_and_rejects_reuse(
    client, db_test_session, monkeypatch
):
    login_response = _login_user(client, monkeypatch)
    original_refresh_token = login_response.cookies["refresh_token"]
    original_payload = decode_refresh_JWT(original_refresh_token)

    refresh_response = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": original_refresh_token},
    )

    assert refresh_response.status_code == 200
    assert set(refresh_response.json()) == {"access_token", "token_type"}

    rotated_refresh_token = refresh_response.cookies["refresh_token"]
    rotated_payload = decode_refresh_JWT(rotated_refresh_token)

    assert rotated_payload["family_id"] == original_payload["family_id"]
    assert rotated_payload["jti"] != original_payload["jti"]

    family_tokens = (
        db_test_session.query(models.RefreshToken)
        .filter(
            models.RefreshToken.family_id == uuid.UUID(original_payload["family_id"])
        )
        .order_by(models.RefreshToken.created_at.asc())
        .all()
    )

    assert len(family_tokens) == 2
    assert family_tokens[0].is_revoked is True
    assert family_tokens[1].is_revoked is False

    replay_response = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": original_refresh_token},
    )

    assert replay_response.status_code == 401
    assert replay_response.json() == {"detail": "Invalid JTI"}


def test_logout_clears_cookie_and_revokes_refresh_family(client, monkeypatch):
    login_response = _login_user(client, monkeypatch)
    access_token = login_response.json()["access_token"]
    refresh_token = login_response.cookies["refresh_token"]

    logout_response = client.post(
        "/api/auth/refresh/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        cookies={"refresh_token": refresh_token},
    )

    assert logout_response.status_code == 200
    assert logout_response.json() == {
        "status_code": 200,
        "message": "Succesfully logged out.",
    }
    assert 'refresh_token=""' in logout_response.headers["set-cookie"]

    refresh_response = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": refresh_token},
    )

    assert refresh_response.status_code == 401
    assert refresh_response.json() == {"detail": "Invalid JTI"}


def test_get_family_name_returns_404_when_family_has_no_name(client, monkeypatch):
    login_response = _login_user(client, monkeypatch)
    access_token = login_response.json()["access_token"]
    family_id = decode_refresh_JWT(login_response.cookies["refresh_token"])["family_id"]

    response = client.get(
        "/api/user/get_family_name",
        params={"family_id": family_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Family id does not exist or has no name associated"
    }


def test_change_device_name_allows_owner_to_read_family_name(client, monkeypatch):
    login_response = _login_user(client, monkeypatch)
    access_token = login_response.json()["access_token"]
    refresh_payload = decode_refresh_JWT(login_response.cookies["refresh_token"])
    family_id = refresh_payload["family_id"]

    change_name_response = client.post(
        "/api/user/change_device_name",
        params={"family_id": family_id, "device_name": "Laptop"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert change_name_response.status_code == 200
    assert change_name_response.json() == {
        "status_code": 200,
        "message": "Family name changed",
    }

    get_name_response = client.get(
        "/api/user/get_family_name",
        params={"family_id": family_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert get_name_response.status_code == 200
    assert get_name_response.json() == {
        "status_code": 200,
        "family_name": "Laptop",
    }


def test_revoke_only_revokes_token_families_owned_by_current_user(client, monkeypatch):
    first_login_response = _login_user(
        client,
        monkeypatch,
        email="first@example.com",
        username="firstuser",
    )
    first_access_token = first_login_response.json()["access_token"]
    first_refresh_token = first_login_response.cookies["refresh_token"]
    first_family_id = decode_refresh_JWT(first_refresh_token)["family_id"]

    second_login_response = _login_user(
        client,
        monkeypatch,
        email="second@example.com",
        username="seconduser",
    )
    second_refresh_token = second_login_response.cookies["refresh_token"]
    second_family_id = decode_refresh_JWT(second_refresh_token)["family_id"]

    revoke_response = client.post(
        "/api/auth/revoke",
        json=[first_family_id, second_family_id],
        headers={"Authorization": f"Bearer {first_access_token}"},
    )

    assert revoke_response.status_code == 200
    assert revoke_response.json() == {
        "status_code": 200,
        "message": "Succesfully revoked sessions.",
    }

    revoked_family_refresh = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": first_refresh_token},
    )
    other_family_refresh = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": second_refresh_token},
    )

    assert revoked_family_refresh.status_code == 401
    assert revoked_family_refresh.json() == {"detail": "Invalid JTI"}
    assert other_family_refresh.status_code == 200


def test_get_sessions_returns_each_family_id_once_after_token_rotation(
    client, monkeypatch
):
    login_response = _login_user(client, monkeypatch)
    original_refresh_token = login_response.cookies["refresh_token"]
    family_id = decode_refresh_JWT(original_refresh_token)["family_id"]

    refresh_response = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": original_refresh_token},
    )
    access_token = refresh_response.json()["access_token"]

    sessions_response = client.get(
        "/api/auth/get_sessions",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert sessions_response.status_code == 200
    assert sessions_response.json() == {
        "status_code": 200,
        "family_ids": [family_id],
    }
