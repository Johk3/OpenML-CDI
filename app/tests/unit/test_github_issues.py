from unittest.mock import MagicMock, patch
from datetime import datetime
import pytest

from github import GithubException
from requests import exceptions as requests_exceptions

from app.config import GitHubIssuesSettings
from app.database.models import Statuses
from app.services.github_issues import (
    GitHubAPIError,
    _build_issue_body,
    _parse_owner_repo_number,
    create_issue,
    get_issue_with_comments,
    create_issue_for_dataset,
    update_issue,
)


@pytest.fixture
def settings():
    return GitHubIssuesSettings(
        app_id=123,
        install_id=456,
        private_key="test_key",
        owner="openml",
        repo="openmlupload-test",
    )


@pytest.fixture
def empty_settings():
    return GitHubIssuesSettings(
        app_id=None,
        install_id=None,
        private_key="",
        owner="openml",
        repo="openmlupload-test",
    )


class TestParseOwnerRepoNumber:
    def test_valid_url(self):
        result = _parse_owner_repo_number(
            "https://github.com/openml/openmlupload-test/issues/42"
        )
        assert result == ("openml", "openmlupload-test", 42)

    def test_http_url(self):
        result = _parse_owner_repo_number("http://github.com/user/repo/issues/1")
        assert result == ("user", "repo", 1)

    def test_invalid_url_returns_none(self):
        assert _parse_owner_repo_number("not-a-url") is None
        assert _parse_owner_repo_number("https://example.com/issues/1") is None


class TestBuildIssueBody:
    def test_basic_body(self):
        body = _build_issue_body(
            "abc-123", "My Dataset", {"description": "A test"}, "http://localhost:8000"
        )
        assert "My Dataset" in body
        assert "http://localhost:8000/datasets/abc-123" in body
        assert "A test" in body

    def test_dict_description(self):
        body = _build_issue_body(
            "id1",
            "Title",
            {"description": {"text": "Nested desc"}},
            "http://localhost:8000",
        )
        assert "Nested desc" in body

    def test_file_count(self):
        body = _build_issue_body(
            "id1",
            "Title",
            {"filenames": ["a.csv", "b.csv"]},
            "http://localhost:8000",
        )
        assert "**Files:** 2" in body

    def test_filters_internal_upload_metadata(self):
        body = _build_issue_body(
            "id1",
            "Title",
            {
                "text": "Please review this dataset.",
                "filenames": ["folder/private.csv"],
                "storage_keys": ["datasets/batch/folder/private.csv"],
                "objects": [
                    {
                        "object_key": "datasets/batch/folder/private.csv",
                        "original_path": "folder/private.csv",
                        "etag": "secret-etag",
                    }
                ],
                "directory_structure": {"paths": ["folder/private.csv"]},
                "content_types": ["text/csv"],
                "byte_sizes": [123],
                "checksums": ["secret-checksum"],
                "storage_schema_version": 1,
                "contact": {"email": "uploader@example.com"},
                "malware_scan": {"status": "clean"},
            },
            "http://localhost:8000",
        )

        assert "Please review this dataset." in body
        assert "**Files:** 1" in body
        assert "storage_keys" not in body
        assert "datasets/batch" not in body
        assert "objects" not in body
        assert "directory_structure" not in body
        assert "folder/private.csv" not in body
        assert "content_types" not in body
        assert "byte_sizes" not in body
        assert "secret-checksum" not in body
        assert "storage_schema_version" not in body
        assert "uploader@example.com" not in body
        assert "malware_scan" not in body


class TestCreateIssue:
    @patch("app.services.github_issues._get_github_client")
    def test_success(self, mock_get_client, settings):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_issue = MagicMock()
        mock_issue.html_url = "https://github.com/openml/openmlupload-test/issues/1"

        mock_repo.create_issue.return_value = mock_issue
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        url = create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")
        assert url == "https://github.com/openml/openmlupload-test/issues/1"
        mock_repo.create_issue.assert_called_once()

    @patch("app.services.github_issues._get_github_client")
    def test_401_raises(self, mock_get_client, settings):
        mock_get_client.side_effect = GithubException(
            401, {"message": "Bad credentials"}
        )

        with pytest.raises(GitHubAPIError, match="invalid or expired"):
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")

    @patch("app.services.github_issues._get_github_client")
    def test_rate_limit_403(self, mock_get_client, settings):
        mock_get_client.side_effect = GithubException(
            403, {"message": "API rate limit exceeded"}
        )

        with pytest.raises(GitHubAPIError, match="rate limit") as exc_info:
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")

        assert exc_info.value.reason == "rate_limited"
        assert exc_info.value.retryable is True

    @patch("app.services.github_issues._get_github_client")
    def test_permission_403(self, mock_get_client, settings):
        mock_get_client.side_effect = GithubException(
            403, {"message": "Resource not accessible by integration"}
        )

        with pytest.raises(GitHubAPIError, match="permission") as exc_info:
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")

        assert exc_info.value.reason == "permission_error"
        assert exc_info.value.retryable is False
        assert "permission" in exc_info.value.user_message

    @patch("app.services.github_issues._get_github_client")
    def test_validation_422(self, mock_get_client, settings):
        mock_get_client.side_effect = GithubException(
            422, {"message": "Validation Failed"}
        )

        with pytest.raises(GitHubAPIError, match="rejected") as exc_info:
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")

        assert exc_info.value.reason == "validation_error"
        assert exc_info.value.retryable is False

    @patch("app.services.github_issues._get_github_client")
    def test_transient_api_error(self, mock_get_client, settings):
        mock_get_client.side_effect = GithubException(500, {"message": "Server Error"})

        with pytest.raises(GitHubAPIError, match="temporary") as exc_info:
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")

        assert exc_info.value.reason == "transient_error"
        assert exc_info.value.retryable is True

    @patch("app.services.github_issues._get_github_client")
    def test_network_error(self, mock_get_client, settings):
        mock_get_client.side_effect = Exception("boom")

        with pytest.raises(Exception, match="boom"):
            create_issue(settings, "ds-1", "Test", {}, "http://localhost:8000")


class TestGetIssueWithComments:
    @patch("app.services.github_issues._get_github_client")
    def test_success(self, mock_get_client, settings):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_issue = MagicMock()

        mock_issue.state = "open"
        mock_issue.html_url = "https://github.com/openml/openmlupload-test/issues/1"
        mock_issue.title = "[Dataset] Test"

        mock_comment = MagicMock()
        mock_comment.id = 100
        mock_comment.user.login = "alice"
        mock_comment.user.avatar_url = "https://avatar.test/a"
        mock_comment.body = "Looks good!"
        mock_comment.created_at = datetime(2026, 5, 13, 10, 0, 0)
        mock_comment.author_association = "MEMBER"

        mock_issue.get_comments.return_value = [mock_comment]

        mock_repo.get_issue.return_value = mock_issue
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        result = get_issue_with_comments(
            settings,
            "https://github.com/openml/openmlupload-test/issues/1",
        )
        assert result["state"] == "open"
        assert len(result["comments"]) == 1
        assert result["comments"][0]["author"] == "alice"
        assert result["comments"][0]["created_at"] == "2026-05-13T10:00:00Z"

    def test_invalid_url_returns_none_state(self, settings):
        result = get_issue_with_comments(settings, "not-a-url")
        assert result["state"] == "none"
        assert result["comments"] == []

    @patch("app.services.github_issues._get_github_client")
    def test_github_exception_preserves_public_reason(self, mock_get_client, settings):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_issue.side_effect = GithubException(
            403, {"message": "API rate limit exceeded"}
        )
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        with pytest.raises(GitHubAPIError) as exc_info:
            get_issue_with_comments(
                settings,
                "https://github.com/openml/openmlupload-test/issues/1",
            )

        assert exc_info.value.reason == "rate_limited"
        assert exc_info.value.retryable is True
        assert "rate limits" in exc_info.value.user_message

    @patch("app.services.github_issues._get_github_client")
    def test_network_exception_becomes_retryable_transient_error(
        self, mock_get_client, settings
    ):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_issue.side_effect = requests_exceptions.Timeout(
            "github read timed out"
        )
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        with pytest.raises(GitHubAPIError) as exc_info:
            get_issue_with_comments(
                settings,
                "https://github.com/openml/openmlupload-test/issues/1",
            )

        assert exc_info.value.reason == "transient_error"
        assert exc_info.value.retryable is True
        assert "temporarily unavailable" in exc_info.value.user_message
        assert "github read timed out" in str(exc_info.value)


class TestCreateIssueForDataset:
    def test_missing_config_marks_github_issue_failed(self, empty_settings):
        mock_dataset = MagicMock()
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=empty_settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
        )

        assert mock_dataset.status == Statuses.PENDING_REVIEW
        assert mock_dataset.dataset_metadata["github_issue"] == {
            "status": "failed",
            "error_reason": "configuration_error",
            "message": (
                "GitHub discussion could not be created because the server "
                "is missing its GitHub App configuration."
            ),
            "retryable": False,
            "attempts": 0,
        }
        mock_db.commit.assert_called_once()

    @patch("app.services.github_issues.create_issue")
    def test_persists_url(self, mock_create, settings):
        mock_create.return_value = (
            "https://github.com/openml/openmlupload-test/issues/5"
        )

        mock_dataset = MagicMock()
        mock_dataset.issue_url = ""
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
        )

        assert (
            mock_dataset.issue_url
            == "https://github.com/openml/openmlupload-test/issues/5"
        )
        assert mock_dataset.status == Statuses.PENDING_REVIEW
        assert mock_dataset.dataset_metadata["github_issue"] == {
            "status": "linked",
            "issue_url": "https://github.com/openml/openmlupload-test/issues/5",
            "error_reason": None,
            "message": "GitHub discussion linked.",
            "retryable": False,
            "attempts": 1,
        }
        assert mock_db.commit.call_count == 2

    @patch("app.services.github_issues.create_issue")
    def test_handles_api_error_gracefully(self, mock_create, settings):
        mock_create.side_effect = GitHubAPIError(
            "rate limit",
            403,
            reason="rate_limited",
            retryable=True,
            user_message=(
                "GitHub discussion creation is delayed because GitHub "
                "rate limits were reached."
            ),
        )
        mock_dataset = MagicMock()
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        # Should not raise
        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
        )
        assert mock_dataset.status == Statuses.PENDING_REVIEW
        assert mock_dataset.dataset_metadata["github_issue"] == {
            "status": "failed",
            "error_reason": "rate_limited",
            "message": (
                "GitHub discussion creation is delayed because GitHub "
                "rate limits were reached."
            ),
            "retryable": True,
            "attempts": 3,
        }
        assert mock_create.call_count == 3
        assert mock_db.commit.call_count == 2

    @patch("app.services.github_issues.create_issue")
    def test_retries_transient_failure_before_persisting_url(
        self, mock_create, settings
    ):
        mock_create.side_effect = [
            GitHubAPIError(
                "temporary unavailable",
                500,
                reason="transient_error",
                retryable=True,
                user_message=(
                    "GitHub discussion creation is temporarily unavailable. "
                    "The upload is saved and can be retried."
                ),
            ),
            "https://github.com/openml/openmlupload-test/issues/6",
        ]
        mock_dataset = MagicMock()
        mock_dataset.issue_url = ""
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
            retry_sleep=lambda _seconds: None,
        )

        assert (
            mock_dataset.issue_url
            == "https://github.com/openml/openmlupload-test/issues/6"
        )
        assert mock_dataset.dataset_metadata["github_issue"]["status"] == "linked"
        assert mock_dataset.dataset_metadata["github_issue"]["attempts"] == 2
        assert mock_create.call_count == 2

    @patch("app.services.github_issues.create_issue")
    def test_retries_known_network_error(self, mock_create, settings):
        mock_create.side_effect = requests_exceptions.ConnectionError("offline")
        mock_dataset = MagicMock()
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
            retry_sleep=lambda _seconds: None,
        )

        assert mock_dataset.dataset_metadata["github_issue"] == {
            "status": "failed",
            "error_reason": "transient_error",
            "message": (
                "GitHub discussion creation is temporarily unavailable. "
                "The upload is saved and can be retried."
            ),
            "retryable": True,
            "attempts": 3,
        }
        assert mock_create.call_count == 3

    @patch("app.services.github_issues.create_issue")
    def test_unknown_exception_is_not_retried_or_reported_as_network(
        self, mock_create, settings
    ):
        mock_create.side_effect = ValueError("bad local state")
        mock_dataset = MagicMock()
        mock_dataset.status = Statuses.PENDING_REVIEW
        mock_dataset.dataset_metadata = {}
        mock_db = MagicMock()
        mock_db.get.return_value = mock_dataset
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)
        mock_db_factory = MagicMock(return_value=mock_db)

        create_issue_for_dataset(
            dataset_id="ds-1",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
            db_factory=mock_db_factory,
            retry_sleep=lambda _seconds: None,
        )

        assert mock_dataset.dataset_metadata["github_issue"] == {
            "status": "failed",
            "error_reason": "unknown_error",
            "message": (
                "Something went wrong while creating the GitHub discussion. "
                "The upload is saved, but the discussion could not be linked."
            ),
            "retryable": False,
            "attempts": 1,
        }
        assert mock_create.call_count == 1


class TestUpdateIssue:
    @patch("app.services.github_issues._get_github_client")
    def test_success(self, mock_get_client, settings):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_issue = MagicMock()

        mock_repo.get_issue.return_value = mock_issue
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        update_issue(
            settings,
            "https://github.com/openml/openmlupload-test/issues/42",
            "ds-1",
            "Updated Title",
            {"description": "Updated desc"},
            "http://localhost:8000",
        )

        mock_repo.get_issue.assert_called_once_with(42)
        mock_issue.edit.assert_called_once()
        args, kwargs = mock_issue.edit.call_args
        assert kwargs["title"] == "[Dataset] Updated Title"
        assert "Updated desc" in kwargs["body"]

    def test_invalid_url_raises(self, settings):
        with pytest.raises(GitHubAPIError, match="Invalid GitHub issue URL format"):
            update_issue(
                settings, "not-a-url", "ds-1", "Test", {}, "http://localhost:8000"
            )

    @patch("app.services.github_issues._get_github_client")
    def test_api_error_raises(self, mock_get_client, settings):
        mock_gh = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_issue.side_effect = GithubException(404, {"message": "Not Found"})
        mock_gh.get_repo.return_value = mock_repo
        mock_get_client.return_value = mock_gh

        with pytest.raises(GitHubAPIError, match="error during update: Not Found"):
            update_issue(
                settings,
                "https://github.com/openml/openmlupload-test/issues/42",
                "ds-1",
                "Updated Title",
                {},
                "http://localhost:8000",
            )


class TestUpdateIssueForDataset:
    def test_skips_when_no_token(self, empty_settings):
        """Should not call GitHub when token is empty."""
        with patch("app.services.github_issues.update_issue") as mock_update:
            from app.services.github_issues import update_issue_for_dataset

            update_issue_for_dataset(
                dataset_id="ds-1",
                issue_url="https://github.com/openml/openmlupload-test/issues/42",
                title="Test",
                metadata={},
                settings=empty_settings,
                app_base_url="http://localhost:8000",
            )
            mock_update.assert_not_called()

    @patch("app.services.github_issues.update_issue")
    def test_calls_update_issue(self, mock_update, settings):
        from app.services.github_issues import update_issue_for_dataset

        update_issue_for_dataset(
            dataset_id="ds-1",
            issue_url="https://github.com/openml/openmlupload-test/issues/42",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
        )
        mock_update.assert_called_once()

    @patch("app.services.github_issues.update_issue")
    def test_handles_api_error_gracefully(self, mock_update, settings):
        mock_update.side_effect = GitHubAPIError("rate limit", 403)
        from app.services.github_issues import update_issue_for_dataset

        # Should not raise
        update_issue_for_dataset(
            dataset_id="ds-1",
            issue_url="https://github.com/openml/openmlupload-test/issues/42",
            title="Test",
            metadata={},
            settings=settings,
            app_base_url="http://localhost:8000",
        )
