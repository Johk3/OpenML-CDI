import uuid
from datetime import datetime, timezone

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token


class _DeletionStorage:
    def __init__(self, objects: set[str] | None = None):
        self.objects = set(objects or set())
        self.aborted: list[tuple[str, str]] = []
        self.deleted: list[str] = []
        self.calls: list[tuple[str, dict]] = []

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        self.calls.append(
            (
                "abort_multipart_upload",
                {"storage_key": storage_key, "upload_id": upload_id},
            )
        )
        self.aborted.append((storage_key, upload_id))

    def delete(self, storage_key: str) -> None:
        self.calls.append(("delete", {"storage_key": storage_key}))
        self.deleted.append(storage_key)
        self.objects.discard(storage_key)


def _user(*, user_id: uuid.UUID, role: Roles = Roles.USER) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        username=f"user-{str(user_id)[:8]}",
        first_name="Dataset",
        last_name="Owner",
        role=role,
        created_at=datetime.now(timezone.utc),
    )


def _headers(user_id: uuid.UUID) -> dict[str, str]:
    token = create_access_token({"sub": str(user_id), "type": "access"})
    return {"Authorization": f"Bearer {token}"}


def _object_metadata(
    *,
    object_key: str,
    final_object_key: str | None = None,
    scan_state: str = "pending",
    download_state: str = "unavailable",
) -> dict:
    return {
        "backend": "s3",
        "provider": "s3",
        "bucket": "datasets",
        "object_key": object_key,
        "quarantine_key": object_key,
        "final_object_key": final_object_key,
        "original_path": object_key.rsplit("/", 1)[-1],
        "content_type": "text/csv",
        "byte_size": 12,
        "checksum": None,
        "etag": "etag",
        "upload_state": "promoted" if final_object_key else "uploaded",
        "scan_state": scan_state,
        "download_state": download_state,
    }


def _metadata(
    *,
    object_key: str,
    final_object_key: str | None = None,
    contact_email: str = "owner@example.com",
) -> dict:
    return {
        "description": "A reusable dataset",
        "contact": {"email": contact_email},
        "uploader": {"email": contact_email, "github_id": "123"},
        "storage_keys": [object_key],
        "objects": [
            _object_metadata(
                object_key=object_key,
                final_object_key=final_object_key,
                scan_state="clean" if final_object_key else "pending",
                download_state="downloadable" if final_object_key else "unavailable",
            )
        ],
    }


def test_account_only_deletion_preserves_datasets_and_scrubs_user_metadata(
    client, db_test_session, monkeypatch
):
    issue_updates = []

    def fake_update_issue_for_dataset(**kwargs):
        issue_updates.append(kwargs)

    monkeypatch.setattr(
        "app.services.deletion_cleanup.update_issue_for_dataset",
        fake_update_issue_for_dataset,
    )

    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "datasets/batch/account-only.csv"
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Account only dataset",
            owner_id=owner_id,
            dataset_metadata=_metadata(object_key=object_key),
            status=Statuses.PENDING_REVIEW,
            issue_url="https://github.com/openml/openmlupload-test/issues/301",
        )
    )
    db_test_session.commit()
    storage = _DeletionStorage({object_key})
    client.app.state.storage = storage

    response = client.post(
        "/api/user/delete",
        json={"mode": "account_only"},
        headers=_headers(owner_id),
    )

    assert response.status_code == 200
    assert response.json()["datasets_preserved"] == 1
    assert response.json()["datasets_deleted"] == 0
    assert db_test_session.get(User, owner_id) is None
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset is not None
    assert dataset.owner_id is None
    assert dataset.dataset_metadata["description"] == "A reusable dataset"
    assert "contact" not in dataset.dataset_metadata
    assert "uploader" not in dataset.dataset_metadata
    assert dataset.dataset_metadata["objects"][0]["object_key"] == object_key
    assert storage.deleted == []
    assert len(issue_updates) == 1
    assert issue_updates[0]["dataset_id"] == dataset_id
    assert issue_updates[0]["issue_url"].endswith("/issues/301")
    assert "contact" not in issue_updates[0]["metadata"]
    assert issue_updates[0]["metadata"]["account_deletion"]["mode"] == "account_only"
    assert dataset.issue_url.endswith("/issues/301")


def test_account_deletion_without_body_defaults_to_account_only(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "datasets/batch/default-account-only.csv"
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Default account deletion dataset",
            owner_id=owner_id,
            dataset_metadata=_metadata(object_key=object_key),
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    storage = _DeletionStorage({object_key})
    client.app.state.storage = storage

    response = client.post("/api/user/delete", headers=_headers(owner_id))

    assert response.status_code == 200
    assert response.json()["datasets_preserved"] == 1
    assert response.json()["datasets_deleted"] == 0
    assert response.json()["dataset_deletion_requests"] == 0
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset is not None
    assert dataset.owner_id is None
    assert "account_deletion" in dataset.dataset_metadata
    assert "contact" not in dataset.dataset_metadata
    assert storage.deleted == []


def test_account_deletion_with_datasets_deletes_unapproved_and_requests_expert_review(
    client, db_test_session, monkeypatch
):
    issue_updates = []

    def fake_update_issue_for_dataset(**kwargs):
        issue_updates.append(kwargs)

    monkeypatch.setattr(
        "app.services.deletion_cleanup.update_issue_for_dataset",
        fake_update_issue_for_dataset,
    )

    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    pending_id = uuid.uuid4()
    published_id = uuid.uuid4()
    pending_key = "datasets/batch/delete-me.csv"
    published_key = "datasets/batch/published.csv"
    published_final_key = "ready/published/published.csv"
    db_test_session.add_all(
        [_user(user_id=owner_id), _user(user_id=expert_id, role=Roles.EXPERT)]
    )
    db_test_session.add_all(
        [
            Dataset(
                id=pending_id,
                title="Pending deletion",
                owner_id=owner_id,
                dataset_metadata={
                    **_metadata(object_key=pending_key),
                    "multipart_uploads": {
                        "upload-active": {
                            "object_key": pending_key,
                            "status": "active",
                        }
                    },
                },
                status=Statuses.PENDING_REVIEW,
                issue_url="https://github.com/openml/openmlupload-test/issues/301",
            ),
            Dataset(
                id=published_id,
                title="Published deletion request",
                owner_id=owner_id,
                dataset_metadata=_metadata(
                    object_key=published_key,
                    final_object_key=published_final_key,
                ),
                status=Statuses.PUBLISHED,
            ),
        ]
    )
    db_test_session.commit()
    storage = _DeletionStorage({pending_key, published_key, published_final_key})
    client.app.state.storage = storage

    response = client.post(
        "/api/user/delete",
        json={"mode": "account_and_datasets"},
        headers=_headers(owner_id),
    )

    assert response.status_code == 200
    assert response.json()["datasets_deleted"] == 1
    assert response.json()["dataset_deletion_requests"] == 1
    assert db_test_session.get(User, owner_id) is None
    assert db_test_session.get(Dataset, pending_id) is None
    published = db_test_session.get(Dataset, published_id)
    assert published is not None
    assert published.owner_id is None
    assert published.dataset_metadata["deletion_request"]["status"] == (
        "pending_expert_approval"
    )
    assert published.dataset_metadata["deletion_request"]["reason"] == "account_deleted"
    assert published.dataset_metadata["objects"][0]["object_key"] == published_key
    assert (
        published.dataset_metadata["objects"][0]["final_object_key"]
        == published_final_key
    )
    assert "contact" not in published.dataset_metadata
    assert storage.calls[:2] == [
        (
            "abort_multipart_upload",
            {"storage_key": pending_key, "upload_id": "upload-active"},
        ),
        ("delete", {"storage_key": pending_key}),
    ]
    assert storage.deleted == [pending_key]
    assert len(issue_updates) == 1
    assert issue_updates[0]["dataset_id"] == pending_id
    assert issue_updates[0]["issue_url"].endswith("/issues/301")
    assert issue_updates[0]["metadata"]["deletion_cleanup"]["status"] == "deleted"
    assert issue_updates[0]["metadata"]["deletion_cleanup"]["reason"] == (
        "account_deleted"
    )
    assert "contact" not in issue_updates[0]["metadata"]

    expert_response = client.post(
        "/api/datasets/delete",
        params={"dataset_id": str(published_id)},
        headers=_headers(expert_id),
    )

    assert expert_response.status_code == 200
    assert db_test_session.get(Dataset, published_id) is None
    assert set(storage.deleted) == {pending_key, published_key, published_final_key}


def test_regular_dataset_delete_cleans_storage_objects(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "datasets/batch/review.csv"
    final_key = "ready/review/review.csv"
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Review dataset",
            owner_id=owner_id,
            dataset_metadata=_metadata(
                object_key=object_key,
                final_object_key=final_key,
            ),
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    storage = _DeletionStorage({object_key, final_key})
    client.app.state.storage = storage

    response = client.post(
        "/api/datasets/delete",
        params={"dataset_id": str(dataset_id)},
        headers=_headers(owner_id),
    )

    assert response.status_code == 200
    assert db_test_session.get(Dataset, dataset_id) is None
    assert set(storage.deleted) == {object_key, final_key}


def test_dataset_delete_aborts_active_multipart_uploads(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "datasets/batch/incomplete.csv"
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Incomplete multipart dataset",
            owner_id=owner_id,
            dataset_metadata={
                **_metadata(object_key=object_key),
                "multipart_uploads": {
                    "upload-active": {
                        "object_key": object_key,
                        "status": "active",
                    },
                    "upload-completed": {
                        "object_key": object_key,
                        "status": "completed",
                    },
                },
            },
            status=Statuses.PENDING_UPLOAD,
        )
    )
    db_test_session.commit()
    storage = _DeletionStorage({object_key})
    client.app.state.storage = storage

    response = client.post(
        "/api/datasets/delete",
        params={"dataset_id": str(dataset_id)},
        headers=_headers(owner_id),
    )

    assert response.status_code == 200
    assert db_test_session.get(Dataset, dataset_id) is None
    assert storage.aborted == [(object_key, "upload-active")]
    assert storage.deleted == [object_key]
    assert storage.calls == [
        (
            "abort_multipart_upload",
            {"storage_key": object_key, "upload_id": "upload-active"},
        ),
        ("delete", {"storage_key": object_key}),
    ]


def test_approved_dataset_delete_requires_expert_approval_then_cleans_storage(
    client, db_test_session, monkeypatch
):
    issue_updates = []

    def fake_update_issue_for_dataset(**kwargs):
        issue_updates.append(kwargs)

    monkeypatch.setattr(
        "app.services.deletion_cleanup.update_issue_for_dataset",
        fake_update_issue_for_dataset,
    )

    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "datasets/batch/approved.csv"
    final_key = "ready/approved/approved.csv"
    db_test_session.add_all(
        [_user(user_id=owner_id), _user(user_id=expert_id, role=Roles.EXPERT)]
    )
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Approved dataset",
            owner_id=owner_id,
            dataset_metadata=_metadata(
                object_key=object_key,
                final_object_key=final_key,
            ),
            status=Statuses.APPROVED,
            issue_url="https://github.com/openml/openmlupload-test/issues/301",
        )
    )
    db_test_session.commit()
    storage = _DeletionStorage({object_key, final_key})
    client.app.state.storage = storage

    owner_response = client.post(
        "/api/datasets/delete",
        params={"dataset_id": str(dataset_id)},
        headers=_headers(owner_id),
    )

    assert owner_response.status_code == 202
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset is not None
    assert dataset.dataset_metadata["deletion_request"]["status"] == (
        "pending_expert_approval"
    )
    assert dataset.dataset_metadata["contact"] == {"email": "owner@example.com"}
    assert dataset.dataset_metadata["uploader"] == {
        "email": "owner@example.com",
        "github_id": "123",
    }
    assert len(issue_updates) == 1
    assert issue_updates[0]["dataset_id"] == dataset_id
    assert issue_updates[0]["issue_url"].endswith("/issues/301")
    assert issue_updates[0]["metadata"]["contact"] == {"email": "owner@example.com"}
    assert issue_updates[0]["metadata"]["deletion_request"]["status"] == (
        "pending_expert_approval"
    )
    assert issue_updates[0]["metadata"]["deletion_request"]["reason"] == (
        "dataset_owner_requested"
    )
    assert storage.deleted == []

    expert_response = client.post(
        "/api/datasets/delete",
        params={"dataset_id": str(dataset_id)},
        headers=_headers(expert_id),
    )

    assert expert_response.status_code == 200
    assert db_test_session.get(Dataset, dataset_id) is None
    assert set(storage.deleted) == {object_key, final_key}
    assert len(issue_updates) == 2
    assert "contact" not in issue_updates[1]["metadata"]
    assert issue_updates[1]["metadata"]["deletion_cleanup"]["status"] == "deleted"
    assert issue_updates[1]["metadata"]["deletion_cleanup"]["reason"] == (
        "dataset_deleted"
    )
