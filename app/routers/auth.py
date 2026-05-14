import logging
import os
import secrets
import uuid
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from requests_oauthlib import OAuth2Session
from sqlalchemy.orm import Session

from app.config import Settings, GitHubIssuesSettings
from app.crud.users import (
    TokenReuseDetectedError,
    get_families,
    get_family_owner,
    get_user_by_email,
    get_user_model_by_username,
    revoke_family as revoke_family_crud,
    update_role,
    verify_jti,
)
from app.database import get_db
from app.schemas.users import User
from app.security import create_tokens, decode_refresh_JWT, get_current_active_user
from app.services.github_roles import resolve_github_repository_role
from app.services.github_sync import (
    GitHubProfile,
    GitHubProfileSyncConflictError,
    split_github_name,
    sync_user_from_github_profile,
)
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

logger = logging.getLogger(__name__)
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


def _cookie_secure(request: Request) -> bool:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        settings = Settings.from_env()
    return settings.auth.cookie_secure


def _set_refresh_cookie(
    response: Response, refresh_token: str, *, secure: bool
) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/auth/refresh",
    )


def _delete_refresh_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        key="refresh_token",
        path="/auth/refresh",
        httponly=True,
        secure=secure,
        samesite="strict",
    )


def _set_oauth_state_cookie(response: Response, state: str, *, secure: bool) -> None:
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=secure,
        max_age=600,
    )


def _delete_oauth_state_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        key="oauth_state",
        httponly=True,
        secure=secure,
    )


def _issue_tokens(
    response: Response, user_id: uuid.UUID, db: Session, *, secure: bool
) -> dict[str, str]:
    access_token, refresh_token = create_tokens(user_id, db)
    _set_refresh_cookie(response, refresh_token, secure=secure)
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


def _sync_oauth_user_role(
    *,
    db: Session,
    user: User,
    github_username: str,
    github_session: OAuth2Session | None = None,
    owner: str | None = None,
    repo: str | None = None,
    settings: GitHubIssuesSettings | None = None,
) -> User:
    resolved_role = resolve_github_repository_role(
        github_username,
        session=github_session,
        owner=owner,
        repo=repo,
        settings=settings,
    )

    if user.role != resolved_role:
        user = update_role(db, user.id, resolved_role)

    logger.info(
        "Persisted GitHub-derived user role",
        extra={
            "user_id": str(user.id),
            "github_username": github_username,
            "assigned_role": resolved_role.value,
            "owner": owner,
            "repo": repo,
        },
    )
    return user


@router.post("/auth/refresh")
def refresh_access(
    request: Request,
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
    _set_refresh_cookie(response, new_refresh_token, secure=_cookie_secure(request))
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/auth/refresh/logout")
def logout(
    request: Request,
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
    _delete_refresh_cookie(response, secure=_cookie_secure(request))
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
def github_login(request: Request):
    cookie_secure = _cookie_secure(request)
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
        _set_oauth_state_cookie(response, state, secure=cookie_secure)
        return response

    github_client_id, _github_secret, github_redirect = _resolve_github_oauth_settings()
    github = OAuth2Session(
        github_client_id,
        scope=["read:user", "user:email", "read:org"],
        redirect_uri=github_redirect,
    )
    authorization_url, state = github.authorization_url(
        "https://github.com/login/oauth/authorize"
    )
    response = RedirectResponse(authorization_url)
    _set_oauth_state_cookie(response, state, secure=cookie_secure)
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
    cookie_secure = _cookie_secure(request)
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
        settings = request.app.state.settings
        user = _sync_oauth_user_role(
            db=db,
            user=user,
            github_username=username,
            owner=settings.github_issues.owner,
            repo=settings.github_issues.repo,
            settings=settings.github_issues,
        )
        _delete_oauth_state_cookie(response, secure=cookie_secure)
        return _issue_tokens(response, user.id, db, secure=cookie_secure)

    saved_state = request.cookies.get("oauth_state")
    if not saved_state:
        raise HTTPException(status_code=400, detail="State missing or expired.")

    query_params = dict(request.query_params)
    code = query_params.get("code")
    state = query_params.get("state")

    if not code:
        raise HTTPException(status_code=400, detail="Code missing.")
    if state != saved_state:
        raise HTTPException(status_code=400, detail="State mismatch.")

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
            code=code,
        )
    except Exception as e:
        logger.error(f"GitHub token exchange failed: {e}")
        raise HTTPException(status_code=400, detail="Authentication failed.")

    user_response = github.get("https://api.github.com/user")
    if user_response.status_code != 200:
        raise HTTPException(
            status_code=400, detail="Failed to fetch user profile from github"
        )
    user_data = user_response.json()
    github_account_id = user_data.get("id")
    github_username = user_data.get("login")
    if github_account_id is None or not github_username:
        raise HTTPException(status_code=400, detail="Incomplete github user profile")

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

    first_name, last_name = split_github_name(user_data.get("name"))
    github_profile = GitHubProfile(
        github_id=str(github_account_id),
        email=primary_email,
        username=github_username,
        first_name=first_name or DEFAULT_DEV_FIRST_NAME,
        last_name=last_name or DEFAULT_DEV_LAST_NAME,
    )
    try:
        user = sync_user_from_github_profile(db, github_profile)
    except GitHubProfileSyncConflictError as exc:
        conflict_response = JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "github_profile_conflict",
                    "message": "Unable to sync GitHub profile with local account",
                    "field": exc.field,
                }
            },
        )
        _delete_oauth_state_cookie(conflict_response, secure=cookie_secure)
        return conflict_response

    _delete_oauth_state_cookie(response, secure=cookie_secure)

    settings = request.app.state.settings
    user = _sync_oauth_user_role(
        db=db,
        user=user,
        github_username=github_username,
        github_session=github,
        owner=settings.github_issues.owner,
        repo=settings.github_issues.repo,
        settings=settings.github_issues,
    )

    return _issue_tokens(response, user.id, db, secure=cookie_secure)
