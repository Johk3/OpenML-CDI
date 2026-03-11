from sqlalchemy.orm import Session
from app.database import models
from app.database.models import Roles
from app.schemas import users as schemas
from sqlalchemy import or_
from datetime import timezone, datetime
import uuid
import os
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

DUMMY_HASH = os.getenv("DUMMY_HASH", "")


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


def get_user_model_by_username(db: Session, username: str) -> models.User | None:
    return db.query(models.User).filter(models.User.username == username).first()


def get_user_model_by_identifier(db: Session, identifier: str) -> models.User | None:
    return (
        db.query(models.User)
        .filter(
            or_(models.User.email == identifier, models.User.username == identifier)
        )
        .first()
    )


def change_user_email(db: Session, user_email: str, user_id: uuid.UUID) -> schemas.User:
    db_user = _get_user(db, user_id)
    if db_user:
        db_user.email = user_email
        db.commit()
        db.refresh(db_user)
        return schemas.User.model_validate(db_user)
    raise ValueError("User not found")


def create_user(db: Session, user: schemas.UserCreate) -> schemas.User:
    from app.security import make_password_hash

    hashed_password = make_password_hash(user.password)
    if get_user_by_email(db, user.email):
        raise ValueError("Email already registered")
    new_user = models.User(
        email=user.email,
        username=user.username,
        password_hash=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return schemas.User.model_validate(new_user)


def _get_user(db: Session, user_id: uuid.UUID) -> models.User:
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        return db_user
    raise ValueError("User not found")


def update_password(db: Session, user_id: uuid.UUID, password: str) -> schemas.User:
    from app.security import make_password_hash

    db_user = _get_user(db, user_id)
    db_user.password_hash = make_password_hash(password)
    db.commit()
    db.refresh(db_user)
    return schemas.User.model_validate(db_user)


def get_password_hash(db: Session, identifier: str) -> str:
    db_user = get_user_model_by_identifier(db, identifier)
    if not db_user:
        return DUMMY_HASH
    return db_user.password_hash


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
    """Raised when a revoked token is used"""

    pass


def verify_jti(
    db: Session, refresh_jti: str
) -> tuple[schemas.User, uuid.UUID] | tuple[None, None]:
    from app.security import hash_token

    hashed_jti = hash_token(refresh_jti)
    db_jwt = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == hashed_jti)
        .with_for_update()  # This makes the db operation lock the row until commit
        .first()
    )
    if not db_jwt:
        return None, None
    if db_jwt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return None, None
    if db_jwt.is_revoked:
        # replay attack
        revoke_family(db, db_jwt.family_id)
        raise TokenReuseDetectedError()
    revoke_jti_model(db, db_jwt)
    return schemas.User.model_validate(db_jwt.owner), db_jwt.family_id


def create_email_verification_token(
    db: Session,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
) -> models.EmailVerificationToken:
    verification_token = models.EmailVerificationToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(verification_token)
    return verification_token


def revoke_family(db: Session, family_id: uuid.UUID):
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
        owner_id = db_family.owner_id
        return _get_user(db, owner_id)
    return None


def set_family_name(db: Session, family_id: uuid.UUID, device_name: str):
    db_name = (
        db.query(models.TokenFamilyName)
        .filter(models.TokenFamilyName.family_id == family_id)
        .first()
    )
    if db_name:
        db_name.family_name = device_name
    else:
        db_name = models.TokenFamilyName(family_id=family_id, family_name=device_name)
        db.add(db_name)
    db.commit()


def get_family_name(db: Session, family_id: uuid.UUID) -> str:
    db_name = (
        db.query(models.TokenFamilyName)
        .filter(models.TokenFamilyName.family_id == family_id)
        .first()
    )
    if db_name:
        return db_name.family_name
    raise HTTPException(
        status_code=404, detail="Family id does not exist or has no name associated"
    )


def get_families(db: Session, user_id: uuid.UUID) -> list[uuid.UUID]:
    db_families = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.owner_id == user_id)
        .distinct()
        .all()
    )
    if not db_families:
        return []
    return [family.family_id for family in db_families]
