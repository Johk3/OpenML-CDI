import uuid
from datetime import datetime, timezone
from pathlib import Path

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


def _create_access_token_for_user(db_test_session, user_id: uuid.UUID) -> str:
    db_test_session.add(
        User(
            id=user_id,
            email="uploader@example.com",
            username="uploader",
            first_name="Upload",
            last_name="User",
            role=Roles.USER,
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


def test_confirm_upload_deletes_dataset_when_file_is_infected(
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
    assert db_test_session.get(Dataset, dataset_id) is None
    final_path = (
        Path(scan_client.app.state.settings.storage.local_upload_dir)
        / "ready"
        / str(dataset_id)
        / "infected.csv"
    )
    assert not final_path.exists()
    quarantine_dir = Path(scan_client.app.state.settings.storage.quarantine_dir)
    assert not list(quarantine_dir.glob("*"))


def test_confirm_upload_deletes_dataset_when_clamd_is_unavailable(
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
    assert db_test_session.get(Dataset, dataset_id) is None
    final_path = (
        Path(scan_client.app.state.settings.storage.local_upload_dir)
        / "ready"
        / str(dataset_id)
        / "offline.csv"
    )
    quarantine_dir = Path(scan_client.app.state.settings.storage.quarantine_dir)
    assert not final_path.exists()
    assert not list(quarantine_dir.glob("*"))
