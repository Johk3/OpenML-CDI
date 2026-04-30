import uuid
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
from app.storage.types import UploadTarget


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
    assert set(body.keys()) == {"id", "presigned_urls", "dataset_url"}
    assert body["presigned_urls"][0] == (
        f"http://testserver/api/datasets/upload/{expected_storage_key}"
    )
    dataset_id = uuid.UUID(body["id"])

    with db_session_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        assert dataset is not None
        assert dataset.title == "My dataset"
        assert dataset.dataset_metadata == {
            "field": "value",
            "filenames": [filename],
            "storage_keys": [expected_storage_key],
        }
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
        assert dataset.dataset_metadata == {
            "field": "value",
            "filenames": [filename],
            "content_types": ["application/x-custom-dataset"],
            "storage_keys": [expected_storage_key],
        }
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
        # Verify sanitization happens (handled by backend but mocked here for simplicity)
        return UploadTarget(
            storage_key=f"datasets/{prefix}/{filename}",
            local_path=Path(f"/tmp/{prefix}/{filename}"),
        )

    monkeypatch.setattr(
        client.app.state.storage,
        "create_upload_target",
        fake_create_upload_target
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
