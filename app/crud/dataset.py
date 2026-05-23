import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import models
from app.database.models import Statuses
from app.schemas import datasets as schemas


def _normalized_dataset_title(title: str) -> str:
    return title.strip().lower()


def _normalized_dataset_checksums(
    checksums: list[str | None] | tuple[str | None, ...] | None,
) -> tuple[str, ...]:
    if not checksums:
        return ()
    return tuple(
        sorted(
            {
                str(checksum).strip().lower()
                for checksum in checksums
                if checksum is not None and str(checksum).strip()
            }
        )
    )


def dataset_checksums_from_metadata(metadata: dict | None) -> tuple[str, ...]:
    if not isinstance(metadata, dict):
        return ()

    checksums = []
    raw_checksums = metadata.get("checksums")
    if isinstance(raw_checksums, list):
        checksums.extend(raw_checksums)

    objects = metadata.get("objects")
    if isinstance(objects, list):
        checksums.extend(
            obj.get("checksum")
            for obj in objects
            if isinstance(obj, dict) and obj.get("checksum") is not None
        )

    return _normalized_dataset_checksums(checksums)


def _metadata_references_storage_key(metadata: dict | None, storage_key: str) -> bool:
    if not isinstance(metadata, dict):
        return False

    if metadata.get("storage_key") == storage_key:
        return True

    storage_keys = metadata.get("storage_keys")
    if isinstance(storage_keys, list) and storage_key in storage_keys:
        return True

    objects = metadata.get("objects")
    if isinstance(objects, list):
        for obj in objects:
            if not isinstance(obj, dict):
                continue
            if (
                obj.get("object_key") == storage_key
                or obj.get("quarantine_key") == storage_key
            ):
                return True

    return False


def get_dataset_for_storage_key(
    db: Session, storage_key: str
) -> schemas.Dataset | None:
    normalized_storage_key = storage_key.strip()
    if not normalized_storage_key:
        return None

    rows = db.query(models.Dataset).all()
    for row in rows:
        if _metadata_references_storage_key(
            row.dataset_metadata, normalized_storage_key
        ):
            return schemas.Dataset.model_validate(row)
    return None


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


def update_dataset_title(db: Session, dataset_id: uuid.UUID, title: str):
    db_dataset = _get_dataset(db, dataset_id)
    db_dataset.title = title
    db.commit()
    db.refresh(db_dataset)
    return schemas.Dataset.model_validate(db_dataset)


def dataset_duplicate_match_for_owner(
    db: Session,
    *,
    owner_id: uuid.UUID | None,
    title: str,
    checksums: list[str | None] | tuple[str | None, ...] | None = None,
    exclude_dataset_id: uuid.UUID | None = None,
) -> str | None:
    if owner_id is None:
        return None

    query = db.query(models.Dataset.id).filter(
        models.Dataset.owner_id == owner_id,
        func.lower(func.trim(models.Dataset.title)) == _normalized_dataset_title(title),
    )
    if exclude_dataset_id is not None:
        query = query.filter(models.Dataset.id != exclude_dataset_id)
    matches = query.all()
    if not matches:
        return None

    normalized_checksums = _normalized_dataset_checksums(checksums)
    if not normalized_checksums:
        return "title"

    for row in matches:
        existing_dataset = _get_dataset(db, row.id)
        if (
            dataset_checksums_from_metadata(existing_dataset.dataset_metadata)
            == normalized_checksums
        ):
            return "title_checksum"
    return None


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
