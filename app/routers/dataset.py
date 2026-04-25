from fastapi import APIRouter, Depends, HTTPException, Request, status, BackgroundTasks
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.datasets import (
    Dataset,
    DatasetCreate,
    DatasetUploadURLRequest,
    DatasetUploadURLResponse,
    Statuses,
)
from app.schemas.users import User, Roles
from app.security import get_current_active_user
from app.crud import dataset as dataset_crud
from app.database.models import Dataset as DatasetModel
import uuid
from uuid import uuid4
from typing import Annotated
from pathlib import Path
from app.services.scan import scan_uploaded_files

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post(
    "/upload-url",
    response_model=DatasetUploadURLResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_upload_url(
    payload: DatasetUploadURLRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
) -> DatasetUploadURLResponse:
    storage_keys = []
    presigned_urls = []
    batch_uuid = uuid4().hex
    for i, filename in enumerate(payload.filenames):
        upload_target = request.app.state.storage.create_upload_target(
            filename, prefix=batch_uuid
        )
        storage_keys.append(upload_target.storage_key)
        url = f"{request.url_for('upload_file', storage_key=upload_target.storage_key)}"
        presigned_urls.append(url)

    if isinstance(payload.description, dict):
        dataset_metadata = dict(payload.description)
    else:
        dataset_metadata = {"description": payload.description}

    dataset_metadata["filenames"] = payload.filenames
    if payload.content_types:
        dataset_metadata["content_types"] = payload.content_types
    dataset_metadata["storage_keys"] = storage_keys

    dataset = DatasetModel(
        title=payload.name,
        dataset_metadata=dataset_metadata,
        owner_id=current_user.id,
        status=Statuses.PENDING,
    )
    try:
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
    except SQLAlchemyError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create dataset record",
        ) from error
    dataset_url = f"/datasets/{dataset.id}"
    return DatasetUploadURLResponse(
        id=dataset.id, presigned_urls=presigned_urls, dataset_url=dataset_url
    )


@router.put("/upload/{storage_key:path}")
async def upload_file(
    storage_key: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Receive file bytes and write to the configured storage backend."""
    data = await request.body()
    request.app.state.storage.write_bytes(storage_key, data)
    return {"message": "Upload successful", "storage_key": storage_key}


@router.post("/{dataset_id}/confirm-upload", status_code=status.HTTP_202_ACCEPTED)
def confirm_upload(
    dataset_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    settings = request.app.state.settings
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)

    storage_keys = dataset.dataset_metadata.get("storage_keys", [])
    if not storage_keys:
        # Fallback for single-file datasets
        storage_key = dataset.dataset_metadata.get("storage_key")
        filename = dataset.dataset_metadata.get("filename")
        if storage_key or filename:
            storage_keys = [storage_key or filename]

    if not storage_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset file references missing",
        )
    background_tasks.add_task(
        scan_uploaded_files,
        dataset_id=dataset_id,
        storage_keys=storage_keys,
        quarantine_dir=Path(settings.storage.quarantine_dir),
        final_dir=Path(settings.storage.local_upload_dir) / "ready",
        storage=request.app.state.storage,
        db=db,
    )
    return {
        "message": "Upload confirmed, scan started",
        "dataset_url": f"/datasets/{dataset_id}",
    }


@router.post("/create", response_model=Dataset)
def create_new_dataset(
    dataset: DatasetCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Create a new dataset.
    """
    if dataset.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to create this dataset"
        )
    # add dataset validation, like metadata and possible duplicates TODO
    return dataset_crud.create_dataset(db=db, dataset=dataset)


def expertOrOwner(current_user: User, dataset: Dataset | None, db: Session) -> None:
    if not dataset or (
        dataset.owner_id != current_user.id and current_user.role != Roles.EXPERT
    ):
        raise HTTPException(
            # Perhaps overkill but this way attackers cannot deduce existing dataset ids
            status_code=403,
            detail="Not authorized to access this dataset",
        )


def ensure_status_update_allowed(dataset: Dataset, next_status: Statuses) -> None:
    if dataset.status == Statuses.QUARANTINED and next_status != Statuses.QUARANTINED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quarantined datasets cannot be processed",
        )


@router.get("/get", response_model=Dataset)
def get_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Retrieve info about a dataset.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    if dataset:
        return dataset
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.post("/delete")
def delete_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Delete a dataset.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    dataset_crud.delete_dataset(db=db, dataset_id=dataset_id)
    return {"status_code": 200, "message": "Dataset deleted successfully"}


@router.post("/status")
def update_status_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    status: Statuses,
    db: Session = Depends(get_db),
):
    """
    Update a datasets status.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    ensure_status_update_allowed(dataset, status)
    dataset_crud.update_dataset_status(db=db, dataset_id=dataset_id, status=status)
    return {"status_code": 200, "message": "Dataset status updated successfully"}


@router.post("/metadata")
def update_metadata_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    metadata: dict,
    db: Session = Depends(get_db),
):
    """
    Update a datasets metadata.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    # Sync title if present in metadata
    if isinstance(metadata, dict) and "name" in metadata:
        dataset_crud.update_dataset_title(
            db=db, dataset_id=dataset_id, title=metadata["name"]
        )

    dataset_crud.update_dataset_metadata(
        db=db, dataset_id=dataset_id, metadata=metadata
    )
    return {"status_code": 200, "message": "Dataset metadata updated successfully"}


@router.post("/owner")
def update_owner_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    owner_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Update a datasets owner.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    dataset_crud.update_dataset_owner(
        db=db, dataset_id=dataset_id, new_owner_id=owner_id
    )
    return {"status_code": 200, "message": "Dataset owner updated successfully"}


@router.post("/issue_url")
def update_issue_url_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    issue_url: str,
    db: Session = Depends(get_db),
):
    """
    Update a datasets issue url.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    dataset_crud.update_dataset_issue_url(
        db=db, dataset_id=dataset_id, issue_url=issue_url
    )
    return {"status_code": 200, "message": "Dataset issue url updated successfully"}


@router.post("/title")
def update_title_url_dataset(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    title: str,
    db: Session = Depends(get_db),
):
    """
    Update a datasets title.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expertOrOwner(current_user, dataset, db)
    dataset_crud.update_dataset_title(db=db, dataset_id=dataset_id, title=title)
    return {"status_code": 200, "message": "Dataset title updated successfully"}
