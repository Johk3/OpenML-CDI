import re
from pathlib import Path
from uuid import uuid4

from .types import UploadTarget

SAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class LocalStorageBackend:
    def __init__(self, root_dir: str | Path):
        """Store uploads under a configured local root directory."""
        self._root = Path(root_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def backend_name(self) -> str:
        """Return the backend identifier used by configuration/factory code."""
        return "local"

    def create_upload_target(self, filename: str) -> UploadTarget:
        """Create a unique, safe local upload destination for a filename."""
        safe_filename = self._sanitize_filename(filename)
        storage_key = f"datasets/{uuid4().hex}_{safe_filename}"

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

    def _sanitize_filename(self, filename: str) -> str:
        """Keep only safe filename characters and drop any path components."""
        base_name = Path(filename).name
        cleaned_name = SAFE_FILENAME_CHARS.sub("_", base_name)
        cleaned_name = cleaned_name.strip("._")

        if not cleaned_name:
            return "upload.bin"
        return cleaned_name

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
