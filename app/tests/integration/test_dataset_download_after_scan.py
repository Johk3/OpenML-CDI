import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import app.services.scan as scan_service
import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import StorageSettings
from app.database import get_db
from app.database.models import Dataset, Roles, Statuses, User
from app.main import app
from app.security import create_access_token
from app.storage.local import LocalStorageBackend
from app.storage.s3 import S3StorageBackend


@pytest.fixture
def download_client(monkeypatch, db_test_session, tmp_path):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("QUARANTINE_DIR", str(tmp_path / "quarantine"))
    monkeypatch.setenv("CLAMD_HOST", "clamd.internal")
    monkeypatch.setenv("CLAMD_PORT", "3322")
    monkeypatch.setenv("CLAMD_TIMEOUT_SECONDS", "4.5")

    def override_get_db():
        yield db_test_session

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(
        "app.routers.dataset.SessionLocal",
        lambda: Session(bind=db_test_session.bind),
    )
    monkeypatch.setattr(
        "app.routers.dataset.create_issue_for_dataset", lambda **_: None
    )
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


class _FakeClamDClient:
    def __init__(self, response=None, error: Exception | None = None):
        self.response = response
        self.error = error

    def scan(self, _file_path: str):
        if self.error:
            raise self.error
        return self.response


class _MemoryBody:
    def __init__(self, data: bytes):
        self._data = data
        self._position = 0
        self.closed = False

    def read(self, size=-1):
        if size is None or size < 0:
            size = len(self._data) - self._position
        start = self._position
        end = min(self._position + size, len(self._data))
        chunk = self._data[start:end]
        self._position = end
        return chunk

    def close(self):
        self.closed = True


class _MemoryS3Client:
    def __init__(self):
        self.objects: dict[str, dict[str, bytes | str | None]] = {}

    def put_object(self, **kwargs):
        body = kwargs["Body"]
        if hasattr(body, "read"):
            body = body.read()
        key = kwargs["Key"]
        etag = f"etag-{len(body)}"
        self.objects[key] = {
            "body": bytes(body),
            "content_type": kwargs.get("ContentType"),
            "etag": etag,
        }
        return {"ETag": f'"{etag}"'}

    def get_object(self, **kwargs):
        obj = self._object_or_raise(kwargs["Key"])
        return {"Body": _MemoryBody(obj["body"])}

    def head_object(self, **kwargs):
        obj = self._object_or_raise(kwargs["Key"])
        return {
            "ContentLength": len(obj["body"]),
            "ContentType": obj["content_type"],
            "ETag": f'"{obj["etag"]}"',
        }

    def copy_object(self, **kwargs):
        source_key = kwargs["CopySource"]["Key"]
        source = self._object_or_raise(source_key)
        self.objects[kwargs["Key"]] = dict(source)
        return {"CopyObjectResult": {"ETag": f'"{source["etag"]}"'}}

    def delete_object(self, **kwargs):
        self.objects.pop(kwargs["Key"], None)
        return {}

    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
        return f"https://signed.example/{ClientMethod}/{Params['Key']}?ttl={ExpiresIn}"

    def _object_or_raise(self, key: str):
        try:
            return self.objects[key]
        except KeyError as error:
            raise ClientError(
                {
                    "Error": {
                        "Code": "NoSuchKey",
                        "Message": f"Object not found: {key}",
                    }
                },
                "GetObject",
            ) from error


def _storage_for_backend(backend_name: str, tmp_path: Path):
    if backend_name == "local":
        return LocalStorageBackend(tmp_path / "uploads")
    if backend_name == "s3":
        return S3StorageBackend(
            StorageSettings(
                backend="s3",
                s3_bucket="datasets",
                s3_region="eu-west-1",
            ),
            client=_MemoryS3Client(),
        )
    raise AssertionError(f"Unsupported backend: {backend_name}")


def _put_upload_object(storage, storage_key: str, payload: bytes) -> None:
    storage.write_bytes(storage_key, payload)


def _headers_for_user(
    db_test_session,
    *,
    email: str,
    username: str,
    role: Roles = Roles.USER,
) -> tuple[uuid.UUID, dict[str, str]]:
    user_id = uuid.uuid4()
    db_test_session.add(
        User(
            id=user_id,
            email=email,
            username=username,
            first_name="Dataset",
            last_name="User",
            role=role,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(user_id), "type": "access"})
    return user_id, {"Authorization": f"Bearer {access_token}"}


def _patch_clean_scan(monkeypatch) -> None:
    monkeypatch.setattr(
        scan_service,
        "_get_clamd_client",
        lambda **_kwargs: _FakeClamDClient({"ignored": ("OK", None)}),
    )


def _promote_upload(
    client: TestClient,
    *,
    headers: dict[str, str],
    name: str,
    files: dict[str, bytes],
    directory_structure: dict | None = None,
) -> uuid.UUID:
    upload_response = client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": name,
            "filenames": list(files),
            "byte_sizes": [len(payload) for payload in files.values()],
            "directory_structure": directory_structure,
        },
    )
    assert upload_response.status_code == 201
    body = upload_response.json()
    for contract in body["upload_contracts"]:
        _put_upload_object(
            client.app.state.storage,
            contract["object_key"],
            files[contract["original_path"]],
        )

    confirm_response = client.post(
        f"/api/datasets/{body['id']}/confirm-upload",
        headers=headers,
    )
    assert confirm_response.status_code == 202
    return uuid.UUID(body["id"])


def _download(client: TestClient, dataset_id: uuid.UUID, headers: dict[str, str]):
    return client.get(
        f"/api/datasets/{dataset_id}/download",
        headers=headers,
    )


def _dataset_detail(client: TestClient, dataset_id: uuid.UUID, headers: dict[str, str]):
    return client.get(
        f"/api/datasets/{dataset_id}",
        headers=headers,
    )


@pytest.mark.parametrize("backend_name", ["local", "s3"])
def test_clean_promoted_dataset_downloads_for_owner_and_expert_after_scan(
    download_client, db_test_session, monkeypatch, tmp_path, backend_name
):
    download_client.app.state.storage = _storage_for_backend(backend_name, tmp_path)
    _patch_clean_scan(monkeypatch)
    _owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-owner@example.com",
        username=f"{backend_name}-owner",
    )
    _expert_id, expert_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-expert@example.com",
        username=f"{backend_name}-expert",
        role=Roles.EXPERT,
    )
    _other_id, other_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-other@example.com",
        username=f"{backend_name}-other",
    )
    payload = b"feature,target\n1,0\n"

    dataset_id = _promote_upload(
        download_client,
        headers=owner_headers,
        name=f"{backend_name} clean dataset",
        files={"clean.csv": payload},
    )

    owner_response = _download(download_client, dataset_id, owner_headers)
    expert_response = _download(download_client, dataset_id, expert_headers)
    other_response = _download(download_client, dataset_id, other_headers)
    detail_response = _dataset_detail(download_client, dataset_id, owner_headers)

    assert owner_response.status_code == 200
    assert owner_response.content == payload
    assert owner_response.headers["content-disposition"] == (
        "attachment; filename=clean.csv"
    )
    assert expert_response.status_code == 200
    assert expert_response.content == payload
    assert other_response.status_code == 403
    assert detail_response.status_code == 200
    assert detail_response.json()["download_url"] == (
        f"/api/datasets/{dataset_id}/download"
    )


@pytest.mark.parametrize("backend_name", ["local", "s3"])
def test_clean_promoted_multi_file_upload_downloads_as_original_folder_zip(
    download_client, db_test_session, monkeypatch, tmp_path, backend_name
):
    download_client.app.state.storage = _storage_for_backend(backend_name, tmp_path)
    _patch_clean_scan(monkeypatch)
    _owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-folder-owner@example.com",
        username=f"{backend_name}-folder-owner",
    )

    dataset_id = _promote_upload(
        download_client,
        headers=owner_headers,
        name=f"{backend_name} folder dataset",
        files={
            "dataset/train/one.csv": b"one",
            "dataset/test/two.csv": b"two",
        },
        directory_structure={
            "compressed": False,
            "root": "dataset",
            "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
        },
    )

    response = _download(download_client, dataset_id, owner_headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == [
            "dataset/test/two.csv",
            "dataset/train/one.csv",
        ]
        assert archive.read("dataset/train/one.csv") == b"one"
        assert archive.read("dataset/test/two.csv") == b"two"


@pytest.mark.parametrize("backend_name", ["local", "s3"])
def test_rejected_promoted_dataset_is_not_downloadable(
    download_client, db_test_session, monkeypatch, tmp_path, backend_name
):
    download_client.app.state.storage = _storage_for_backend(backend_name, tmp_path)
    _patch_clean_scan(monkeypatch)
    _owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-rejected-owner@example.com",
        username=f"{backend_name}-rejected-owner",
    )
    dataset_id = _promote_upload(
        download_client,
        headers=owner_headers,
        name=f"{backend_name} rejected dataset",
        files={"clean.csv": b"clean"},
    )
    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.status = Statuses.REJECTED
    db_test_session.commit()

    response = _download(download_client, dataset_id, owner_headers)
    detail_response = _dataset_detail(download_client, dataset_id, owner_headers)

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset files are not available for download"}
    assert detail_response.status_code == 200
    assert detail_response.json()["download_url"] is None


@pytest.mark.parametrize("backend_name", ["local", "s3"])
def test_missing_promoted_object_is_not_downloadable(
    download_client, db_test_session, monkeypatch, tmp_path, backend_name
):
    download_client.app.state.storage = _storage_for_backend(backend_name, tmp_path)
    _patch_clean_scan(monkeypatch)
    _owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email=f"{backend_name}-missing-owner@example.com",
        username=f"{backend_name}-missing-owner",
    )
    dataset_id = _promote_upload(
        download_client,
        headers=owner_headers,
        name=f"{backend_name} missing object dataset",
        files={"clean.csv": b"clean"},
    )
    dataset = db_test_session.get(Dataset, dataset_id)
    final_key = dataset.dataset_metadata["objects"][0]["final_object_key"]
    download_client.app.state.storage.delete(final_key)

    response = _download(download_client, dataset_id, owner_headers)

    assert response.status_code == 404
    assert response.json() == {"detail": "Dataset file is missing from storage"}


def test_scan_failed_promoted_metadata_is_not_downloadable(
    download_client, db_test_session, tmp_path
):
    download_client.app.state.storage = _storage_for_backend("local", tmp_path)
    owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email="scan-failed-owner@example.com",
        username="scan-failed-owner",
    )
    dataset_id = uuid.uuid4()
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Scan failed dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["clean.csv"],
                "objects": [
                    {
                        "backend": "local",
                        "provider": "local",
                        "bucket": str(tmp_path / "uploads"),
                        "object_key": "datasets/batch/clean.csv",
                        "quarantine_key": "datasets/batch/clean.csv",
                        "final_object_key": "ready/dataset/clean.csv",
                        "original_path": "clean.csv",
                        "content_type": None,
                        "byte_size": 5,
                        "checksum": None,
                        "etag": None,
                        "upload_state": "uploaded",
                        "scan_state": "error",
                        "download_state": "unavailable",
                    }
                ],
            },
            status=Statuses.INTEGRATION_FAILED,
        )
    )
    db_test_session.commit()

    response = _download(download_client, dataset_id, owner_headers)

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset files are not available for download"}


def test_legacy_metadata_is_not_downloadable_without_scan_promotion(
    download_client, db_test_session, tmp_path
):
    download_client.app.state.storage = _storage_for_backend("local", tmp_path)
    owner_id, owner_headers = _headers_for_user(
        db_test_session,
        email="legacy-owner@example.com",
        username="legacy-owner",
    )
    dataset_id = uuid.uuid4()
    storage_key = "datasets/legacy.csv"
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Legacy dataset",
            owner_id=owner_id,
            dataset_metadata={
                "filenames": ["legacy.csv"],
                "storage_keys": [storage_key],
            },
            status=Statuses.APPROVED,
        )
    )
    db_test_session.commit()
    download_client.app.state.storage.write_bytes(storage_key, b"legacy")

    response = _download(download_client, dataset_id, owner_headers)
    detail_response = _dataset_detail(download_client, dataset_id, owner_headers)

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset files are not available for download"}
    assert detail_response.status_code == 200
    assert detail_response.json()["download_url"] is None
