import pytest

from app.services.dataset_objects import (
    DatasetObjectStateError,
    DatasetObjectValidationError,
    build_dataset_objects,
    get_dataset_objects,
    mark_objects_scan_results,
    mark_objects_uploaded,
)
from app.storage.types import ObjectMetadata, UploadTarget


class _Storage:
    def __init__(self, backend_name: str = "local", bucket: str = "uploads"):
        self.bucket = bucket
        self._backend_name = backend_name

    def backend_name(self) -> str:
        return self._backend_name


def test_build_dataset_objects_for_single_file_upload():
    objects = build_dataset_objects(
        storage=_Storage(),
        upload_targets=[
            UploadTarget(storage_key="datasets/batch/data.csv", local_path=None)
        ],
        original_paths=["data.csv"],
        content_types=["text/csv"],
    )

    assert objects == [
        {
            "backend": "local",
            "provider": "local",
            "bucket": "uploads",
            "object_key": "datasets/batch/data.csv",
            "quarantine_key": "datasets/batch/data.csv",
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
    ]


def test_build_dataset_objects_preserves_multi_file_folder_paths():
    objects = build_dataset_objects(
        storage=_Storage("s3", "datasets"),
        upload_targets=[
            UploadTarget("quarantine/batch/folder/data.csv", None),
            UploadTarget("quarantine/batch/folder/sub/meta.txt", None),
        ],
        original_paths=["folder/data.csv", "folder/sub/meta.txt"],
        content_types=["text/csv", "text/plain"],
    )

    assert [obj["original_path"] for obj in objects] == [
        "folder/data.csv",
        "folder/sub/meta.txt",
    ]
    assert [obj["object_key"] for obj in objects] == [
        "quarantine/batch/folder/data.csv",
        "quarantine/batch/folder/sub/meta.txt",
    ]
    assert all(obj["backend"] == "s3" for obj in objects)
    assert all(obj["bucket"] == "datasets" for obj in objects)


@pytest.mark.parametrize("path", ["", "../secret.csv", "/tmp/secret.csv"])
def test_build_dataset_objects_rejects_unsafe_original_paths(path):
    with pytest.raises(DatasetObjectValidationError):
        build_dataset_objects(
            storage=_Storage(),
            upload_targets=[UploadTarget("datasets/batch/data.csv", None)],
            original_paths=[path],
            content_types=[None],
        )


def test_build_dataset_objects_rejects_duplicate_original_paths():
    with pytest.raises(DatasetObjectValidationError):
        build_dataset_objects(
            storage=_Storage(),
            upload_targets=[
                UploadTarget("datasets/batch/one.csv", None),
                UploadTarget("datasets/batch/two.csv", None),
            ],
            original_paths=["data.csv", "data.csv"],
            content_types=[None, None],
        )


def test_get_dataset_objects_supports_legacy_storage_keys():
    metadata = {
        "filenames": ["folder/data.csv"],
        "content_types": ["text/csv"],
        "storage_keys": ["datasets/batch/folder/data.csv"],
    }

    objects = get_dataset_objects(metadata)

    assert objects[0]["backend"] == "legacy"
    assert objects[0]["object_key"] == "datasets/batch/folder/data.csv"
    assert objects[0]["original_path"] == "folder/data.csv"
    assert objects[0]["upload_state"] == "uploaded"


def test_get_dataset_objects_rejects_invalid_states():
    metadata = {
        "objects": [
            {
                "backend": "local",
                "provider": "local",
                "bucket": "uploads",
                "object_key": "datasets/batch/data.csv",
                "quarantine_key": "datasets/batch/data.csv",
                "final_object_key": None,
                "original_path": "data.csv",
                "content_type": "text/csv",
                "byte_size": None,
                "checksum": None,
                "etag": None,
                "upload_state": "finished",
                "scan_state": "pending",
                "download_state": "unavailable",
            }
        ]
    }

    with pytest.raises(DatasetObjectStateError):
        get_dataset_objects(metadata)


def test_mark_objects_uploaded_records_verification_metadata():
    objects = build_dataset_objects(
        storage=_Storage(),
        upload_targets=[UploadTarget("datasets/batch/data.csv", None)],
        original_paths=["data.csv"],
        content_types=["text/csv"],
    )

    updated = mark_objects_uploaded(
        objects,
        [
            ObjectMetadata(
                backend="local",
                bucket="uploads",
                storage_key="datasets/batch/data.csv",
                byte_size=12,
                content_type="text/csv",
                etag="abc123",
            )
        ],
    )

    assert updated[0]["upload_state"] == "uploaded"
    assert updated[0]["byte_size"] == 12
    assert updated[0]["etag"] == "abc123"


def test_mark_objects_scan_results_promotes_clean_and_quarantines_infected():
    objects = build_dataset_objects(
        storage=_Storage(),
        upload_targets=[
            UploadTarget("datasets/batch/clean.csv", None),
            UploadTarget("datasets/batch/infected.csv", None),
        ],
        original_paths=["clean.csv", "infected.csv"],
        content_types=["text/csv", "text/csv"],
    )
    uploaded = mark_objects_uploaded(
        objects,
        [
            ObjectMetadata("local", "uploads", "datasets/batch/clean.csv", 5),
            ObjectMetadata("local", "uploads", "datasets/batch/infected.csv", 7),
        ],
    )

    updated = mark_objects_scan_results(
        uploaded,
        dataset_id="dataset-1",
        scan_results=[
            {"file": "clean.csv", "status": "clean", "engine": "clamav"},
            {"file": "infected.csv", "status": "infected", "engine": "clamav"},
        ],
    )

    assert updated[0]["upload_state"] == "promoted"
    assert updated[0]["scan_state"] == "clean"
    assert updated[0]["final_object_key"] == "ready/dataset-1/clean.csv"
    assert updated[0]["download_state"] == "downloadable"
    assert updated[1]["upload_state"] == "uploaded"
    assert updated[1]["scan_state"] == "infected"
    assert updated[1]["final_object_key"] is None
    assert updated[1]["download_state"] == "unavailable"
