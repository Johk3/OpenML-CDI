import re
import mimetypes
import shutil
from pathlib import Path
from uuid import uuid4

from .errors import StorageObjectNotFoundError, StorageVerificationError
from .types import MultipartUpload, ObjectMetadata, UploadTarget

SAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class LocalStorageBackend:
    def __init__(self, root_dir: str | Path):
        """Store uploads under a configured local root directory."""
        self._root = Path(root_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def backend_name(self) -> str:
        """Return the backend identifier used by configuration/factory code."""
        return "local"

    def create_upload_target(
        self, filename: str, prefix: str | None = None
    ) -> UploadTarget:
        """Create a unique, safe local upload destination for a filename."""
        safe_filename = self._sanitize_filename(filename)
        # Use provided batch UUID or generate a new one per file
        folder_prefix = prefix or uuid4().hex
        storage_key = f"datasets/{folder_prefix}/{safe_filename}"

        local_path = self._resolve_storage_key_path(storage_key)

        local_path.parent.mkdir(parents=True, exist_ok=True)
        return UploadTarget(storage_key=storage_key, local_path=local_path)

    def write_bytes(self, storage_key: str, data: bytes) -> None:
        """Write upload bytes to disk using a validated storage key."""
        local_path = self._resolve_storage_key_path(storage_key)

        # Ensure nested folders exist before writing file content.
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(data)

    def read_bytes(self, storage_key: str) -> bytes:
        """Read upload bytes from disk using a validated storage key."""
        local_path = self._resolve_storage_key_path(storage_key)
        return local_path.read_bytes()

    def open(self, storage_key: str, mode: str = "rb"):
        """Open a file-like object for a storage key."""
        local_path = self._resolve_storage_key_path(storage_key)
        return open(local_path, mode)

    def object_exists(self, storage_key: str) -> bool:
        """Return whether a storage key exists on disk."""
        local_path = self._resolve_storage_key_path(storage_key)
        return local_path.exists()

    def get_metadata(self, storage_key: str) -> ObjectMetadata:
        """Return local file metadata using the shared storage metadata shape."""
        local_path = self._resolve_storage_key_path(storage_key)
        if not local_path.exists():
            raise StorageObjectNotFoundError(f"Object not found: {storage_key}")

        return ObjectMetadata(
            backend=self.backend_name(),
            bucket=str(self._root),
            storage_key=storage_key,
            byte_size=local_path.stat().st_size,
            content_type=mimetypes.guess_type(local_path.name)[0],
            etag=None,
        )

    def delete(self, storage_key: str) -> None:
        """Delete a local storage object if it exists."""
        local_path = self._resolve_storage_key_path(storage_key)
        local_path.unlink(missing_ok=True)

    def create_download_url(self, storage_key: str, expires_seconds: int = 3600) -> str:
        """Return a local file URI for development and test usage."""
        del expires_seconds
        local_path = self._resolve_storage_key_path(storage_key)
        if not local_path.exists():
            raise StorageObjectNotFoundError(f"Object not found: {storage_key}")
        return local_path.as_uri()

    def promote_from_quarantine(
        self, quarantine_key: str, final_key: str
    ) -> ObjectMetadata:
        """Move a local object from quarantine to final storage."""
        source_path = self._resolve_storage_key_path(quarantine_key)
        final_path = self._resolve_storage_key_path(final_key)
        if not source_path.exists():
            raise StorageObjectNotFoundError(f"Object not found: {quarantine_key}")

        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source_path), final_path)
        return self.get_metadata(final_key)

    def initiate_multipart_upload(
        self, storage_key: str, content_type: str | None = None
    ) -> MultipartUpload:
        """Local storage does not need multipart upload sessions."""
        del storage_key, content_type
        raise NotImplementedError("Local storage does not support multipart uploads")

    def create_multipart_part_url(
        self,
        storage_key: str,
        upload_id: str,
        part_number: int,
        expires_seconds: int = 3600,
    ) -> str:
        """Local storage does not need multipart upload URLs."""
        del storage_key, upload_id, part_number, expires_seconds
        raise NotImplementedError("Local storage does not support multipart uploads")

    def complete_multipart_upload(
        self,
        storage_key: str,
        upload_id: str,
        parts: list[dict[str, str | int]],
    ) -> ObjectMetadata:
        """Local storage does not need multipart upload sessions."""
        del storage_key, upload_id, parts
        raise NotImplementedError("Local storage does not support multipart uploads")

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        """Local storage does not need multipart upload sessions."""
        del storage_key, upload_id
        raise NotImplementedError("Local storage does not support multipart uploads")

    def verify_object(
        self,
        storage_key: str,
        expected_size: int | None = None,
        expected_content_type: str | None = None,
        expected_etag: str | None = None,
    ) -> ObjectMetadata:
        """Verify local object metadata when upload confirmation runs in dev/test."""
        metadata = self.get_metadata(storage_key)
        if expected_size is not None and metadata.byte_size != expected_size:
            raise StorageVerificationError(
                f"Object size mismatch for {storage_key}: "
                f"expected {expected_size}, got {metadata.byte_size}"
            )
        if (
            expected_content_type is not None
            and metadata.content_type != expected_content_type
        ):
            raise StorageVerificationError(
                f"Object content type mismatch for {storage_key}: "
                f"expected {expected_content_type}, got {metadata.content_type}"
            )
        if expected_etag is not None:
            raise StorageVerificationError(
                f"Local storage cannot verify etag for {storage_key}"
            )
        return metadata

    def _sanitize_filename(self, filename: str) -> str:
        """Keep only safe filename characters."""
        parts = Path(filename).parts
        safe_parts = []
        for part in parts:
            cleaned_part = SAFE_FILENAME_CHARS.sub("_", part).strip("._")
            if cleaned_part:
                safe_parts.append(cleaned_part)
        if not safe_parts:
            return "upload.bin"
        return "/".join(safe_parts)

    def _is_within_root(self, path: Path) -> bool:
        """Check that the resolved path stays inside the configured root."""
        try:
            path.relative_to(self._root)
        except ValueError:
            return False
        return True

    def _resolve_storage_key_path(self, storage_key: str) -> Path:
        """Resolve a storage key to an absolute path and enforce root boundary."""
        cleaned_key = storage_key.strip()
        if not cleaned_key:
            raise ValueError("Storage key cannot be empty")

        # Resolve against root so we can block traversal/absolute-path escapes.
        local_path = (self._root / cleaned_key).resolve()
        if not self._is_within_root(local_path):
            raise ValueError("Resolved upload path escapes configured root")

        return local_path
