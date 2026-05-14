from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class UploadTarget:
    storage_key: str
    local_path: Path | None


@dataclass(frozen=True)
class ObjectMetadata:
    backend: str
    bucket: str
    storage_key: str
    byte_size: int
    content_type: str | None = None
    etag: str | None = None


@dataclass(frozen=True)
class MultipartUpload:
    storage_key: str
    upload_id: str


@dataclass(frozen=True)
class MultipartPart:
    part_number: int
    etag: str
    size: int | None = None
