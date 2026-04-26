import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.crud.users import get_user_model_by_email, get_user_model_by_username
from app.database.models import Roles, User
from app.schemas.users import User as UserSchema

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


def register_user(
    *,
    db: Session,
    email: str,
    username: str,
    first_name: str,
    last_name: str,
) -> UserSchema:
    normalized_email = normalize_email(email)
    normalized_username = normalize_username(username)
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

    if get_user_model_by_email(db, normalized_email) or get_user_model_by_username(
        db, normalized_username
    ):
        raise RegistrationConflictError()

    new_user = User(
        email=normalized_email,
        username=normalized_username,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        role=Roles.USER,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserSchema.model_validate(new_user)
