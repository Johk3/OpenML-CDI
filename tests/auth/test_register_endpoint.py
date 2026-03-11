from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.database.models import EmailVerificationToken, User
from app.main import app
from app.services.email import InMemoryEmailSender


@pytest.fixture
def db_session_factory(tmp_path: Path):
    db_path = tmp_path / "register_endpoint.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    testing_session_local = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    try:
        yield testing_session_local
    finally:
        engine.dispose()


@pytest.fixture
def client(db_session_factory):
    email_sender = InMemoryEmailSender()
    app.state.email_sender = email_sender

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as test_client:
            yield test_client, db_session_factory, email_sender
    finally:
        app.dependency_overrides.clear()
        if hasattr(app.state, "email_sender"):
            delattr(app.state, "email_sender")


def test_register_returns_201_profile_and_triggers_verification_email(client):
    test_client, db_session_factory, email_sender = client

    response = test_client.post(
        "/auth/register",
        json={
            "email": "  New.User@Example.com ",
            "username": "  New_User  ",
            "password": "StrongPass!234",
            "first_name": "  New  ",
            "last_name": "  User  ",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": response.json()["id"],
        "email": "new.user@example.com",
        "username": "new_user",
        "first_name": "New",
        "last_name": "User",
        "role": "uploader",
        "is_verified": False,
        "created_at": response.json()["created_at"],
    }

    with db_session_factory() as db:
        stored_user = db.query(User).filter(User.email == "new.user@example.com").one()
        verification_token = (
            db.query(EmailVerificationToken)
            .filter(EmailVerificationToken.user_id == stored_user.id)
            .one()
        )
        assert stored_user.username == "new_user"
        assert stored_user.password_hash != "StrongPass!234"
        assert stored_user.is_verified is False
        assert verification_token.token_hash

    assert len(email_sender.sent_messages) == 1
    assert email_sender.sent_messages[0].to_email == "new.user@example.com"


def test_register_returns_409_for_duplicate_email(client):
    test_client, _db_session_factory, _email_sender = client

    payload = {
        "email": "dupe@example.com",
        "username": "first_user",
        "password": "StrongPass!234",
        "first_name": "Dupe",
        "last_name": "One",
    }

    first_response = test_client.post("/auth/register", json=payload)
    second_response = test_client.post(
        "/auth/register",
        json={**payload, "username": "second_user"},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json() == {
        "error": {
            "code": "registration_conflict",
            "message": "Unable to create account with provided credentials",
        }
    }


def test_register_returns_409_for_duplicate_username(client):
    test_client, _db_session_factory, _email_sender = client

    first_response = test_client.post(
        "/auth/register",
        json={
            "email": "first@example.com",
            "username": "taken_user",
            "password": "StrongPass!234",
            "first_name": "Dupe",
            "last_name": "One",
        },
    )
    second_response = test_client.post(
        "/auth/register",
        json={
            "email": "second@example.com",
            "username": "taken_user",
            "password": "StrongPass!234",
            "first_name": "Dupe",
            "last_name": "Two",
        },
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json() == {
        "error": {
            "code": "registration_conflict",
            "message": "Unable to create account with provided credentials",
        }
    }


def test_register_returns_400_for_invalid_input_and_field_errors(client):
    test_client, _db_session_factory, _email_sender = client

    response = test_client.post(
        "/auth/register",
        json={
            "email": "not-an-email",
            "username": "!",
            "password": "short",
            "first_name": "",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Invalid request body",
            "fields": response.json()["error"]["fields"],
        }
    }
    assert "email" in response.json()["error"]["fields"]
    assert "username" in response.json()["error"]["fields"]
    assert "last_name" in response.json()["error"]["fields"]


def test_register_returns_400_for_weak_password(client):
    test_client, _db_session_factory, _email_sender = client

    response = test_client.post(
        "/auth/register",
        json={
            "email": "weak@example.com",
            "username": "weak_user",
            "password": "alllowercase1",
            "first_name": "Weak",
            "last_name": "Password",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Invalid request body",
            "fields": {
                "password": [
                    "Must contain at least one uppercase letter",
                    "Must contain at least one special character",
                ]
            },
        }
    }


def test_login_accepts_registered_email_and_username_for_unverified_user(client):
    test_client, _db_session_factory, _email_sender = client

    register_response = test_client.post(
        "/auth/register",
        json={
            "email": "login@example.com",
            "username": "login_user",
            "password": "StrongPass!234",
            "first_name": "Login",
            "last_name": "User",
        },
    )

    assert register_response.status_code == 201

    email_login = test_client.post(
        "/auth/token",
        data={"username": "login@example.com", "password": "StrongPass!234"},
    )
    username_login = test_client.post(
        "/auth/token",
        data={"username": "login_user", "password": "StrongPass!234"},
    )

    assert email_login.status_code == 200
    assert set(email_login.json()) == {
        "access_token",
        "token_type",
        "refresh_token",
    }
    assert username_login.status_code == 200
