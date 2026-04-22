import shutil
from pathlib import Path
from typing import Any
from sqlalchemy.orm import Session
from app.database.models import Dataset, Statuses

SCAN_ENGINE = "signature"
EICAR_TEST_SIGNATURE = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"
EICAR_SIGNATURE_NAME = "EICAR-Test-File"


def _contains_signature(file_obj, signature: bytes) -> bool:
    carry = b""
    overlap = len(signature) - 1

    for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
        data = carry + chunk
        if signature in data:
            return True
        carry = data[-overlap:] if overlap else b""

    return False


def _scan_file(file_path: Path) -> dict[str, str]:
    with file_path.open("rb") as f:
        if _contains_signature(f, EICAR_TEST_SIGNATURE):
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
    storage_key: str,
    quarantine_dir: Path,
    final_dir: Path,
    storage: Any,
    db: Session,
) -> None:
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        return

    # Use a temporary filename for the scan
    temp_filename = Path(storage_key).name
    quarantine_path = quarantine_dir / f"scan_{temp_filename}"

    try:
        with storage.open(storage_key, "rb") as src:
            with quarantine_path.open("wb") as dst:
                shutil.copyfileobj(src, dst)
    except Exception as e:
        dataset.status = Statuses.QUARANTINED
        _set_scan_metadata(
            dataset,
            {
                "status": "missing",
                "message": f"Failed to retrieve file for scan: {str(e)}",
                "engine": SCAN_ENGINE,
            },
        )
        db.commit()
        return

    scan_result = _scan_file(quarantine_path)
    _set_scan_metadata(dataset, scan_result)

    if scan_result["status"] == "clean":
        final_path = final_dir / temp_filename
        shutil.move(str(quarantine_path), final_path)
        dataset.status = Statuses.CLAIMED
    else:
        dataset.status = Statuses.QUARANTINED

    db.commit()
