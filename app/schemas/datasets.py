from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.database.models import Statuses


class DatasetBase(BaseModel):
    title: str
    dataset_metadata: dict[str, Any] = Field(default_factory=dict)
    owner_id: UUID | None
    issue_url: str = ""


class DatasetCreate(DatasetBase):
    status: Statuses = Statuses.PENDING_UPLOAD


class Dataset(DatasetBase):
    id: UUID
    created_at: datetime
    status: Statuses

    class Config:
        from_attributes = True
        frozen = True  # no changes


class DatasetDetail(Dataset):
    dataset_url: str
    download_url: str | None = None
    storage_objects: list[dict[str, Any]] = Field(default_factory=list)
    upload_package: dict[str, Any] | None = None
    lifecycle: dict[str, Any] = Field(default_factory=dict)


class DatasetUploadURLRequest(BaseModel):
    name: str = Field(..., min_length=1)
    description: str | dict[str, Any] | None = None
    filenames: list[str] = Field(..., min_items=1)
    content_types: list[str | None] | None = None
    byte_sizes: list[int | None] | None = None
    checksums: list[str | None] | None = None
    directory_structure: dict[str, Any] | None = None


class DatasetUploadContract(BaseModel):
    original_path: str
    object_key: str
    url: str
    method: str = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)
    content_type: str | None = None
    expires_seconds: int
    upload_mode: Literal["direct", "multipart"] = "direct"


class DatasetUploadURLResponse(BaseModel):
    id: UUID
    presigned_urls: list[str]
    upload_contracts: list[DatasetUploadContract] = Field(default_factory=list)
    dataset_url: str | None = None


class DatasetConfirmUploadRequest(BaseModel):
    etags: list[str | None] | None = None


class DatasetMultipartUploadCreateRequest(BaseModel):
    object_key: str = Field(..., min_length=1)
    content_type: str | None = None
    part_size: int = Field(default=8 * 1024 * 1024, ge=5 * 1024 * 1024)


class DatasetMultipartUploadResponse(BaseModel):
    dataset_id: UUID
    object_key: str
    upload_id: str
    part_size: int
    expires_seconds: int
    status: str


class DatasetMultipartObjectRequest(BaseModel):
    object_key: str = Field(..., min_length=1)


class DatasetMultipartPartURLResponse(BaseModel):
    url: str
    method: str = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)
    expires_seconds: int


class DatasetMultipartUploadedPart(BaseModel):
    part_number: int
    etag: str
    size: int | None = None


class DatasetMultipartPartsResponse(BaseModel):
    object_key: str
    upload_id: str
    parts: list[DatasetMultipartUploadedPart]


class DatasetMultipartCompletedPart(BaseModel):
    part_number: int = Field(..., ge=1, le=10000)
    etag: str = Field(..., min_length=1)


class DatasetMultipartCompleteRequest(BaseModel):
    object_key: str = Field(..., min_length=1)
    parts: list[DatasetMultipartCompletedPart] = Field(..., min_length=1)
