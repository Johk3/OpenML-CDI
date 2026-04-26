import logging

from app.database.models import Roles
from app.services.github_roles import (
    GitHubPermissionLookupError,
    GitHubRepositoryPermissionClient,
    GitHubRepositoryRoleResolver,
    GITHUB_API_VERSION,
    map_github_repository_role,
)


class FakeGitHubClient:
    def __init__(self, payload=None, error: Exception | None = None):
        self.payload = payload or {}
        self.error = error
        self.calls: list[str] = []

    def get_repository_permission(self, username: str) -> dict:
        self.calls.append(username)
        if self.error:
            raise self.error
        return self.payload


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self.payload = payload

    def json(self):
        return self.payload


class RecordingSession:
    def __init__(self, response: FakeResponse):
        self.response = response
        self.requests: list[dict] = []

    def get(self, url: str, *, headers: dict):
        self.requests.append({"url": url, "headers": headers})
        return self.response


class FailingSession:
    def get(self, url: str, *, headers: dict):
        raise RuntimeError("network unavailable")


def test_repository_permission_client_uses_expected_github_endpoint_and_headers():
    session = RecordingSession(FakeResponse(200, {"role_name": "maintain"}))
    client = GitHubRepositoryPermissionClient(
        session, owner="openml", repo="openmlupload"
    )

    assert client.get_repository_permission("octocat") == {"role_name": "maintain"}
    assert session.requests == [
        {
            "url": (
                "https://api.github.com/repos/openml/openmlupload"
                "/collaborators/octocat/permission"
            ),
            "headers": {
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
        }
    ]


def test_repository_permission_client_wraps_http_errors_as_lookup_failures():
    client = GitHubRepositoryPermissionClient(
        FailingSession(), owner="openml", repo="openmlupload"
    )

    try:
        client.get_repository_permission("octocat")
    except GitHubPermissionLookupError as error:
        assert "GitHub request failed" in str(error)
    else:
        raise AssertionError("Expected GitHubPermissionLookupError")


def test_maps_maintain_or_admin_permission_to_expert():
    assert map_github_repository_role({"role_name": "maintain"}) == Roles.EXPERT
    assert map_github_repository_role({"role_name": "admin"}) == Roles.EXPERT
    assert map_github_repository_role({"permission": "admin"}) == Roles.EXPERT


def test_maps_non_maintainer_permission_to_user():
    assert map_github_repository_role({"role_name": "write"}) == Roles.USER
    assert map_github_repository_role({"role_name": "triage"}) == Roles.USER
    assert map_github_repository_role({"permission": "write"}) == Roles.USER
    assert map_github_repository_role({}) == Roles.USER


def test_permission_lookup_failure_falls_back_to_user_and_logs(caplog):
    resolver = GitHubRepositoryRoleResolver(
        FakeGitHubClient(error=GitHubPermissionLookupError("github unavailable"))
    )

    with caplog.at_level(logging.WARNING):
        role = resolver.resolve_role("octocat")

    assert role == Roles.USER
    assert "GitHub repository permission lookup failed" in caplog.text
