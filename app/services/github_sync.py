from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud.users import (
    get_user_model_by_email,
    get_user_model_by_github_id,
    get_user_model_by_username,
)
from app.database.models import Roles, User
from app.services.registration import normalize_email, normalize_username


class GitHubProfileSyncConflictError(RuntimeError):
    def __init__(self, field: str):
        super().__init__(f"GitHub profile conflict on '{field}'")
        self.field = field


@dataclass(frozen=True)
class GitHubProfile:
    github_id: str
    email: str
    username: str
    first_name: str
    last_name: str


def split_github_name(full_name: str | None) -> tuple[str, str]:
    cleaned_name = (full_name or "").strip()
    if not cleaned_name:
        return "", ""

    name_parts = cleaned_name.split(" ", 1)
    first_name = name_parts[0] if name_parts[0] else ""
    last_name = name_parts[1].strip() if len(name_parts) > 1 else ""
    return first_name, last_name


def _detect_conflict_field(
    db: Session,
    *,
    github_id: str,
    email: str,
    username: str,
    current_user_id: UUID | None,
) -> str | None:
    by_email = get_user_model_by_email(db, email)
    if by_email and by_email.id != current_user_id:
        return "email"

    by_username = get_user_model_by_username(db, username)
    if by_username and by_username.id != current_user_id:
        return "username"

    by_github_id = get_user_model_by_github_id(db, github_id)
    if by_github_id and by_github_id.id != current_user_id:
        return "github_id"

    return None


def _commit_synced_user(
    db: Session,
    *,
    user: User,
    github_id: str,
    email: str,
    username: str,
) -> User:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        conflict_field = _detect_conflict_field(
            db,
            github_id=github_id,
            email=email,
            username=username,
            current_user_id=user.id,
        )
        raise GitHubProfileSyncConflictError(conflict_field or "profile") from exc

    db.refresh(user)
    return user


def sync_user_from_github_profile(db: Session, profile: GitHubProfile) -> User:
    github_id = profile.github_id.strip()
    email = normalize_email(profile.email)
    username = normalize_username(profile.username)
    first_name = profile.first_name.strip()
    last_name = profile.last_name.strip()

    user_by_github_id = get_user_model_by_github_id(db, github_id)
    user_by_email = get_user_model_by_email(db, email)

    if user_by_github_id:
        user = user_by_github_id
    elif user_by_email:
        if user_by_email.github_id and user_by_email.github_id != github_id:
            raise GitHubProfileSyncConflictError("email")
        user = user_by_email
    else:
        user = User(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            role=Roles.USER,
            github_id=github_id,
        )
        db.add(user)
        return _commit_synced_user(
            db,
            user=user,
            github_id=github_id,
            email=email,
            username=username,
        )

    conflict_field = _detect_conflict_field(
        db,
        github_id=github_id,
        email=email,
        username=username,
        current_user_id=user.id,
    )
    if conflict_field:
        raise GitHubProfileSyncConflictError(conflict_field)

    user.github_id = github_id
    user.email = email
    user.username = username
    user.first_name = first_name
    user.last_name = last_name

    return _commit_synced_user(
        db,
        user=user,
        github_id=github_id,
        email=email,
        username=username,
    )
