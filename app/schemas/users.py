from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from uuid import UUID
from datetime import datetime
from app.database.models import Roles


class UserBase(BaseModel):
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    role: Roles


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: UUID
    created_at: datetime
    is_verified: bool
    datasets: list[UUID] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, frozen=True)

    @field_validator("datasets", mode="before")
    @classmethod
    def normalize_dataset_ids(cls, value: object) -> list[UUID]:
        if value is None:
            return []
        return [item.id if hasattr(item, "id") else item for item in value]
