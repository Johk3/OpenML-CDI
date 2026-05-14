# service for creating and reading GitHub issues linked to datasets.

import logging
from typing import Any, Callable

from sqlalchemy.orm import Session
from github import Github, Auth, GithubException, GithubIntegration

from app.config import GitHubIssuesSettings
from app.database.models import Dataset

logger = logging.getLogger(__name__)

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

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _get_github_client(settings: GitHubIssuesSettings) -> Github:
    """Initialize a PyGithub client using GitHub App authentication."""
    if not settings.app_id or not settings.install_id or not settings.private_key:
        raise GitHubAPIError("GitHub App credentials are not fully configured")

    auth = Auth.AppAuth(settings.app_id, settings.private_key)
    integration = GithubIntegration(auth=auth)

    try:
        # Get access token for the specific installation
        access = integration.get_access_token(settings.install_id)
        # We must use token authentication since creating issues as an App requires
        # an installation token.
        return Github(auth=Auth.Token(access.token))
    except GithubException as e:
        raise GitHubAPIError(
            f"Failed to authenticate as GitHub App: {e.data.get('message', str(e))}",
            e.status,
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
        status = e.status
        msg = (
            e.data.get("message", str(e))
            if hasattr(e, "data") and isinstance(e.data, dict)
            else str(e)
        )
        if status == 401:
            raise GitHubAPIError("GitHub token is invalid or expired", status)
        if status == 403:
            raise GitHubAPIError(
                "GitHub API rate limit exceeded or permission denied", status
            )
        if status == 404:
            raise GitHubAPIError("GitHub repository not found", status)
        if status == 422:
            raise GitHubAPIError(f"GitHub rejected the request: {msg}", status)
        if status == 429:
            raise GitHubAPIError("GitHub API rate limit exceeded", status)
        raise GitHubAPIError(f"GitHub API returned {status}: {msg}", status)


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
        status = e.status
        msg = (
            e.data.get("message", str(e))
            if hasattr(e, "data") and isinstance(e.data, dict)
            else str(e)
        )
        if status in (401, 403, 404, 422, 429):
            raise GitHubAPIError(f"GitHub API error during update: {msg}", status)
        raise GitHubAPIError(f"GitHub API returned {status}: {msg}", status)


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
) -> None:
    """Background task: create a GitHub issue and persist the URL on the dataset."""
    if not settings.app_id or not settings.install_id or not settings.private_key:
        logger.info(
            "GitHub issue creation skipped, GitHub App credentials not fully configured"
        )
        return

    try:
        html_url = create_issue(
            settings=settings,
            dataset_id=str(dataset_id),
            title=title,
            metadata=metadata,
            app_base_url=app_base_url,
        )
    except GitHubAPIError:
        logger.exception("Failed to create GitHub issue for dataset %s", dataset_id)
        return
    except Exception:
        logger.exception(
            "Network error creating GitHub issue for dataset %s", dataset_id
        )
        return

    with db_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        if dataset is None:
            logger.warning("Dataset %s not found when persisting issue URL", dataset_id)
            return
        dataset.issue_url = html_url
        db.commit()

    logger.info("GitHub issue created for dataset %s: %s", dataset_id, html_url)


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
