import logging
from typing import Protocol
from urllib.parse import quote

import requests
from requests import Response

from app.database.models import Roles
from app.config import GitHubIssuesSettings

logger = logging.getLogger(__name__)

GITHUB_API_VERSION = "2022-11-28"
DEFAULT_GITHUB_PERMISSION_OWNER = "koevoet1221"
DEFAULT_GITHUB_PERMISSION_REPO = "openmlupload-testing"
# All collaborator roles now qualify for expert status
MAINTAINER_ROLE_NAMES = {"read", "triage", "write", "maintain", "admin"}


class GitHubPermissionLookupError(RuntimeError):
    pass


class GitHubPermissionClient(Protocol):
    def get_repository_permission(self, username: str) -> dict[str, object]: ...


class GitHubRepositoryPermissionClient:
    def __init__(
        self,
        session=None,
        *,
        token: str | None = None,
        api_base_url: str = "https://api.github.com",
    ):
        # If a token is provided (App token), we use a fresh session to avoid
        # conflicts with user-level OAuth sessions.
        if token:
            self.session = session or requests.Session()
            self.token = token
            self.auth_method = "app_token"
        else:
            self.session = session or requests.Session()
            self.token = None
            self.auth_method = "user_session" if session else "unauthenticated"

        self.owner = DEFAULT_GITHUB_PERMISSION_OWNER
        self.repo = DEFAULT_GITHUB_PERMISSION_REPO
        self.api_base_url = api_base_url.rstrip("/")

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def get_repository_permission(self, username: str) -> dict[str, object]:
        safe_owner = quote(self.owner, safe="")
        safe_repo = quote(self.repo, safe="")
        safe_username = quote(username.strip(), safe="")
        url = (
            f"{self.api_base_url}/repos/{safe_owner}/{safe_repo}"
            f"/collaborators/{safe_username}/permission"
        )
        logger.debug(
            "Checking GitHub repository permission",
            extra={
                "url": url,
                "auth_method": self.auth_method,
                "github_username": username,
            },
        )
        try:
            response: Response = self.session.get(
                url,
                headers=self._get_headers(),
            )
        except Exception as error:
            raise GitHubPermissionLookupError("GitHub request failed") from error

        if response.status_code == 404:
            logger.debug(
                "GitHub returned 404 (not a collaborator)",
                extra={
                    "github_username": username,
                    "repo": f"{self.owner}/{self.repo}",
                },
            )
            return {"permission": "none", "role_name": "none"}

        if response.status_code != 200:
            logger.warning(
                "GitHub permission check failed with non-200 status",
                extra={
                    "status_code": response.status_code,
                    "body": response.text[:500],
                    "github_username": username,
                },
            )
            raise GitHubPermissionLookupError(
                f"GitHub returned {response.status_code} for {self.owner}/{self.repo}"
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise GitHubPermissionLookupError("GitHub returned invalid JSON") from error

        if not isinstance(payload, dict):
            raise GitHubPermissionLookupError("GitHub returned an invalid payload")

        logger.debug(
            "GitHub permission payload received",
            extra={"github_username": username, "payload": payload},
        )
        return payload


def map_github_repository_role(permission_payload: dict[str, object]) -> Roles:
    role_name = str(permission_payload.get("role_name", "")).strip().lower()
    permission = str(permission_payload.get("permission", "")).strip().lower()
    if role_name in MAINTAINER_ROLE_NAMES or permission == "admin":
        return Roles.EXPERT
    return Roles.USER


class GitHubRepositoryRoleResolver:
    def __init__(self, client: GitHubPermissionClient):
        self.client = client

    def resolve_role(self, username: str) -> Roles:
        try:
            permission_payload = self.client.get_repository_permission(username)
            role = map_github_repository_role(permission_payload)

            if role == Roles.EXPERT:
                return role

        except GitHubPermissionLookupError as error:
            logger.warning(
                "GitHub repository permission lookup failed; assigning least privilege",
                extra={"github_username": username, "error": str(error)},
            )
            return Roles.USER

        return Roles.USER


def resolve_github_repository_role(
    username: str,
    session=None,
    settings: GitHubIssuesSettings | None = None,
) -> Roles:
    token = None
    if settings:
        from app.services.github_issues import get_installation_token, GitHubAPIError

        try:
            token = get_installation_token(settings)
            logger.debug("Acquired GitHub App installation token for role resolution")
        except GitHubAPIError as error:
            logger.warning(
                "Failed to get GitHub App installation token for role resolution",
                extra={"error": str(error)},
            )

    # If we have an App token, we use it with a fresh session to avoid conflicts
    # with the user's OAuth session.
    client_session = session if not token else None
    client = GitHubRepositoryPermissionClient(client_session, token=token)
    return GitHubRepositoryRoleResolver(client).resolve_role(username)
