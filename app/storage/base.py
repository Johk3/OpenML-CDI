from typing import Protocol, Any
from .types import MultipartPart, MultipartUpload, ObjectMetadata, UploadTarget


class StorageBackend(Protocol):
    def backend_name(self) -> str:
        """Return a short backend name (for example: 'local')."""
        ...

    def create_upload_target(
        self, filename: str, prefix: str | None = None
    ) -> UploadTarget:
        """Create and return a safe destination for an incoming upload."""
        ...

    def write_bytes(self, storage_key: str, data: bytes) -> None:
        """Persist raw bytes for a storage key."""
        ...

    def create_upload_url(
        self,
        storage_key: str,
        content_type: str | None = None,
        expires_seconds: int = 3600,
    ) -> str:
        """Create a short-lived direct upload URL."""
        ...

    def read_bytes(self, storage_key: str) -> bytes:
        """Read raw bytes previously stored for a storage key."""
        ...

    def open(self, storage_key: str, mode: str = "rb") -> Any:
        """Return a file-like object for a storage key."""
        ...

    def object_exists(self, storage_key: str) -> bool:
        """Return whether an object exists."""
        ...

    def get_metadata(self, storage_key: str) -> ObjectMetadata:
        """Return object metadata from the backend."""
        ...

    def delete(self, storage_key: str) -> None:
        """Delete an object if it exists."""
        ...

    def create_download_url(self, storage_key: str, expires_seconds: int = 3600) -> str:
        """Create a short-lived download URL."""
        ...

    def promote_from_quarantine(
        self, quarantine_key: str, final_key: str
    ) -> ObjectMetadata:
        """Promote a quarantined object into its final storage key."""
        ...

    def initiate_multipart_upload(
        self, storage_key: str, content_type: str | None = None
    ) -> MultipartUpload:
        """Start a multipart upload."""
        ...

    def create_multipart_part_url(
        self,
        storage_key: str,
        upload_id: str,
        part_number: int,
        expires_seconds: int = 3600,
    ) -> str:
        """Create a short-lived URL for uploading one multipart part."""
        ...

    def list_multipart_parts(
        self, storage_key: str, upload_id: str
    ) -> list[MultipartPart]:
        """List uploaded parts for a multipart upload."""
        ...

    def complete_multipart_upload(
        self,
        storage_key: str,
        upload_id: str,
        parts: list[dict[str, str | int]],
    ) -> None:
        """Complete a multipart upload."""
        ...

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        """Abort a multipart upload."""
        ...

    def verify_object(
        self,
        storage_key: str,
        expected_size: int | None = None,
        expected_content_type: str | None = None,
        expected_etag: str | None = None,
    ) -> ObjectMetadata:
        """Verify that an object exists and matches expected metadata."""
        ...
