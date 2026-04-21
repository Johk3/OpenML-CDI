import shutil
from pathlib import Path
from sqlalchemy.orm import Session
from app.database.models import Dataset, Statuses

SCAN_ENGINE = "signature"
EICAR_TEST_SIGNATURE = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"
EICAR_SIGNATURE_NAME = "EICAR-Test-File"


def _contains_signature(file_path: Path, signature: bytes) -> bool:
    carry = b""
    overlap = len(signature) - 1

    with file_path.open("rb") as uploaded_file:
        for chunk in iter(lambda: uploaded_file.read(1024 * 1024), b""):
            data = carry + chunk
            if signature in data:
                return True
            carry = data[-overlap:] if overlap else b""

    return False


def _scan_file(file_path: Path) -> dict[str, str]:
    if _contains_signature(file_path, EICAR_TEST_SIGNATURE):
        return {
            "status": "infected",
            "engine": SCAN_ENGINE,
            "signature": EICAR_SIGNATURE_NAME,
        }

    return {"status": "clean", "engine": SCAN_ENGINE}


def _set_scan_metadata(dataset: Dataset, scan_result: dict[str, str]) -> None:
    metadata = dict(dataset.dataset_metadata or {})
    metadata["malware_scan"] = scan_result
    dataset.dataset_metadata = metadata


def scan_uploaded_file(
    dataset_id,
    file_path: Path,
    quarantine_dir: Path,
    final_dir: Path,
    db: Session,
) -> None:
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        return

    if not file_path.exists():
        dataset.status = Statuses.QUARANTINED
        _set_scan_metadata(
            dataset,
            {
                "status": "missing",
                "engine": SCAN_ENGINE,
            },
        )
        db.commit()
        return

    quarantine_path = quarantine_dir / file_path.name
    shutil.move(str(file_path), quarantine_path)
    scan_result = _scan_file(quarantine_path)
    _set_scan_metadata(dataset, scan_result)

    if scan_result["status"] == "clean":
        final_path = final_dir / file_path.name
        shutil.move(str(quarantine_path), final_path)
        dataset.status = Statuses.CLAIMED
    else:
        dataset.status = Statuses.QUARANTINED

    db.commit()
