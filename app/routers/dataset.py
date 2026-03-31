from fastapi import APIRouter, Depends, HTTPException, Request, status
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
from app.services.presign import generate_presigned_put_url
import uuid
from typing import Annotated

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
    settings = request.app.state.settings

    if isinstance(payload.description, dict):
        dataset_metadata = dict(payload.description)
    else:
        dataset_metadata = {"description": payload.description}
    dataset_metadata["filename"] = payload.filename

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

    presigned_url = generate_presigned_put_url(
        payload.filename,
        bucket_name=settings.upload.target,
        region_name=settings.upload.location,
        expires_in_seconds=settings.upload.expires_seconds,
    )

    return DatasetUploadURLResponse(id=dataset.id, presigned_url=presigned_url)


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
    dataset_crud.update_dataset_metadata(
        db=db, dataset_id=dataset_id, metadata=metadata
    )
    return {"status_code": 200, "message": "Dataset metadate updated successfully"}


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
