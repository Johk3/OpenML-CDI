from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.database.models import Statuses


class DatasetBase(BaseModel):
    title: str
    dataset_metadata: dict[str, Any] = Field(default_factory=dict)
    owner_id: UUID | None
    issue_url: str = ""


class DatasetCreate(DatasetBase):
    status: Statuses = Statuses.PENDING


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


class DatasetUploadURLResponse(BaseModel):
    id: UUID
    presigned_urls: list[str]
    upload_contracts: list[DatasetUploadContract] = Field(default_factory=list)
    dataset_url: str | None = None


class DatasetConfirmUploadRequest(BaseModel):
    etags: list[str | None] | None = None
