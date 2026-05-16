# service for creating and reading GitHub issues linked to datasets.

import logging
import time
from typing import Any, Callable

from sqlalchemy.orm import Session
from github import Github, Auth, GithubException, GithubIntegration
from requests import exceptions as requests_exceptions

from app.config import GitHubIssuesSettings
from app.database.models import Dataset, Statuses
from app.services.dataset_lifecycle import lifecycle_state

logger = logging.getLogger(__name__)
GITHUB_ISSUE_METADATA_KEY = "github_issue"
GITHUB_ISSUE_MAX_ATTEMPTS = 3
GITHUB_ISSUE_RETRY_BASE_SECONDS = 0.5

CONFIGURATION_ERROR = "configuration_error"
AUTHENTICATION_ERROR = "authentication_error"
PERMISSION_ERROR = "permission_error"
RATE_LIMITED = "rate_limited"
TRANSIENT_ERROR = "transient_error"
VALIDATION_ERROR = "validation_error"
NOT_FOUND_ERROR = "not_found"
UNKNOWN_ERROR = "unknown_error"

USER_MESSAGES = {
    CONFIGURATION_ERROR: (
        "GitHub discussion could not be created because the server is "
        "missing its GitHub App configuration."
    ),
    AUTHENTICATION_ERROR: (
        "GitHub discussion could not be created because the GitHub App "
        "could not authenticate."
    ),
    PERMISSION_ERROR: (
        "GitHub discussion could not be created because the GitHub App "
        "does not have permission to create issues in the configured repository."
    ),
    RATE_LIMITED: (
        "GitHub discussion creation is delayed because GitHub rate limits "
        "were reached."
    ),
    TRANSIENT_ERROR: (
        "GitHub discussion creation is temporarily unavailable. The upload "
        "is saved and can be retried."
    ),
    VALIDATION_ERROR: (
        "GitHub discussion could not be created because GitHub rejected the "
        "issue request."
    ),
    NOT_FOUND_ERROR: (
        "GitHub discussion could not be created because the configured "
        "repository was not found."
    ),
    UNKNOWN_ERROR: (
        "Something went wrong while creating the GitHub discussion. The upload "
        "is saved, but the discussion could not be linked."
    ),
}
NETWORK_EXCEPTIONS = (requests_exceptions.RequestException, TimeoutError)

PRIVATE_METADATA_FIELDS = {
    "name",
    "description",
    "filenames",
    "filename",
    "file_objects",
    "text",
    "contact",
    "malware_scan",
    "storage_key",
    "storage_keys",
    "objects",
    "directory_structure",
    "content_types",
    "byte_sizes",
    "checksums",
    "storage_schema_version",
}


class GitHubAPIError(RuntimeError):
    """Raised when the GitHub API returns an error response."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        *,
        reason: str = UNKNOWN_ERROR,
        retryable: bool = False,
        user_message: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.reason = reason
        self.retryable = retryable
        self.user_message = user_message or USER_MESSAGES.get(
            reason, USER_MESSAGES[UNKNOWN_ERROR]
        )


def get_installation_token(settings: GitHubIssuesSettings) -> str:
    """Acquire a GitHub App installation access token."""
    if not settings.app_id or not settings.install_id or not settings.private_key:
        raise GitHubAPIError(
            "GitHub App credentials are not fully configured",
            reason=CONFIGURATION_ERROR,
            retryable=False,
        )

    auth = Auth.AppAuth(settings.app_id, settings.private_key)
    integration = GithubIntegration(auth=auth)

    try:
        access = integration.get_access_token(settings.install_id)
        return access.token
    except GithubException as e:
        raise _github_api_error_from_exception(e)


def _get_github_client(settings: GitHubIssuesSettings) -> Github:
    """Initialize a PyGithub client using GitHub App authentication."""
    token = get_installation_token(settings)
    return Github(auth=Auth.Token(token))


def _github_exception_message(error: GithubException) -> str:
    if hasattr(error, "data") and isinstance(error.data, dict):
        return str(error.data.get("message", str(error)))
    return str(error)


def _is_rate_limit_error(status: int | None, message: str) -> bool:
    message_lower = message.lower()
    return status == 429 or (
        status == 403
        and ("rate limit" in message_lower or "rate-limit" in message_lower)
    )


def _github_api_error_from_exception(error: GithubException) -> GitHubAPIError:
    status = error.status
    message = _github_exception_message(error)

    if status == 401:
        return GitHubAPIError(
            "GitHub token is invalid or expired",
            status,
            reason=AUTHENTICATION_ERROR,
            retryable=False,
        )
    if _is_rate_limit_error(status, message):
        return GitHubAPIError(
            "GitHub API rate limit exceeded",
            status,
            reason=RATE_LIMITED,
            retryable=True,
        )
    if status == 403:
        return GitHubAPIError(
            "GitHub permission denied",
            status,
            reason=PERMISSION_ERROR,
            retryable=False,
        )
    if status == 404:
        return GitHubAPIError(
            "GitHub repository not found",
            status,
            reason=NOT_FOUND_ERROR,
            retryable=False,
        )
    if status == 422:
        return GitHubAPIError(
            f"GitHub rejected the request: {message}",
            status,
            reason=VALIDATION_ERROR,
            retryable=False,
        )
    if status is not None and status >= 500:
        return GitHubAPIError(
            f"GitHub API temporary failure: {message}",
            status,
            reason=TRANSIENT_ERROR,
            retryable=True,
        )
    return GitHubAPIError(
        f"GitHub API returned {status}: {message}",
        status,
        reason=UNKNOWN_ERROR,
        retryable=True,
    )


def _build_issue_body(
    dataset_id: str,
    title: str,
    metadata: dict[str, Any],
    app_base_url: str,
) -> str:
    """Build a Markdown issue body with dataset metadata."""
    dataset_url = f"{app_base_url.rstrip('/')}/datasets/{dataset_id}"

    user_message = metadata.get("text", "")
    if not isinstance(user_message, str):
        user_message = ""

    croissant_desc = metadata.get("description", "")
    if not isinstance(croissant_desc, str):
        croissant_desc = str(croissant_desc) if croissant_desc else ""

    filenames = metadata.get("filenames", [])
    file_count = len(filenames) if isinstance(filenames, list) else 0

    import json

    # remove large/duplicate fields from the display dict
    display_metadata = {
        k: v for k, v in metadata.items() if k not in PRIVATE_METADATA_FIELDS
    }

    lines = [
        f"## Dataset: {title}",
        "",
        f"**Dataset page:** {dataset_url}",
        f"**Dataset ID:** `{dataset_id}`",
        f"**Files:** {file_count}",
        "",
    ]

    if user_message:
        lines += [
            "### Uploader Message",
            "",
            user_message,
            "",
        ]

    if croissant_desc:
        lines += [
            "### Dataset Description",
            "",
            croissant_desc,
            "",
        ]

    if display_metadata:
        lines += [
            "### Croissant Metadata",
            "",
            "```json",
            json.dumps(display_metadata, indent=2),
            "```",
            "",
        ]

    lines += [
        "---",
        "",
        "*This issue was automatically created by the OpenML CDI. "
        "Use this thread to discuss the dataset with the uploader and experts.",
        "If the uploader modifies the metadata, this issue will be updated to "
        "reflect the changes.*",
    ]

    return "\n".join(lines)


def create_issue(
    settings: GitHubIssuesSettings,
    dataset_id: str,
    title: str,
    metadata: dict[str, Any],
    app_base_url: str,
) -> str:
    """Create a GitHub issue and return its ``html_url``.

    Raises ``GitHubAPIError`` on failure.
    """
    try:
        gh = _get_github_client(settings)
        repo = gh.get_repo(f"{settings.owner}/{settings.repo}")

        body = _build_issue_body(dataset_id, title, metadata, app_base_url)
        issue_title = f"[Dataset] {title}"

        issue = repo.create_issue(
            title=issue_title, body=body, labels=["dataset-upload"]
        )
        return issue.html_url
    except GithubException as e:
        raise _github_api_error_from_exception(e)


def update_issue(
    settings: GitHubIssuesSettings,
    issue_url: str,
    dataset_id: str,
    title: str,
    metadata: dict[str, Any],
    app_base_url: str,
) -> None:
    """Update a GitHub issue body with the latest dataset metadata.

    Raises ``GitHubAPIError`` on failure.
    """
    parsed = _parse_owner_repo_number(issue_url)
    if not parsed:
        raise GitHubAPIError("Invalid GitHub issue URL format")

    owner, repo_name, number = parsed

    try:
        gh = _get_github_client(settings)
        repo = gh.get_repo(f"{owner}/{repo_name}")
        issue = repo.get_issue(number)

        body = _build_issue_body(dataset_id, title, metadata, app_base_url)
        issue_title = f"[Dataset] {title}"

        issue.edit(title=issue_title, body=body)
    except GithubException as e:
        error = _github_api_error_from_exception(e)
        raise GitHubAPIError(
            f"GitHub API error during update: {_github_exception_message(e)}",
            error.status_code,
            reason=error.reason,
            retryable=error.retryable,
            user_message=error.user_message,
        )


def _parse_owner_repo_number(issue_url: str) -> tuple[str, str, int] | None:
    """Extract (owner, repo, number) from a GitHub issue URL."""
    import re

    match = re.match(r"https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)", issue_url)
    if not match:
        return None
    return match.group(1), match.group(2), int(match.group(3))


def get_issue_with_comments(
    settings: GitHubIssuesSettings,
    issue_url: str,
) -> dict[str, Any]:
    """Fetch the issue state and all comments."""
    parsed = _parse_owner_repo_number(issue_url)
    if parsed is None:
        return {"state": "none", "html_url": "", "comments": []}

    owner, repo_name, number = parsed

    try:
        gh = _get_github_client(settings)
        repo = gh.get_repo(f"{owner}/{repo_name}")
        issue = repo.get_issue(number)

        comments = []
        for c in issue.get_comments():
            created_at_str = ""
            if c.created_at:
                created_at_str = c.created_at.isoformat()
                # PyGithub might return aware or naive datetime
                if not created_at_str.endswith("Z") and "+" not in created_at_str:
                    created_at_str += "Z"
                # If it has an offset like +00:00, standard JS date string parses
                # it correctly, but adding Z to it breaks it.
                # So we don't blindly add "Z".

            comments.append(
                {
                    "id": c.id,
                    "author": c.user.login if c.user else "unknown",
                    "avatar_url": c.user.avatar_url if c.user else "",
                    "body": c.body or "",
                    "created_at": created_at_str,
                    "author_association": c.author_association or "",
                }
            )

        return {
            "state": issue.state or "unknown",
            "html_url": issue.html_url or issue_url,
            "title": issue.title or "",
            "comments": comments,
        }
    except GithubException as e:
        status = e.status
        msg = (
            e.data.get("message", str(e))
            if hasattr(e, "data") and isinstance(e.data, dict)
            else str(e)
        )
        raise GitHubAPIError(f"GitHub API returned {status}: {msg}", status)


def create_issue_for_dataset(
    *,
    dataset_id: Any,
    title: str,
    metadata: dict[str, Any],
    settings: GitHubIssuesSettings,
    app_base_url: str,
    db_factory: Callable[[], Session],
    max_attempts: int = GITHUB_ISSUE_MAX_ATTEMPTS,
    retry_sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Background task: create a GitHub issue and persist the URL on the dataset."""
    with db_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        if dataset is None:
            logger.warning("Dataset %s not found before creating issue", dataset_id)
            return
        if lifecycle_state(dataset) != Statuses.PENDING_REVIEW:
            logger.info(
                "GitHub issue creation skipped for dataset %s in lifecycle state %s",
                dataset_id,
                lifecycle_state(dataset).value,
            )
            return

    if not settings.app_id or not settings.install_id or not settings.private_key:
        logger.info(
            "GitHub issue creation skipped, GitHub App credentials not fully configured"
        )
        _persist_dataset_github_issue_state(
            dataset_id=dataset_id,
            db_factory=db_factory,
            state=_github_issue_failure_state(
                reason=CONFIGURATION_ERROR,
                retryable=False,
                attempts=0,
            ),
        )
        return

    _persist_dataset_github_issue_state(
        dataset_id=dataset_id,
        db_factory=db_factory,
        state={
            "status": "pending",
            "error_reason": None,
            "message": "GitHub discussion creation is pending.",
            "retryable": False,
            "attempts": 0,
        },
    )

    attempts = max(1, max_attempts)
    last_error: GitHubAPIError | None = None
    for attempt in range(1, attempts + 1):
        try:
            html_url = create_issue(
                settings=settings,
                dataset_id=str(dataset_id),
                title=title,
                metadata=metadata,
                app_base_url=app_base_url,
            )
        except GitHubAPIError as error:
            last_error = error
            logger.warning(
                "Failed to create GitHub issue for dataset %s: %s",
                dataset_id,
                error,
            )
        except NETWORK_EXCEPTIONS as error:
            last_error = GitHubAPIError(
                f"Network error creating GitHub issue: {error}",
                reason=TRANSIENT_ERROR,
                retryable=True,
            )
            logger.warning(
                "Network error creating GitHub issue for dataset %s: %s",
                dataset_id,
                error,
            )
        except Exception as error:
            last_error = GitHubAPIError(
                f"Unexpected error creating GitHub issue: {error}",
                reason=UNKNOWN_ERROR,
                retryable=False,
            )
            logger.exception(
                "Unexpected error creating GitHub issue for dataset %s",
                dataset_id,
            )
        else:
            _persist_dataset_github_issue_state(
                dataset_id=dataset_id,
                db_factory=db_factory,
                state={
                    "status": "linked",
                    "issue_url": html_url,
                    "error_reason": None,
                    "message": "GitHub discussion linked.",
                    "retryable": False,
                    "attempts": attempt,
                },
                issue_url=html_url,
            )
            logger.info("GitHub issue created for dataset %s: %s", dataset_id, html_url)
            return

        if not last_error.retryable or attempt == attempts:
            break

        retry_sleep(_retry_delay_seconds(attempt))

    if last_error is None:
        last_error = GitHubAPIError(
            "GitHub issue creation failed",
            reason=UNKNOWN_ERROR,
            retryable=True,
        )

    _persist_dataset_github_issue_state(
        dataset_id=dataset_id,
        db_factory=db_factory,
        state=_github_issue_failure_state(
            reason=last_error.reason,
            retryable=last_error.retryable,
            attempts=attempt,
            message=last_error.user_message,
        ),
    )


def _retry_delay_seconds(attempt: int) -> float:
    return GITHUB_ISSUE_RETRY_BASE_SECONDS * (2 ** (attempt - 1))


def _github_issue_failure_state(
    *,
    reason: str,
    retryable: bool,
    attempts: int,
    message: str | None = None,
) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_reason": reason,
        "message": message or USER_MESSAGES.get(reason, USER_MESSAGES[UNKNOWN_ERROR]),
        "retryable": retryable,
        "attempts": attempts,
    }


def _persist_dataset_github_issue_state(
    *,
    dataset_id: Any,
    db_factory: Callable[[], Session],
    state: dict[str, Any],
    issue_url: str | None = None,
) -> None:
    with db_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        if dataset is None:
            logger.warning(
                "Dataset %s not found when persisting GitHub state", dataset_id
            )
            return
        dataset_metadata = dict(dataset.dataset_metadata or {})
        dataset_metadata[GITHUB_ISSUE_METADATA_KEY] = state
        dataset.dataset_metadata = dataset_metadata
        if issue_url is not None:
            dataset.issue_url = issue_url
        db.commit()


def update_issue_for_dataset(
    *,
    dataset_id: Any,
    issue_url: str,
    title: str,
    metadata: dict[str, Any],
    settings: GitHubIssuesSettings,
    app_base_url: str,
) -> None:
    """Background task: update the existing GitHub issue with new metadata."""
    if not settings.app_id or not settings.install_id or not settings.private_key:
        logger.info(
            "GitHub issue update skipped, GitHub App credentials not fully configured"
        )
        return

    try:
        update_issue(
            settings=settings,
            issue_url=issue_url,
            dataset_id=str(dataset_id),
            title=title,
            metadata=metadata,
            app_base_url=app_base_url,
        )
        logger.info("GitHub issue updated for dataset %s: %s", dataset_id, issue_url)
    except GitHubAPIError:
        logger.exception("Failed to update GitHub issue for dataset %s", dataset_id)
    except Exception:
        logger.exception(
            "Network error updating GitHub issue for dataset %s", dataset_id
        )
