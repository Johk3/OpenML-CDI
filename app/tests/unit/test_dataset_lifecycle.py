import uuid
from datetime import datetime, timezone

import pytest

from app.database.models import Dataset, Roles, Statuses
from app.services.dataset_lifecycle import (
    DatasetLifecycleError,
    DatasetLifecyclePermissionError,
    assert_lifecycle_transition_allowed,
    lifecycle_state,
    lifecycle_summary,
)


def _dataset(
    *,
    status: Statuses,
    metadata: dict | None = None,
    issue_url: str = "",
) -> Dataset:
    return Dataset(
        id=uuid.uuid4(),
        title="Lifecycle dataset",
        owner_id=uuid.uuid4(),
        dataset_metadata=metadata or {},
        status=status,
        issue_url=issue_url,
        created_at=datetime.now(timezone.utc),
    )


def test_legacy_pending_clean_dataset_maps_to_pending_review():
    dataset = _dataset(
        status=Statuses.PENDING,
        metadata={
            "objects": [
                {
                    "backend": "s3",
                    "provider": "s3",
                    "bucket": "datasets",
                    "object_key": "quarantine/batch/clean.csv",
                    "quarantine_key": "quarantine/batch/clean.csv",
                    "final_object_key": "ready/dataset/clean.csv",
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 11,
                    "checksum": None,
                    "etag": "etag",
                    "upload_state": "promoted",
                    "scan_state": "clean",
                    "download_state": "downloadable",
                }
            ]
        },
    )

    assert lifecycle_state(dataset) == Statuses.PENDING_REVIEW


def test_pending_clean_dataset_without_promotion_stays_in_scanning_state():
    dataset = _dataset(
        status=Statuses.PENDING,
        metadata={
            "objects": [
                {
                    "backend": "s3",
                    "provider": "s3",
                    "bucket": "datasets",
                    "object_key": "quarantine/batch/clean.csv",
                    "quarantine_key": "quarantine/batch/clean.csv",
                    "final_object_key": "ready/dataset/clean.csv",
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 11,
                    "checksum": None,
                    "etag": "etag",
                    "upload_state": "uploaded",
                    "scan_state": "clean",
                    "download_state": "downloadable",
                }
            ]
        },
    )

    assert lifecycle_state(dataset) == Statuses.SCANNING


def test_lifecycle_summary_marks_pending_review_download_as_review_only():
    dataset = _dataset(
        status=Statuses.PENDING_REVIEW,
        metadata={
            "objects": [
                {
                    "backend": "s3",
                    "provider": "s3",
                    "bucket": "datasets",
                    "object_key": "quarantine/batch/clean.csv",
                    "quarantine_key": "quarantine/batch/clean.csv",
                    "final_object_key": "ready/dataset/clean.csv",
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 11,
                    "checksum": None,
                    "etag": "etag",
                    "upload_state": "promoted",
                    "scan_state": "clean",
                    "download_state": "downloadable",
                }
            ]
        },
    )

    summary = lifecycle_summary(dataset)

    assert summary["download"] == {
        "available": True,
        "review_only": True,
        "final_approved": False,
        "message": "Download is available for review; expert approval is pending.",
    }


def test_lifecycle_summary_blocks_rejected_clean_download_signal():
    dataset = _dataset(
        status=Statuses.REJECTED,
        metadata={
            "objects": [
                {
                    "backend": "s3",
                    "provider": "s3",
                    "bucket": "datasets",
                    "object_key": "quarantine/batch/clean.csv",
                    "quarantine_key": "quarantine/batch/clean.csv",
                    "final_object_key": "ready/dataset/clean.csv",
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 11,
                    "checksum": None,
                    "etag": "etag",
                    "upload_state": "promoted",
                    "scan_state": "clean",
                    "download_state": "downloadable",
                }
            ]
        },
    )

    summary = lifecycle_summary(dataset)

    assert summary["download"] == {
        "available": False,
        "review_only": False,
        "final_approved": False,
        "message": "Dataset files are not ready for download.",
    }


def test_lifecycle_summary_requires_promoted_object_for_download_signal():
    dataset = _dataset(
        status=Statuses.PENDING_REVIEW,
        metadata={
            "objects": [
                {
                    "backend": "s3",
                    "provider": "s3",
                    "bucket": "datasets",
                    "object_key": "quarantine/batch/clean.csv",
                    "quarantine_key": "quarantine/batch/clean.csv",
                    "final_object_key": "ready/dataset/clean.csv",
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 11,
                    "checksum": None,
                    "etag": "etag",
                    "upload_state": "uploaded",
                    "scan_state": "clean",
                    "download_state": "downloadable",
                }
            ]
        },
    )

    summary = lifecycle_summary(dataset)

    assert summary["download"] == {
        "available": False,
        "review_only": False,
        "final_approved": False,
        "message": "Dataset files are not ready for download.",
    }


def test_system_can_move_pending_upload_to_scanning():
    dataset = _dataset(status=Statuses.PENDING_UPLOAD)

    assert_lifecycle_transition_allowed(
        dataset,
        Statuses.SCANNING,
        actor_role=None,
        system=True,
    )


def test_user_cannot_approve_pending_review_dataset():
    dataset = _dataset(status=Statuses.PENDING_REVIEW)

    with pytest.raises(DatasetLifecyclePermissionError, match="Only experts"):
        assert_lifecycle_transition_allowed(
            dataset,
            Statuses.APPROVED,
            actor_role=Roles.USER,
            system=False,
        )


def test_expert_can_approve_pending_review_dataset():
    dataset = _dataset(status=Statuses.PENDING_REVIEW)

    assert_lifecycle_transition_allowed(
        dataset,
        Statuses.APPROVED,
        actor_role=Roles.EXPERT,
        system=False,
    )


def test_expert_can_mark_reviewed_dataset_as_processing_error():
    for current_status in (
        Statuses.PENDING_REVIEW,
        Statuses.APPROVED,
        Statuses.PUBLISHED,
    ):
        dataset = _dataset(status=current_status)

        assert_lifecycle_transition_allowed(
            dataset,
            Statuses.INTEGRATION_FAILED,
            actor_role=Roles.EXPERT,
            system=False,
        )


def test_expert_can_mark_reviewed_dataset_as_ongoing_processing():
    for current_status in (
        Statuses.PENDING_REVIEW,
        Statuses.APPROVED,
        Statuses.PUBLISHED,
    ):
        dataset = _dataset(status=current_status)

        assert_lifecycle_transition_allowed(
            dataset,
            Statuses.SCANNING,
            actor_role=Roles.EXPERT,
            system=False,
        )


def test_rejects_invalid_transition_with_clear_error():
    dataset = _dataset(status=Statuses.PENDING_UPLOAD)

    with pytest.raises(DatasetLifecycleError, match="pending_upload -> published"):
        assert_lifecycle_transition_allowed(
            dataset,
            Statuses.PUBLISHED,
            actor_role=Roles.EXPERT,
            system=False,
        )


def test_lifecycle_summary_exposes_github_integration_failure():
    dataset = _dataset(status=Statuses.INTEGRATION_FAILED)

    summary = lifecycle_summary(dataset)

    assert summary["state"] == "integration_failed"
    assert summary["github"]["state"] == "failed"


def test_lifecycle_summary_exposes_github_issue_pending_metadata():
    dataset = _dataset(
        status=Statuses.PENDING_REVIEW,
        metadata={
            "github_issue": {
                "status": "pending",
                "message": "GitHub discussion creation is pending.",
                "retryable": False,
                "attempts": 0,
            }
        },
    )

    summary = lifecycle_summary(dataset)

    assert summary["state"] == "pending_review"
    assert summary["github"] == {
        "state": "pending",
        "issue_url": "",
        "error_reason": None,
        "message": "GitHub discussion creation is pending.",
        "retryable": False,
        "attempts": 0,
    }


def test_lifecycle_summary_exposes_github_issue_failure_metadata():
    dataset = _dataset(
        status=Statuses.PENDING_REVIEW,
        metadata={
            "github_issue": {
                "status": "failed",
                "error_reason": "permission_error",
                "message": (
                    "GitHub discussion could not be created because the "
                    "GitHub App does not have permission to create issues "
                    "in the configured repository."
                ),
                "retryable": False,
                "attempts": 1,
            }
        },
    )

    summary = lifecycle_summary(dataset)

    assert summary["state"] == "pending_review"
    assert summary["github"]["state"] == "failed"
    assert summary["github"]["error_reason"] == "permission_error"
    assert summary["github"]["retryable"] is False
    assert "permission" in summary["github"]["message"]
