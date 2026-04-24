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
                role=Roles.UPLOADER,
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
        lambda _filename: UploadTarget(
            storage_key=expected_storage_key,
            local_path=Path(f"/tmp/{expected_storage_key}"),
        ),
    )

    def fake_generate_presigned_put_url(
        object_key: str,
        *,
        bucket_name: str,
        region_name: str,
        expires_in_seconds: int,
    ):
        assert object_key == expected_storage_key
        assert bucket_name == "uploads"
        assert region_name == "default"
        assert expires_in_seconds == 3600
        return f"https://storage.example/upload/{object_key}?signature=test"

    monkeypatch.setattr(
        "app.routers.dataset.generate_presigned_put_url",
        fake_generate_presigned_put_url,
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "My dataset",
            "description": {"field": "value"},
            "filename": filename,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {"id", "presigned_url"}
    assert body["presigned_url"] == (
        f"https://storage.example/upload/{expected_storage_key}?signature=test"
    )
    dataset_id = uuid.UUID(body["id"])

    with db_session_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        assert dataset is not None
        assert dataset.title == "My dataset"
        assert dataset.dataset_metadata == {
            "field": "value",
            "filename": filename,
            "storage_key": expected_storage_key,
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
        "app.routers.dataset.scan_uploaded_file",
        lambda **kwargs: scan_calls.append(kwargs),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 202
    assert response.json() == {"message": "Upload confirmed, scan started"}
    assert len(scan_calls) == 1
    assert scan_calls[0]["dataset_id"] == dataset_id
    assert scan_calls[0]["file_path"] == (
        Path(client.app.state.settings.storage.local_upload_dir)
        / "datasets/generated_data.csv"
    )


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
        lambda _filename: UploadTarget(
            storage_key=expected_storage_key,
            local_path=Path(f"/tmp/{expected_storage_key}"),
        ),
    )
    monkeypatch.setattr(
        "app.routers.dataset.generate_presigned_put_url",
        lambda *_args, **_kwargs: "https://storage.example/upload/customblob",
    )

    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "Unsupported but accepted",
            "description": {"field": "value"},
            "filename": filename,
            "content_type": "application/x-custom-dataset",
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
            "filename": filename,
            "content_type": "application/x-custom-dataset",
            "storage_key": expected_storage_key,
        }
        assert dataset.status == Statuses.PENDING


def test_upload_url_requires_authentication(client: TestClient):
    response = client.post(
        "/api/datasets/upload-url",
        json={
            "name": "My dataset",
            "description": "any description",
            "filename": "sample.csv",
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
            role=Roles.UPLOADER,
            created_at=datetime.now(timezone.utc),
            datasets=[],
        )

    def fake_generate_presigned_put_url(**_kwargs):
        raise AssertionError("presigned URL should not be generated on DB failure")

    monkeypatch.setattr(
        "app.routers.dataset.generate_presigned_put_url",
        fake_generate_presigned_put_url,
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
                    "filename": "sample.csv",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to create dataset record"}
    assert failing_db.rollback_called is True
