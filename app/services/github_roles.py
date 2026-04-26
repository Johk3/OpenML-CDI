import logging
import os
from typing import Protocol
from urllib.parse import quote

from requests import Response

from app.database.models import Roles

logger = logging.getLogger(__name__)

GITHUB_PERMISSION_OWNER_ENV = "GITHUB_PERMISSION_OWNER"
GITHUB_PERMISSION_REPO_ENV = "GITHUB_PERMISSION_REPO"
GITHUB_API_VERSION = "2026-03-10"
DEFAULT_GITHUB_PERMISSION_OWNER = "openml"
DEFAULT_GITHUB_PERMISSION_REPO = "openmlupload"
MAINTAINER_ROLE_NAMES = {"maintain", "admin"}


class GitHubPermissionLookupError(RuntimeError):
    pass


class GitHubPermissionClient(Protocol):
    def get_repository_permission(self, username: str) -> dict:
        pass


class GitHubRepositoryPermissionClient:
    def __init__(
        self,
        session,
        *,
        owner: str | None = None,
        repo: str | None = None,
        api_base_url: str = "https://api.github.com",
    ):
        self.session = session
        self.owner = (
            owner
            or os.getenv(GITHUB_PERMISSION_OWNER_ENV, DEFAULT_GITHUB_PERMISSION_OWNER)
        ).strip()
        self.repo = (
            repo
            or os.getenv(GITHUB_PERMISSION_REPO_ENV, DEFAULT_GITHUB_PERMISSION_REPO)
        ).strip()
        self.api_base_url = api_base_url.rstrip("/")

    def get_repository_permission(self, username: str) -> dict:
        safe_owner = quote(self.owner, safe="")
        safe_repo = quote(self.repo, safe="")
        safe_username = quote(username.strip(), safe="")
        url = (
            f"{self.api_base_url}/repos/{safe_owner}/{safe_repo}"
            f"/collaborators/{safe_username}/permission"
        )
        try:
            response: Response = self.session.get(
                url,
                headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": GITHUB_API_VERSION,
                },
            )
        except Exception as error:
            raise GitHubPermissionLookupError("GitHub request failed") from error
        if response.status_code == 404:
            return {"permission": "none", "role_name": "none"}
        if response.status_code != 200:
            raise GitHubPermissionLookupError(
                f"GitHub returned {response.status_code} for {self.owner}/{self.repo}"
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise GitHubPermissionLookupError("GitHub returned invalid JSON") from error
        if not isinstance(payload, dict):
            raise GitHubPermissionLookupError("GitHub returned an invalid payload")
        return payload


def map_github_repository_role(permission_payload: dict) -> Roles:
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
        except GitHubPermissionLookupError as error:
            logger.warning(
                "GitHub repository permission lookup failed; assigning least privilege",
                extra={"github_username": username, "error": str(error)},
            )
            return Roles.USER

        role = map_github_repository_role(permission_payload)
        logger.info(
            "GitHub repository role assignment resolved",
            extra={
                "github_username": username,
                "github_role_name": permission_payload.get("role_name"),
                "github_permission": permission_payload.get("permission"),
                "assigned_role": role.value,
            },
        )
        return role


def resolve_github_repository_role(username: str, session=None) -> Roles:
    if session is None:
        logger.warning(
            "GitHub repository permission lookup skipped; assigning least privilege",
            extra={"github_username": username},
        )
        return Roles.USER
    client = GitHubRepositoryPermissionClient(session)
    return GitHubRepositoryRoleResolver(client).resolve_role(username)
