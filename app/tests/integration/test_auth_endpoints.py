import uuid

from fastapi.testclient import TestClient

from app.database import models
from app.security import decode_refresh_JWT
from app.services.email import InMemoryEmailSender


def _prepare_registration(client: TestClient) -> None:
    client.app.state.email_sender = InMemoryEmailSender()


def _register_user(client: TestClient) -> dict:
    return _register_user_with_overrides(client)


def _register_user_with_overrides(
    client: TestClient,
    *,
    email: str = "user@example.com",
    username: str = "user1",
    password: str = "StrongPass!234",
    first_name: str = "Test",
    last_name: str = "User",
) -> dict:
    _prepare_registration(client)
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
            "first_name": first_name,
            "last_name": last_name,
        },
    )
    assert response.status_code == 201
    return response.json()


def _login_user(
    client: TestClient,
    username: str = "user@example.com",
    password: str = "StrongPass!234",
):
    return client.post(
        "/auth/token",
        data={"username": username, "password": password},
    )


def test_register_creates_verified_profile_and_verification_artifacts(
    client, db_test_session
):
    response_json = _register_user_with_overrides(
        client,
        email="  New.User@Example.com ",
        username="  New_User  ",
        first_name="  New  ",
        last_name="  User  ",
    )

    assert response_json["email"] == "new.user@example.com"
    assert response_json["username"] == "new_user"
    assert response_json["first_name"] == "New"
    assert response_json["last_name"] == "User"
    assert response_json["is_verified"] is True

    stored_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "new.user@example.com")
        .one()
    )
    verification_token = (
        db_test_session.query(models.EmailVerificationToken)
        .filter(models.EmailVerificationToken.user_id == stored_user.id)
        .one()
    )

    assert stored_user.username == "new_user"
    assert verification_token.token_hash
    assert len(client.app.state.email_sender.sent_messages) == 1
    assert (
        client.app.state.email_sender.sent_messages[0].to_email
        == "new.user@example.com"
    )


def test_login_accepts_email_and_username_identifiers(client):
    _register_user(client)

    email_response = _login_user(client, "user@example.com")
    username_response = _login_user(client, "user1")

    assert email_response.status_code == 200
    assert set(email_response.json()) == {"access_token", "token_type"}
    assert username_response.status_code == 200
    assert username_response.cookies.get("refresh_token")


def test_login_rejects_invalid_password(client):
    _register_user(client)

    response = _login_user(client, password="WrongPass!234")

    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect username or password"}


def test_login_sets_http_only_refresh_cookie_for_verified_user(client, db_test_session):
    _register_user(client)

    response = _login_user(client)

    assert response.status_code == 200
    assert set(response.json()) == {"access_token", "token_type"}
    assert response.json()["token_type"] == "bearer"
    assert response.cookies.get("refresh_token")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Path=/auth/refresh" in response.headers["set-cookie"]

    stored_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "user@example.com")
        .one()
    )
    assert stored_user.is_verified is True


def test_refresh_rejects_missing_cookie(client):
    response = client.post("/auth/refresh")

    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token missing"}


def test_refresh_rejects_invalid_token_cookie(client):
    response = client.post("/auth/refresh", cookies={"refresh_token": "not-a-jwt"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}


def test_refresh_rotates_refresh_token_and_rejects_reuse(client, db_test_session):
    _register_user(client)
    login_response = _login_user(client)
    original_refresh_token = login_response.cookies["refresh_token"]
    original_payload = decode_refresh_JWT(original_refresh_token)

    refresh_response = client.post(
        "/auth/refresh",
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
        "/auth/refresh",
        cookies={"refresh_token": original_refresh_token},
    )

    assert replay_response.status_code == 401
    assert replay_response.json() == {"detail": "Invalid JTI"}


def test_logout_clears_cookie_and_revokes_refresh_family(client):
    _register_user(client)
    login_response = _login_user(client)
    access_token = login_response.json()["access_token"]
    refresh_token = login_response.cookies["refresh_token"]

    logout_response = client.post(
        "/auth/refresh/logout",
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
        "/auth/refresh",
        cookies={"refresh_token": refresh_token},
    )

    assert refresh_response.status_code == 401
    assert refresh_response.json() == {"detail": "Invalid JTI"}


def test_get_family_name_returns_404_when_family_has_no_name(client):
    _register_user(client)
    login_response = _login_user(client)
    access_token = login_response.json()["access_token"]
    family_id = decode_refresh_JWT(login_response.cookies["refresh_token"])["family_id"]

    response = client.get(
        "/user/get_family_name",
        params={"family_id": family_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Family id does not exist or has no name associated"
    }


def test_change_device_name_allows_owner_to_read_family_name(client):
    _register_user(client)
    login_response = _login_user(client)
    access_token = login_response.json()["access_token"]
    refresh_payload = decode_refresh_JWT(login_response.cookies["refresh_token"])
    family_id = refresh_payload["family_id"]

    change_name_response = client.post(
        "/user/change_device_name",
        params={"family_id": family_id, "device_name": "Laptop"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert change_name_response.status_code == 200
    assert change_name_response.json() == {
        "status_code": 200,
        "message": "Family name changed",
    }

    get_name_response = client.get(
        "/user/get_family_name",
        params={"family_id": family_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert get_name_response.status_code == 200
    assert get_name_response.json() == {
        "status_code": 200,
        "family_name": "Laptop",
    }


def test_revoke_only_revokes_token_families_owned_by_current_user(client):
    _register_user_with_overrides(
        client,
        email="first@example.com",
        username="firstuser",
    )
    first_login_response = _login_user(client, "first@example.com")
    first_access_token = first_login_response.json()["access_token"]
    first_refresh_token = first_login_response.cookies["refresh_token"]
    first_family_id = decode_refresh_JWT(first_refresh_token)["family_id"]

    _register_user_with_overrides(
        client,
        email="second@example.com",
        username="seconduser",
    )
    second_login_response = _login_user(client, "second@example.com")
    second_refresh_token = second_login_response.cookies["refresh_token"]
    second_family_id = decode_refresh_JWT(second_refresh_token)["family_id"]

    revoke_response = client.post(
        "/auth/revoke",
        json=[first_family_id, second_family_id],
        headers={"Authorization": f"Bearer {first_access_token}"},
    )

    assert revoke_response.status_code == 200
    assert revoke_response.json() == {
        "status_code": 200,
        "message": "Succesfully revoked sessions.",
    }

    revoked_family_refresh = client.post(
        "/auth/refresh",
        cookies={"refresh_token": first_refresh_token},
    )
    other_family_refresh = client.post(
        "/auth/refresh",
        cookies={"refresh_token": second_refresh_token},
    )

    assert revoked_family_refresh.status_code == 401
    assert revoked_family_refresh.json() == {"detail": "Invalid JTI"}
    assert other_family_refresh.status_code == 200


def test_get_sessions_returns_each_family_id_once_after_token_rotation(client):
    _register_user(client)
    login_response = _login_user(client)
    original_refresh_token = login_response.cookies["refresh_token"]
    family_id = decode_refresh_JWT(original_refresh_token)["family_id"]

    refresh_response = client.post(
        "/auth/refresh",
        cookies={"refresh_token": original_refresh_token},
    )
    access_token = refresh_response.json()["access_token"]

    sessions_response = client.get(
        "/auth/get_sessions",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert sessions_response.status_code == 200
    assert sessions_response.json() == {
        "status_code": 200,
        "family_ids": [family_id],
    }
