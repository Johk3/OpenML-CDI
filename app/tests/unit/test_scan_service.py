import uuid
from pathlib import Path

import pytest

from app.database.models import Dataset, Statuses
from app.services.scan import scan_uploaded_file

EICAR_TEST_BYTES = (
    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}" b"$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
)


def _create_dataset(db_session, *, filename: str) -> Dataset:
    dataset = Dataset(
        id=uuid.uuid4(),
        title="Dataset under scan",
        owner_id=uuid.uuid4(),
        dataset_metadata={"filename": filename},
        status=Statuses.PENDING,
    )
    db_session.add(dataset)
    db_session.commit()
    return dataset


def test_scan_uploaded_clean_csv_moves_file_to_ready_and_marks_clean(
    db_test_session, tmp_path: Path
):
    filename = "clean.csv"
    upload_path = tmp_path / filename
    upload_path.write_bytes(b"feature,target\n1,0\n")
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"
    dataset = _create_dataset(db_test_session, filename=filename)

    scan_uploaded_file(
        dataset_id=dataset.id,
        file_path=upload_path,
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        db=db_test_session,
    )

    db_test_session.refresh(dataset)
    assert not upload_path.exists()
    assert not (quarantine_dir / filename).exists()
    assert (final_dir / filename).read_bytes() == b"feature,target\n1,0\n"
    assert dataset.status == Statuses.CLAIMED
    assert dataset.dataset_metadata["malware_scan"] == {
        "status": "clean",
        "engine": "signature",
    }


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
    upload_path = tmp_path / filename
    upload_path.write_bytes(payload)
    quarantine_dir = tmp_path / "quarantine"
    final_dir = tmp_path / "ready"
    dataset = _create_dataset(db_test_session, filename=filename)

    scan_uploaded_file(
        dataset_id=dataset.id,
        file_path=upload_path,
        quarantine_dir=quarantine_dir,
        final_dir=final_dir,
        db=db_test_session,
    )

    db_test_session.refresh(dataset)
    assert not upload_path.exists()
    assert (quarantine_dir / filename).read_bytes() == payload
    assert not (final_dir / filename).exists()
    assert dataset.status == Statuses.QUARANTINED
    assert dataset.dataset_metadata["malware_scan"] == {
        "status": "infected",
        "engine": "signature",
        "signature": "EICAR-Test-File",
    }
