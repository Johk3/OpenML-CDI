import uuid
from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZipFile

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token
from app.services.github_issues import GitHubAPIError
from app.storage.errors import StorageObjectNotFoundError, StorageUnavailableError


class _ReadableStorage:
    def __init__(self, objects: dict[str, bytes] | None = None):
        self.objects = objects or {"ready/dataset/clean.csv": b"clean bytes"}
        self.opened_keys: list[str] = []

    def open(self, storage_key: str, mode: str = "rb"):
        self.opened_keys.append(storage_key)
        return _ReadContext(self.objects[storage_key])

    def object_exists(self, storage_key: str) -> bool:
        return storage_key in self.objects


class _OpenFailureStorage(_ReadableStorage):
    def __init__(self, error: Exception):
        super().__init__()
        self.error = error

    def open(self, storage_key: str, mode: str = "rb"):
        self.opened_keys.append(storage_key)
        raise self.error

    def object_exists(self, storage_key: str) -> bool:
        return True


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
    original_path: str = "clean.csv",
    content_type: str = "text/csv",
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
        "original_path": original_path,
        "content_type": content_type,
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


def test_download_reports_missing_object_when_storage_open_fails(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _OpenFailureStorage(StorageObjectNotFoundError("gone"))
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Missing at download",
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

    assert response.status_code == 404
    assert response.json() == {"detail": "Dataset file is missing from storage"}
    assert storage.opened_keys == ["ready/dataset/clean.csv"]


def test_download_reports_storage_unavailable_when_storage_open_fails(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _OpenFailureStorage(StorageUnavailableError("storage down"))
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Storage unavailable at download",
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

    assert response.status_code == 503
    assert response.json() == {"detail": "Dataset file storage is unavailable"}
    assert storage.opened_keys == ["ready/dataset/clean.csv"]


def test_archive_download_reports_missing_object_when_storage_open_fails(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _OpenFailureStorage(StorageObjectNotFoundError("gone"))
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Missing archive dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["train.csv", "test.csv"],
                "objects": [
                    _object_metadata(
                        object_key="quarantine/dataset/train.csv",
                        final_object_key="ready/dataset/train.csv",
                        original_path="train.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
                    _object_metadata(
                        object_key="quarantine/dataset/test.csv",
                        final_object_key="ready/dataset/test.csv",
                        original_path="test.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
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

    assert response.status_code == 404
    assert response.json() == {"detail": "Dataset file is missing from storage"}
    assert storage.opened_keys == ["ready/dataset/train.csv"]


def test_download_encodes_non_ascii_filenames(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage({"ready/dataset/resume.csv": b"resume"})
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Unicode filename dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["Résumé Δ.csv"],
                "objects": [
                    _object_metadata(
                        final_object_key="ready/dataset/resume.csv",
                        original_path="Résumé Δ.csv",
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
    assert (
        "filename*=UTF-8''R%C3%A9sum%C3%A9%20%CE%94.csv"
        in response.headers["content-disposition"]
    )


def test_download_archives_single_nested_object_path(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage(
        {"ready/dataset/folder/sub/clean.csv": b"nested clean bytes"}
    )
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Nested single-file dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["folder/sub/clean.csv"],
                "directory_structure": {
                    "compressed": False,
                    "representation": "single_object",
                    "root": "folder",
                    "paths": ["folder/sub/clean.csv"],
                    "archive_path": None,
                    "manifest": {
                        "version": 1,
                        "path_count": 1,
                        "source": "directory_structure.paths",
                    },
                },
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/folder/sub/clean.csv",
                        final_object_key="ready/dataset/folder/sub/clean.csv",
                        original_path="folder/sub/clean.csv",
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
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == ["folder/sub/clean.csv"]
        assert archive.read("folder/sub/clean.csv") == b"nested clean bytes"
    assert storage.opened_keys == ["ready/dataset/folder/sub/clean.csv"]


def test_download_archives_multi_object_folder_paths(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage(
        {
            "ready/dataset/folder/train/one.csv": b"one",
            "ready/dataset/folder/test/two.csv": b"two",
        }
    )
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Nested multi-file dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": [
                    "folder/train/one.csv",
                    "folder/test/two.csv",
                ],
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/folder/train/one.csv",
                        final_object_key="ready/dataset/folder/train/one.csv",
                        original_path="folder/train/one.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
                    _object_metadata(
                        object_key="quarantine/batch/folder/test/two.csv",
                        final_object_key="ready/dataset/folder/test/two.csv",
                        original_path="folder/test/two.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
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
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == [
            "folder/test/two.csv",
            "folder/train/one.csv",
        ]
        assert archive.read("folder/train/one.csv") == b"one"
        assert archive.read("folder/test/two.csv") == b"two"
    assert storage.opened_keys == [
        "ready/dataset/folder/train/one.csv",
        "ready/dataset/folder/test/two.csv",
    ]


def test_download_wraps_flat_multi_object_paths_in_dataset_folder(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage(
        {
            "ready/dataset/one.csv": b"one",
            "ready/dataset/two.csv": b"two",
        }
    )
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Flat multi-file dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["one.csv", "two.csv"],
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/one.csv",
                        final_object_key="ready/dataset/one.csv",
                        original_path="one.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
                    _object_metadata(
                        object_key="quarantine/batch/two.csv",
                        final_object_key="ready/dataset/two.csv",
                        original_path="two.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
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

    root = f"dataset_{dataset_id}"
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == [
            f"{root}/one.csv",
            f"{root}/two.csv",
        ]
        assert archive.read(f"{root}/one.csv") == b"one"
        assert archive.read(f"{root}/two.csv") == b"two"
    assert storage.opened_keys == [
        "ready/dataset/one.csv",
        "ready/dataset/two.csv",
    ]


def test_download_streams_compressed_upload_package(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    zip_payload = BytesIO()
    with ZipFile(zip_payload, "w") as archive:
        archive.writestr("folder/train/one.csv", b"one")
        archive.writestr("folder/test/two.csv", b"two")
    storage = _ReadableStorage(
        {"ready/dataset/Folder_Dataset_files.zip": zip_payload.getvalue()}
    )
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Compressed dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["Folder_Dataset_files.zip"],
                "directory_structure": {
                    "compressed": True,
                    "representation": "zip",
                    "root": "folder",
                    "paths": ["folder/train/one.csv", "folder/test/two.csv"],
                    "archive_path": "Folder_Dataset_files.zip",
                    "manifest": {
                        "version": 1,
                        "path_count": 2,
                        "source": "browser-selection",
                    },
                },
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/Folder_Dataset_files.zip",
                        final_object_key="ready/dataset/Folder_Dataset_files.zip",
                        original_path="Folder_Dataset_files.zip",
                        content_type="application/zip",
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
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == [
            "folder/test/two.csv",
            "folder/train/one.csv",
        ]
    assert storage.opened_keys == ["ready/dataset/Folder_Dataset_files.zip"]


def test_download_rejects_duplicate_original_paths_before_packaging(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage(
        {
            "ready/dataset/one.csv": b"one",
            "ready/dataset/two.csv": b"two",
        }
    )
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Duplicate path dataset",
            owner_id=owner_id,
            dataset_metadata={
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/one.csv",
                        final_object_key="ready/dataset/one.csv",
                        original_path="same.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
                    _object_metadata(
                        object_key="quarantine/batch/two.csv",
                        final_object_key="ready/dataset/two.csv",
                        original_path="same.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    ),
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

    assert response.status_code == 400
    assert response.json() == {"detail": "Duplicate original paths are not allowed"}
    assert storage.opened_keys == []


def test_download_rejects_unsafe_original_paths_before_packaging(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    storage = _ReadableStorage({"ready/dataset/secret.csv": b"secret"})
    client.app.state.storage = storage
    db_test_session.add(_user(user_id=owner_id))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Unsafe path dataset",
            owner_id=owner_id,
            dataset_metadata={
                "objects": [
                    _object_metadata(
                        object_key="quarantine/batch/secret.csv",
                        final_object_key="ready/dataset/secret.csv",
                        original_path="../secret.csv",
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

    assert response.status_code == 400
    assert response.json() == {
        "detail": "original path cannot be absolute or contain '..'"
    }
    assert storage.opened_keys == []


def test_download_still_rejects_non_owner(client, db_test_session):
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    client.app.state.storage = _ReadableStorage()
    db_test_session.add_all([_user(user_id=owner_id), _user(user_id=other_id)])
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Private dataset",
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
    access_token = create_access_token({"sub": str(other_id), "type": "access"})

    response = client.get(
        f"/api/datasets/{dataset_id}/download",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Not authorized to access this dataset"}


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


def test_non_expert_cannot_approve_dataset(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Review dataset",
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
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "approved"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Only experts can change dataset status"}
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.PENDING_REVIEW


def test_expert_can_approve_review_ready_dataset(client, db_test_session, monkeypatch):
    closed_issues = []

    def fake_close_issue_for_dataset(**kwargs):
        closed_issues.append(kwargs)

    monkeypatch.setattr(
        "app.routers.dataset.close_issue_for_dataset",
        fake_close_issue_for_dataset,
    )

    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        User(
            id=expert_id,
            email="expert@example.com",
            username="expert",
            first_name="Expert",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Review dataset",
            owner_id=owner_id,
            issue_url="https://github.com/openml/openmlupload-test/issues/42",
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
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "approved"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.APPROVED
    assert len(closed_issues) == 1
    assert closed_issues[0]["dataset_id"] == dataset_id
    assert closed_issues[0]["issue_url"].endswith("/issues/42")


def test_expert_can_mark_reviewed_dataset_as_processing_error(client, db_test_session):
    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        User(
            id=expert_id,
            email="processing-error-expert@example.com",
            username="processing-error-expert",
            first_name="Expert",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    dataset_ids: list[uuid.UUID] = []
    for initial_status in (
        Statuses.PENDING_REVIEW,
        Statuses.APPROVED,
        Statuses.PUBLISHED,
    ):
        dataset_id = uuid.uuid4()
        dataset_ids.append(dataset_id)
        db_test_session.add(
            Dataset(
                id=dataset_id,
                title=f"{initial_status.value} dataset",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [
                        _object_metadata(
                            final_object_key=f"ready/{dataset_id}/clean.csv",
                            scan_state="clean",
                            download_state="downloadable",
                        )
                    ],
                },
                status=initial_status,
            )
        )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    for dataset_id in dataset_ids:
        response = client.post(
            "/api/datasets/status",
            params={"dataset_id": str(dataset_id), "status": "integration_failed"},
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        db_test_session.expire_all()
        assert (
            db_test_session.get(Dataset, dataset_id).status
            == Statuses.INTEGRATION_FAILED
        )


def test_expert_cannot_return_review_ready_dataset_to_scanning(client, db_test_session):
    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        User(
            id=expert_id,
            email="ongoing-processing-expert@example.com",
            username="ongoing-processing-expert",
            first_name="Expert",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    dataset_ids: list[uuid.UUID] = []
    for initial_status in (
        Statuses.PENDING_REVIEW,
        Statuses.APPROVED,
        Statuses.PUBLISHED,
    ):
        dataset_id = uuid.uuid4()
        dataset_ids.append(dataset_id)
        db_test_session.add(
            Dataset(
                id=dataset_id,
                title=f"{initial_status.value} dataset",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [
                        _object_metadata(
                            final_object_key=f"ready/{dataset_id}/clean.csv",
                            scan_state="clean",
                            download_state="downloadable",
                        )
                    ],
                },
                status=initial_status,
            )
        )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    for dataset_id, initial_status in zip(
        dataset_ids,
        (Statuses.PENDING_REVIEW, Statuses.APPROVED, Statuses.PUBLISHED),
    ):
        response = client.post(
            "/api/datasets/status",
            params={"dataset_id": str(dataset_id), "status": "scanning"},
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 409
        assert response.json() == {
            "detail": (
                "Invalid dataset lifecycle transition: "
                f"{initial_status.value} -> scanning"
            )
        }
        db_test_session.expire_all()
        assert db_test_session.get(Dataset, dataset_id).status == initial_status


def test_expert_can_reopen_rejected_review_ready_dataset(client, db_test_session):
    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(_user(user_id=expert_id, role=Roles.EXPERT))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Rejected review-ready dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["clean.csv"],
                "objects": [
                    _object_metadata(
                        final_object_key="ready/rejected/clean.csv",
                        scan_state="clean",
                        download_state="downloadable",
                    )
                ],
            },
            status=Statuses.REJECTED,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "pending_review"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.PENDING_REVIEW


def test_rejected_dataset_without_review_ready_files_cannot_be_reopened(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    expert_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(_user(user_id=expert_id, role=Roles.EXPERT))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Rejected unsafe dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["infected.csv"],
                "objects": [
                    _object_metadata(
                        object_key="quarantine/infected.csv",
                        scan_state="infected",
                        download_state="unavailable",
                    )
                ],
            },
            status=Statuses.REJECTED,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(expert_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "pending_review"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset is not ready for expert review"}
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.REJECTED


def test_github_discussion_returns_creation_failure_without_issue_url(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Review dataset",
            owner_id=owner_id,
            dataset_metadata={
                "github_issue": {
                    "status": "failed",
                    "error_reason": "permission_error",
                    "message": (
                        "GitHub discussion could not be created because "
                        "the GitHub App does not have permission."
                    ),
                    "retryable": False,
                    "attempts": 1,
                }
            },
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    response = client.get(
        f"/api/datasets/{dataset_id}/github-discussion",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "state": "failed",
        "html_url": "",
        "title": "",
        "message": (
            "GitHub discussion could not be created because "
            "the GitHub App does not have permission."
        ),
        "error_reason": "permission_error",
        "retryable": False,
        "comments": [],
    }


def test_github_discussion_returns_structured_fetch_failure(
    client, db_test_session, monkeypatch
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(_user(user_id=owner_id, role=Roles.USER))
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Linked dataset",
            owner_id=owner_id,
            issue_url="https://github.com/openml/openmlupload-test/issues/42",
            dataset_metadata={"filenames": ["linked.csv"]},
            status=Statuses.PENDING_REVIEW,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    def fail_fetch(_settings, _issue_url):
        raise GitHubAPIError(
            "GitHub API rate limit exceeded",
            403,
            reason="rate_limited",
            retryable=True,
        )

    monkeypatch.setattr("app.routers.dataset.get_issue_with_comments", fail_fetch)

    response = client.get(
        f"/api/datasets/{dataset_id}/github-discussion",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "github_discussion_fetch_failed",
            "message": (
                "GitHub discussion is temporarily unavailable because GitHub "
                "rate limits were reached."
            ),
            "reason": "rate_limited",
            "retryable": True,
        }
    }


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


def test_list_datasets_includes_lifecycle_download_visibility(client, db_test_session):
    expert_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    downloadable_id = uuid.uuid4()
    rejected_id = uuid.uuid4()
    clean_object = _object_metadata(
        final_object_key="ready/dataset/clean.csv",
        scan_state="clean",
        download_state="downloadable",
    )
    db_test_session.add_all(
        [
            _user(user_id=expert_id, role=Roles.EXPERT),
            _user(user_id=owner_id),
            Dataset(
                id=downloadable_id,
                title="Downloadable pending",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [clean_object],
                },
                status=Statuses.PENDING,
            ),
            Dataset(
                id=rejected_id,
                title="Rejected clean",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [clean_object],
                },
                status=Statuses.REJECTED,
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
    datasets = {dataset["id"]: dataset for dataset in response.json()}
    downloadable = datasets[str(downloadable_id)]
    rejected = datasets[str(rejected_id)]
    assert downloadable["status"] == "pending_review"
    assert downloadable["lifecycle"]["state"] == "pending_review"
    assert downloadable["lifecycle"]["download"]["available"] is True
    assert downloadable["download_url"] == (f"/api/datasets/{downloadable_id}/download")
    assert rejected["status"] == "rejected"
    assert rejected["lifecycle"]["state"] == "rejected"
    assert rejected["lifecycle"]["download"]["available"] is False
    assert rejected["download_url"] is None


def test_get_dataset_normalizes_scanning_clean_promoted_dataset(
    client, db_test_session
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    clean_object = _object_metadata(
        final_object_key="ready/dataset/clean.csv",
        scan_state="clean",
        download_state="downloadable",
    )
    db_test_session.add_all(
        [
            _user(user_id=owner_id),
            Dataset(
                id=dataset_id,
                title="Clean but persisted scanning",
                owner_id=owner_id,
                dataset_metadata={
                    "filenames": ["clean.csv"],
                    "objects": [clean_object],
                },
                status=Statuses.SCANNING,
            ),
        ]
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(owner_id), "type": "access"})

    response = client.get(
        "/api/datasets/get",
        params={"dataset_id": str(dataset_id)},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending_review"
    assert payload["lifecycle"]["state"] == "pending_review"
    assert payload["lifecycle"]["upload"]["scanning"] is False
    assert payload["download_url"] == f"/api/datasets/{dataset_id}/download"


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
