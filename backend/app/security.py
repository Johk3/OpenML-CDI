import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.users import User

load_dotenv()
JWT_SECRET = os.getenv("JWT_SECRET", "")
if JWT_SECRET == "":
    raise ValueError(
        "Please supply a JWT secret (Ed25519 private key) "
        "using the env var 'JWT_SECRET'"
    )

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# No need to catch as it will be a configuration issue
ACCESS_TOKEN_EXPIRY_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRY_MINUTES", 5))
REFRESH_TOKEN_EXPIRY_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRY_DAYS", 7))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: uuid.UUID | None = None


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/github/login")


def create_tokens(
    user_id: uuid.UUID,
    db: Session,
    family_id: uuid.UUID | None = None,
) -> tuple[str, str]:
    from app.crud.users import update_jti

    if not family_id:  # switch to db side uuuid gen TODO
        family_id = uuid.uuid4()

    # Access Token: 15 mins
    access_expire = timedelta(minutes=ACCESS_TOKEN_EXPIRY_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user_id), "type": "access"}, expires_delta=access_expire
    )

    # Refresh Token: 7 days + unique JTI for rotation
    refresh_expire = timedelta(days=REFRESH_TOKEN_EXPIRY_DAYS)
    refresh_jti = secrets.token_urlsafe(32)
    refresh_token = create_access_token(
        data={
            "sub": str(user_id),
            "type": "refresh",
            "jti": str(refresh_jti),
            "family_id": str(family_id),
        },
        expires_delta=refresh_expire,
    )
    refresh_expires_at = datetime.now(timezone.utc) + refresh_expire
    token_hash = hash_token(refresh_jti)
    update_jti(db, user_id, token_hash, refresh_expires_at, family_id)
    return access_token, refresh_token


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_refresh_JWT(JWT: str) -> dict:
    try:
        payload = jwt.decode(JWT, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(get_db)
) -> User:
    from app.crud.users import get_user

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        try:
            user_id = uuid.UUID(user_id)
        except Exception as e:
            print("user getting error", e)
            raise credentials_exception
        # token_data = TokenData(user_id=user_id)
    except InvalidTokenError:
        raise credentials_exception
    if payload.get("type", "") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user(db, user_id)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user
