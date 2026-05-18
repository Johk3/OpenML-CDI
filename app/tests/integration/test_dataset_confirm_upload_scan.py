import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import app.services.scan as scan_service
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models import Dataset, Roles, Statuses, User
from app.main import app
from app.security import create_access_token


@pytest.fixture
def scan_client(monkeypatch, db_test_session, tmp_path):
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
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


class _FakeClamDClient:
    def __init__(self, response=None, error: Exception | None = None):
        self.response = response
        self.error = error
        self.scanned_paths: list[str] = []

    def scan(self, file_path: str):
        self.scanned_paths.append(file_path)
        if self.error:
            raise self.error
        return self.response


def _create_access_token_for_user(
    db_test_session, user_id: uuid.UUID, *, role: Roles = Roles.USER
) -> str:
    db_test_session.add(
        User(
            id=user_id,
            email=f"{role.value}-{user_id}@example.com",
            username=f"{role.value}-{str(user_id)[:8]}",
            first_name="Upload",
            last_name="User",
            role=role,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.commit()
    return create_access_token({"sub": str(user_id), "type": "access"})


def _seed_pending_dataset(
    db_test_session,
    *,
    owner_id: uuid.UUID,
    dataset_id: uuid.UUID,
    filename: str,
    storage_key: str,
) -> None:
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Dataset awaiting scan",
            owner_id=owner_id,
            dataset_metadata={
                "filename": filename,
                "storage_key": storage_key,
            },
            status=Statuses.PENDING,
        )
    )
    db_test_session.commit()


def _patch_clamd(monkeypatch, fake_client: _FakeClamDClient) -> None:
    monkeypatch.setattr(
        scan_service,
        "_get_clamd_client",
        lambda **_kwargs: fake_client,
    )


def _confirm_upload(scan_client: TestClient, dataset_id: uuid.UUID, access_token: str):
    return scan_client.post(
        f"/api/datasets/{dataset_id}/confirm-upload",
        headers={"Authorization": f"Bearer {access_token}"},
    )


def _zip_bytes(entries: dict[str, bytes]) -> bytes:
    payload = BytesIO()
    with ZipFile(payload, "w") as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return payload.getvalue()


def test_confirm_upload_promotes_clean_file_and_marks_dataset_pending_review(
    scan_client: TestClient, db_test_session, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_test_session, uploader_id)
    dataset_id = uuid.uuid4()
    storage_key = "datasets/clean.csv"
    payload = b"feature,target\n1,0\n"

    _seed_pending_dataset(
        db_test_session,
        owner_id=uploader_id,
        dataset_id=dataset_id,
        filename="clean.csv",
        storage_key=storage_key,
    )
    scan_client.app.state.storage.write_bytes(storage_key, payload)

    fake_client = _FakeClamDClient({"ignored": ("OK", None)})
    _patch_clamd(monkeypatch, fake_client)

    response = _confirm_upload(scan_client, dataset_id, access_token)

    assert response.status_code == 202
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.status == Statuses.PENDING_REVIEW
    assert dataset.dataset_metadata["malware_scan"] == {
        "files": [
            {
                "status": "clean",
                "engine": "clamav",
                "file": "clean.csv",
                "final_object_key": f"ready/{dataset_id}/clean.csv",
            }
        ],
        "engine": "clamav",
    }
    final_path = (
        Path(scan_client.app.state.settings.storage.local_upload_dir)
        / "ready"
        / str(dataset_id)
        / "clean.csv"
    )
    assert final_path.read_bytes() == payload
    assert len(fake_client.scanned_paths) == 1
    assert Path(fake_client.scanned_paths[0]).name.endswith("_clean.csv")
    quarantine_dir = Path(scan_client.app.state.settings.storage.quarantine_dir)
    assert not list(quarantine_dir.glob("*"))


def test_confirm_upload_promotes_clean_file_when_storage_key_is_sanitized(
    scan_client: TestClient, db_test_session, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_test_session, uploader_id)
    payload = b"%PDF-1.7 sample"
    filename = "Fundamentals of Software Architecture sample.pdf"
    headers = {"Authorization": f"Bearer {access_token}"}

    upload_response = scan_client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Architecture Book",
            "filenames": [filename],
            "content_types": ["application/pdf"],
            "byte_sizes": [len(payload)],
        },
    )
    assert upload_response.status_code == 201
    body = upload_response.json()
    dataset_id = uuid.UUID(body["id"])
    storage_key = body["upload_contracts"][0]["object_key"]
    assert storage_key.endswith("Fundamentals_of_Software_Architecture_sample.pdf")
    scan_client.app.state.storage.write_bytes(storage_key, payload)

    fake_client = _FakeClamDClient({"ignored": ("OK", None)})
    _patch_clamd(monkeypatch, fake_client)

    response = _confirm_upload(scan_client, dataset_id, access_token)

    assert response.status_code == 202
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.status == Statuses.PENDING_REVIEW
    scan_file = dataset.dataset_metadata["malware_scan"]["files"][0]
    assert scan_file["status"] == "clean"
    assert scan_file["file"] == "Fundamentals_of_Software_Architecture_sample.pdf"
    assert scan_file["final_object_key"].endswith(
        "/Fundamentals_of_Software_Architecture_sample.pdf"
    )
    obj = dataset.dataset_metadata["objects"][0]
    assert obj["original_path"] == filename
    assert obj["upload_state"] == "promoted"
    assert obj["scan_state"] == "clean"
    assert obj["download_state"] == "downloadable"
    assert obj["final_object_key"] == scan_file["final_object_key"]

    expert_token = _create_access_token_for_user(
        db_test_session, uuid.uuid4(), role=Roles.EXPERT
    )
    approve_response = scan_client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "approved"},
        headers={"Authorization": f"Bearer {expert_token}"},
    )
    assert approve_response.status_code == 200
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.APPROVED


def test_confirm_upload_rejects_zip_entries_that_do_not_match_manifest(
    scan_client: TestClient, db_test_session, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_test_session, uploader_id)
    zip_payload = _zip_bytes({"dataset/unexpected.csv": b"wrong"})
    headers = {"Authorization": f"Bearer {access_token}"}

    upload_response = scan_client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Folder Dataset",
            "filenames": ["Folder_Dataset_files.zip"],
            "content_types": ["application/zip"],
            "byte_sizes": [len(zip_payload)],
            "directory_structure": {
                "compressed": True,
                "root": "dataset",
                "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
                "archive_path": "Folder_Dataset_files.zip",
                "manifest": {"version": 1, "path_count": 2},
            },
        },
    )
    assert upload_response.status_code == 201
    body = upload_response.json()
    dataset_id = uuid.UUID(body["id"])
    storage_key = body["upload_contracts"][0]["object_key"]
    scan_client.app.state.storage.write_bytes(storage_key, zip_payload)
    fake_client = _FakeClamDClient({"ignored": ("OK", None)})
    _patch_clamd(monkeypatch, fake_client)

    response = _confirm_upload(scan_client, dataset_id, access_token)

    assert response.status_code == 400
    assert response.json() == {
        "detail": "ZIP archive entries must match directory_structure paths"
    }
    assert fake_client.scanned_paths == []
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id) is None


def test_confirm_upload_marks_dataset_quarantined_when_file_is_infected(
    scan_client: TestClient, db_test_session, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_test_session, uploader_id)
    dataset_id = uuid.uuid4()
    storage_key = "datasets/infected.csv"

    _seed_pending_dataset(
        db_test_session,
        owner_id=uploader_id,
        dataset_id=dataset_id,
        filename="infected.csv",
        storage_key=storage_key,
    )
    scan_client.app.state.storage.write_bytes(storage_key, b"infected-bytes")

    fake_client = _FakeClamDClient({"ignored": ("FOUND", "Eicar-Test-Signature")})
    _patch_clamd(
        monkeypatch,
        fake_client,
    )

    response = _confirm_upload(scan_client, dataset_id, access_token)

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded file failed malware scan"}
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.status == Statuses.QUARANTINED
    assert dataset.dataset_metadata["malware_scan"]["files"][0]["status"] == "infected"
    assert dataset.dataset_metadata["objects"][0]["scan_state"] == "infected"
    assert dataset.dataset_metadata["objects"][0]["download_state"] == "unavailable"
    final_path = (
        Path(scan_client.app.state.settings.storage.local_upload_dir)
        / "ready"
        / str(dataset_id)
        / "infected.csv"
    )
    assert not final_path.exists()
    quarantine_dir = Path(scan_client.app.state.settings.storage.quarantine_dir)
    assert not list(quarantine_dir.glob("*"))


def test_confirm_upload_marks_dataset_quarantined_when_clamd_is_unavailable(
    scan_client: TestClient, db_test_session, monkeypatch
):
    uploader_id = uuid.uuid4()
    access_token = _create_access_token_for_user(db_test_session, uploader_id)
    dataset_id = uuid.uuid4()
    storage_key = "datasets/offline.csv"

    _seed_pending_dataset(
        db_test_session,
        owner_id=uploader_id,
        dataset_id=dataset_id,
        filename="offline.csv",
        storage_key=storage_key,
    )
    scan_client.app.state.storage.write_bytes(storage_key, b"feature,target\n2,1\n")

    _patch_clamd(
        monkeypatch,
        _FakeClamDClient(error=scan_service.clamd.ConnectionError("daemon offline")),
    )

    response = _confirm_upload(scan_client, dataset_id, access_token)

    assert response.status_code == 503
    assert response.json() == {"detail": "Upload scan could not be completed"}
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.status == Statuses.QUARANTINED
    assert dataset.dataset_metadata["malware_scan"]["files"][0]["status"] == "error"
    assert dataset.dataset_metadata["objects"][0]["scan_state"] == "error"
    assert dataset.dataset_metadata["objects"][0]["download_state"] == "unavailable"
    final_path = (
        Path(scan_client.app.state.settings.storage.local_upload_dir)
        / "ready"
        / str(dataset_id)
        / "offline.csv"
    )
    quarantine_dir = Path(scan_client.app.state.settings.storage.quarantine_dir)
    assert not final_path.exists()
    assert not list(quarantine_dir.glob("*"))
