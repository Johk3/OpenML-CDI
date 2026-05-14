import uuid
from datetime import datetime, timezone

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token


class _ReadableStorage:
    def __init__(self):
        self.objects = {"ready/dataset/clean.csv": b"clean bytes"}
        self.opened_keys: list[str] = []

    def open(self, storage_key: str, mode: str = "rb"):
        self.opened_keys.append(storage_key)
        return _ReadContext(self.objects[storage_key])


class _ReadContext:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return None

    def read(self, _size=-1):
        payload = self.payload
        self.payload = b""
        return payload


def _user(*, user_id: uuid.UUID, role: Roles = Roles.USER) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        username=f"user-{str(user_id)[:8]}",
        first_name="Upload",
        last_name="User",
        role=role,
        created_at=datetime.now(timezone.utc),
    )


def _object_metadata(
    *,
    object_key: str = "quarantine/batch/clean.csv",
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
        "original_path": "clean.csv",
        "content_type": "text/csv",
        "byte_size": 11,
        "checksum": None,
        "etag": "etag",
        "upload_state": "promoted" if final_object_key else "uploaded",
        "scan_state": scan_state,
        "download_state": download_state,
    }


def test_quarantined_dataset_cannot_be_moved_to_processing(client, db_test_session):
    uploader_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(
        User(
            id=uploader_id,
            email="uploader@example.com",
            username="uploader",
            first_name="Upload",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Quarantined dataset",
            owner_id=uploader_id,
            dataset_metadata={
                "filename": "infected.csv",
                "malware_scan": {
                    "status": "infected",
                    "engine": "signature",
                    "signature": "EICAR-Test-File",
                },
            },
            status=Statuses.QUARANTINED,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(uploader_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "claimed"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Quarantined datasets can only be rejected"}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.QUARANTINED


def test_quarantined_dataset_can_be_rejected(client, db_test_session):
    uploader_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(
        User(
            id=uploader_id,
            email="uploader2@example.com",
            username="uploader2",
            first_name="Upload",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Quarantined dataset",
            owner_id=uploader_id,
            dataset_metadata={
                "filename": "infected.csv",
                "malware_scan": {
                    "status": "infected",
                },
            },
            status=Statuses.QUARANTINED,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(uploader_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "rejected"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.REJECTED


def test_download_uses_only_downloadable_final_object(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage()
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Clean dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["clean.csv"],
                "objects": [
                    _object_metadata(
                        final_object_key="ready/dataset/clean.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    )
                ],
            },
            status=Statuses.PENDING,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    response = client.get(
        f"/api/datasets/{dataset_id}/download",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.content == b"clean bytes"
    assert storage.opened_keys == ["ready/dataset/clean.csv"]


def test_download_rejects_unscanned_quarantine_object(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Unscanned dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["clean.csv"],
                "storage_keys": ["quarantine/batch/clean.csv"],
                "objects": [_object_metadata()],
            },
            status=Statuses.PENDING,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    response = client.get(
        f"/api/datasets/{dataset_id}/download",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset files are not available for download"}


def test_unscanned_pending_dataset_cannot_be_approved(client, db_test_session):
    expert_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add_all(
        [
            _user(user_id=expert_id, role=Roles.EXPERT),
            _user(user_id=owner_id),
            Dataset(
                id=dataset_id,
                title="Unscanned pending",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["pending.csv"],
                    "objects": [_object_metadata(object_key="quarantine/pending.csv")],
                },
                status=Statuses.PENDING,
            ),
        ]
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "approved"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset is not ready for expert approval"}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.PENDING


def test_expert_default_list_includes_all_datasets(client, db_test_session):
    expert_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    expert_dataset_id = uuid.uuid4()
    other_dataset_id = uuid.uuid4()
    db_test_session.add_all(
        [
            _user(user_id=expert_id, role=Roles.EXPERT),
            _user(user_id=owner_id),
            Dataset(
                id=expert_dataset_id,
                title="Expert owned",
                owner_id=expert_id,
                dataset_metadata={"filenames": ["expert.csv"]},
                status=Statuses.PENDING,
            ),
            Dataset(
                id=other_dataset_id,
                title="Other owned",
                owner_id=owner_id,
                dataset_metadata={"filenames": ["other.csv"]},
                status=Statuses.PENDING,
            ),
        ]
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.get(
        "/api/datasets/list",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert {dataset["id"] for dataset in response.json()} == {
        str(expert_dataset_id),
        str(other_dataset_id),
    }


def test_regular_user_default_list_only_includes_owned_datasets(
    client, db_test_session
):
    user_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    user_dataset_id = uuid.uuid4()
    other_dataset_id = uuid.uuid4()
    db_test_session.add_all(
        [
            _user(user_id=user_id),
            _user(user_id=owner_id),
            Dataset(
                id=user_dataset_id,
                title="User owned",
                owner_id=user_id,
                dataset_metadata={"filenames": ["user.csv"]},
                status=Statuses.PENDING,
            ),
            Dataset(
                id=other_dataset_id,
                title="Other owned",
                owner_id=owner_id,
                dataset_metadata={"filenames": ["other.csv"]},
                status=Statuses.PENDING,
            ),
        ]
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(user_id), "type": "access"})

    response = client.get(
        "/api/datasets/list",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert [dataset["id"] for dataset in response.json()] == [str(user_dataset_id)]


def test_expert_review_queue_excludes_unscanned_pending_datasets(
    client, db_test_session
):
    expert_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    clean_id = uuid.uuid4()
    unscanned_id = uuid.uuid4()
    quarantined_id = uuid.uuid4()
    db_test_session.add_all(
        [
            _user(user_id=expert_id, role=Roles.EXPERT),
            _user(user_id=owner_id),
            Dataset(
                id=clean_id,
                title="Clean pending",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [
                        _object_metadata(
                            final_object_key="ready/dataset/clean.csv",
                            scan_state="clean",
                            download_state="downloadable",
                        )
                    ],
                },
                status=Statuses.PENDING,
            ),
            Dataset(
                id=unscanned_id,
                title="Unscanned pending",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["pending.csv"],
                    "objects": [_object_metadata(object_key="quarantine/pending.csv")],
                },
                status=Statuses.PENDING,
            ),
            Dataset(
                id=quarantined_id,
                title="Quarantined",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["infected.csv"],
                    "objects": [
                        _object_metadata(
                            object_key="quarantine/infected.csv",
                            scan_state="infected",
                        )
                    ],
                },
                status=Statuses.QUARANTINED,
            ),
        ]
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.get(
        "/api/datasets/list",
        params={"scope": "review_queue"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    dataset_ids = [dataset["id"] for dataset in response.json()]
    assert dataset_ids == [str(quarantined_id), str(clean_id)]


def test_regular_users_cannot_request_expert_review_queue(client, db_test_session):
    user_id = uuid.uuid4()
    db_test_session.add(_user(user_id=user_id))
    db_test_session.commit()
    access_token = create_access_token({"sub": str(user_id), "type": "access"})

    response = client.get(
        "/api/datasets/list",
        params={"scope": "review_queue"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Only experts can view the review queue"}
