from sqlalchemy.orm import Session
from app.database import models
from app.database.models import Statuses
from app.schemas import datasets as schemas
import uuid


def create_dataset(db: Session, dataset: schemas.DatasetCreate) -> schemas.Dataset:
    new_dataset = models.Dataset(
        title=dataset.title,
        dataset_metadata=dataset.dataset_metadata,
        owner_id=dataset.owner_id,
        status=dataset.status,
        issue_url=dataset.issue_url,
    )
    db.add(new_dataset)
    db.commit()
    db.refresh(new_dataset)
    return schemas.Dataset.model_validate(new_dataset)


def get_dataset(db: Session, dataset_id: uuid.UUID) -> schemas.Dataset | None:
    db_dataset = (
        db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    )
    if db_dataset:
        return schemas.Dataset.model_validate(db_dataset)
    return None


def _get_dataset(db: Session, dataset_id: uuid.UUID) -> models.Dataset:
    db_dataset = (
        db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    )
    if db_dataset:
        return db_dataset
    raise (ValueError("Dataset not found"))


def update_dataset_owner(
    db: Session, dataset_id: uuid.UUID, new_owner_id: uuid.UUID
) -> schemas.Dataset:
    db_dataset = _get_dataset(db, dataset_id)
    db_dataset.owner_id = new_owner_id

    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def update_dataset_metadata(
    db: Session, dataset_id: uuid.UUID, metadata: dict
) -> schemas.Dataset:
    db_dataset = _get_dataset(db, dataset_id)
    # Perform a shallow merge to preserve torage_key, filename, etc
    current_metadata = dict(db_dataset.dataset_metadata or {})
    current_metadata.update(metadata)
    db_dataset.dataset_metadata = current_metadata
    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def update_dataset_status(
    db: Session, dataset_id: uuid.UUID, status: Statuses
) -> schemas.Dataset:
    db_dataset = _get_dataset(db, dataset_id)
    db_dataset.status = status
    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def update_dataset_issue_url(
    db: Session, dataset_id: uuid.UUID, issue_url: str
) -> schemas.Dataset:
    db_dataset = _get_dataset(db, dataset_id)
    db_dataset.issue_url = issue_url
    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def update_dataset_title(db: Session, dataset_id: uuid.UUID, title: str):
    db_dataset = _get_dataset(db, dataset_id)
    db_dataset.title = title
    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def delete_dataset(db: Session, dataset_id: uuid.UUID) -> None:
    db_dataset = _get_dataset(db, dataset_id)
    db.delete(db_dataset)
    db.commit()


def get_datasets_for_user(db: Session, user_id: uuid.UUID) -> list[schemas.Dataset]:
    rows = (
        db.query(models.Dataset)
        .filter(models.Dataset.owner_id == user_id)
        .order_by(models.Dataset.created_at.desc())
        .all()
    )
    return [schemas.Dataset.model_validate(r) for r in rows]


def get_all_datasets(
    db: Session, offset: int = 0, limit: int = 100
) -> list[schemas.Dataset]:
    rows = (
        db.query(models.Dataset)
        .order_by(models.Dataset.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [schemas.Dataset.model_validate(r) for r in rows]
