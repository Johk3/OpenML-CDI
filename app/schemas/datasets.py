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


class DatasetUploadURLRequest(BaseModel):
    name: str = Field(..., min_length=1)
    description: str | dict[str, Any]
    filenames: list[str] = Field(..., min_items=1)
    content_types: list[str | None] | None = None


# Any file extension is accepted — format validation is deferred to a post-upload step


class DatasetUploadURLResponse(BaseModel):
    id: UUID
    presigned_urls: list[str]
    dataset_url: str | None = None
