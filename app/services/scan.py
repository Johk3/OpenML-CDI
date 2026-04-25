import uuid
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


def _get_relative_path(storage_key: str) -> Path:
    """Extract the relative file path from a storage key."""
    parts = Path(storage_key).parts
    if not parts:
        return Path("unknown.bin")

    # Handles many files uploaded: datasets/{batch_uuid}/{path}
    if parts[0] == "datasets" and len(parts) > 2:
        return Path(*parts[2:])

    # Handles single file uploaded: datasets/{uuid}_{filename}
    if parts[0] == "datasets" and len(parts) == 2:
        name = parts[1]
        if "_" in name:
            return Path(name.split("_", 1)[1])
        return Path(name)

    # Fallback to just the filaname
    return Path(parts[-1])


def scan_uploaded_files(
    dataset_id,
    storage_keys: list[str],
    quarantine_dir: Path,
    final_dir: Path,
    storage: Any,
    db: Session,
) -> None:
    quarantine_dir.mkdir(parents=True, exist_ok=True)

    # Create a dataset-specific final directory to avoid collisions
    dataset_final_dir = final_dir / str(dataset_id)
    dataset_final_dir.mkdir(parents=True, exist_ok=True)

    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        return

    overall_results = []
    all_clean = True

    for storage_key in storage_keys:
        rel_path = _get_relative_path(storage_key)
        temp_id = uuid.uuid4().hex
        quarantine_path = quarantine_dir / f"scan_{temp_id}_{rel_path.name}"

        try:
            with storage.open(storage_key, "rb") as src:
                with quarantine_path.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
        except Exception as e:
            all_clean = False
            overall_results.append(
                {
                    "file": str(rel_path),
                    "status": "missing",
                    "message": f"Failed to retrieve file for scan: {str(e)}",
                }
            )
            continue

        scan_result = _scan_file(quarantine_path)
        scan_result["file"] = str(rel_path)
        overall_results.append(scan_result)

        if scan_result["status"] == "clean":
            final_path = dataset_final_dir / rel_path
            # Ensure the nested directory structure exists in the destination
            final_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(quarantine_path), final_path)
        else:
            all_clean = False

    _set_scan_metadata(dataset, {"files": overall_results, "engine": SCAN_ENGINE})

    if all_clean:
        dataset.status = Statuses.CLAIMED
    else:
        dataset.status = Statuses.QUARANTINED

    db.commit()
