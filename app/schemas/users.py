from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from app.database.models import Roles


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str


class UserCreate(UserBase):
    password: str
    role: Roles


class User(UserBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
