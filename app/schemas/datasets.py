from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from app.database.models import Statuses


class DatasetBase(BaseModel):
    title: str
    dataset_metadata: dict = {}
    owner_id: UUID
    issue_url: str = ""


class DatasetCreate(DatasetBase):
    status: Statuses


class Dataset(DatasetBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
