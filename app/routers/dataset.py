from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status as http_status,
    BackgroundTasks,
    Query,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.datasets import (
    Dataset,
    DatasetConfirmUploadRequest,
    DatasetCreate,
    DatasetUploadContract,
    DatasetUploadURLRequest,
    DatasetUploadURLResponse,
    Statuses,
)
from app.database.models import Roles
from app.schemas.users import User
from app.security import get_current_active_user
from app.crud import dataset as dataset_crud
from app.database.models import Dataset as DatasetModel
import uuid
from uuid import uuid4
from typing import Annotated
from pathlib import Path
from app.services.scan import scan_uploaded_files
from app.services.dataset_objects import (
    DatasetObjectValidationError,
    attach_dataset_objects,
    build_dataset_objects,
    get_dataset_objects,
    mark_objects_uploaded,
    storage_keys_from_metadata,
)
from app.storage.errors import StorageError
from app.database import SessionLocal

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post(
    "/upload-url",
    response_model=DatasetUploadURLResponse,
    status_code=http_status.HTTP_201_CREATED,
)
def create_upload_url(
    payload: DatasetUploadURLRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
) -> DatasetUploadURLResponse:
    storage_keys = []
    presigned_urls = []
    upload_contracts = []
    upload_targets = []
    batch_uuid = uuid4().hex
    expires_seconds = request.app.state.settings.upload.expires_seconds
    for index, filename in enumerate(payload.filenames):
        upload_target = request.app.state.storage.create_upload_target(
            filename, prefix=batch_uuid
        )
        upload_targets.append(upload_target)
        storage_keys.append(upload_target.storage_key)
        content_type = payload.content_types[index] if payload.content_types else None
        url = _create_upload_contract_url(
            request=request,
            storage_key=upload_target.storage_key,
            content_type=content_type,
            expires_seconds=expires_seconds,
        )
        presigned_urls.append(url)
        upload_contracts.append(
            DatasetUploadContract(
                original_path=filename,
                object_key=upload_target.storage_key,
                url=url,
                method="PUT",
                headers=({"Content-Type": content_type} if content_type else {}),
                content_type=content_type,
                expires_seconds=expires_seconds,
            )
        )

    if payload.description is None:
        dataset_metadata = {"description": ""}
    elif isinstance(payload.description, dict):
        dataset_metadata = dict(payload.description)
    else:
        dataset_metadata = {"description": payload.description}

    dataset_metadata["filenames"] = payload.filenames
    if payload.content_types:
        dataset_metadata["content_types"] = payload.content_types
    if payload.byte_sizes:
        dataset_metadata["byte_sizes"] = payload.byte_sizes
    if payload.checksums:
        dataset_metadata["checksums"] = payload.checksums
    dataset_metadata["storage_keys"] = storage_keys

    try:
        dataset_objects = build_dataset_objects(
            storage=request.app.state.storage,
            upload_targets=upload_targets,
            original_paths=payload.filenames,
            content_types=payload.content_types,
            byte_sizes=payload.byte_sizes,
            checksums=payload.checksums,
        )
        dataset_metadata = attach_dataset_objects(dataset_metadata, dataset_objects)
    except DatasetObjectValidationError as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

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
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create dataset record",
        ) from error
    dataset_url = f"/datasets/{dataset.id}"
    return DatasetUploadURLResponse(
        id=dataset.id,
        presigned_urls=presigned_urls,
        upload_contracts=upload_contracts,
        dataset_url=dataset_url,
    )


def _create_upload_contract_url(
    *,
    request: Request,
    storage_key: str,
    content_type: str | None,
    expires_seconds: int,
) -> str:
    storage = request.app.state.storage
    if storage.backend_name() == "s3":
        return storage.create_upload_url(
            storage_key,
            content_type=content_type,
            expires_seconds=expires_seconds,
        )
    return f"{request.url_for('upload_file', storage_key=storage_key)}"


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


@router.post("/{dataset_id}/confirm-upload", status_code=http_status.HTTP_202_ACCEPTED)
def confirm_upload(
    dataset_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    payload: DatasetConfirmUploadRequest | None = None,
    db: Session = Depends(get_db),
):
    settings = request.app.state.settings
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)

    metadata = dict(dataset.dataset_metadata or {})
    storage_keys = storage_keys_from_metadata(metadata)
    if not storage_keys:
        # Fallback for single-file datasets
        storage_key = metadata.get("storage_key")
        filename = metadata.get("filename")
        if storage_key or filename:
            storage_keys = [storage_key or filename]

    if not storage_keys:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Dataset file references missing",
        )

    try:
        objects = get_dataset_objects(metadata)
        etags = payload.etags if payload and payload.etags else []
        verified_objects = []
        for index, obj in enumerate(objects):
            expected_etag = etags[index] if index < len(etags) else obj.get("etag")
            verified_objects.append(
                request.app.state.storage.verify_object(
                    obj["object_key"],
                    expected_size=obj.get("byte_size"),
                    expected_content_type=obj.get("content_type"),
                    expected_etag=expected_etag,
                )
            )
        metadata = attach_dataset_objects(
            metadata,
            mark_objects_uploaded(objects, verified_objects),
        )
        dataset_crud.update_dataset_metadata(
            db=db, dataset_id=dataset_id, metadata=metadata
        )
    except (DatasetObjectValidationError, StorageError, ValueError) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    background_tasks.add_task(
        scan_uploaded_files,
        dataset_id=dataset_id,
        storage_keys=storage_keys,
        quarantine_dir=Path(settings.storage.quarantine_dir),
        final_dir=Path(settings.storage.local_upload_dir) / "ready",
        clamd_socket=settings.storage.clamd_socket,
        clamd_host=settings.storage.clamd_host,
        clamd_port=settings.storage.clamd_port,
        clamd_timeout_seconds=settings.storage.clamd_timeout_seconds,
        storage=request.app.state.storage,
        db_factory=SessionLocal,
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


def expert_or_owner(current_user: User, dataset: Dataset | None) -> None:
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
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Quarantined datasets cannot be processed",
        )


@router.get("/list", response_model=list[Dataset])
def list_datasets(
    current_user: Annotated[User, Depends(get_current_active_user)],
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Return all datasets owned by the current user.
    Experts receive every dataset in the system.
    """
    if current_user.role == Roles.EXPERT:
        return dataset_crud.get_all_datasets(db=db, offset=offset, limit=limit)
    return dataset_crud.get_datasets_for_user(db=db, user_id=current_user.id)


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
    expert_or_owner(current_user, dataset)
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
    expert_or_owner(current_user, dataset)
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
    Update a datasets status. Only experts are allowed to change status.
    """
    if current_user.role != Roles.EXPERT:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only experts can change dataset status",
        )

    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

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
    expert_or_owner(current_user, dataset)
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
    expert_or_owner(current_user, dataset)
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
    expert_or_owner(current_user, dataset)
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
    expert_or_owner(current_user, dataset)
    dataset_crud.update_dataset_title(db=db, dataset_id=dataset_id, title=title)
    return {"status_code": 200, "message": "Dataset title updated successfully"}


@router.get("/{dataset_id}/download")
def download_dataset(
    dataset_id: uuid.UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Download the dataset file(s).
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset, db)

    storage_keys = dataset.dataset_metadata.get("storage_keys", [])
    if not storage_keys:
        storage_key = dataset.dataset_metadata.get("storage_key")
        if storage_key:
            storage_keys = [storage_key]

    if not storage_keys:
        raise HTTPException(status_code=404, detail="No files found for this dataset")

    # For now, we only support downloading the
    # first file (which is the ZIP if > 1 files were uploaded)
    storage_key = storage_keys[0]
    filename = dataset.dataset_metadata.get("filenames", [f"dataset_{dataset_id}.bin"])[
        0
    ]

    def iter_file():
        with request.app.state.storage.open(storage_key, "rb") as f:
            # chunked read
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
