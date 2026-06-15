import logging

import pytest

from app.config import GitHubIssuesSettings
from app.database.models import Roles
from app.services.github_issues import GitHubAPIError
from app.services.github_roles import (
    GitHubPermissionLookupError,
    GitHubRepositoryPermissionClient,
    GitHubRepositoryRoleResolver,
    GITHUB_API_VERSION,
    map_github_repository_role,
    resolve_github_repository_role,
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
    def __init__(self, status_code: int, payload: list | dict, text: str = ""):
        self.status_code = status_code
        self.payload = payload
        self.text = text

    def json(self):
        return self.payload


class InvalidJsonResponse(FakeResponse):
    def __init__(self):
        super().__init__(200, {}, text="not-json")

    def json(self):
        raise ValueError("invalid json")


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


def test_repository_permission_client_uses_configured_repository():
    session = RecordingSession(FakeResponse(200, {"role_name": "maintain"}))
    client = GitHubRepositoryPermissionClient(
        session,
        owner="openml",
        repo="expert-checks",
    )

    assert client.get_repository_permission("octocat") == {"role_name": "maintain"}
    assert session.requests[0]["url"] == (
        "https://api.github.com/repos/openml/expert-checks"
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


def test_repository_permission_client_maps_404_to_no_permission():
    session = RecordingSession(FakeResponse(404, {"message": "Not Found"}))
    client = GitHubRepositoryPermissionClient(session)

    assert client.get_repository_permission("octocat") == {
        "permission": "none",
        "role_name": "none",
    }


def test_repository_permission_client_wraps_non_200_responses():
    session = RecordingSession(
        FakeResponse(500, {"message": "Server Error"}, text="server error")
    )
    client = GitHubRepositoryPermissionClient(session)

    with pytest.raises(GitHubPermissionLookupError, match="GitHub returned 500"):
        client.get_repository_permission("octocat")


def test_repository_permission_client_wraps_invalid_json_responses():
    session = RecordingSession(InvalidJsonResponse())
    client = GitHubRepositoryPermissionClient(session)

    with pytest.raises(GitHubPermissionLookupError, match="invalid JSON"):
        client.get_repository_permission("octocat")


@pytest.mark.parametrize(
    "permission_payload",
    [
        {"permission": "read", "role_name": "read"},
        {"permission": "read"},
    ],
)
def test_maps_public_repository_read_permission_to_user(permission_payload):
    assert map_github_repository_role(permission_payload) == Roles.USER


@pytest.mark.parametrize("role_name", ["read", "triage", "write"])
def test_maps_lower_collaborator_permissions_to_user(role_name):
    assert map_github_repository_role({"role_name": role_name}) == Roles.USER


def test_maps_normalized_lower_collaborator_permission_to_user():
    assert map_github_repository_role({"role_name": " WRITE "}) == Roles.USER


@pytest.mark.parametrize(
    "permission_payload",
    [
        {"role_name": "maintain"},
        {"role_name": "admin"},
        {"permission": "admin"},
        {"role_name": " Maintain "},
        {"permission": " ADMIN "},
        {"permission": "maintain"},
    ],
)
def test_maps_elevated_collaborator_permissions_to_expert(permission_payload):
    assert map_github_repository_role(permission_payload) == Roles.EXPERT


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


def test_resolve_role_uses_configured_permission_repository(monkeypatch):
    class RecordingPermissionClient:
        def __init__(
            self,
            session=None,
            *,
            token=None,
            owner=None,
            repo=None,
        ):
            self.session = session
            self.token = token
            self.owner = owner
            self.repo = repo
            created_clients.append(self)

        def get_repository_permission(self, username: str) -> dict[str, object]:
            return {"role_name": "maintain"}

    created_clients: list[RecordingPermissionClient] = []

    monkeypatch.setattr(
        "app.services.github_roles.GitHubRepositoryPermissionClient",
        RecordingPermissionClient,
    )
    monkeypatch.setattr(
        "app.services.github_issues.get_installation_token",
        lambda _settings: "gh-app-token",
    )
    settings = GitHubIssuesSettings(
        app_id=123,
        install_id=456,
        private_key="test-key",
        owner="issue-owner",
        repo="issue-repo",
        permission_owner="permission-owner",
        permission_repo="permission-repo",
    )

    role = resolve_github_repository_role(
        "octocat", session=object(), settings=settings
    )

    assert role == Roles.EXPERT
    assert len(created_clients) == 1
    created_client = created_clients[0]
    assert created_client.session is None
    assert created_client.token == "gh-app-token"
    assert created_client.owner == "permission-owner"
    assert created_client.repo == "permission-repo"


def test_resolve_role_falls_back_to_user_when_app_token_lookup_fails(monkeypatch):
    session = RecordingSession(FakeResponse(200, {"role_name": "maintain"}))

    def fail_token_lookup(_settings):
        raise GitHubAPIError("token unavailable")

    monkeypatch.setattr(
        "app.services.github_issues.get_installation_token",
        fail_token_lookup,
    )
    settings = GitHubIssuesSettings(
        app_id=123,
        install_id=456,
        private_key="test-key",
        owner="issue-owner",
        repo="issue-repo",
        permission_owner="permission-owner",
        permission_repo="permission-repo",
    )

    role = resolve_github_repository_role("octocat", session=session, settings=settings)

    assert role == Roles.USER
    assert session.requests == []
