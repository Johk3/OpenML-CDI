import os
import secrets
import uuid
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from requests_oauthlib import OAuth2Session
from sqlalchemy.orm import Session

from app.crud.users import (
    TokenReuseDetectedError,
    get_families,
    get_family_owner,
    get_user_by_email,
    get_user_model_by_username,
    revoke_family as revoke_family_crud,
    verify_jti,
)
from app.database import get_db
from app.schemas.users import User
from app.security import create_tokens, decode_refresh_JWT, get_current_active_user
from app.services.registration import (
    RegistrationConflictError,
    RegistrationValidationError,
    normalize_email,
    register_user,
)

load_dotenv()

DEV_LOGIN_BYPASS_ENV = "AUTH_DEV_MODE_APPROVE_ALL_LOGINS"
DEFAULT_DEV_CALLBACK_URL = "http://localhost:5173/login/callback"
DEFAULT_DEV_EMAIL = "dev.user@example.com"
DEFAULT_DEV_USERNAME = "dev-user"
DEFAULT_DEV_FIRST_NAME = "Dev"
DEFAULT_DEV_LAST_NAME = "User"

router = APIRouter(tags=["auth"])


def _is_truthy(raw_value: str | None) -> bool:
    if raw_value is None:
        return False
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _is_dev_login_bypass_enabled() -> bool:
    if _is_truthy(os.getenv(DEV_LOGIN_BYPASS_ENV)):
        return True
    # Keep backward compatibility with existing dev compose setup.
    return os.getenv("ENVIRONMENT", "").strip().lower() in {"dev", "development"}


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # SET TO True FOR PRODUCTION, FALSE FOR TESTING FIXME
        samesite="strict",
        path="/auth/refresh",
    )


def _issue_tokens(
    response: Response, user_id: uuid.UUID, db: Session
) -> dict[str, str]:
    access_token, refresh_token = create_tokens(user_id, db)
    _set_refresh_cookie(response, refresh_token)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


def _append_query_params(url: str, params: dict[str, str]) -> str:
    parts = urlsplit(url)
    existing_query = dict(parse_qsl(parts.query, keep_blank_values=True))
    existing_query.update(params)
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(existing_query),
            parts.fragment,
        )
    )


def _resolve_github_oauth_settings() -> tuple[str, str, str]:
    github_client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    github_secret = os.getenv("GITHUB_SECRET", "").strip()
    github_redirect = (
        os.getenv("GITHUB_REDIRECT", "").strip() or DEFAULT_DEV_CALLBACK_URL
    )
    missing_values: list[str] = []
    if not github_client_id:
        missing_values.append("GITHUB_CLIENT_ID")
    if not github_secret:
        missing_values.append("GITHUB_SECRET")
    if not github_redirect:
        missing_values.append("GITHUB_REDIRECT")
    if missing_values:
        raise HTTPException(
            status_code=500,
            detail=(
                "Github OAuth settings are incomplete. Missing: "
                + ", ".join(missing_values)
            ),
        )
    return github_client_id, github_secret, github_redirect


def _sanitize_username(preferred_username: str) -> str:
    normalized = preferred_username.strip().lower()
    safe = "".join(
        character if (character.isalnum() or character in {".", "_", "-"}) else "-"
        for character in normalized
    ).strip("._-")
    if not safe:
        safe = "github-user"
    return safe[:32]


def _next_available_username(db: Session, preferred_username: str) -> str:
    base_username = _sanitize_username(preferred_username)
    if not get_user_model_by_username(db, base_username):
        return base_username
    for counter in range(1, 1000):
        suffix = f"-{counter}"
        candidate = f"{base_username[: 32 - len(suffix)]}{suffix}"
        if not get_user_model_by_username(db, candidate):
            return candidate
    raise HTTPException(status_code=500, detail="Unable to allocate username")


def _ensure_oauth_user(
    *,
    db: Session,
    email: str,
    preferred_username: str,
    first_name: str,
    last_name: str,
) -> User:
    normalized_email = normalize_email(email)
    existing_user = get_user_by_email(db, normalized_email)
    if existing_user:
        return existing_user

    candidate_username = _next_available_username(db, preferred_username)
    try:
        register_user(
            db=db,
            email=normalized_email,
            username=candidate_username,
            first_name=first_name.strip() or DEFAULT_DEV_FIRST_NAME,
            last_name=last_name.strip() or DEFAULT_DEV_LAST_NAME,
        )
    except RegistrationValidationError:
        fallback_username = _next_available_username(
            db, normalized_email.split("@", 1)[0] or "github-user"
        )
        register_user(
            db=db,
            email=normalized_email,
            username=fallback_username,
            first_name=first_name.strip() or DEFAULT_DEV_FIRST_NAME,
            last_name=last_name.strip() or DEFAULT_DEV_LAST_NAME,
        )
    except RegistrationConflictError:
        # Handle concurrent creation by resolving the row after conflict.
        concurrent_user = get_user_by_email(db, normalized_email)
        if concurrent_user:
            return concurrent_user
        raise HTTPException(status_code=409, detail="Unable to register OAuth user")

    created_user = get_user_by_email(db, normalized_email)
    if not created_user:
        raise HTTPException(status_code=500, detail="Failed to register user")
    return created_user


@router.post("/auth/refresh")
def refresh_access(
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    decoded_jwt = decode_refresh_JWT(refresh_token)
    refresh_token = decoded_jwt.get("jti", "")
    if decoded_jwt.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid JTI")
    try:
        user, family_id = verify_jti(
            db, refresh_token
        )  # committed in create_tokens -> update_jti
    except TokenReuseDetectedError:
        raise HTTPException(status_code=401, detail="Invalid JTI")

    if not user or not family_id:
        raise HTTPException(status_code=401, detail="Invalid JTI")

    access_token, new_refresh_token = create_tokens(user.id, db, family_id)
    _set_refresh_cookie(response, new_refresh_token)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/auth/refresh/logout")
def logout(
    current_user: Annotated[User, Depends(get_current_active_user)],
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    decoded_jwt = decode_refresh_JWT(refresh_token)
    refresh_token = decoded_jwt.get("jti", "")
    _, family_id = verify_jti(db, refresh_token)
    if not family_id:
        raise HTTPException(status_code=401, detail="Invalid family ID")
    revoke_family_crud(db, family_id)
    db.commit()
    response.delete_cookie(
        key="refresh_token",
        path="/auth/refresh",
        httponly=True,
        secure=False,  # SET TO True FOR PRODUCTION, FALSE FOR TESTING FIXME
        samesite="strict",
    )
    return {"status_code": 200, "message": "Succesfully logged out."}


@router.get("/auth/get_sessions")
def get_sessions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    return {"status_code": 200, "family_ids": get_families(db, current_user.id)}


@router.post("/auth/revoke")
def revoke_family(
    family_ids: list[uuid.UUID],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    for family_id in family_ids:
        family_id_owner = get_family_owner(db, family_id)
        if family_id_owner and family_id_owner.id == current_user.id:
            revoke_family_crud(db, family_id)
    return {"status_code": 200, "message": "Succesfully revoked sessions."}


@router.get("/auth/github/login")
def github_login():
    if _is_dev_login_bypass_enabled():
        callback_url = (
            os.getenv("GITHUB_REDIRECT", "").strip() or DEFAULT_DEV_CALLBACK_URL
        )
        state = secrets.token_urlsafe(16)
        # In dev mode, short-circuit external OAuth and treat callback as approved.
        redirect_url = _append_query_params(
            callback_url,
            {"code": "dev-mode", "state": state},
        )
        response = RedirectResponse(redirect_url)
        response.set_cookie(
            key="oauth_state",
            value=state,
            httponly=True,
            secure=False,
            max_age=600,
        )
        return response

    github_client_id, _github_secret, github_redirect = _resolve_github_oauth_settings()
    github = OAuth2Session(
        github_client_id,
        scope=["read:user", "user:email"],
        redirect_uri=github_redirect,
    )
    authorization_url, state = github.authorization_url(
        "https://github.com/login/oauth/authorize"
    )
    response = RedirectResponse(authorization_url)
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=False,  # Set to True in production (HTTPS)
        max_age=600,
    )
    return response


@router.get("/auth/me", response_model=User)
def get_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return current_user


@router.get("/auth/github/callback")
def auth_github_callback(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    if _is_dev_login_bypass_enabled():
        email = os.getenv("AUTH_DEV_LOGIN_EMAIL", DEFAULT_DEV_EMAIL)
        username = os.getenv("AUTH_DEV_LOGIN_USERNAME", DEFAULT_DEV_USERNAME)
        first_name = os.getenv("AUTH_DEV_LOGIN_FIRST_NAME", DEFAULT_DEV_FIRST_NAME)
        last_name = os.getenv("AUTH_DEV_LOGIN_LAST_NAME", DEFAULT_DEV_LAST_NAME)
        user = _ensure_oauth_user(
            db=db,
            email=email,
            preferred_username=username,
            first_name=first_name,
            last_name=last_name,
        )
        response.delete_cookie(
            key="oauth_state",
            httponly=True,
            secure=False,
        )
        return _issue_tokens(response, user.id, db)

    saved_state = request.cookies.get("oauth_state")
    if not saved_state:
        raise HTTPException(status_code=400, detail="State missing or expired.")

    github_client_id, github_secret, github_redirect = _resolve_github_oauth_settings()
    github = OAuth2Session(
        github_client_id,
        state=saved_state,
        redirect_uri=github_redirect,
    )
    try:
        github.fetch_token(
            "https://github.com/login/oauth/access_token",
            client_secret=github_secret,
            authorization_response=str(request.url),
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Authentication failed.")

    emails_response = github.get("https://api.github.com/user/emails")
    if emails_response.status_code != 200:
        raise HTTPException(
            status_code=400, detail="Failed to fetch emails from github"
        )
    emails_data = emails_response.json()

    primary_email = None
    for email_obj in emails_data:
        if email_obj.get("primary") and email_obj.get("verified"):
            primary_email = email_obj.get("email")
            break
    if not primary_email:
        raise HTTPException(status_code=400, detail="No verified primary email found")

    response.delete_cookie(
        key="oauth_state",
        httponly=True,
        secure=False,  # Set to True in production (HTTPS)
    )

    user = get_user_by_email(db, primary_email)
    if not user:
        user_response = github.get("https://api.github.com/user")
        if user_response.status_code != 200:
            raise HTTPException(
                status_code=400, detail="Failed to fetch user profile from github"
            )

        user_data = user_response.json()
        username = user_data.get("login") or primary_email.split("@", 1)[0]
        full_name = user_data.get("name") or ""
        name_parts = full_name.strip().split(" ", 1)
        first_name = name_parts[0] if name_parts[0] else DEFAULT_DEV_FIRST_NAME
        last_name = name_parts[1] if len(name_parts) > 1 else DEFAULT_DEV_LAST_NAME

        user = _ensure_oauth_user(
            db=db,
            email=primary_email,
            preferred_username=username,
            first_name=first_name,
            last_name=last_name,
        )

    return _issue_tokens(response, user.id, db)
