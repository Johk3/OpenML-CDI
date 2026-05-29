import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import models
from app.database.models import Roles
from app.schemas import users as schemas


def get_user(db: Session, user_id: uuid.UUID) -> schemas.User | None:
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        return schemas.User.model_validate(db_user)
    return None


def get_user_by_email(db: Session, email: str) -> schemas.User | None:
    db_user = get_user_model_by_email(db, email)
    if db_user:
        return schemas.User.model_validate(db_user)
    return None


def get_user_model_by_email(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_model_by_github_id(db: Session, github_id: str) -> models.User | None:
    return db.query(models.User).filter(models.User.github_id == github_id).first()


def get_user_model_by_username(db: Session, username: str) -> models.User | None:
    return db.query(models.User).filter(models.User.username == username).first()


def _get_user(db: Session, user_id: uuid.UUID) -> models.User:
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        return db_user
    raise ValueError("User not found")


def del_user(db: Session, user_id: uuid.UUID) -> None:
    db_user = _get_user(db, user_id)
    db.delete(db_user)
    db.commit()


def update_role(db: Session, user_id: uuid.UUID, role: Roles) -> schemas.User:
    db_user = _get_user(db, user_id)
    db_user.role = role
    db.commit()
    db.refresh(db_user)
    return schemas.User.model_validate(db_user)


def update_jti(
    db: Session,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
    family_id: uuid.UUID | None,
) -> None:
    if family_id:
        db_token = models.RefreshToken(
            token_hash=token_hash,
            owner_id=user_id,
            expires_at=expires_at,
            family_id=family_id,
        )
    else:
        db_token = models.RefreshToken(
            token_hash=token_hash, owner_id=user_id, expires_at=expires_at
        )
    db.add(db_token)
    db.commit()


def revoke_jti_hash(db: Session, refresh_jti_hash: str) -> None:
    db_jwt = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == refresh_jti_hash)
        .first()
    )
    if db_jwt:
        db_jwt.is_revoked = True
        db.commit()


def revoke_jti_model(db: Session, refresh_jti: models.RefreshToken) -> None:
    refresh_jti.is_revoked = True


class TokenReuseDetectedError(Exception):
    """Raised when a revoked token is used."""


def verify_jti(
    db: Session, refresh_jti: str
) -> tuple[schemas.User, uuid.UUID] | tuple[None, None]:
    from app.security import hash_token

    hashed_jti = hash_token(refresh_jti)
    db_jwt = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == hashed_jti)
        .with_for_update()  # Lock until commit to avoid token reuse race conditions.
        .first()
    )
    if not db_jwt:
        return None, None
    if db_jwt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return None, None
    if db_jwt.is_revoked:
        revoke_family(db, db_jwt.family_id)
        raise TokenReuseDetectedError()
    revoke_jti_model(db, db_jwt)
    return schemas.User.model_validate(db_jwt.owner), db_jwt.family_id


def revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.query(models.RefreshToken).filter(
        models.RefreshToken.family_id == family_id
    ).update({"is_revoked": True}, synchronize_session="evaluate")
    db.commit()


def get_family_owner(db: Session, family_id: uuid.UUID) -> schemas.User | None:
    db_family = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.family_id == family_id)
        .first()
    )
    if db_family:
        return _get_user(db, db_family.owner_id)
    return None


def get_families(db: Session, user_id: uuid.UUID) -> list[uuid.UUID]:
    db_families = (
        db.query(models.RefreshToken.family_id)
        .filter(models.RefreshToken.owner_id == user_id)
        .distinct()
        .all()
    )
    if not db_families:
        return []
    return [family_id for (family_id,) in db_families]
