import logging
import shutil
import socket
import uuid
from pathlib import Path
from typing import Any, Callable

import clamd
from sqlalchemy.orm import Session

from app.database.models import Dataset, Statuses

SCAN_ENGINE = "clamav"
logger = logging.getLogger(__name__)


class ClamAVUnavailableError(RuntimeError):
    """Raised when clamd cannot be reached to scan a file."""


def _get_clamd_client(
    *,
    clamd_socket: str,
    clamd_host: str,
    clamd_port: int,
    clamd_timeout_seconds: float,
):
    if clamd_socket:
        return clamd.ClamdUnixSocket(path=clamd_socket, timeout=clamd_timeout_seconds)
    return clamd.ClamdNetworkSocket(
        host=clamd_host,
        port=clamd_port,
        timeout=clamd_timeout_seconds,
    )


def _scan_file(
    file_path: Path,
    *,
    clamd_socket: str,
    clamd_host: str,
    clamd_port: int,
    clamd_timeout_seconds: float,
) -> dict[str, str]:
    try:
        clamd_client = _get_clamd_client(
            clamd_socket=clamd_socket,
            clamd_host=clamd_host,
            clamd_port=clamd_port,
            clamd_timeout_seconds=clamd_timeout_seconds,
        )
        scan_response = clamd_client.scan(str(file_path))
    except (clamd.ConnectionError, socket.timeout, TimeoutError, OSError) as error:
        raise ClamAVUnavailableError(str(error)) from error

    if not scan_response:
        return {"status": "clean", "engine": SCAN_ENGINE}

    _, result = next(iter(scan_response.items()))
    verdict = result[0]
    signature = result[1] if len(result) > 1 else None

    if verdict == "OK":
        return {"status": "clean", "engine": SCAN_ENGINE}
    if verdict == "FOUND":
        scan_result = {"status": "infected", "engine": SCAN_ENGINE}
        if signature:
            scan_result["signature"] = str(signature)
        return scan_result

    message = str(signature) if signature else f"Unexpected ClamAV verdict: {verdict}"
    return {
        "status": "error",
        "engine": SCAN_ENGINE,
        "message": message,
    }


def _delete_quarantine_file(quarantine_path: Path) -> None:
    try:
        quarantine_path.unlink(missing_ok=True)
    except OSError:
        logger.exception("Failed to delete quarantined file at %s", quarantine_path)


def _set_scan_metadata(dataset: Dataset, scan_result: dict[str, Any]) -> None:
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

    # Fallback to just the filename.
    return Path(parts[-1])


def _copy_to_quarantine(storage: Any, storage_key: str, quarantine_path: Path) -> None:
    with storage.open(storage_key, "rb") as src:
        with quarantine_path.open("wb") as dst:
            shutil.copyfileobj(src, dst)


def _scan_error_result(*, rel_path: Path, message: str) -> dict[str, str]:
    return {
        "file": str(rel_path),
        "status": "error",
        "engine": SCAN_ENGINE,
        "message": message,
    }


def scan_uploaded_files(
    dataset_id,
    storage_keys: list[str],
    quarantine_dir: Path,
    final_dir: Path,
    clamd_socket: str,
    clamd_host: str,
    clamd_port: int,
    clamd_timeout_seconds: float,
    storage: Any,
    db_factory: Callable[[], Session],
) -> None:
    quarantine_dir.mkdir(parents=True, exist_ok=True)

    # Create a dataset-specific final directory to avoid collisions.
    dataset_final_dir = final_dir / str(dataset_id)
    dataset_final_dir.mkdir(parents=True, exist_ok=True)

    with db_factory() as db:
        dataset = db.get(Dataset, dataset_id)
        if dataset is None:
            return

        overall_results: list[dict[str, Any]] = []
        all_clean = True

        for storage_key in storage_keys:
            rel_path = _get_relative_path(storage_key)
            temp_id = uuid.uuid4().hex
            quarantine_path = quarantine_dir / f"scan_{temp_id}_{rel_path.name}"

            try:
                _copy_to_quarantine(storage, storage_key, quarantine_path)
            except Exception as error:
                all_clean = False
                overall_results.append(
                    {
                        "file": str(rel_path),
                        "status": "missing",
                        "engine": SCAN_ENGINE,
                        "message": f"Failed to retrieve file for scan: {str(error)}",
                    }
                )
                continue

            try:
                scan_result = _scan_file(
                    quarantine_path,
                    clamd_socket=clamd_socket,
                    clamd_host=clamd_host,
                    clamd_port=clamd_port,
                    clamd_timeout_seconds=clamd_timeout_seconds,
                )
            except ClamAVUnavailableError as error:
                logger.exception(
                    "ClamAV unavailable while scanning dataset %s", dataset.id
                )
                all_clean = False
                overall_results.append(
                    _scan_error_result(
                        rel_path=rel_path,
                        message=f"ClamAV unavailable: {str(error)}",
                    )
                )
                _delete_quarantine_file(quarantine_path)
                continue
            except Exception as error:
                logger.exception("Unexpected ClamAV failure for dataset %s", dataset.id)
                all_clean = False
                overall_results.append(
                    _scan_error_result(
                        rel_path=rel_path,
                        message=f"Unexpected scan failure: {str(error)}",
                    )
                )
                _delete_quarantine_file(quarantine_path)
                continue

            scan_result["file"] = str(rel_path)
            if scan_result["status"] == "clean":
                final_path = dataset_final_dir / rel_path
                try:
                    final_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(quarantine_path), final_path)
                except Exception as error:
                    logger.exception(
                        "Failed to move clean file for dataset %s", dataset.id
                    )
                    all_clean = False
                    scan_result = _scan_error_result(
                        rel_path=rel_path,
                        message=f"Failed to promote clean file: {str(error)}",
                    )
                    _delete_quarantine_file(quarantine_path)
            else:
                all_clean = False
                _delete_quarantine_file(quarantine_path)

            overall_results.append(scan_result)

        _set_scan_metadata(dataset, {"files": overall_results, "engine": SCAN_ENGINE})
        # Uploaded datasets stay pending expert review unless malware is detected.
        dataset.status = Statuses.PENDING if all_clean else Statuses.QUARANTINED
        db.commit()
