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
from datetime import datetime, timedelta, timezone
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile
from app.database import get_db
from app.schemas.datasets import (
    Dataset,
    DatasetConfirmUploadRequest,
    DatasetCreate,
    DatasetDetail,
    DatasetMultipartCompleteRequest,
    DatasetMultipartObjectRequest,
    DatasetMultipartPartsResponse,
    DatasetMultipartPartURLResponse,
    DatasetMultipartUploadedPart,
    DatasetMultipartUploadCreateRequest,
    DatasetMultipartUploadResponse,
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
    get_upload_package_metadata,
    mark_objects_uploaded,
    normalize_directory_structure,
    storage_keys_from_metadata,
)
from app.services.github_issues import (
    GitHubAPIError,
    create_issue_for_dataset,
    get_issue_with_comments,
)
from app.storage.errors import StorageError
from app.database import SessionLocal

router = APIRouter(prefix="/datasets", tags=["datasets"])
MULTIPART_UPLOADS_KEY = "multipart_uploads"
MULTIPART_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024


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
        byte_size = (
            payload.byte_sizes[index]
            if payload.byte_sizes and index < len(payload.byte_sizes)
            else None
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
                upload_mode=_upload_mode_for_contract(
                    request=request,
                    byte_size=byte_size,
                ),
            )
        )

    if payload.description is None:
        dataset_metadata = {"description": ""}
    elif isinstance(payload.description, dict):
        dataset_metadata = dict(payload.description)
    else:
        dataset_metadata = {"description": payload.description}

    requested_directory_structure = payload.directory_structure
    if requested_directory_structure is None and isinstance(payload.description, dict):
        maybe_directory_structure = payload.description.get("directory_structure")
        if isinstance(maybe_directory_structure, dict):
            requested_directory_structure = maybe_directory_structure

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
        directory_structure = normalize_directory_structure(
            requested_directory_structure,
            original_paths=payload.filenames,
        )
        if directory_structure:
            dataset_metadata["directory_structure"] = directory_structure
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


def _upload_mode_for_contract(*, request: Request, byte_size: int | None) -> str:
    storage = request.app.state.storage
    if (
        storage.backend_name() == "s3"
        and byte_size is not None
        and byte_size > MULTIPART_UPLOAD_THRESHOLD_BYTES
    ):
        return "multipart"
    return "direct"


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


@router.post(
    "/{dataset_id}/multipart-uploads",
    response_model=DatasetMultipartUploadResponse,
    status_code=http_status.HTTP_201_CREATED,
)
def initiate_multipart_upload(
    dataset_id: uuid.UUID,
    payload: DatasetMultipartUploadCreateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
) -> DatasetMultipartUploadResponse:
    storage = _require_multipart_storage(request)
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    metadata = dict(dataset.dataset_metadata or {})
    upload_object = _get_quarantine_upload_object(metadata, payload.object_key)
    expires_seconds = request.app.state.settings.upload.expires_seconds
    content_type = payload.content_type or upload_object.get("content_type")

    try:
        upload = storage.initiate_multipart_upload(
            payload.object_key,
            content_type=content_type,
        )
    except (NotImplementedError, StorageError, ValueError) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    session = {
        "object_key": upload.storage_key,
        "part_size": payload.part_size,
        "content_type": content_type,
        "expires_seconds": expires_seconds,
        "expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=expires_seconds)
        ).isoformat(),
        "status": "active",
    }
    metadata = _set_multipart_upload_session(metadata, upload.upload_id, session)
    dataset_crud.update_dataset_metadata(
        db=db, dataset_id=dataset_id, metadata=metadata
    )

    return DatasetMultipartUploadResponse(
        dataset_id=dataset_id,
        object_key=upload.storage_key,
        upload_id=upload.upload_id,
        part_size=payload.part_size,
        expires_seconds=expires_seconds,
        status="active",
    )


@router.post(
    "/{dataset_id}/multipart-uploads/{upload_id}/parts/{part_number}/url",
    response_model=DatasetMultipartPartURLResponse,
    status_code=http_status.HTTP_201_CREATED,
)
def create_multipart_part_url(
    dataset_id: uuid.UUID,
    upload_id: str,
    part_number: int,
    payload: DatasetMultipartObjectRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
) -> DatasetMultipartPartURLResponse:
    if part_number <= 0 or part_number > 10000:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="part_number must be between 1 and 10000",
        )

    storage = _require_multipart_storage(request)
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    metadata = dict(dataset.dataset_metadata or {})
    _get_active_multipart_upload_session(metadata, upload_id, payload.object_key)
    expires_seconds = request.app.state.settings.upload.expires_seconds

    try:
        url = storage.create_multipart_part_url(
            payload.object_key,
            upload_id=upload_id,
            part_number=part_number,
            expires_seconds=expires_seconds,
        )
    except (NotImplementedError, StorageError, ValueError) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return DatasetMultipartPartURLResponse(
        url=url,
        method="PUT",
        headers={},
        expires_seconds=expires_seconds,
    )


@router.get(
    "/{dataset_id}/multipart-uploads/{upload_id}/parts",
    response_model=DatasetMultipartPartsResponse,
)
def list_multipart_parts(
    dataset_id: uuid.UUID,
    upload_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    object_key: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> DatasetMultipartPartsResponse:
    storage = _require_multipart_storage(request)
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    metadata = dict(dataset.dataset_metadata or {})
    _get_active_multipart_upload_session(metadata, upload_id, object_key)

    try:
        parts = storage.list_multipart_parts(object_key, upload_id=upload_id)
    except (NotImplementedError, StorageError, ValueError) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return DatasetMultipartPartsResponse(
        object_key=object_key,
        upload_id=upload_id,
        parts=[
            DatasetMultipartUploadedPart(
                part_number=part.part_number,
                etag=part.etag,
                size=part.size,
            )
            for part in parts
        ],
    )


@router.post(
    "/{dataset_id}/multipart-uploads/{upload_id}/complete",
    status_code=http_status.HTTP_202_ACCEPTED,
)
def complete_multipart_upload(
    dataset_id: uuid.UUID,
    upload_id: str,
    payload: DatasetMultipartCompleteRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    storage = _require_multipart_storage(request)
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    metadata = dict(dataset.dataset_metadata or {})
    upload_object = _get_quarantine_upload_object(metadata, payload.object_key)
    session = _get_active_multipart_upload_session(
        metadata,
        upload_id,
        payload.object_key,
    )
    parts = _validated_complete_parts(payload)

    try:
        storage.complete_multipart_upload(
            payload.object_key,
            upload_id=upload_id,
            parts=parts,
        )
        verified_metadata = storage.verify_object(
            payload.object_key,
            expected_size=upload_object.get("byte_size"),
            expected_content_type=upload_object.get("content_type"),
        )
        objects = get_dataset_objects(metadata)
        updated_objects = [
            (
                mark_objects_uploaded([obj], [verified_metadata])[0]
                if obj["object_key"] == payload.object_key
                else obj
            )
            for obj in objects
        ]
        metadata = attach_dataset_objects(metadata, updated_objects)
        metadata = _set_multipart_upload_session(
            metadata,
            upload_id,
            {
                **session,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "etag": verified_metadata.etag,
                "byte_size": verified_metadata.byte_size,
            },
        )
        dataset_crud.update_dataset_metadata(
            db=db, dataset_id=dataset_id, metadata=metadata
        )
    except (
        DatasetObjectValidationError,
        NotImplementedError,
        StorageError,
        ValueError,
    ) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    _enqueue_upload_scan(
        request=request,
        background_tasks=background_tasks,
        dataset_id=dataset_id,
        storage_keys=[payload.object_key],
    )
    return {
        "message": "Multipart upload completed, scan started",
        "dataset_url": f"/datasets/{dataset_id}",
    }


@router.delete(
    "/{dataset_id}/multipart-uploads/{upload_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
)
def abort_multipart_upload(
    dataset_id: uuid.UUID,
    upload_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    object_key: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> None:
    storage = _require_multipart_storage(request)
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    metadata = dict(dataset.dataset_metadata or {})
    session = _get_active_multipart_upload_session(metadata, upload_id, object_key)

    try:
        storage.abort_multipart_upload(object_key, upload_id)
    except (NotImplementedError, StorageError, ValueError) as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    metadata = _set_multipart_upload_session(
        metadata,
        upload_id,
        {
            **session,
            "status": "aborted",
            "aborted_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    dataset_crud.update_dataset_metadata(
        db=db, dataset_id=dataset_id, metadata=metadata
    )
    return None


@router.post("/{dataset_id}/confirm-upload", status_code=http_status.HTTP_202_ACCEPTED)
def confirm_upload(
    dataset_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    payload: DatasetConfirmUploadRequest | None = None,
    db: Session = Depends(get_db),
):
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    settings = request.app.state.settings

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

    _enqueue_upload_scan(
        request=request,
        background_tasks=background_tasks,
        dataset_id=dataset_id,
        storage_keys=storage_keys,
    )
    background_tasks.add_task(
        create_issue_for_dataset,
        dataset_id=dataset_id,
        title=dataset.title,
        metadata=metadata,
        settings=settings.github_issues,
        app_base_url=settings.email.app_base_url,
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


def _require_multipart_storage(request: Request):
    storage = request.app.state.storage
    if storage.backend_name() != "s3":
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Multipart uploads require S3 storage",
        )
    return storage


def _get_quarantine_upload_object(metadata: dict, object_key: str) -> dict:
    try:
        objects = get_dataset_objects(metadata)
    except DatasetObjectValidationError as error:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    for obj in objects:
        if obj["object_key"] == object_key:
            if not object_key.startswith("quarantine/"):
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Multipart uploads require a quarantine object key",
                )
            return obj

    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail="Multipart object key is not part of this dataset",
    )


def _get_active_multipart_upload_session(
    metadata: dict,
    upload_id: str,
    object_key: str,
) -> dict:
    _get_quarantine_upload_object(metadata, object_key)
    sessions = metadata.get(MULTIPART_UPLOADS_KEY) or {}
    session = sessions.get(upload_id)
    if not isinstance(session, dict) or session.get("object_key") != object_key:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Multipart upload session not found",
        )
    if session.get("status") != "active":
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Multipart upload session is not active",
        )
    return dict(session)


def _set_multipart_upload_session(
    metadata: dict,
    upload_id: str,
    session: dict,
) -> dict:
    updated = dict(metadata or {})
    sessions = dict(updated.get(MULTIPART_UPLOADS_KEY) or {})
    sessions[upload_id] = session
    updated[MULTIPART_UPLOADS_KEY] = sessions
    return updated


def _validated_complete_parts(
    payload: DatasetMultipartCompleteRequest,
) -> list[dict[str, str | int]]:
    part_numbers = [part.part_number for part in payload.parts]
    if part_numbers != sorted(part_numbers) or len(part_numbers) != len(
        set(part_numbers)
    ):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Multipart parts must be ordered by unique part_number values",
        )
    complete_parts = []
    for part in payload.parts:
        etag = part.etag.strip()
        if not etag:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Multipart part etag cannot be empty",
            )
        complete_parts.append({"part_number": part.part_number, "etag": etag})
    return complete_parts


def _enqueue_upload_scan(
    *,
    request: Request,
    background_tasks: BackgroundTasks,
    dataset_id: uuid.UUID,
    storage_keys: list[str],
) -> None:
    settings = request.app.state.settings
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


def _dataset_detail_response(dataset: DatasetModel) -> DatasetDetail:
    metadata = dict(dataset.dataset_metadata or {})
    storage_objects = get_dataset_objects(metadata)
    has_downloadable_files = bool(storage_keys_from_metadata(metadata))
    return DatasetDetail(
        id=dataset.id,
        title=dataset.title,
        dataset_metadata=metadata,
        owner_id=dataset.owner_id,
        issue_url=dataset.issue_url or "",
        created_at=dataset.created_at,
        status=dataset.status,
        dataset_url=f"/datasets/{dataset.id}",
        download_url=(
            f"/api/datasets/{dataset.id}/download" if has_downloadable_files else None
        ),
        storage_objects=storage_objects,
        upload_package=get_upload_package_metadata(metadata),
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
        datasets = dataset_crud.get_all_datasets(db=db, offset=offset, limit=limit)
        return [dataset for dataset in datasets if _is_ready_for_expert_review(dataset)]
    return dataset_crud.get_datasets_for_user(db=db, user_id=current_user.id)


@router.get("/get", response_model=DatasetDetail)
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
        return _dataset_detail_response(dataset)
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset_detail(
    dataset_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Retrieve a dataset detail view with stable UI links and storage object metadata.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)
    if dataset:
        return _dataset_detail_response(dataset)
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
    request: Request,
    background_tasks: BackgroundTasks,
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

    if dataset.issue_url:
        from app.services.github_issues import update_issue_for_dataset

        settings = request.app.state.settings
        title = metadata.get("name", dataset.title)

        background_tasks.add_task(
            update_issue_for_dataset,
            dataset_id=dataset_id,
            issue_url=dataset.issue_url,
            title=title,
            metadata=metadata,
            settings=settings.github_issues,
            app_base_url=settings.email.app_base_url,
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


@router.get("/{dataset_id}/github-discussion")
def get_github_discussion(
    dataset_id: uuid.UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Proxy GitHub issue data and comments for the dataset.
    """
    dataset = dataset_crud.get_dataset(db=db, dataset_id=dataset_id)
    expert_or_owner(current_user, dataset)

    issue_url = dataset.issue_url if dataset else ""
    if not issue_url:
        return {"state": "none", "html_url": "", "comments": []}

    settings = request.app.state.settings.github_issues
    try:
        return get_issue_with_comments(settings, issue_url)
    except GitHubAPIError as error:
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {error}",
        ) from error


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
    expert_or_owner(current_user, dataset)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    downloadable_objects = _downloadable_objects(dataset)

    if len(downloadable_objects) > 1:
        archive = BytesIO()
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zip_file:
            for storage_key, original_path in downloadable_objects:
                with request.app.state.storage.open(storage_key, "rb") as f:
                    zip_file.writestr(original_path, f.read())
        archive.seek(0)
        filename = f"dataset_{dataset_id}.zip"
        return StreamingResponse(
            archive,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    storage_key, original_path = downloadable_objects[0]
    filename = Path(original_path).name

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


def _is_ready_for_expert_review(dataset: Dataset) -> bool:
    if dataset.status != Statuses.PENDING:
        return False

    metadata = dataset.dataset_metadata or {}
    objects = get_dataset_objects(metadata)
    if objects:
        return all(
            obj["scan_state"] == "clean"
            and obj["download_state"] == "downloadable"
            and obj["final_object_key"]
            for obj in objects
        )

    scan_files = (metadata.get("malware_scan") or {}).get("files") or []
    return bool(scan_files) and all(
        result.get("status") == "clean" for result in scan_files
    )


def _downloadable_objects(dataset: Dataset) -> list[tuple[str, str]]:
    if dataset.status == Statuses.QUARANTINED:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Dataset files are not available for download",
        )

    metadata = dataset.dataset_metadata or {}
    objects = get_dataset_objects(metadata)
    if not objects:
        raise HTTPException(status_code=404, detail="No files found for this dataset")

    if "objects" not in metadata:
        return [(obj["object_key"], obj["original_path"]) for obj in objects]

    downloadable_objects = [
        (obj["final_object_key"], obj["original_path"])
        for obj in objects
        if obj["download_state"] == "downloadable" and obj["final_object_key"]
    ]
    if downloadable_objects:
        return downloadable_objects

    raise HTTPException(
        status_code=http_status.HTTP_409_CONFLICT,
        detail="Dataset files are not available for download",
    )
