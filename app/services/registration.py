from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud.users import (
    create_email_verification_token,
    get_user_model_by_email,
    get_user_model_by_username,
)
from app.database.models import Roles, User
from app.schemas.auth import RegisterRequest, RegisterResponse
from app.security import make_password_hash
from app.services.email import EmailSender

USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]+$")


class RegistrationConflictError(RuntimeError):
    pass


@dataclass(frozen=True)
class RegistrationValidationError(RuntimeError):
    fields: dict[str, list[str]]


def normalize_email(value: str) -> str:
    return value.strip().lower()


def normalize_username(value: str) -> str:
    return value.strip().lower()


def validate_password_complexity(password: str) -> list[str]:
    errors: list[str] = []
    if not any(character.islower() for character in password):
        errors.append("Must contain at least one lowercase letter")
    if not any(character.isupper() for character in password):
        errors.append("Must contain at least one uppercase letter")
    if not any(character.isdigit() for character in password):
        errors.append("Must contain at least one digit")
    if not any(not character.isalnum() for character in password):
        errors.append("Must contain at least one special character")
    return errors


def register_user(
    *,
    db: Session,
    request: RegisterRequest,
    email_sender: EmailSender,
    app_base_url: str,
    verification_ttl_hours: int,
) -> RegisterResponse:
    normalized_email = normalize_email(request.email)
    normalized_username = normalize_username(request.username)

    if not USERNAME_PATTERN.fullmatch(normalized_username):
        raise RegistrationValidationError(
            fields={
                "username": [
                    (
                        "Username may contain only lowercase letters, digits, "
                        "'.', '_' and '-'"
                    )
                ]
            }
        )

    password_errors = validate_password_complexity(request.password)
    if password_errors:
        raise RegistrationValidationError(fields={"password": password_errors})

    if get_user_model_by_email(db, normalized_email) or get_user_model_by_username(
        db, normalized_username
    ):
        raise RegistrationConflictError()

    new_user = User(
        email=normalized_email,
        username=normalized_username,
        password_hash=make_password_hash(request.password),
        first_name=request.first_name.strip(),
        last_name=request.last_name.strip(),
        role=Roles.UPLOADER,
        is_verified=True,  # OAUTH will be used thus email verification is unnecessary
    )
    db.add(new_user)

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=verification_ttl_hours)

    try:
        db.flush()
        create_email_verification_token(
            db,
            user_id=new_user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        verification_url = (
            f"{app_base_url.rstrip('/')}/auth/verify-email?token={raw_token}"
        )
        email_sender.send_verification_email(
            to_email=normalized_email,
            verification_url=verification_url,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise RegistrationConflictError() from exc
    except Exception:
        db.rollback()
        raise

    db.refresh(new_user)
    return RegisterResponse.model_validate(new_user)
