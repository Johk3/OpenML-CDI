import uuid
from pathlib import Path

from sqlalchemy.orm import Session

import app.services.scan as scan_service
from app.database.models import Dataset, Statuses
from app.storage.local import LocalStorageBackend


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


def _create_dataset(
    db_session,
    *,
    filename: str,
    storage_key: str,
) -> Dataset:
    dataset = Dataset(
        id=uuid.uuid4(),
        title="Dataset under scan",
        owner_id=uuid.uuid4(),
        dataset_metadata={
            "filenames": [filename],
            "storage_keys": [storage_key],
        },
        status=Statuses.PENDING,
    )
    db_session.add(dataset)
    db_session.commit()
    return dataset


def _patch_clamd_client(monkeypatch, fake_client: _FakeClamDClient):
    captured = {}

    def fake_get_client(**kwargs):
        captured.update(kwargs)
        return fake_client

    monkeypatch.setattr(scan_service, "_get_clamd_client", fake_get_client)
    return captured


def _run_scan(
    *,
    db_test_session,
    dataset: Dataset,
    storage: LocalStorageBackend,
    storage_keys: list[str],
    quarantine_dir: Path,
    final_dir: Path,
) -> None:
    scan_service.scan_uploaded_files(
        dataset_id=dataset.id,
        storage_keys=storage_keys,
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        clamd_socket="",
        clamd_host="clamd.internal",
        clamd_port=3322,
        clamd_timeout_seconds=4.5,
        storage=storage,
        db_factory=lambda: Session(bind=db_test_session.bind),
    )


def test_scan_uploaded_clean_file_moves_to_dataset_ready_dir_and_stays_pending(
    db_test_session, tmp_path: Path, monkeypatch
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/clean.csv"
    payload = b"feature,target\n1,0\n"
    storage.write_bytes(storage_key, payload)

    dataset = _create_dataset(
        db_test_session,
        filename="clean.csv",
        storage_key=storage_key,
    )
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    fake_client = _FakeClamDClient(response={"ignored": ("OK", None)})
    clamd_kwargs = _patch_clamd_client(monkeypatch, fake_client)

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
    )

    db_test_session.refresh(dataset)
    assert clamd_kwargs == {
        "clamd_socket": "",
        "clamd_host": "clamd.internal",
        "clamd_port": 3322,
        "clamd_timeout_seconds": 4.5,
    }
    assert len(fake_client.scanned_paths) == 1
    assert Path(fake_client.scanned_paths[0]).name.endswith("_clean.csv")
    assert not list(quarantine_dir.glob("*"))
    assert (final_dir / str(dataset.id) / "clean.csv").read_bytes() == payload
    assert dataset.status == Statuses.PENDING
    assert dataset.dataset_metadata["malware_scan"] == {
        "files": [
            {
                "status": "clean",
                "engine": "clamav",
                "file": "clean.csv",
            }
        ],
        "engine": "clamav",
    }


def test_scan_uploaded_clean_file_marks_object_downloadable(
    db_test_session, tmp_path: Path, monkeypatch
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/clean.csv"
    storage.write_bytes(storage_key, b"feature,target\n1,0\n")

    dataset = Dataset(
        id=uuid.uuid4(),
        title="Dataset under scan",
        owner_id=uuid.uuid4(),
        dataset_metadata={
            "filenames": ["clean.csv"],
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
                    "original_path": "clean.csv",
                    "content_type": "text/csv",
                    "byte_size": 19,
                    "checksum": None,
                    "etag": None,
                    "upload_state": "uploaded",
                    "scan_state": "pending",
                    "download_state": "unavailable",
                }
            ],
        },
        status=Statuses.PENDING,
    )
    db_test_session.add(dataset)
    db_test_session.commit()
    _patch_clamd_client(
        monkeypatch, _FakeClamDClient(response={"ignored": ("OK", None)})
    )

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=tmp_path / "quarantine",
        final_dir=tmp_path / "ready",
    )

    db_test_session.refresh(dataset)
    obj = dataset.dataset_metadata["objects"][0]
    assert obj["upload_state"] == "promoted"
    assert obj["scan_state"] == "clean"
    assert obj["final_object_key"] == f"ready/{dataset.id}/clean.csv"
    assert obj["download_state"] == "downloadable"


def test_scan_uploaded_nested_folder_preserves_structure(
    db_test_session, tmp_path: Path, monkeypatch
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/folder/sub/data.csv"
    payload = b"nested data"
    storage.write_bytes(storage_key, payload)

    dataset = _create_dataset(
        db_test_session,
        filename="folder/sub/data.csv",
        storage_key=storage_key,
    )
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    _patch_clamd_client(
        monkeypatch, _FakeClamDClient(response={"ignored": ("OK", None)})
    )

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
    )

    db_test_session.refresh(dataset)
    expected_path = final_dir / str(dataset.id) / "folder/sub/data.csv"
    assert expected_path.read_bytes() == payload
    assert dataset.status == Statuses.PENDING
    assert dataset.dataset_metadata["malware_scan"]["files"][0]["file"] == (
        "folder/sub/data.csv"
    )


def test_scan_infected_file_quarantines_and_deletes_copy(
    db_test_session,
    tmp_path: Path,
    monkeypatch,
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/infected.csv"
    payload = b"col\ninfected-content\n"
    storage.write_bytes(storage_key, payload)

    dataset = _create_dataset(
        db_test_session,
        filename="infected.csv",
        storage_key=storage_key,
    )
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    fake_client = _FakeClamDClient(
        response={"ignored": ("FOUND", "Eicar-Test-Signature")},
    )
    _patch_clamd_client(monkeypatch, fake_client)

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
    )

    db_test_session.refresh(dataset)
    assert not list(quarantine_dir.glob("*"))
    assert not (final_dir / str(dataset.id) / "infected.csv").exists()
    assert dataset.status == Statuses.QUARANTINED
    assert dataset.dataset_metadata["malware_scan"] == {
        "files": [
            {
                "status": "infected",
                "engine": "clamav",
                "signature": "Eicar-Test-Signature",
                "file": "infected.csv",
            }
        ],
        "engine": "clamav",
    }


def test_scan_uploaded_when_clamd_is_unreachable_marks_quarantined_safely(
    db_test_session, tmp_path: Path, monkeypatch
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/unreachable.csv"
    storage.write_bytes(storage_key, b"feature,target\n2,1\n")

    dataset = _create_dataset(
        db_test_session,
        filename="unreachable.csv",
        storage_key=storage_key,
    )
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    connection_error = scan_service.clamd.ConnectionError("offline")
    fake_client = _FakeClamDClient(error=connection_error)
    _patch_clamd_client(monkeypatch, fake_client)

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
    )

    db_test_session.refresh(dataset)
    assert not list(quarantine_dir.glob("*"))
    assert not (final_dir / str(dataset.id) / "unreachable.csv").exists()
    assert dataset.status == Statuses.QUARANTINED
    scan_result = dataset.dataset_metadata["malware_scan"]["files"][0]
    assert scan_result["status"] == "error"
    assert scan_result["engine"] == "clamav"
    assert scan_result["file"] == "unreachable.csv"
    assert "ClamAV unavailable" in scan_result["message"]


def test_scan_uploaded_missing_file_marks_quarantined(
    db_test_session, tmp_path: Path, monkeypatch
):
    storage = LocalStorageBackend(tmp_path / "uploads")
    storage_key = "datasets/batch123/missing.csv"

    dataset = _create_dataset(
        db_test_session,
        filename="missing.csv",
        storage_key=storage_key,
    )
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    fake_client = _FakeClamDClient(response={"ignored": ("OK", None)})
    _patch_clamd_client(monkeypatch, fake_client)

    _run_scan(
        db_test_session=db_test_session,
        dataset=dataset,
        storage=storage,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
    )

    db_test_session.refresh(dataset)
    assert fake_client.scanned_paths == []
    assert dataset.status == Statuses.QUARANTINED
    scan_result = dataset.dataset_metadata["malware_scan"]["files"][0]
    assert scan_result["status"] == "missing"
    assert scan_result["engine"] == "clamav"
    assert scan_result["file"] == "missing.csv"
