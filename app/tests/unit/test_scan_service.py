import uuid
from pathlib import Path

import pytest

from app.database.models import Dataset, Statuses
from app.services.scan import scan_uploaded_files

EICAR_TEST_BYTES = (
    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}" b"$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
)


def _create_dataset(db_session, *, filename: str) -> Dataset:
    dataset = Dataset(
        id=uuid.uuid4(),
        title="Dataset under scan",
        owner_id=uuid.uuid4(),
        dataset_metadata={
            "filenames": [filename],
            "storage_keys": [f"datasets/abcd_{filename}"],
        },
        status=Statuses.PENDING,
    )
    db_session.add(dataset)
    db_session.commit()
    return dataset


def test_scan_uploaded_clean_csv_moves_file_to_ready_and_marks_clean(
    db_test_session, tmp_path: Path
):
    dataset_id = uuid.uuid4()
    filename = "clean.csv"
    storage_key = f"datasets/abcd_{filename}"

    src_file = tmp_path / "source_file"
    src_file.write_bytes(b"feature,target\n1,0\n")

    class MockStorage:
        def open(self, key, mode):
            return open(src_file, mode)

    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    dataset = Dataset(
        id=dataset_id,
        title="Dataset under scan",
        owner_id=uuid.uuid4(),
        dataset_metadata={"filenames": [filename], "storage_keys": [storage_key]},
        status=Statuses.PENDING,
    )
    db_test_session.add(dataset)
    db_test_session.commit()

    scan_uploaded_files(
        dataset_id=dataset.id,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        storage=MockStorage(),
        db=db_test_session,
    )

    db_test_session.refresh(dataset)
    # The file should be moved from quarantine to ready
    final_path = final_dir / str(dataset.id) / filename
    assert final_path.exists()
    assert final_path.read_bytes() == b"feature,target\n1,0\n"
    assert dataset.status == Statuses.CLAIMED
    assert dataset.dataset_metadata["malware_scan"]["files"][0]["status"] == "clean"


def test_scan_uploaded_nested_folder_preserves_structure(
    db_test_session, tmp_path: Path
):
    dataset_id = uuid.uuid4()
    batch_uuid = "batch123"
    rel_path = "folder/sub/data.csv"
    storage_key = f"datasets/{batch_uuid}/{rel_path}"

    src_file = tmp_path / "source_file"
    src_file.write_bytes(b"nested data")

    class MockStorage:
        def open(self, key, mode):
            return open(src_file, mode)

    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    dataset = Dataset(
        id=dataset_id,
        title="Nested Dataset",
        owner_id=uuid.uuid4(),
        dataset_metadata={"filenames": [rel_path], "storage_keys": [storage_key]},
        status=Statuses.PENDING,
    )
    db_test_session.add(dataset)
    db_test_session.commit()

    scan_uploaded_files(
        dataset_id=dataset_id,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        storage=MockStorage(),
        db=db_test_session,
    )

    db_test_session.refresh(dataset)
    # Check if file exists at ready
    expected_path = final_dir / str(dataset_id) / rel_path
    assert expected_path.exists()
    assert expected_path.read_bytes() == b"nested data"
    assert dataset.status == Statuses.CLAIMED


@pytest.mark.parametrize(
    ("filename", "payload"),
    [
        ("infected.csv", b"col\n" + EICAR_TEST_BYTES + b"\n"),
        ("infected.h5", b"\x89HDF\r\n\x1a\n" + EICAR_TEST_BYTES),
    ],
)
def test_scan_uploaded_infected_files_stay_quarantined_and_mark_dataset(
    db_test_session,
    tmp_path: Path,
    filename: str,
    payload: bytes,
):
    dataset_id = uuid.uuid4()
    storage_key = f"datasets/abcd_{filename}"

    src_file = tmp_path / "source_file"
    src_file.write_bytes(payload)

    class MockStorage:
        def open(self, key, mode):
            return open(src_file, mode)

    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"

    dataset = Dataset(
        id=dataset_id,
        title="Infected Dataset",
        owner_id=uuid.uuid4(),
        dataset_metadata={"filenames": [filename], "storage_keys": [storage_key]},
        status=Statuses.PENDING,
    )
    db_test_session.add(dataset)
    db_test_session.commit()

    scan_uploaded_files(
        dataset_id=dataset.id,
        storage_keys=[storage_key],
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        storage=MockStorage(),
        db=db_test_session,
    )

    db_test_session.refresh(dataset)
    # Marked as quarantined
    assert dataset.status == Statuses.QUARANTINED
    # File should stay in quarantine
    quarantined_files = list(quarantine_dir.glob(f"*{filename}"))
    assert len(quarantined_files) == 1
    assert quarantined_files[0].read_bytes() == payload
    # Should NOT be in ready
    assert not (final_dir / str(dataset_id) / filename).exists()
