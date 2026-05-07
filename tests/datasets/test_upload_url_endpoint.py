import uuid
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.database.models import Dataset, Roles, Statuses, User
from app.main import app
from app.schemas.users import User as UserSchema
from app.security import create_access_token, get_current_active_user
from app.storage.errors import StorageObjectNotFoundError
from app.storage.types import ObjectMetadata, UploadTarget


class _FakeS3Storage:
    bucket = "datasets"

    def __init__(self):
        self.upload_url_calls = []
        self.verify_calls = []
        self.objects: dict[str, ObjectMetadata] = {}

    def backend_name(self) -> str:
        return "s3"

    def create_upload_target(self, filename: str, prefix: str | None = None):
        return UploadTarget(
            storage_key=f"quarantine/{prefix}/{filename}",
            local_path=None,
        )

    def create_upload_url(
        self,
        storage_key: str,
        content_type: str | None = None,
        expires_seconds: int = 3600,
    ) -> str:
        self.upload_url_calls.append(
            {
                "storage_key": storage_key,
                "content_type": content_type,
                "expires_seconds": expires_seconds,
            }
        )
        return f"https://s3.example/{storage_key}?signature=abc"

    def verify_object(
        self,
        storage_key: str,
        expected_size: int | None = None,
        expected_content_type: str | None = None,
        expected_etag: str | None = None,
    ):
        self.verify_calls.append(
            {
                "storage_key": storage_key,
                "expected_size": expected_size,
                "expected_content_type": expected_content_type,
                "expected_etag": expected_etag,
            }
        )
        if storage_key not in self.objects:
            raise StorageObjectNotFoundError(f"Object not found: {storage_key}")
        return self.objects[storage_key]


def _assert_dataset_object(
    metadata: dict,
    *,
    original_path: str,
    storage_key: str,
    content_type: str | None = None,
):
    objects = metadata["objects"]
    matching = [obj for obj in objects if obj["original_path"] == original_path]
    assert len(matching) == 1
    obj = matching[0]
    assert obj["backend"] == "local"
    assert obj["provider"] == "local"
    assert obj["object_key"] == storage_key
    assert obj["quarantine_key"] == storage_key
    assert obj["final_object_key"] is None
    assert obj["content_type"] == content_type
    assert obj["byte_size"] is None
    assert obj["checksum"] is None
    assert obj["etag"] is None
    assert obj["upload_state"] == "pending"
    assert obj["scan_state"] == "pending"
    assert obj["download_state"] == "unavailable"


@pytest.fixture
def db_session_factory(tmp_path: Path):
    db_path = tmp_path / "upload_url_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    testing_session_local = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    try:
        yield testing_session_local
    finally:
        engine.dispose()


@pytest.fixture
def client(db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def _create_access_token_for_user(db_session_factory, user_id: uuid.UUID) -> str:
    with db_session_factory() as db:
        db.add(
            User(
                id=user_id,
                email="uploader@example.com",
                username="uploader",
                first_name="Upload",
                last_name="User",
                role=Roles.USER,
            )
        )
        db.commit()
    return create_access_token({"sub": str(user_id), "type": "access"})


@pytest.mark.parametrize(
    "filename",
    ["sample.csv", "data.zip", "dataset.xlsx", "model.h5", "archive.hdf5"],
)
def test_upload_url_creates_pending_dataset_and_returns_presigned_url(
    client: TestClient, db_session_factory, monkeypatch, filename
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)
    expected_storage_key = f"datasets/fixed_{filename}"

    monkeypatch.setattr(
        client.app.state.storage,
        "create_upload_target",
        lambda _filename, **kwargs: UploadTarget(
            storage_key=expected_storage_key,
            local_path=Path(f"/tmp/{expected_storage_key}"),
        ),
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "My dataset",
            "description": {"field": "value"},
            "filenames": [filename],
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {
        "id",
        "presigned_urls",
        "upload_contracts",
        "dataset_url",
    }
    assert body["presigned_urls"][0] == (
        f"http://testserver/api/datasets/upload/{expected_storage_key}"
    )
    assert body["upload_contracts"][0] == {
        "original_path": filename,
        "object_key": expected_storage_key,
        "url": f"http://testserver/api/datasets/upload/{expected_storage_key}",
        "method": "PUT",
        "headers": {},
        "content_type": None,
        "expires_seconds": 3600,
    }
    dataset_id = uuid.UUID(body["id"])

    with db_session_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        assert dataset is not None
        assert dataset.title == "My dataset"
        metadata = dataset.dataset_metadata
        assert metadata["field"] == "value"
        assert metadata["filenames"] == [filename]
        assert metadata["storage_keys"] == [expected_storage_key]
        assert metadata["storage_schema_version"] == 1
        _assert_dataset_object(
            metadata,
            original_path=filename,
            storage_key=expected_storage_key,
        )
        assert dataset.owner_id == uploader_id
        assert dataset.status == Statuses.PENDING


def test_confirm_upload_triggers_scan_and_returns_202(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)

    dataset_id = uuid.uuid4()
    with db_session_factory() as db:
        db.add(
            Dataset(
                id=dataset_id,
                title="My dataset",
                owner_id=uploader_id,
                dataset_metadata={
                    "filename": "data.csv",
                    "storage_key": "datasets/generated_data.csv",
                },
                status=Statuses.PENDING,
            )
        )
        db.commit()
    client.app.state.storage.write_bytes(
        "datasets/generated_data.csv", b"feature,target\n1,0\n"
    )

    scan_calls = []

    monkeypatch.setattr(
        "app.routers.dataset.scan_uploaded_files",
        lambda **kwargs: scan_calls.append(kwargs),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 202
    assert response.json() == {
        "message": "Upload confirmed, scan started",
        "dataset_url": f"/datasets/{dataset_id}",
    }
    assert len(scan_calls) == 1
    assert scan_calls[0]["dataset_id"] == dataset_id
    assert scan_calls[0]["storage_keys"] == ["datasets/generated_data.csv"]


def test_confirm_upload_marks_dataset_objects_uploaded(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)
    storage_key = "datasets/batch/data.csv"
    dataset_id = uuid.uuid4()
    with db_session_factory() as db:
        db.add(
            Dataset(
                id=dataset_id,
                title="My dataset",
                owner_id=uploader_id,
                dataset_metadata={
                    "filenames": ["data.csv"],
                    "storage_keys": [storage_key],
                    "storage_schema_version": 1,
                    "objects": [
                        {
                            "backend": "local",
                            "provider": "local",
                            "bucket": "uploads",
                            "object_key": storage_key,
                            "quarantine_key": storage_key,
                            "final_object_key": None,
                            "original_path": "data.csv",
                            "content_type": "text/csv",
                            "byte_size": None,
                            "checksum": None,
                            "etag": None,
                            "upload_state": "pending",
                            "scan_state": "pending",
                            "download_state": "unavailable",
                        }
                    ],
                },
                status=Statuses.PENDING,
            )
        )
        db.commit()

    client.app.state.storage.write_bytes(storage_key, b"a,b\n1,2\n")
    scan_calls = []
    monkeypatch.setattr(
        "app.routers.dataset.scan_uploaded_files",
        lambda **kwargs: scan_calls.append(kwargs),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 202
    assert scan_calls[0]["storage_keys"] == [storage_key]
    with db_session_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        obj = dataset.dataset_metadata["objects"][0]
        assert obj["upload_state"] == "uploaded"
        assert obj["byte_size"] == 8


def test_upload_url_returns_direct_s3_upload_contract(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)
    storage = _FakeS3Storage()
    monkeypatch.setattr(client.app.state, "storage", storage)
    monkeypatch.setattr(
        client.app.state,
        "settings",
        replace(
            client.app.state.settings,
            upload=replace(client.app.state.settings.upload, expires_seconds=120),
        ),
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "S3 dataset",
            "description": {"field": "value"},
            "filenames": ["folder/data.csv"],
            "content_types": ["text/csv"],
            "byte_sizes": [8],
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    contract = body["upload_contracts"][0]
    assert body["presigned_urls"] == [
        "https://s3.example/quarantine/"
        f"{contract['object_key'].split('/')[1]}/folder/data.csv?signature=abc"
    ]
    assert contract["method"] == "PUT"
    assert contract["url"].startswith("https://s3.example/quarantine/")
    assert contract["object_key"].startswith("quarantine/")
    assert contract["original_path"] == "folder/data.csv"
    assert contract["content_type"] == "text/csv"
    assert contract["headers"] == {"Content-Type": "text/csv"}
    assert contract["expires_seconds"] == 120
    assert storage.upload_url_calls[0]["content_type"] == "text/csv"
    assert storage.upload_url_calls[0]["expires_seconds"] == 120

    with db_session_factory() as db:
        dataset = db.get(Dataset, uuid.UUID(body["id"]))
        obj = dataset.dataset_metadata["objects"][0]
        assert obj["backend"] == "s3"
        assert obj["bucket"] == "datasets"
        assert obj["object_key"] == contract["object_key"]
        assert obj["quarantine_key"] == contract["object_key"]
        assert obj["original_path"] == "folder/data.csv"
        assert obj["byte_size"] == 8
        assert obj["upload_state"] == "pending"


def test_confirm_upload_verifies_s3_object_and_blocks_scan_on_failure(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)
    storage = _FakeS3Storage()
    monkeypatch.setattr(client.app.state, "storage", storage)

    create_response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "S3 dataset",
            "filenames": ["data.csv"],
            "content_types": ["text/csv"],
            "byte_sizes": [8],
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    dataset_id = uuid.UUID(create_response.json()["id"])
    storage_key = create_response.json()["upload_contracts"][0]["object_key"]
    scan_calls = []
    monkeypatch.setattr(
        "app.routers.dataset.scan_uploaded_files",
        lambda **kwargs: scan_calls.append(kwargs),
    )

    failed_response = client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert failed_response.status_code == 400
    assert scan_calls == []
    assert storage.verify_calls[0] == {
        "storage_key": storage_key,
        "expected_size": 8,
        "expected_content_type": "text/csv",
        "expected_etag": None,
    }

    storage.objects[storage_key] = ObjectMetadata(
        backend="s3",
        bucket="datasets",
        storage_key=storage_key,
        byte_size=8,
        content_type="text/csv",
        etag="etag-1",
    )

    success_response = client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        json={"etags": ["etag-1"]},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert success_response.status_code == 202
    assert scan_calls[0]["storage_keys"] == [storage_key]


def test_upload_url_accepts_unsupported_format_and_persists_content_type(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)
    filename = "dataset.customblob"
    expected_storage_key = f"datasets/fixed_{filename}"

    monkeypatch.setattr(
        client.app.state.storage,
        "create_upload_target",
        lambda _filename, **kwargs: UploadTarget(
            storage_key=expected_storage_key,
            local_path=Path(f"/tmp/{expected_storage_key}"),
        ),
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "Unsupported but accepted",
            "description": {"field": "value"},
            "filenames": [filename],
            "content_types": ["application/x-custom-dataset"],
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201
    dataset_id = uuid.UUID(response.json()["id"])

    with db_session_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        assert dataset is not None
        metadata = dataset.dataset_metadata
        assert metadata["field"] == "value"
        assert metadata["filenames"] == [filename]
        assert metadata["content_types"] == ["application/x-custom-dataset"]
        assert metadata["storage_keys"] == [expected_storage_key]
        assert metadata["storage_schema_version"] == 1
        _assert_dataset_object(
            metadata,
            original_path=filename,
            storage_key=expected_storage_key,
            content_type="application/x-custom-dataset",
        )
        assert dataset.status == Statuses.PENDING


def test_upload_url_requires_authentication(client: TestClient):
    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "My dataset",
            "description": "any description",
            "filenames": ["sample.csv"],
        },
    )

    assert response.status_code == 401


def test_upload_url_returns_400_when_required_metadata_missing(
    client: TestClient, db_session_factory
):
    access_token = _create_access_token_for_user(db_session_factory, uuid.uuid4())

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "My dataset",
            "description": "any description",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 400


def test_upload_url_rejects_duplicate_original_paths(
    client: TestClient, db_session_factory
):
    access_token = _create_access_token_for_user(db_session_factory, uuid.uuid4())

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "Duplicate paths",
            "description": "any description",
            "filenames": ["data.csv", "data.csv"],
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Duplicate original paths are not allowed"}


def test_upload_url_rolls_back_and_returns_500_on_db_commit_failure(monkeypatch):
    uploader_id = uuid.uuid4()

    class FailingDBSession:
        def __init__(self):
            self.rollback_called = False

        def add(self, _value):
            return None

        def commit(self):
            raise SQLAlchemyError("db failure")

        def refresh(self, _value):
            raise AssertionError("refresh should not be reached after failed commit")

        def rollback(self):
            self.rollback_called = True

    failing_db = FailingDBSession()

    def override_get_db():
        yield failing_db

    async def override_current_user():
        return UserSchema(
            id=uploader_id,
            email="uploader@example.com",
            username="uploader",
            first_name="Upload",
            last_name="User",
            role=Roles.USER,
            created_at=datetime.now(timezone.utc),
            datasets=[],
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_active_user] = override_current_user
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/datasets/upload-url",
                json={
                    "name": "My dataset",
                    "description": "any description",
                    "filenames": ["sample.csv"],
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to create dataset record"}
    assert failing_db.rollback_called is True


def test_upload_url_handles_folder_structure(
    client: TestClient, db_session_factory, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_session_factory, uploader_id)

    # Simulate a folder upload with nested files
    filenames = ["folder/data.csv", "folder/sub/meta.txt"]

    captured_prefixes = []

    def fake_create_upload_target(filename: str, prefix: str | None = None):
        captured_prefixes.append(prefix)
        # Sanitization is handled by the backend but mocked here for simplicity.
        return UploadTarget(
            storage_key=f"datasets/{prefix}/{filename}",
            local_path=Path(f"/tmp/{prefix}/{filename}"),
        )

    monkeypatch.setattr(
        client.app.state.storage, "create_upload_target", fake_create_upload_target
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "Folder dataset",
            "description": {"text": "Testing nested paths"},
            "filenames": filenames,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201
    body = response.json()

    # Verify both files share the same prefix
    assert len(captured_prefixes) == 2
    assert captured_prefixes[0] == captured_prefixes[1]
    assert captured_prefixes[0] is not None

    # Verify the presigned URLs have the correct structure
    prefix = captured_prefixes[0]
    assert body["presigned_urls"][0].endswith(f"datasets/{prefix}/folder/data.csv")
    assert body["presigned_urls"][1].endswith(f"datasets/{prefix}/folder/sub/meta.txt")

    with db_session_factory() as db:
        dataset = db.get(Dataset, uuid.UUID(body["id"]))
        metadata = dataset.dataset_metadata
        assert metadata["filenames"] == filenames
        assert metadata["storage_keys"] == [
            f"datasets/{prefix}/folder/data.csv",
            f"datasets/{prefix}/folder/sub/meta.txt",
        ]
        assert metadata["storage_schema_version"] == 1
        _assert_dataset_object(
            metadata,
            original_path="folder/data.csv",
            storage_key=f"datasets/{prefix}/folder/data.csv",
        )
        _assert_dataset_object(
            metadata,
            original_path="folder/sub/meta.txt",
            storage_key=f"datasets/{prefix}/folder/sub/meta.txt",
        )
