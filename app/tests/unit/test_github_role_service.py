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
    def __init__(
        self, payload=None, error: Exception | None = None, is_contributor=False
    ):
        self.payload = payload or {}
        self.error = error
        self.contributor = is_contributor
        self.calls: list[str] = []

    def get_repository_permission(self, username: str) -> dict:
        self.calls.append(username)
        if self.error:
            raise self.error
        return self.payload

    def is_contributor(self, username: str) -> bool:
        return self.contributor


class FakeResponse:
    def __init__(self, status_code: int, payload: list | dict):
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
    client = GitHubRepositoryPermissionClient(session)

    assert client.get_repository_permission("octocat") == {"role_name": "maintain"}
    assert session.requests == [
        {
            "url": (
                "https://api.github.com/repos/koevoet1221/openmlupload-testing"
                "/collaborators/octocat/permission"
            ),
            "headers": {
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
        }
    ]


def test_repository_permission_client_defaults_to_openml_upload_testing(monkeypatch):
    monkeypatch.setenv("GITHUB_PERMISSION_OWNER", "wrong-owner")
    monkeypatch.setenv("GITHUB_PERMISSION_REPO", "wrong-repo")
    session = RecordingSession(FakeResponse(200, {"role_name": "maintain"}))
    client = GitHubRepositoryPermissionClient(session)

    assert client.get_repository_permission("octocat") == {"role_name": "maintain"}
    assert session.requests[0]["url"] == (
        "https://api.github.com/repos/koevoet1221/openmlupload-testing"
        "/collaborators/octocat/permission"
    )


def test_repository_permission_client_applies_auth_header_when_token_provided():
    session = RecordingSession(FakeResponse(200, {"role_name": "maintain"}))
    # We pass session explicitly to the client even with a token for testing
    client = GitHubRepositoryPermissionClient(session, token="gh-app-token")

    assert client.get_repository_permission("octocat") == {"role_name": "maintain"}
    assert session.requests[0]["headers"]["Authorization"] == "Bearer gh-app-token"


def test_repository_permission_client_wraps_http_errors_as_lookup_failures():
    client = GitHubRepositoryPermissionClient(FailingSession())

    try:
        client.get_repository_permission("octocat")
    except GitHubPermissionLookupError as error:
        assert "GitHub request failed" in str(error)
    else:
        raise AssertionError("Expected GitHubPermissionLookupError")


def test_maps_all_collaborator_permissions_to_expert():
    assert map_github_repository_role({"role_name": "read"}) == Roles.EXPERT
    assert map_github_repository_role({"role_name": "triage"}) == Roles.EXPERT
    assert map_github_repository_role({"role_name": "write"}) == Roles.EXPERT
    assert map_github_repository_role({"role_name": "maintain"}) == Roles.EXPERT
    assert map_github_repository_role({"role_name": "admin"}) == Roles.EXPERT
    assert map_github_repository_role({"permission": "admin"}) == Roles.EXPERT


def test_maps_no_permission_to_user():
    assert map_github_repository_role({"role_name": "none"}) == Roles.USER
    assert map_github_repository_role({}) == Roles.USER


def test_resolver_does_not_promote_non_collaborating_contributors():
    client = FakeGitHubClient(payload={"role_name": "none"}, is_contributor=True)
    resolver = GitHubRepositoryRoleResolver(client)
    assert resolver.resolve_role("contributor-user") == Roles.USER


def test_resolver_returns_user_if_neither_collaborator_nor_contributor():
    client = FakeGitHubClient(payload={"role_name": "none"}, is_contributor=False)
    resolver = GitHubRepositoryRoleResolver(client)
    assert resolver.resolve_role("regular-user") == Roles.USER


def test_permission_lookup_failure_falls_back_to_user_and_logs(caplog):
    resolver = GitHubRepositoryRoleResolver(
        FakeGitHubClient(error=GitHubPermissionLookupError("github unavailable"))
    )

    with caplog.at_level(logging.WARNING):
        role = resolver.resolve_role("octocat")

    assert role == Roles.USER
    assert "GitHub repository permission lookup failed" in caplog.text
