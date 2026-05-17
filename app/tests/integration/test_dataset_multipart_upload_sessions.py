import uuid
from datetime import datetime, timezone

import pytest

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token
from app.storage.errors import StorageVerificationError
from app.storage.types import MultipartPart, MultipartUpload, ObjectMetadata


class _MultipartStorage:
    bucket = "datasets"

    def __init__(self, verification_error: Exception | None = None):
        self.calls: list[tuple[str, dict]] = []
        self.verification_error = verification_error

    def backend_name(self) -> str:
        return "s3"

    def initiate_multipart_upload(
        self, storage_key: str, content_type: str | None = None
    ) -> MultipartUpload:
        self.calls.append(
            (
                "initiate_multipart_upload",
                {"storage_key": storage_key, "content_type": content_type},
            )
        )
        return MultipartUpload(storage_key=storage_key, upload_id="upload-1")

    def create_multipart_part_url(
        self,
        storage_key: str,
        upload_id: str,
        part_number: int,
        expires_seconds: int = 3600,
    ) -> str:
        self.calls.append(
            (
                "create_multipart_part_url",
                {
                    "storage_key": storage_key,
                    "upload_id": upload_id,
                    "part_number": part_number,
                    "expires_seconds": expires_seconds,
                },
            )
        )
        return f"https://signed.example/{upload_id}/{part_number}"

    def list_multipart_parts(
        self, storage_key: str, upload_id: str
    ) -> list[MultipartPart]:
        self.calls.append(
            (
                "list_multipart_parts",
                {"storage_key": storage_key, "upload_id": upload_id},
            )
        )
        return [
            MultipartPart(part_number=1, etag="etag-1", size=5),
            MultipartPart(part_number=2, etag="etag-2", size=7),
        ]

    def complete_multipart_upload(
        self,
        storage_key: str,
        upload_id: str,
        parts: list[dict[str, str | int]],
    ) -> ObjectMetadata:
        self.calls.append(
            (
                "complete_multipart_upload",
                {
                    "storage_key": storage_key,
                    "upload_id": upload_id,
                    "parts": parts,
                },
            )
        )
        return _object_metadata_response(storage_key)

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        self.calls.append(
            (
                "abort_multipart_upload",
                {"storage_key": storage_key, "upload_id": upload_id},
            )
        )

    def verify_object(
        self,
        storage_key: str,
        expected_size: int | None = None,
        expected_content_type: str | None = None,
        expected_etag: str | None = None,
    ) -> ObjectMetadata:
        self.calls.append(
            (
                "verify_object",
                {
                    "storage_key": storage_key,
                    "expected_size": expected_size,
                    "expected_content_type": expected_content_type,
                    "expected_etag": expected_etag,
                },
            )
        )
        if self.verification_error:
            raise self.verification_error
        return _object_metadata_response(storage_key)


def _object_metadata_response(storage_key: str) -> ObjectMetadata:
    return ObjectMetadata(
        backend="s3",
        bucket="datasets",
        storage_key=storage_key,
        byte_size=12,
        content_type="text/csv",
        etag="complete-etag",
    )


def _seed_dataset(
    db_test_session,
    *,
    owner_id: uuid.UUID,
    dataset_id: uuid.UUID,
    object_key: str,
    multipart_uploads: dict | None = None,
) -> None:
    db_test_session.add(
        User(
            id=owner_id,
            email=f"{owner_id}@example.com",
            username=f"user-{str(owner_id)[:8]}",
            first_name="Upload",
            last_name="User",
            role=Roles.USER,
            created_at=datetime.now(timezone.utc),
        )
    )
    metadata = {
        "filenames": ["large.csv"],
        "storage_keys": [object_key],
        "storage_schema_version": 1,
        "objects": [
            {
                "backend": "s3",
                "provider": "s3",
                "bucket": "datasets",
                "object_key": object_key,
                "quarantine_key": object_key,
                "final_object_key": None,
                "original_path": "large.csv",
                "content_type": "text/csv",
                "byte_size": 12,
                "checksum": None,
                "etag": None,
                "upload_state": "pending",
                "scan_state": "pending",
                "download_state": "unavailable",
            }
        ],
    }
    if multipart_uploads is not None:
        metadata["multipart_uploads"] = multipart_uploads
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Large dataset",
            owner_id=owner_id,
            dataset_metadata=metadata,
            status=Statuses.PENDING,
        )
    )
    db_test_session.commit()


def _headers(owner_id: uuid.UUID) -> dict[str, str]:
    token = create_access_token({"sub": str(owner_id), "type": "access"})
    return {"Authorization": f"Bearer {token}"}


def _active_upload(object_key: str) -> dict:
    return {
        "upload-1": {
            "object_key": object_key,
            "part_size": 8 * 1024 * 1024,
            "content_type": "text/csv",
            "expires_seconds": 3600,
            "status": "active",
        }
    }


def test_multipart_upload_session_lifecycle_exposes_s3_api(
    client, db_test_session, monkeypatch
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "quarantine/batch/large.csv"
    storage = _MultipartStorage()
    scan_calls = []
    client.app.state.storage = storage

    def fake_scan(**kwargs):
        scan_calls.append(kwargs)
        return {
            "files": [
                {
                    "status": "clean",
                    "engine": "clamav",
                    "file": "large.csv",
                    "final_object_key": f"ready/{dataset_id}/large.csv",
                }
            ],
            "engine": "clamav",
        }

    monkeypatch.setattr(
        "app.routers.dataset.scan_uploaded_files",
        fake_scan,
    )
    _seed_dataset(
        db_test_session,
        owner_id=owner_id,
        dataset_id=dataset_id,
        object_key=object_key,
    )

    initiate_response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads",
        headers=_headers(owner_id),
        json={
            "object_key": object_key,
            "content_type": "text/csv",
            "part_size": 8 * 1024 * 1024,
        },
    )
    assert initiate_response.status_code == 201
    assert initiate_response.json() == {
        "dataset_id": str(dataset_id),
        "object_key": object_key,
        "upload_id": "upload-1",
        "part_size": 8 * 1024 * 1024,
        "expires_seconds": 3600,
        "status": "active",
    }

    part_url_response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/parts/2/url",
        headers=_headers(owner_id),
        json={"object_key": object_key},
    )
    assert part_url_response.status_code == 201
    assert part_url_response.json() == {
        "url": "https://signed.example/upload-1/2",
        "method": "PUT",
        "headers": {},
        "expires_seconds": 3600,
    }

    parts_response = client.get(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/parts",
        headers=_headers(owner_id),
        params={"object_key": object_key},
    )
    assert parts_response.status_code == 200
    assert parts_response.json() == {
        "object_key": object_key,
        "upload_id": "upload-1",
        "parts": [
            {"part_number": 1, "etag": "etag-1", "size": 5},
            {"part_number": 2, "etag": "etag-2", "size": 7},
        ],
    }

    complete_response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/complete",
        headers=_headers(owner_id),
        json={
            "object_key": object_key,
            "parts": [
                {"part_number": 1, "etag": "etag-1"},
                {"part_number": 2, "etag": "etag-2"},
            ],
        },
    )

    assert complete_response.status_code == 202
    assert complete_response.json() == {
        "message": "Multipart upload completed and scan finished",
        "dataset_url": f"/datasets/{dataset_id}",
    }
    assert [name for name, _ in storage.calls] == [
        "initiate_multipart_upload",
        "create_multipart_part_url",
        "list_multipart_parts",
        "complete_multipart_upload",
        "verify_object",
    ]
    assert scan_calls and scan_calls[0]["storage_keys"] == [object_key]

    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.dataset_metadata["objects"][0]["upload_state"] == "uploaded"
    assert dataset.dataset_metadata["objects"][0]["etag"] == "complete-etag"
    assert (
        dataset.dataset_metadata["multipart_uploads"]["upload-1"]["status"]
        == "completed"
    )


def test_complete_multipart_upload_keeps_quarantined_dataset_when_scan_fails(
    client, db_test_session, monkeypatch
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "quarantine/batch/large.csv"
    storage = _MultipartStorage()
    client.app.state.storage = storage
    scan_result = {
        "files": [
            {
                "status": "infected",
                "engine": "clamav",
                "file": "large.csv",
                "signature": "Eicar-Test-Signature",
            }
        ],
        "engine": "clamav",
    }

    def fake_scan(**_kwargs):
        dataset = db_test_session.get(Dataset, dataset_id)
        metadata = dict(dataset.dataset_metadata)
        metadata["malware_scan"] = scan_result
        metadata["objects"][0]["upload_state"] = "uploaded"
        metadata["objects"][0]["scan_state"] = "infected"
        metadata["objects"][0]["download_state"] = "unavailable"
        metadata["objects"][0]["final_object_key"] = None
        dataset.dataset_metadata = metadata
        dataset.status = Statuses.QUARANTINED
        db_test_session.commit()
        return scan_result

    monkeypatch.setattr("app.routers.dataset.scan_uploaded_files", fake_scan)
    _seed_dataset(
        db_test_session,
        owner_id=owner_id,
        dataset_id=dataset_id,
        object_key=object_key,
        multipart_uploads=_active_upload(object_key),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/complete",
        headers=_headers(owner_id),
        json={
            "object_key": object_key,
            "parts": [{"part_number": 1, "etag": "etag-1"}],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded file failed malware scan"}
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.status == Statuses.QUARANTINED
    assert dataset.dataset_metadata["objects"][0]["scan_state"] == "infected"
    assert dataset.dataset_metadata["objects"][0]["download_state"] == "unavailable"


def test_abort_multipart_upload_marks_session_aborted(client, db_test_session):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "quarantine/batch/large.csv"
    storage = _MultipartStorage()
    client.app.state.storage = storage
    _seed_dataset(
        db_test_session,
        owner_id=owner_id,
        dataset_id=dataset_id,
        object_key=object_key,
        multipart_uploads=_active_upload(object_key),
    )

    response = client.delete(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1",
        headers=_headers(owner_id),
        params={"object_key": object_key},
    )

    assert response.status_code == 204
    assert storage.calls == [
        (
            "abort_multipart_upload",
            {"storage_key": object_key, "upload_id": "upload-1"},
        )
    ]
    db_test_session.expire_all()
    dataset = db_test_session.get(Dataset, dataset_id)
    assert (
        dataset.dataset_metadata["multipart_uploads"]["upload-1"]["status"] == "aborted"
    )


@pytest.mark.parametrize(
    "parts",
    [
        [],
        [{"part_number": 2, "etag": "etag-2"}, {"part_number": 1, "etag": "etag-1"}],
        [{"part_number": 1, "etag": "etag-1"}, {"part_number": 1, "etag": "etag-2"}],
    ],
)
def test_complete_multipart_upload_rejects_invalid_part_lists(
    client, db_test_session, parts
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "quarantine/batch/large.csv"
    storage = _MultipartStorage()
    client.app.state.storage = storage
    _seed_dataset(
        db_test_session,
        owner_id=owner_id,
        dataset_id=dataset_id,
        object_key=object_key,
        multipart_uploads=_active_upload(object_key),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/complete",
        headers=_headers(owner_id),
        json={"object_key": object_key, "parts": parts},
    )

    assert response.status_code == 400
    assert not storage.calls


def test_complete_multipart_upload_rejects_verification_failure_before_scan(
    client, db_test_session, monkeypatch
):
    owner_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    object_key = "quarantine/batch/large.csv"
    scan_calls = []
    storage = _MultipartStorage(
        verification_error=StorageVerificationError("Object size mismatch")
    )
    client.app.state.storage = storage
    monkeypatch.setattr(
        "app.routers.dataset.scan_uploaded_files",
        lambda **kwargs: scan_calls.append(kwargs),
    )
    _seed_dataset(
        db_test_session,
        owner_id=owner_id,
        dataset_id=dataset_id,
        object_key=object_key,
        multipart_uploads=_active_upload(object_key),
    )

    response = client.post(
        f"/api/datasets/{dataset_id}/multipart-uploads/upload-1/complete",
        headers=_headers(owner_id),
        json={
            "object_key": object_key,
            "parts": [{"part_number": 1, "etag": "etag-1"}],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Object size mismatch"}
    db_test_session.expire_all()
    assert db_test_session.get(Dataset, dataset_id) is None
    assert [name for name, _ in storage.calls] == [
        "complete_multipart_upload",
        "verify_object",
    ]
    assert scan_calls == []
