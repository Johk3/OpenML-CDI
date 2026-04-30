import uuid

from app.database import models


class _FakeGitHubResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _mock_github_oauth(
    monkeypatch,
    *,
    user_payload: dict,
    emails_payload: list[dict],
    user_status: int = 200,
    emails_status: int = 200,
):
    monkeypatch.setenv("AUTH_DEV_MODE_APPROVE_ALL_LOGINS", "false")
    monkeypatch.setenv("ENVIRONMENT", "production")

    class FakeOAuth2Session:
        def __init__(self, *_args, **_kwargs):
            pass

        def fetch_token(self, *_args, **_kwargs):
            return {"access_token": "github-access-token"}

        def get(self, url: str, **_kwargs):
            if url == "https://api.github.com/user":
                return _FakeGitHubResponse(user_status, user_payload)
            if url == "https://api.github.com/user/emails":
                return _FakeGitHubResponse(emails_status, emails_payload)
            if "/repos/" in url and url.endswith("/permission"):
                return _FakeGitHubResponse(
                    404, {"permission": "none", "role_name": "none"}
                )
            raise AssertionError(f"Unexpected GitHub URL: {url}")

    monkeypatch.setattr("app.routers.auth.OAuth2Session", FakeOAuth2Session)


def test_github_callback_syncs_existing_user_and_me_returns_latest_profile(
    client, db_test_session, monkeypatch
):
    existing_user = models.User(
        id=uuid.uuid4(),
        github_id="123456",
        email="old.email@example.com",
        username="old-login",
        first_name="Old",
        last_name="Name",
        role=models.Roles.USER,
    )
    db_test_session.add(existing_user)
    db_test_session.commit()

    _mock_github_oauth(
        monkeypatch,
        user_payload={
            "id": 123456,
            "login": "new-login",
            "name": "New Name",
        },
        emails_payload=[
            {
                "email": "new.email@example.com",
                "primary": True,
                "verified": True,
            }
        ],
    )

    callback_response = client.get(
        "/api/auth/github/callback?code=fake-code&state=fake-state",
        cookies={"oauth_state": "fake-state"},
    )

    assert callback_response.status_code == 200
    assert set(callback_response.json()) == {"access_token", "token_type"}

    db_test_session.expire_all()
    users = db_test_session.query(models.User).all()
    assert len(users) == 1
    synced_user = users[0]
    assert synced_user.github_id == "123456"
    assert synced_user.email == "new.email@example.com"
    assert synced_user.username == "new-login"
    assert synced_user.first_name == "New"
    assert synced_user.last_name == "Name"

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {callback_response.json()['access_token']}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "new.email@example.com"
    assert me_response.json()["username"] == "new-login"
    assert me_response.json()["first_name"] == "New"
    assert me_response.json()["last_name"] == "Name"


def test_github_callback_links_legacy_email_user_without_creating_duplicate(
    client, db_test_session, monkeypatch
):
    legacy_user = models.User(
        id=uuid.uuid4(),
        github_id=None,
        email="legacy@example.com",
        username="legacy-local-login",
        first_name="Legacy",
        last_name="Local",
        role=models.Roles.USER,
    )
    db_test_session.add(legacy_user)
    db_test_session.commit()

    _mock_github_oauth(
        monkeypatch,
        user_payload={
            "id": 98765,
            "login": "legacy-gh-login",
            "name": "Legacy Synced",
        },
        emails_payload=[
            {
                "email": "legacy@example.com",
                "primary": True,
                "verified": True,
            }
        ],
    )

    callback_response = client.get(
        "/api/auth/github/callback?code=fake-code&state=fake-state",
        cookies={"oauth_state": "fake-state"},
    )

    assert callback_response.status_code == 200

    db_test_session.expire_all()
    users = db_test_session.query(models.User).all()
    assert len(users) == 1
    linked_user = users[0]
    assert linked_user.github_id == "98765"
    assert linked_user.email == "legacy@example.com"
    assert linked_user.username == "legacy-gh-login"
    assert linked_user.first_name == "Legacy"
    assert linked_user.last_name == "Synced"


def test_github_callback_returns_conflict_when_email_is_owned_by_other_user(
    client, db_test_session, monkeypatch
):
    github_user = models.User(
        id=uuid.uuid4(),
        github_id="654321",
        email="github-owner@example.com",
        username="github-owner",
        first_name="GitHub",
        last_name="Owner",
        role=models.Roles.USER,
    )
    local_user_with_conflicting_email = models.User(
        id=uuid.uuid4(),
        github_id=None,
        email="taken@example.com",
        username="local-user",
        first_name="Local",
        last_name="User",
        role=models.Roles.USER,
    )
    db_test_session.add_all([github_user, local_user_with_conflicting_email])
    db_test_session.commit()

    _mock_github_oauth(
        monkeypatch,
        user_payload={
            "id": 654321,
            "login": "github-owner-renamed",
            "name": "GitHub Renamed",
        },
        emails_payload=[
            {
                "email": "taken@example.com",
                "primary": True,
                "verified": True,
            }
        ],
    )

    callback_response = client.get(
        "/api/auth/github/callback?code=fake-code&state=fake-state",
        cookies={"oauth_state": "fake-state"},
    )

    assert callback_response.status_code == 409
    assert callback_response.json() == {
        "error": {
            "code": "github_profile_conflict",
            "message": "Unable to sync GitHub profile with local account",
            "field": "email",
        }
    }

    second_response = client.get(
        "/api/auth/github/callback?code=fake-code&state=fake-state",
        cookies={"oauth_state": "fake-state"},
    )
    assert second_response.status_code == 409
    assert second_response.json() == callback_response.json()

    db_test_session.expire_all()
    assert db_test_session.query(models.User).count() == 2

    unchanged_github_user = (
        db_test_session.query(models.User)
        .filter(models.User.github_id == "654321")
        .one()
    )
    assert unchanged_github_user.email == "github-owner@example.com"
    assert unchanged_github_user.username == "github-owner"
