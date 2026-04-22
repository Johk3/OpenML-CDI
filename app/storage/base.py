from typing import Protocol, Any
from .types import UploadTarget


class StorageBackend(Protocol):
    def backend_name(self) -> str:
        """Return a short backend name (for example: 'local')."""
        ...

    def create_upload_target(self, filename: str) -> UploadTarget:
        """Create and return a safe destination for an incoming upload."""
        ...

    def write_bytes(self, storage_key: str, data: bytes) -> None:
        """Persist raw bytes for a storage key."""
        ...

    def read_bytes(self, storage_key: str) -> bytes:
        """Read raw bytes previously stored for a storage key."""
        ...

    def open(self, storage_key: str, mode: str = "rb") -> Any:
        """Return a file-like object for a storage key."""
        ...
