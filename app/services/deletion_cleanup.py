from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from app.config import GitHubIssuesSettings
from app.database.models import (
    Dataset,
    RefreshToken,
    Roles,
    Statuses,
    TokenFamilyName,
    User,
)
from app.services.dataset_lifecycle import lifecycle_state
from app.services.dataset_objects import (
    DatasetObjectValidationError,
    get_dataset_objects,
)
from app.services.github_issues import update_issue_for_dataset

DELETION_REQUEST_KEY = "deletion_request"
ACCOUNT_DELETION_KEY = "account_deletion"
DELETION_CLEANUP_KEY = "deletion_cleanup"
PROTECTED_DATASET_STATES = {Statuses.APPROVED, Statuses.PUBLISHED}
ACTIVE_MULTIPART_UPLOAD_STATUSES = {"active"}
USER_METADATA_KEYS = {
    "author_email",
    "contact",
    "created_by",
    "email",
    "github_id",
    "github_username",
    "owner",
    "owner_id",
    "text",
    "uploaded_by",
    "uploader",
    "user",
    "user_id",
}


@dataclass(frozen=True)
class GitHubIssueUpdate:
    dataset_id: uuid.UUID
    issue_url: str
    title: str
    metadata: dict[str, Any]


@dataclass
class AccountDeletionResult:
    datasets_preserved: int = 0
    datasets_deleted: int = 0
    dataset_deletion_requests: int = 0
    github_updates: list[GitHubIssueUpdate] = field(default_factory=list)


@dataclass
class DatasetDeletionResult:
    action: str
    github_updates: list[GitHubIssueUpdate] = field(default_factory=list)


def delete_user_account(
    *,
    db: Session,
    user_id: uuid.UUID,
    storage: Any,
    delete_owned_datasets: bool,
) -> AccountDeletionResult:
    db_user = db.get(User, user_id)
    if db_user is None:
        raise ValueError("User not found")

    result = AccountDeletionResult()
    deleted_at = _utcnow()
    datasets = list(db.query(Dataset).filter(Dataset.owner_id == user_id).all())

    for dataset in datasets:
        if delete_owned_datasets and not dataset_requires_expert_deletion(dataset):
            update = _delete_dataset_record(
                db=db,
                dataset=dataset,
                storage=storage,
                deleted_at=deleted_at,
                reason="account_deleted",
            )
            if update:
                result.github_updates.append(update)
            result.datasets_deleted += 1
            continue

        metadata = scrub_user_metadata(dataset.dataset_metadata or {})
        metadata[ACCOUNT_DELETION_KEY] = {
            "owner_removed_at": deleted_at.isoformat(),
            "mode": (
                "account_and_datasets" if delete_owned_datasets else "account_only"
            ),
        }
        if delete_owned_datasets:
            metadata = _with_deletion_request(
                metadata,
                requested_at=deleted_at,
                reason="account_deleted",
            )
            result.dataset_deletion_requests += 1
        else:
            result.datasets_preserved += 1
        dataset.dataset_metadata = metadata
        dataset.owner_id = None
        update = _github_issue_update(dataset, metadata)
        if update:
            result.github_updates.append(update)

    _delete_refresh_token_family_names(db, user_id)
    db.delete(db_user)
    db.commit()
    return result


def delete_dataset_for_actor(
    *,
    db: Session,
    dataset: Dataset,
    storage: Any,
    actor_role: Roles,
) -> DatasetDeletionResult:
    requested_at = _utcnow()
    if actor_role != Roles.EXPERT and dataset_requires_expert_deletion(dataset):
        metadata = dict(dataset.dataset_metadata or {})
        metadata = _with_deletion_request(
            metadata,
            requested_at=requested_at,
            reason="dataset_owner_requested",
        )
        dataset.dataset_metadata = metadata
        db.commit()
        update = _github_issue_update(dataset, metadata)
        return DatasetDeletionResult(
            action="requested",
            github_updates=[update] if update else [],
        )

    update = _delete_dataset_record(
        db=db,
        dataset=dataset,
        storage=storage,
        deleted_at=requested_at,
        reason="dataset_deleted",
    )
    db.commit()
    return DatasetDeletionResult(
        action="deleted",
        github_updates=[update] if update else [],
    )


def dataset_requires_expert_deletion(dataset: Dataset) -> bool:
    return lifecycle_state(dataset) in PROTECTED_DATASET_STATES


def scrub_user_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    return _scrub_metadata_value(metadata)


def dataset_storage_keys(metadata: dict[str, Any]) -> list[str]:
    keys: list[str] = []

    def add(value: Any) -> None:
        if value:
            key = str(value)
            if key not in keys:
                keys.append(key)

    try:
        objects = get_dataset_objects(metadata)
    except (DatasetObjectValidationError, ValueError, TypeError):
        objects = []

    for obj in objects:
        add(obj.get("object_key"))
        add(obj.get("quarantine_key"))
        add(obj.get("final_object_key"))

    add(metadata.get("storage_key"))
    for storage_key in metadata.get("storage_keys") or []:
        add(storage_key)

    scan_files = (metadata.get("malware_scan") or {}).get("files") or []
    for scan_file in scan_files:
        if isinstance(scan_file, dict):
            add(scan_file.get("final_object_key"))

    return keys


def abort_active_multipart_uploads(*, storage: Any, metadata: dict[str, Any]) -> None:
    sessions = metadata.get("multipart_uploads") or {}
    if not isinstance(sessions, dict):
        return

    for upload_id, session in sessions.items():
        if not isinstance(session, dict):
            continue
        if session.get("status") not in ACTIVE_MULTIPART_UPLOAD_STATUSES:
            continue
        object_key = session.get("object_key")
        if not object_key:
            continue
        try:
            storage.abort_multipart_upload(str(object_key), str(upload_id))
        except NotImplementedError:
            continue


def queue_github_issue_updates(
    *,
    background_tasks: Any,
    updates: list[GitHubIssueUpdate],
    settings: GitHubIssuesSettings,
    app_base_url: str,
) -> None:
    for update in updates:
        background_tasks.add_task(
            update_issue_for_dataset,
            dataset_id=update.dataset_id,
            issue_url=update.issue_url,
            title=update.title,
            metadata=update.metadata,
            settings=settings,
            app_base_url=app_base_url,
        )


def _delete_dataset_record(
    *,
    db: Session,
    dataset: Dataset,
    storage: Any,
    deleted_at: datetime,
    reason: str,
) -> GitHubIssueUpdate | None:
    metadata = scrub_user_metadata(dataset.dataset_metadata or {})
    metadata[DELETION_CLEANUP_KEY] = {
        "status": "deleted",
        "reason": reason,
        "deleted_at": deleted_at.isoformat(),
    }
    update = _github_issue_update(dataset, metadata)
    abort_active_multipart_uploads(
        storage=storage,
        metadata=dataset.dataset_metadata or {},
    )
    for storage_key in dataset_storage_keys(dataset.dataset_metadata or {}):
        storage.delete(storage_key)
    db.delete(dataset)
    return update


def _with_deletion_request(
    metadata: dict[str, Any],
    *,
    requested_at: datetime,
    reason: str,
) -> dict[str, Any]:
    updated = dict(metadata)
    updated[DELETION_REQUEST_KEY] = {
        "status": "pending_expert_approval",
        "reason": reason,
        "requested_at": requested_at.isoformat(),
    }
    return updated


def _github_issue_update(
    dataset: Dataset,
    metadata: dict[str, Any],
) -> GitHubIssueUpdate | None:
    if not dataset.issue_url:
        return None
    return GitHubIssueUpdate(
        dataset_id=dataset.id,
        issue_url=dataset.issue_url,
        title=dataset.title,
        metadata=metadata,
    )


def _delete_refresh_token_family_names(db: Session, user_id: uuid.UUID) -> None:
    family_ids = [
        row[0]
        for row in db.query(RefreshToken.family_id)
        .filter(RefreshToken.owner_id == user_id)
        .distinct()
        .all()
    ]
    if family_ids:
        db.query(TokenFamilyName).filter(
            TokenFamilyName.family_id.in_(family_ids)
        ).delete(synchronize_session=False)


def _scrub_metadata_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _scrub_metadata_value(child)
            for key, child in value.items()
            if key not in USER_METADATA_KEYS
        }
    if isinstance(value, list):
        return [_scrub_metadata_value(item) for item in value]
    return value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
