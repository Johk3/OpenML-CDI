import logging
import os
import secrets
import uuid
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from requests import exceptions as requests_exceptions
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
DEFAULT_DEV_EMAIL = "dev.user@example.com"
DEFAULT_DEV_USERNAME = "dev-user"
DEFAULT_DEV_FIRST_NAME = "Dev"
DEFAULT_DEV_LAST_NAME = "User"
DEV_CALLBACK_URL = "http://localhost:5173/login/callback"
DEFAULT_GITHUB_OAUTH_SCOPES = ("read:user", "user:email", "read:org")
GITHUB_OAUTH_CONFIGURATION_MESSAGE = (
    "GitHub login is not configured correctly. Please contact an administrator."
)
GITHUB_OAUTH_RETRY_MESSAGE = "GitHub authentication failed. Please try again."
GITHUB_PROFILE_FETCH_FAILED_MESSAGE = (
    "Could not fetch your GitHub profile. Please try again."
)
GITHUB_EMAIL_FETCH_FAILED_MESSAGE = (
    "Could not fetch your GitHub email addresses. Please try again."
)
GITHUB_STATE_ERROR_MESSAGE = "Your GitHub sign-in session expired. Please start again."
GITHUB_PROFILE_CONFLICT_MESSAGES = {
    "email": (
        "This GitHub account uses an email address that is already connected "
        "to another OpenML account."
    ),
    "username": (
        "This GitHub account uses a username that is already connected to "
        "another OpenML account."
    ),
    "github_id": "This GitHub account is already connected to another OpenML account.",
    "profile": "Unable to sync GitHub profile with a local account.",
}

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


def _refresh_jti_from_payload(payload: dict[str, Any]) -> str:
    refresh_jti = payload.get("jti")
    if not isinstance(refresh_jti, str) or not refresh_jti:
        raise HTTPException(status_code=401, detail="Invalid JTI")
    return refresh_jti


class GitHubOAuthConfigurationError(RuntimeError):
    def __init__(self, missing_values: list[str]):
        super().__init__("GitHub OAuth settings are incomplete")
        self.missing_values = missing_values


class GitHubOAuthFlowError(RuntimeError):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


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


def _github_auth_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    secure: bool | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    error_body: dict[str, Any] = {"code": code, "message": message}
    if extra:
        error_body.update(extra)
    response = JSONResponse(status_code=status_code, content={"error": error_body})
    if secure is not None:
        _delete_oauth_state_cookie(response, secure=secure)
    return response


def _github_profile_conflict_message(field: str) -> str:
    return GITHUB_PROFILE_CONFLICT_MESSAGES.get(
        field, GITHUB_PROFILE_CONFLICT_MESSAGES["profile"]
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


def _resolve_github_oauth_settings() -> tuple[str, str]:
    github_client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    github_secret = os.getenv("GITHUB_SECRET", "").strip()
    missing_values: list[str] = []
    if not github_client_id:
        missing_values.append("GITHUB_CLIENT_ID")
    if not github_secret:
        missing_values.append("GITHUB_SECRET")
    if missing_values:
        logger.error(
            "GitHub OAuth settings are incomplete",
            extra={"missing_values": missing_values},
        )
        raise GitHubOAuthConfigurationError(missing_values)
    return github_client_id, github_secret


def _github_oauth_scopes() -> list[str]:
    raw_scopes = os.getenv("GITHUB_OAUTH_SCOPES", "").strip()
    if not raw_scopes:
        return list(DEFAULT_GITHUB_OAUTH_SCOPES)

    scopes = [
        scope.strip() for scope in raw_scopes.replace(",", " ").split() if scope.strip()
    ]
    return scopes or list(DEFAULT_GITHUB_OAUTH_SCOPES)


def _get_github_json(
    github: OAuth2Session,
    url: str,
    *,
    code: str,
    message: str,
) -> Any:
    try:
        github_response = github.get(url)
    except requests_exceptions.RequestException as error:
        logger.warning(
            "GitHub OAuth API request failed",
            extra={"url": url, "error": str(error)},
        )
        raise GitHubOAuthFlowError(400, code, message) from error

    if github_response.status_code != 200:
        logger.warning(
            "GitHub OAuth API request returned non-200",
            extra={
                "url": url,
                "status_code": github_response.status_code,
                "body": getattr(github_response, "text", "")[:500],
            },
        )
        raise GitHubOAuthFlowError(400, code, message)

    try:
        return github_response.json()
    except ValueError as error:
        logger.warning(
            "GitHub OAuth API response was not valid JSON",
            extra={"url": url},
        )
        raise GitHubOAuthFlowError(400, code, message) from error


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
    settings: GitHubIssuesSettings | None = None,
) -> User:
    resolved_role = resolve_github_repository_role(
        github_username,
        session=github_session,
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
    refresh_jti = _refresh_jti_from_payload(decoded_jwt)
    if decoded_jwt.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid JTI")
    try:
        user, family_id = verify_jti(
            db, refresh_jti
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
    refresh_jti = _refresh_jti_from_payload(decoded_jwt)
    _, family_id = verify_jti(db, refresh_jti)
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
        state = secrets.token_urlsafe(16)
        # In dev mode, short-circuit external OAuth and treat callback as approved.
        redirect_url = _append_query_params(
            DEV_CALLBACK_URL,
            {"code": "dev-mode", "state": state},
        )
        response = RedirectResponse(redirect_url)
        _set_oauth_state_cookie(response, state, secure=cookie_secure)
        return response

    try:
        github_client_id, _github_secret = _resolve_github_oauth_settings()
    except GitHubOAuthConfigurationError:
        return _github_auth_error_response(
            status_code=500,
            code="github_oauth_configuration_error",
            message=GITHUB_OAUTH_CONFIGURATION_MESSAGE,
        )
    github = OAuth2Session(
        github_client_id,
        scope=_github_oauth_scopes(),
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
            settings=settings.github_issues,
        )
        _delete_oauth_state_cookie(response, secure=cookie_secure)
        return _issue_tokens(response, user.id, db, secure=cookie_secure)

    saved_state = request.cookies.get("oauth_state")
    if not saved_state:
        return _github_auth_error_response(
            status_code=400,
            code="github_oauth_state_missing",
            message=GITHUB_STATE_ERROR_MESSAGE,
            secure=cookie_secure,
        )

    query_params = dict(request.query_params)
    code = query_params.get("code")
    state = query_params.get("state")

    if not code:
        return _github_auth_error_response(
            status_code=400,
            code="github_oauth_code_missing",
            message=GITHUB_OAUTH_RETRY_MESSAGE,
            secure=cookie_secure,
        )
    if state != saved_state:
        return _github_auth_error_response(
            status_code=400,
            code="github_oauth_state_mismatch",
            message=GITHUB_STATE_ERROR_MESSAGE,
            secure=cookie_secure,
        )

    try:
        github_client_id, github_secret = _resolve_github_oauth_settings()
    except GitHubOAuthConfigurationError:
        return _github_auth_error_response(
            status_code=500,
            code="github_oauth_configuration_error",
            message=GITHUB_OAUTH_CONFIGURATION_MESSAGE,
            secure=cookie_secure,
        )
    github = OAuth2Session(
        github_client_id,
        state=saved_state,
    )
    try:
        github.fetch_token(
            "https://github.com/login/oauth/access_token",
            client_secret=github_secret,
            code=code,
        )
    except Exception as e:
        logger.warning("GitHub token exchange failed", extra={"error": str(e)})
        return _github_auth_error_response(
            status_code=400,
            code="github_oauth_token_exchange_failed",
            message=GITHUB_OAUTH_RETRY_MESSAGE,
            secure=cookie_secure,
        )

    try:
        user_data = _get_github_json(
            github,
            "https://api.github.com/user",
            code="github_profile_fetch_failed",
            message=GITHUB_PROFILE_FETCH_FAILED_MESSAGE,
        )
    except GitHubOAuthFlowError as error:
        return _github_auth_error_response(
            status_code=error.status_code,
            code=error.code,
            message=error.message,
            secure=cookie_secure,
        )
    if not isinstance(user_data, dict):
        return _github_auth_error_response(
            status_code=400,
            code="github_profile_fetch_failed",
            message=GITHUB_PROFILE_FETCH_FAILED_MESSAGE,
            secure=cookie_secure,
        )
    github_account_id = user_data.get("id")
    github_username = user_data.get("login")
    if github_account_id is None or not github_username:
        return _github_auth_error_response(
            status_code=400,
            code="github_profile_incomplete",
            message="GitHub did not return a complete profile. Please try again.",
            secure=cookie_secure,
        )

    try:
        emails_data = _get_github_json(
            github,
            "https://api.github.com/user/emails",
            code="github_email_fetch_failed",
            message=GITHUB_EMAIL_FETCH_FAILED_MESSAGE,
        )
    except GitHubOAuthFlowError as error:
        return _github_auth_error_response(
            status_code=error.status_code,
            code=error.code,
            message=error.message,
            secure=cookie_secure,
        )
    if not isinstance(emails_data, list):
        return _github_auth_error_response(
            status_code=400,
            code="github_email_fetch_failed",
            message=GITHUB_EMAIL_FETCH_FAILED_MESSAGE,
            secure=cookie_secure,
        )

    primary_email = None
    for email_obj in emails_data:
        if not isinstance(email_obj, dict):
            continue
        if email_obj.get("primary") and email_obj.get("verified"):
            primary_email = email_obj.get("email")
            break
    if not primary_email:
        return _github_auth_error_response(
            status_code=400,
            code="github_verified_email_missing",
            message=(
                "GitHub did not return a verified primary email address. "
                "Please verify an email address on GitHub and try again."
            ),
            secure=cookie_secure,
        )

    first_name, last_name = split_github_name(user_data.get("name"))
    github_profile = GitHubProfile(
        github_id=str(github_account_id),
        email=primary_email,
        username=github_username,
        first_name=first_name or github_username,
        last_name=last_name,
    )
    try:
        user = sync_user_from_github_profile(db, github_profile)
    except GitHubProfileSyncConflictError as exc:
        conflict_response = JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "github_profile_conflict",
                    "message": _github_profile_conflict_message(exc.field),
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
        settings=settings.github_issues,
    )

    return _issue_tokens(response, user.id, db, secure=cookie_secure)
