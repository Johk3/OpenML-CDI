import uuid
from sqlalchemy import Boolean, String, Uuid, DateTime, ForeignKey, JSON, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from . import Base
from datetime import datetime, timezone
import enum


class Roles(str, enum.Enum):
    EXPERT = "expert"
    USER = "user"


class Statuses(str, enum.Enum):
    PENDING_UPLOAD = "pending_upload"
    UPLOADED = "uploaded"
    SCANNING = "scanning"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"
    INTEGRATION_FAILED = "integration_failed"
    PENDING = "pending"
    CLAIMED = "claimed"
    CONVERTED = "converted"
    QUARANTINED = "quarantined"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, default=uuid.uuid4, primary_key=True, index=True
    )  # optionally change to serverside default in production
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    github_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Roles] = mapped_column(SQLEnum(Roles), default=Roles.USER)
    datasets = relationship("Dataset", back_populates="owner")
    refresh_tokens = relationship(
        "RefreshToken", back_populates="owner", cascade="all, delete-orphan"
    )


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, default=uuid.uuid4, primary_key=True, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    owner = relationship("User", back_populates="datasets")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    dataset_metadata: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[Statuses] = mapped_column(
        SQLEnum(Statuses), default=Statuses.PENDING_UPLOAD, nullable=False
    )
    issue_url: Mapped[str] = mapped_column(Text, default="")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    owner = relationship("User", back_populates="refresh_tokens")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, default=uuid.uuid4, nullable=False, index=True
    )
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class TokenFamilyName(Base):
    __tablename__ = "token_family_names"

    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, primary_key=True)
    family_name: Mapped[str] = mapped_column(String(255))
