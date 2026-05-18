"""repair dataset object scan metadata

Revision ID: a6f4d8c2b913
Revises: e4c1a7b9d2f3
Create Date: 2026-05-18 15:00:00.000000

"""

from pathlib import PurePosixPath
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a6f4d8c2b913"
down_revision: Union[str, Sequence[str], None] = "e4c1a7b9d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCAN_STATES = {"clean", "infected", "error", "missing"}


datasets = sa.table(
    "datasets",
    sa.column("id", sa.Uuid()),
    sa.column("dataset_metadata", sa.JSON()),
)


def upgrade() -> None:
    """Repair object metadata left stale by sanitized scan result filenames."""
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(datasets.c.id, datasets.c.dataset_metadata).where(
            datasets.c.dataset_metadata.is_not(None)
        )
    )

    for dataset_id, metadata in rows:
        repaired = _repair_metadata(str(dataset_id), metadata)
        if repaired is metadata:
            continue
        bind.execute(
            sa.update(datasets)
            .where(datasets.c.id == dataset_id)
            .values(dataset_metadata=repaired)
        )


def downgrade() -> None:
    """Data repair is intentionally not reversible."""


def _repair_metadata(dataset_id: str, metadata: Any) -> dict[str, Any] | Any:
    if not isinstance(metadata, dict):
        return metadata

    objects = metadata.get("objects")
    scan_files = (metadata.get("malware_scan") or {}).get("files")
    if not isinstance(objects, list) or not isinstance(scan_files, list):
        return metadata

    updated_objects = _mark_scan_results(objects, dataset_id, scan_files)
    if updated_objects == objects:
        return metadata

    repaired = dict(metadata)
    repaired["objects"] = updated_objects
    repaired["storage_schema_version"] = repaired.get("storage_schema_version", 1)
    return repaired


def _mark_scan_results(
    objects: list[Any], dataset_id: str, scan_results: list[Any]
) -> list[Any]:
    object_lookup = _build_scan_object_lookup(objects)
    updated_objects = [dict(obj) if isinstance(obj, dict) else obj for obj in objects]
    object_indexes = {
        obj.get("original_path"): index
        for index, obj in enumerate(updated_objects)
        if isinstance(obj, dict) and obj.get("original_path")
    }

    for result in scan_results:
        if not isinstance(result, dict):
            continue

        original_path = _find_scanned_object_path(result, object_lookup)
        index = object_indexes.get(original_path)
        if index is None:
            continue

        status = str(result.get("status", "error"))
        if status not in SCAN_STATES:
            status = "error"

        obj = dict(updated_objects[index])
        obj["scan_state"] = status
        if status == "clean":
            obj["upload_state"] = "promoted"
            obj["final_object_key"] = result.get(
                "final_object_key",
                f"ready/{dataset_id}/{original_path}",
            )
            obj["download_state"] = "downloadable"
        else:
            obj["final_object_key"] = None
            obj["download_state"] = "unavailable"
        updated_objects[index] = obj

    return updated_objects


def _build_scan_object_lookup(objects: list[Any]) -> dict[str, str | None]:
    lookup: dict[str, str | None] = {}
    for obj in objects:
        if not isinstance(obj, dict):
            continue

        original_path = obj.get("original_path")
        if not original_path:
            continue

        for key in _object_scan_match_keys(obj):
            if key in lookup and lookup[key] != original_path:
                lookup[key] = None
            else:
                lookup[key] = original_path
    return lookup


def _object_scan_match_keys(obj: dict[str, Any]) -> set[str]:
    keys = {str(obj["original_path"])}
    for field in ("object_key", "quarantine_key", "final_object_key"):
        storage_key = obj.get(field)
        if not storage_key:
            continue
        key = _normalize_posix_path(str(storage_key))
        keys.add(key)
        keys.add(_relative_path_from_storage_key(key))
    return keys


def _find_scanned_object_path(
    result: dict[str, Any],
    object_lookup: dict[str, str | None],
) -> str | None:
    for key in _scan_result_match_keys(result):
        original_path = object_lookup.get(key)
        if original_path:
            return original_path
    return None


def _scan_result_match_keys(result: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for field in ("file", "final_object_key"):
        value = result.get(field)
        if not value:
            continue
        key = _normalize_posix_path(str(value))
        keys.add(key)
        keys.add(_relative_path_from_storage_key(key))
    return keys


def _normalize_posix_path(path: str) -> str:
    return PurePosixPath(path.strip()).as_posix()


def _relative_path_from_storage_key(storage_key: str) -> str:
    parts = PurePosixPath(storage_key).parts
    if not parts:
        return storage_key

    if parts[0] in {"datasets", "quarantine", "ready"} and len(parts) > 2:
        return PurePosixPath(*parts[2:]).as_posix()

    if parts[0] in {"datasets", "quarantine"} and len(parts) == 2:
        name = parts[1]
        if "_" in name:
            return name.split("_", 1)[1]
        return name

    if len(parts) > 1:
        return PurePosixPath(*parts[1:]).as_posix()
    return storage_key
