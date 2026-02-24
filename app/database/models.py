import uuid
from sqlalchemy import String, Uuid, DateTime, ForeignKey, JSON, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from . import Base
from datetime import datetime
import enum


class Roles(str, enum.Enum):
    EXPERT = "expert"
    UPLOADER = "uploader"


class Statuses(str, enum.Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    CONVERTED = "converted"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, default=uuid.uuid4, primary_key=True
    )  # optionally change to serverside default in production
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Roles] = mapped_column(SQLEnum(Roles), default=Roles.UPLOADER)
    datasets = relationship("Dataset", back_populates="owner")


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, default=uuid.uuid4, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    owner = relationship("User", back_populates="datasets")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    dataset_metadata: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[Statuses] = mapped_column(
        SQLEnum(Statuses), default=Statuses.PENDING, nullable=False
    )
    issue_url: Mapped[str] = mapped_column(Text, default="")
