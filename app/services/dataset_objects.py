from pathlib import PurePosixPath
from typing import Any

from app.storage.types import ObjectMetadata, UploadTarget

DATASET_OBJECTS_KEY = "objects"
DIRECTORY_STRUCTURE_KEY = "directory_structure"
STORAGE_SCHEMA_VERSION_KEY = "storage_schema_version"
STORAGE_SCHEMA_VERSION = 1

UPLOAD_STATES = {"pending", "uploaded", "promoted"}
SCAN_STATES = {"pending", "clean", "infected", "error", "missing"}
DOWNLOAD_STATES = {"unavailable", "downloadable"}


class DatasetObjectValidationError(ValueError):
    """Raised when dataset object metadata is unsafe or inconsistent."""


class DatasetObjectStateError(DatasetObjectValidationError):
    """Raised when dataset object metadata has an unknown lifecycle state."""


def build_dataset_objects(
    *,
    storage: Any,
    upload_targets: list[UploadTarget],
    original_paths: list[str],
    content_types: list[str | None] | None = None,
    byte_sizes: list[int | None] | None = None,
    checksums: list[str | None] | None = None,
) -> list[dict[str, Any]]:
    if len(upload_targets) != len(original_paths):
        raise DatasetObjectValidationError(
            "Upload target count must match original path count"
        )

    normalized_paths = [_normalize_original_path(path) for path in original_paths]
    _reject_duplicates(normalized_paths, "original paths")

    storage_keys = [target.storage_key for target in upload_targets]
    _reject_duplicates(storage_keys, "storage keys")

    resolved_content_types = content_types or [None] * len(upload_targets)
    if len(resolved_content_types) != len(upload_targets):
        raise DatasetObjectValidationError(
            "Content type count must match upload target count"
        )
    resolved_byte_sizes = byte_sizes or [None] * len(upload_targets)
    if len(resolved_byte_sizes) != len(upload_targets):
        raise DatasetObjectValidationError(
            "Byte size count must match upload target count"
        )
    resolved_checksums = checksums or [None] * len(upload_targets)
    if len(resolved_checksums) != len(upload_targets):
        raise DatasetObjectValidationError(
            "Checksum count must match upload target count"
        )

    backend = storage.backend_name()
    bucket = _storage_bucket(storage)

    return [
        _validate_object(
            {
                "backend": backend,
                "provider": backend,
                "bucket": bucket,
                "object_key": target.storage_key,
                "quarantine_key": target.storage_key,
                "final_object_key": None,
                "original_path": original_path,
                "content_type": content_type,
                "byte_size": byte_size,
                "checksum": checksum,
                "etag": None,
                "upload_state": "pending",
                "scan_state": "pending",
                "download_state": "unavailable",
            }
        )
        for target, original_path, content_type, byte_size, checksum in zip(
            upload_targets,
            normalized_paths,
            resolved_content_types,
            resolved_byte_sizes,
            resolved_checksums,
        )
    ]


def attach_dataset_objects(
    metadata: dict[str, Any], objects: list[dict[str, Any]]
) -> dict[str, Any]:
    updated = dict(metadata or {})
    updated[STORAGE_SCHEMA_VERSION_KEY] = STORAGE_SCHEMA_VERSION
    updated[DATASET_OBJECTS_KEY] = validate_dataset_objects(objects)
    return updated


def get_dataset_objects(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    if DATASET_OBJECTS_KEY in metadata:
        return validate_dataset_objects(metadata.get(DATASET_OBJECTS_KEY) or [])
    return _legacy_dataset_objects(metadata)


def storage_keys_from_metadata(metadata: dict[str, Any]) -> list[str]:
    return [obj["object_key"] for obj in get_dataset_objects(metadata)]


def normalize_directory_structure(
    directory_structure: dict[str, Any] | None,
    *,
    original_paths: list[str],
) -> dict[str, Any] | None:
    if directory_structure is None:
        normalized_paths = [_normalize_original_path(path) for path in original_paths]
        if not any("/" in path for path in normalized_paths):
            return None
        return {
            "compressed": False,
            "root": _common_root(normalized_paths),
            "paths": normalized_paths,
        }

    if not isinstance(directory_structure, dict):
        raise DatasetObjectValidationError("directory_structure must be an object")

    raw_paths = directory_structure.get("paths")
    if not isinstance(raw_paths, list) or not raw_paths:
        raise DatasetObjectValidationError("directory_structure paths must be a list")

    try:
        paths = [_normalize_original_path(str(path)) for path in raw_paths]
    except DatasetObjectValidationError as error:
        message = str(error).replace("original path", "directory_structure paths")
        raise DatasetObjectValidationError(message) from error

    _reject_duplicates(paths, "directory structure paths")

    root = directory_structure.get("root")
    if root is None or str(root).strip() == "":
        normalized_root = _common_root(paths)
    else:
        try:
            normalized_root = _normalize_original_path(str(root))
        except DatasetObjectValidationError as error:
            message = str(error).replace("original path", "directory_structure root")
            raise DatasetObjectValidationError(message) from error

    if normalized_root and "/" in normalized_root:
        raise DatasetObjectValidationError(
            "directory_structure root must be a single path segment"
        )
    if normalized_root and not all(
        path == normalized_root or path.startswith(f"{normalized_root}/")
        for path in paths
    ):
        raise DatasetObjectValidationError(
            "directory_structure root must contain every path"
        )

    return {
        "compressed": bool(directory_structure.get("compressed", False)),
        "root": normalized_root,
        "paths": paths,
    }


def mark_objects_uploaded(
    objects: list[dict[str, Any]],
    verified_metadata: list[ObjectMetadata],
) -> list[dict[str, Any]]:
    if len(objects) != len(verified_metadata):
        raise DatasetObjectValidationError(
            "Verified metadata count must match dataset object count"
        )

    updated = []
    for obj, metadata in zip(validate_dataset_objects(objects), verified_metadata):
        if obj["object_key"] != metadata.storage_key:
            raise DatasetObjectValidationError(
                "Verified metadata storage key does not match dataset object"
            )
        next_obj = dict(obj)
        next_obj["backend"] = metadata.backend
        next_obj["bucket"] = metadata.bucket
        next_obj["byte_size"] = metadata.byte_size
        next_obj["content_type"] = metadata.content_type or obj.get("content_type")
        next_obj["etag"] = metadata.etag
        next_obj["upload_state"] = "uploaded"
        updated.append(_validate_object(next_obj))
    return updated


def mark_objects_scan_results(
    objects: list[dict[str, Any]],
    *,
    dataset_id: str,
    scan_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    objects_by_path = {
        obj["original_path"]: obj for obj in validate_dataset_objects(objects)
    }
    updated_by_path = {path: dict(obj) for path, obj in objects_by_path.items()}

    for result in scan_results:
        original_path = _normalize_original_path(str(result.get("file", "")))
        if original_path not in updated_by_path:
            continue

        status = str(result.get("status", "error"))
        if status not in SCAN_STATES:
            status = "error"

        obj = dict(updated_by_path[original_path])
        obj["scan_state"] = status

        if status == "clean":
            obj["upload_state"] = "promoted"
            obj["final_object_key"] = f"ready/{dataset_id}/{original_path}"
            obj["download_state"] = "downloadable"
        else:
            obj["download_state"] = "unavailable"
            obj["final_object_key"] = None

        updated_by_path[original_path] = _validate_object(obj)

    return [updated_by_path[obj["original_path"]] for obj in objects_by_path.values()]


def validate_dataset_objects(
    objects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(objects, list):
        raise DatasetObjectValidationError("Dataset objects must be a list")

    validated = [_validate_object(obj) for obj in objects]
    _reject_duplicates([obj["original_path"] for obj in validated], "original paths")
    _reject_duplicates([obj["object_key"] for obj in validated], "storage keys")
    return validated


def _validate_object(obj: dict[str, Any]) -> dict[str, Any]:
    required = {
        "backend",
        "provider",
        "bucket",
        "object_key",
        "quarantine_key",
        "final_object_key",
        "original_path",
        "content_type",
        "byte_size",
        "checksum",
        "etag",
        "upload_state",
        "scan_state",
        "download_state",
    }
    missing = sorted(required - set(obj))
    if missing:
        raise DatasetObjectValidationError(
            f"Dataset object metadata missing fields: {', '.join(missing)}"
        )

    normalized_path = _normalize_original_path(str(obj["original_path"]))
    object_key = _normalize_storage_key(str(obj["object_key"]))
    quarantine_key = _normalize_storage_key(str(obj["quarantine_key"]))
    final_object_key = obj.get("final_object_key")
    if final_object_key is not None:
        final_object_key = _normalize_storage_key(str(final_object_key))

    upload_state = str(obj["upload_state"])
    scan_state = str(obj["scan_state"])
    download_state = str(obj["download_state"])
    if upload_state not in UPLOAD_STATES:
        raise DatasetObjectStateError(f"Invalid upload_state: {upload_state}")
    if scan_state not in SCAN_STATES:
        raise DatasetObjectStateError(f"Invalid scan_state: {scan_state}")
    if download_state not in DOWNLOAD_STATES:
        raise DatasetObjectStateError(f"Invalid download_state: {download_state}")

    byte_size = obj.get("byte_size")
    if byte_size is not None:
        byte_size = int(byte_size)
        if byte_size < 0:
            raise DatasetObjectValidationError("byte_size must be >= 0")

    return {
        **obj,
        "object_key": object_key,
        "quarantine_key": quarantine_key,
        "final_object_key": final_object_key,
        "original_path": normalized_path,
        "byte_size": byte_size,
        "upload_state": upload_state,
        "scan_state": scan_state,
        "download_state": download_state,
    }


def _legacy_dataset_objects(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    storage_keys = list(metadata.get("storage_keys") or [])
    if not storage_keys:
        storage_key = metadata.get("storage_key")
        if storage_key:
            storage_keys = [storage_key]

    filenames = list(metadata.get("filenames") or [])
    filename = metadata.get("filename")
    if not filenames and filename:
        filenames = [filename]

    content_types = list(metadata.get("content_types") or [])
    objects = []
    for index, storage_key in enumerate(storage_keys):
        original_path = (
            filenames[index]
            if index < len(filenames)
            else _original_path_from_storage_key(str(storage_key))
        )
        objects.append(
            {
                "backend": "legacy",
                "provider": "legacy",
                "bucket": "",
                "object_key": str(storage_key),
                "quarantine_key": str(storage_key),
                "final_object_key": None,
                "original_path": original_path,
                "content_type": (
                    content_types[index] if index < len(content_types) else None
                ),
                "byte_size": None,
                "checksum": None,
                "etag": None,
                "upload_state": "uploaded",
                "scan_state": "pending",
                "download_state": "unavailable",
            }
        )
    return validate_dataset_objects(objects)


def _normalize_original_path(path: str) -> str:
    normalized = _normalize_posix_path(path, label="original path")
    if normalized.startswith("datasets/") or normalized.startswith("quarantine/"):
        raise DatasetObjectValidationError(
            "Original path cannot include storage prefixes"
        )
    return normalized


def _normalize_storage_key(key: str) -> str:
    return _normalize_posix_path(key, label="storage key")


def _normalize_posix_path(path: str, *, label: str) -> str:
    value = path.strip()
    if not value:
        raise DatasetObjectValidationError(f"{label} cannot be empty")

    posix_path = PurePosixPath(value)
    if posix_path.is_absolute() or any(part == ".." for part in posix_path.parts):
        raise DatasetObjectValidationError(
            f"{label} cannot be absolute or contain '..'"
        )
    return posix_path.as_posix()


def _reject_duplicates(values: list[str], label: str) -> None:
    if len(values) != len(set(values)):
        raise DatasetObjectValidationError(f"Duplicate {label} are not allowed")


def _common_root(paths: list[str]) -> str | None:
    roots = {PurePosixPath(path).parts[0] for path in paths if "/" in path}
    if len(roots) == 1:
        return next(iter(roots))
    return None


def _storage_bucket(storage: Any) -> str:
    bucket = getattr(storage, "bucket", None)
    if bucket:
        return str(bucket)
    root = getattr(storage, "_root", None)
    if root:
        return str(root)
    return ""


def _original_path_from_storage_key(storage_key: str) -> str:
    parts = PurePosixPath(storage_key).parts
    if len(parts) > 2 and parts[0] in {"datasets", "quarantine"}:
        return PurePosixPath(*parts[2:]).as_posix()
    if len(parts) > 1:
        return PurePosixPath(*parts[1:]).as_posix()
    return storage_key
