from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.database.models import Roles, User
from app.schemas.auth import RegisterRequest
from app.services.email import EmailDeliveryError, InMemoryEmailSender
from app.services.registration import (
    normalize_email,
    normalize_username,
    register_user,
    validate_password_complexity,
)


class FailingEmailSender:
    def send_verification_email(self, *, to_email: str, verification_url: str) -> None:
        raise EmailDeliveryError("smtp unavailable")


@pytest.fixture
def db_session(tmp_path: Path):
    db_path = tmp_path / "registration_service.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    testing_session_local = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    try:
        with testing_session_local() as session:
            yield session
    finally:
        engine.dispose()


def test_normalize_email_trims_and_lowercases():
    assert normalize_email("  Person.Example@Example.COM  ") == "person.example@example.com"


def test_normalize_username_trims_and_lowercases():
    assert normalize_username("  Mixed.User_Name-42  ") == "mixed.user_name-42"


def test_validate_password_complexity_reports_missing_requirements():
    errors = validate_password_complexity("alllowercase1")

    assert errors == [
        "Must contain at least one uppercase letter",
        "Must contain at least one special character",
    ]


def test_register_user_hashes_password_marks_user_unverified_and_sends_email(db_session):
    email_sender = InMemoryEmailSender()

    created_user = register_user(
        db=db_session,
        request=RegisterRequest(
            email="  New.User@Example.com ",
            username="  New_User  ",
            password="StrongPass!234",
            first_name="  New  ",
            last_name="  User  ",
        ),
        email_sender=email_sender,
        app_base_url="http://localhost:8000",
        verification_ttl_hours=24,
    )

    stored_user = db_session.get(User, created_user.id)

    assert stored_user is not None
    assert stored_user.email == "new.user@example.com"
    assert stored_user.username == "new_user"
    assert stored_user.role == Roles.UPLOADER
    assert stored_user.is_verified is False
    assert stored_user.password_hash != "StrongPass!234"
    assert len(email_sender.sent_messages) == 1
    assert email_sender.sent_messages[0].to_email == "new.user@example.com"
    assert "token=" in email_sender.sent_messages[0].verification_url


def test_register_user_rolls_back_when_email_delivery_fails(db_session):
    with pytest.raises(EmailDeliveryError):
        register_user(
            db=db_session,
            request=RegisterRequest(
                email="fail@example.com",
                username="fail_user",
                password="StrongPass!234",
                first_name="Fail",
                last_name="Case",
            ),
            email_sender=FailingEmailSender(),
            app_base_url="http://localhost:8000",
            verification_ttl_hours=24,
        )

    assert db_session.query(User).count() == 0
