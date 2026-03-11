from datetime import datetime
import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.database.models import Roles

USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]+$")


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=12, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if len(normalized) > 254:
                raise ValueError("Value should have at most 254 characters")
            return normalized
        return value

    @field_validator("username", mode="before")
    @classmethod
    def validate_username(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(normalized):
            raise ValueError(
                "Username may contain only lowercase letters, digits, '.', '_' and '-'"
            )
        return normalized

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def validate_name(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value cannot be blank")
        return normalized


class RegisterResponse(BaseModel):
    id: UUID
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    role: Roles
    is_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, frozen=True)
