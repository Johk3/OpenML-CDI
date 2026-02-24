from sqlalchemy.orm import Session
from app.database import models
from app.database.models import Roles
from app.schemas import users as schemas
from app.security import make_hash
from datetime import UTC, datetime
import uuid

DUMMY_HASH = ""  # TODO FIXME


def get_user(db: Session, user_id: uuid.UUID) -> schemas.User | None:
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        return schemas.User.model_validate(db_user)
    return None


def get_user_by_email(db: Session, email: str) -> schemas.User | None:
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if db_user:
        return schemas.User.model_validate(db_user)
    return None


def create_user(db: Session, user: schemas.UserCreate) -> schemas.User:
    hashed_password = make_hash(user.password)
    if get_user_by_email(db, user.email):
        raise ValueError("Email already registered")
    new_user = models.User(
        email=user.email,
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
    db_user = _get_user(db, user_id)
    db_user.password_hash = make_hash(password)
    db.commit()
    db.refresh(db_user)
    return schemas.User.model_validate(db_user)


def get_password_hash(db: Session, email: str) -> str:
    db_user = db.query(models.User).filter(models.User.email == email).first()
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
    db: Session, user_id: uuid.UUID, refresh_jti: uuid.UUID, expires_at: datetime
) -> None:
    db_token = models.RefreshToken(
        id=refresh_jti, owner_id=user_id, expires_at=expires_at
    )
    db.add(db_token)
    db.commit()


def delete_jti(db: Session, refresh_jti: uuid.UUID) -> None:
    db_jwt = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.id == refresh_jti)
        .first()
    )
    if db_jwt:
        db.delete(db_jwt)
        db.commit()


def verify_jti(db: Session, user_id: uuid.UUID, refresh_jti: uuid.UUID) -> bool:
    db_user = _get_user(db, user_id)
    if refresh_jti not in db_user.refresh_tokens:
        return False
    db_jwt = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.id == refresh_jti)
        .first()
    )
    if db_jwt and (db_jwt.expires_at > datetime.now(UTC)):
        return True
    return False
