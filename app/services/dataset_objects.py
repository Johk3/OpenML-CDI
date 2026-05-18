from pathlib import PurePosixPath
from typing import Any

from app.storage.types import ObjectMetadata, UploadTarget

DATASET_OBJECTS_KEY = "objects"
DIRECTORY_STRUCTURE_KEY = "directory_structure"
STORAGE_SCHEMA_VERSION_KEY = "storage_schema_version"
STORAGE_SCHEMA_VERSION = 1
UPLOAD_PACKAGE_MANIFEST_VERSION = 1

UPLOAD_STATES = {"pending", "uploaded", "promoted"}
SCAN_STATES = {"pending", "clean", "infected", "error", "missing"}
DOWNLOAD_STATES = {"unavailable", "downloadable"}
UPLOAD_REPRESENTATIONS = {"single_object", "multi_object", "zip"}


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
    uploaded_paths = [_normalize_original_path(path) for path in original_paths]

    if directory_structure is None:
        if len(uploaded_paths) == 1 and not any("/" in path for path in uploaded_paths):
            return None
        return _build_directory_structure(
            compressed=False,
            paths=uploaded_paths,
            uploaded_paths=uploaded_paths,
            root=_common_root(uploaded_paths),
            archive_path=None,
            manifest=None,
            requested_representation=None,
        )

    if not isinstance(directory_structure, dict):
        raise DatasetObjectValidationError("directory_structure must be an object")

    raw_compressed = directory_structure.get("compressed", False)
    if not isinstance(raw_compressed, bool):
        raise DatasetObjectValidationError(
            "directory_structure compressed must be a boolean"
        )

    raw_paths = directory_structure.get("paths")
    if not isinstance(raw_paths, list) or not raw_paths:
        raise DatasetObjectValidationError("directory_structure paths must be a list")
    if not all(isinstance(path, str) for path in raw_paths):
        raise DatasetObjectValidationError("directory_structure paths must be strings")

    try:
        paths = [_normalize_original_path(path) for path in raw_paths]
    except DatasetObjectValidationError as error:
        message = str(error).replace("original path", "directory_structure paths")
        raise DatasetObjectValidationError(message) from error

    _reject_duplicates(paths, "directory structure paths")

    root = directory_structure.get("root")
    if root is not None and not isinstance(root, str):
        raise DatasetObjectValidationError("directory_structure root must be a string")
    if root is None or root.strip() == "":
        normalized_root = _common_root(paths)
    else:
        try:
            normalized_root = _normalize_original_path(root)
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

    return _build_directory_structure(
        compressed=raw_compressed,
        paths=paths,
        uploaded_paths=uploaded_paths,
        root=normalized_root,
        archive_path=directory_structure.get("archive_path"),
        manifest=directory_structure.get("manifest"),
        requested_representation=directory_structure.get("representation"),
    )


def get_upload_package_metadata(metadata: dict[str, Any]) -> dict[str, Any] | None:
    package = (metadata or {}).get(DIRECTORY_STRUCTURE_KEY)
    if not isinstance(package, dict):
        return None

    paths = package.get("paths")
    if not isinstance(paths, list) or not paths:
        return None

    try:
        normalized_paths = [_normalize_original_path(str(path)) for path in paths]
        _reject_duplicates(normalized_paths, "directory structure paths")
        root = package.get("root")
        normalized_root = (
            _normalize_original_path(str(root)) if root is not None else None
        )
        archive_path = package.get("archive_path")
        normalized_archive_path = (
            _normalize_original_path(str(archive_path))
            if archive_path is not None
            else None
        )
    except DatasetObjectValidationError:
        return None

    compressed = bool(package.get("compressed", False))
    representation = str(
        package.get("representation")
        or _representation_for(compressed=compressed, paths=normalized_paths)
    )
    if representation not in UPLOAD_REPRESENTATIONS:
        return None

    try:
        manifest = _normalize_manifest(package.get("manifest"), len(normalized_paths))
    except DatasetObjectValidationError:
        return None

    return {
        "compressed": compressed,
        "representation": representation,
        "root": normalized_root,
        "paths": normalized_paths,
        "archive_path": normalized_archive_path,
        "manifest": manifest,
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
    object_lookup = _build_scan_object_lookup(objects_by_path)

    for result in scan_results:
        original_path = _find_scanned_object_path(result, object_lookup)
        if original_path not in updated_by_path:
            continue

        status = str(result.get("status", "error"))
        if status not in SCAN_STATES:
            status = "error"

        obj = dict(updated_by_path[original_path])
        obj["scan_state"] = status

        if status == "clean":
            obj["upload_state"] = "promoted"
            obj["final_object_key"] = result.get(
                "final_object_key",
                f"ready/{dataset_id}/{original_path}",
            )
            obj["download_state"] = "downloadable"
        else:
            obj["download_state"] = "unavailable"
            obj["final_object_key"] = None

        updated_by_path[original_path] = _validate_object(obj)

    return [updated_by_path[obj["original_path"]] for obj in objects_by_path.values()]


def _build_scan_object_lookup(
    objects_by_path: dict[str, dict[str, Any]],
) -> dict[str, str | None]:
    lookup: dict[str, str | None] = {}
    for original_path, obj in objects_by_path.items():
        for key in _object_scan_match_keys(obj):
            if key in lookup and lookup[key] != original_path:
                lookup[key] = None
            else:
                lookup[key] = original_path
    return lookup


def _object_scan_match_keys(obj: dict[str, Any]) -> set[str]:
    keys = {obj["original_path"]}
    keys.add(obj["object_key"])
    keys.add(obj["quarantine_key"])
    keys.add(_relative_path_from_storage_key(obj["object_key"]))
    keys.add(_relative_path_from_storage_key(obj["quarantine_key"]))
    if obj.get("final_object_key"):
        keys.add(obj["final_object_key"])
        keys.add(_relative_path_from_storage_key(obj["final_object_key"]))
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
    raw_file = result.get("file")
    if raw_file:
        file_key = _normalize_posix_path(str(raw_file), label="scan result file")
        keys.add(file_key)
        keys.add(_relative_path_from_storage_key(file_key))

    final_object_key = result.get("final_object_key")
    if final_object_key:
        final_key = _normalize_storage_key(str(final_object_key))
        keys.add(final_key)
        keys.add(_relative_path_from_storage_key(final_key))

    return keys


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


def _build_directory_structure(
    *,
    compressed: bool,
    paths: list[str],
    uploaded_paths: list[str],
    root: str | None,
    archive_path: Any,
    manifest: Any,
    requested_representation: Any,
) -> dict[str, Any]:
    representation = _representation_for(compressed=compressed, paths=paths)

    if requested_representation is not None:
        requested = str(requested_representation)
        if requested not in UPLOAD_REPRESENTATIONS:
            raise DatasetObjectValidationError(
                "directory_structure representation is invalid"
            )
        if requested != representation:
            raise DatasetObjectValidationError(
                "directory_structure representation does not match compressed flag"
            )

    if compressed:
        if len(uploaded_paths) != 1 or not uploaded_paths[0].lower().endswith(".zip"):
            raise DatasetObjectValidationError(
                "Compressed uploads must contain exactly one ZIP archive"
            )
        if archive_path is not None and not isinstance(archive_path, str):
            raise DatasetObjectValidationError(
                "directory_structure archive_path must be a string"
            )
        normalized_archive_path = (
            _normalize_original_path(archive_path)
            if archive_path is not None
            else uploaded_paths[0]
        )
        if normalized_archive_path != uploaded_paths[0]:
            raise DatasetObjectValidationError(
                "directory_structure archive_path must match uploaded ZIP archive"
            )
    else:
        if archive_path not in (None, ""):
            raise DatasetObjectValidationError(
                "directory_structure archive_path is only valid for ZIP uploads"
            )
        if paths != uploaded_paths:
            raise DatasetObjectValidationError(
                "directory_structure paths must match uploaded paths"
            )
        normalized_archive_path = None

    return {
        "compressed": compressed,
        "representation": representation,
        "root": root,
        "paths": paths,
        "archive_path": normalized_archive_path,
        "manifest": _normalize_manifest(manifest, len(paths)),
    }


def _representation_for(*, compressed: bool, paths: list[str]) -> str:
    if compressed:
        return "zip"
    if len(paths) > 1:
        return "multi_object"
    return "single_object"


def _normalize_manifest(manifest: Any, path_count: int) -> dict[str, Any]:
    if manifest is not None and not isinstance(manifest, dict):
        raise DatasetObjectValidationError(
            "directory_structure manifest must be an object"
        )

    source = "directory_structure.paths"
    if isinstance(manifest, dict):
        raw_version = manifest.get("version")
        if raw_version is not None:
            if (
                not _is_int(raw_version)
                or raw_version != UPLOAD_PACKAGE_MANIFEST_VERSION
            ):
                raise DatasetObjectValidationError(
                    "directory_structure manifest version is invalid"
                )

        raw_path_count = manifest.get("path_count")
        if raw_path_count is not None:
            if not _is_int(raw_path_count) or raw_path_count != path_count:
                raise DatasetObjectValidationError(
                    "directory_structure manifest path_count must match paths"
                )

        raw_source = manifest.get("source")
        if raw_source is not None:
            if not isinstance(raw_source, str):
                raise DatasetObjectValidationError(
                    "directory_structure manifest source must be a string"
                )
            if raw_source.strip():
                source = raw_source.strip()

    return {
        "version": UPLOAD_PACKAGE_MANIFEST_VERSION,
        "path_count": path_count,
        "source": source,
    }


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


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
