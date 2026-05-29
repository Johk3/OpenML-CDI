from pathlib import Path
import pytest

from app.storage.local import LocalStorageBackend


def test_create_upload_target_uses_datasets_prefix(tmp_path: Path):
    # Build backend using a temporary root for isolation.
    backend = LocalStorageBackend(tmp_path)

    # Generate a target path/key for one upload file.
    target = backend.create_upload_target("file.csv")

    # Keys should always stay under datasets/ and keep the file name.
    assert target.storage_key.startswith("datasets/")
    assert target.local_path is not None
    assert target.local_path.name.endswith("file.csv")


def test_create_upload_target_is_unique_per_call(tmp_path: Path):
    # Creating two targets for the same filename should still be unique.
    backend = LocalStorageBackend(tmp_path)

    first = backend.create_upload_target("file.csv")
    second = backend.create_upload_target("file.csv")

    assert first.storage_key != second.storage_key
    assert first.local_path != second.local_path


def test_traversal_like_filename_cannot_escape_root(tmp_path: Path):
    # Path-like input should be sanitized and remain inside configured root.
    backend = LocalStorageBackend(tmp_path)

    target = backend.create_upload_target("../secret.txt")

    assert target.local_path is not None
    assert target.local_path.is_relative_to(tmp_path.resolve())
    assert ".." not in target.storage_key
    assert target.local_path.name.endswith("secret.txt")


def test_parent_directory_is_created_under_configured_root(tmp_path: Path):
    # Backend should create the datasets folder automatically when needed.
    backend = LocalStorageBackend(tmp_path)

    target = backend.create_upload_target("file.csv")

    assert target.local_path is not None
    assert target.local_path.parent.parent == (tmp_path / "datasets")
    assert target.local_path.parent.exists()


def test_write_and_read_round_trip_under_configured_root(tmp_path: Path):
    # Read/write should persist content under the configured local root only.
    backend = LocalStorageBackend(tmp_path)
    payload = b"a,b\n1,2\n"
    storage_key = "datasets/sample.csv"

    backend.write_bytes(storage_key, payload)

    assert (tmp_path / storage_key).read_bytes() == payload
    assert backend.read_bytes(storage_key) == payload


def test_write_rejects_traversal_storage_key(tmp_path: Path):
    # Direct keys from callers must not escape the configured storage root.
    backend = LocalStorageBackend(tmp_path)

    with pytest.raises(ValueError):
        backend.write_bytes("../outside.txt", b"blocked")


def test_read_rejects_traversal_storage_key(tmp_path: Path):
    # Reads should enforce the same root-boundary checks as writes.
    backend = LocalStorageBackend(tmp_path)

    with pytest.raises(ValueError):
        backend.read_bytes("../outside.txt")


def test_metadata_exists_delete_and_verify_round_trip(tmp_path: Path):
    backend = LocalStorageBackend(tmp_path)
    storage_key = "datasets/sample.csv"

    backend.write_bytes(storage_key, b"a,b\n1,2\n")

    assert backend.object_exists(storage_key) is True
    metadata = backend.verify_object(storage_key, expected_size=8)
    assert metadata.backend == "local"
    assert metadata.storage_key == storage_key
    assert metadata.byte_size == 8
    assert backend.create_download_url(storage_key).startswith("file://")

    backend.delete(storage_key)

    assert backend.object_exists(storage_key) is False
