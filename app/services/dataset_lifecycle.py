from typing import Any

from app.database.models import Roles, Statuses
from app.services.dataset_objects import (
    DatasetObjectValidationError,
    get_dataset_objects,
)

LEGACY_STATUS_MAP = {
    Statuses.CLAIMED: Statuses.PUBLISHED,
    Statuses.CONVERTED: Statuses.APPROVED,
}
GITHUB_ISSUE_METADATA_KEY = "github_issue"

ALLOWED_TRANSITIONS = {
    Statuses.PENDING_UPLOAD: {
        Statuses.UPLOADED,
        Statuses.SCANNING,
        Statuses.QUARANTINED,
        Statuses.INTEGRATION_FAILED,
    },
    Statuses.UPLOADED: {
        Statuses.SCANNING,
        Statuses.QUARANTINED,
        Statuses.INTEGRATION_FAILED,
    },
    Statuses.SCANNING: {
        Statuses.PENDING_REVIEW,
        Statuses.QUARANTINED,
        Statuses.INTEGRATION_FAILED,
    },
    Statuses.PENDING_REVIEW: {
        Statuses.SCANNING,
        Statuses.APPROVED,
        Statuses.REJECTED,
        Statuses.INTEGRATION_FAILED,
    },
    Statuses.APPROVED: {
        Statuses.SCANNING,
        Statuses.PUBLISHED,
        Statuses.REJECTED,
        Statuses.INTEGRATION_FAILED,
    },
    Statuses.INTEGRATION_FAILED: {
        Statuses.PENDING_REVIEW,
        Statuses.REJECTED,
    },
    Statuses.QUARANTINED: {Statuses.REJECTED},
    Statuses.REJECTED: {Statuses.PENDING_REVIEW},
    Statuses.PUBLISHED: {Statuses.SCANNING, Statuses.INTEGRATION_FAILED},
}

EXPERT_TRANSITION_TARGETS = {
    Statuses.PENDING_REVIEW,
    Statuses.SCANNING,
    Statuses.APPROVED,
    Statuses.REJECTED,
    Statuses.PUBLISHED,
}
DOWNLOADABLE_STATES = {
    Statuses.PENDING_REVIEW,
    Statuses.APPROVED,
    Statuses.PUBLISHED,
}


class DatasetLifecycleError(ValueError):
    """Raised when a dataset lifecycle transition is not allowed."""


class DatasetLifecyclePermissionError(PermissionError):
    """Raised when an actor cannot perform a lifecycle transition."""


def canonical_status(status: Statuses) -> Statuses:
    if status in LEGACY_STATUS_MAP:
        return LEGACY_STATUS_MAP[status]
    return status


def requested_lifecycle_state(status: Statuses) -> Statuses:
    if status == Statuses.PENDING:
        return Statuses.PENDING_REVIEW
    return canonical_status(status)


def lifecycle_state(dataset: Any) -> Statuses:
    status = canonical_status(dataset.status)
    if status != Statuses.PENDING:
        return status

    metadata = dict(dataset.dataset_metadata or {})
    objects = _safe_dataset_objects(metadata)
    if objects:
        scan_states = {str(obj.get("scan_state")) for obj in objects}
        download_states = {str(obj.get("download_state")) for obj in objects}
        upload_states = {str(obj.get("upload_state")) for obj in objects}

        if (
            scan_states <= {"clean"}
            and download_states <= {"downloadable"}
            and upload_states <= {"promoted"}
        ):
            return Statuses.PENDING_REVIEW
        if scan_states & {"infected", "error", "missing"}:
            return Statuses.QUARANTINED
        if upload_states & {"uploaded", "promoted"}:
            return Statuses.SCANNING
        return Statuses.PENDING_UPLOAD

    scan_files = (metadata.get("malware_scan") or {}).get("files") or []
    if scan_files:
        scan_statuses = {str(result.get("status")) for result in scan_files}
        if scan_statuses <= {"clean"}:
            return Statuses.PENDING_REVIEW
        return Statuses.QUARANTINED

    return Statuses.PENDING_UPLOAD


def lifecycle_summary(dataset: Any) -> dict[str, Any]:
    state = lifecycle_state(dataset)
    metadata = dict(dataset.dataset_metadata or {})
    objects = _safe_dataset_objects(metadata)
    clean_downloadable = bool(objects) and all(
        obj.get("upload_state") == "promoted"
        and obj.get("scan_state") == "clean"
        and obj.get("download_state") == "downloadable"
        and obj.get("final_object_key")
        for obj in objects
    )
    download_available = clean_downloadable and state in DOWNLOADABLE_STATES
    review_only_download = download_available and state == Statuses.PENDING_REVIEW
    final_approved_download = download_available and state in {
        Statuses.APPROVED,
        Statuses.PUBLISHED,
    }
    issue_url = getattr(dataset, "issue_url", "") or ""

    return {
        "state": state.value,
        "review": {
            "ready": state == Statuses.PENDING_REVIEW,
            "approved": state in {Statuses.APPROVED, Statuses.PUBLISHED},
            "rejected": state == Statuses.REJECTED,
            "published": state == Statuses.PUBLISHED,
        },
        "upload": {
            "uploaded": state
            in {
                Statuses.UPLOADED,
                Statuses.SCANNING,
                Statuses.PENDING_REVIEW,
                Statuses.APPROVED,
                Statuses.REJECTED,
                Statuses.PUBLISHED,
                Statuses.QUARANTINED,
                Statuses.INTEGRATION_FAILED,
            },
            "scanning": state == Statuses.SCANNING,
            "quarantined": state == Statuses.QUARANTINED,
        },
        "download": {
            "available": download_available,
            "review_only": review_only_download,
            "final_approved": final_approved_download,
            "message": _download_message(
                available=download_available,
                review_only=review_only_download,
                final_approved=final_approved_download,
            ),
        },
        "github": _github_summary(
            state=state,
            issue_url=issue_url,
            metadata=metadata,
        ),
    }


def _download_message(
    *,
    available: bool,
    review_only: bool,
    final_approved: bool,
) -> str:
    if not available:
        return "Dataset files are not ready for download."
    if review_only:
        return "Download is available for review; expert approval is pending."
    if final_approved:
        return "Download is available from the expert-approved dataset."
    return "Download is available."


def assert_lifecycle_transition_allowed(
    dataset: Any,
    next_status: Statuses,
    *,
    actor_role: Roles | None,
    system: bool = False,
) -> None:
    current_state = lifecycle_state(dataset)
    next_state = requested_lifecycle_state(next_status)

    if current_state == next_state:
        return

    if current_state == Statuses.QUARANTINED and next_state != Statuses.REJECTED:
        raise DatasetLifecycleError("Quarantined datasets can only be rejected")

    if not system and next_state in EXPERT_TRANSITION_TARGETS:
        if actor_role != Roles.EXPERT:
            raise DatasetLifecyclePermissionError(
                "Only experts can change dataset status"
            )

    if next_state not in ALLOWED_TRANSITIONS.get(current_state, set()):
        raise DatasetLifecycleError(
            f"Invalid dataset lifecycle transition: "
            f"{current_state.value} -> {next_state.value}"
        )


def _github_state(*, state: Statuses, issue_url: str) -> str:
    if state == Statuses.INTEGRATION_FAILED:
        return "failed"
    if issue_url:
        return "linked"
    if state in {
        Statuses.PENDING_REVIEW,
        Statuses.APPROVED,
        Statuses.REJECTED,
        Statuses.PUBLISHED,
    }:
        return "pending"
    return "not_ready"


def _github_summary(
    *,
    state: Statuses,
    issue_url: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    github_issue = metadata.get(GITHUB_ISSUE_METADATA_KEY)
    if isinstance(github_issue, dict):
        metadata_status = github_issue.get("status")
        metadata_issue_url = str(github_issue.get("issue_url") or "")
        summary_state = (
            str(metadata_status)
            if metadata_status in {"pending", "failed", "linked"}
            else _github_state(state=state, issue_url=issue_url)
        )
        return {
            "state": summary_state,
            "issue_url": issue_url or metadata_issue_url,
            "error_reason": github_issue.get("error_reason"),
            "message": github_issue.get("message")
            or _default_github_message(summary_state),
            "retryable": bool(github_issue.get("retryable", False)),
            "attempts": _safe_attempts(github_issue.get("attempts")),
        }

    summary_state = _github_state(state=state, issue_url=issue_url)
    return {
        "state": summary_state,
        "issue_url": issue_url,
        "error_reason": None,
        "message": _default_github_message(summary_state),
        "retryable": False,
        "attempts": 0,
    }


def _safe_attempts(value: Any) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def _default_github_message(state: str) -> str:
    messages = {
        "linked": "GitHub discussion linked.",
        "pending": "GitHub discussion creation is pending.",
        "failed": "GitHub discussion could not be created.",
        "not_ready": "GitHub discussion will be created after upload review is ready.",
        "none": "GitHub discussion is not available.",
    }
    return messages.get(state, "GitHub discussion status is unknown.")


def _safe_dataset_objects(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        return get_dataset_objects(metadata)
    except DatasetObjectValidationError:
        return []
