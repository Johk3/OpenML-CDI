from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.users import AccountDeletionMode, AccountDeletionRequest, User
from app.security import get_current_active_user
from app.services.deletion_cleanup import (
    delete_user_account,
    queue_github_issue_updates,
)
from app.storage.errors import StorageError

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/delete")
def delete_user(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    payload: AccountDeletionRequest | None = None,
    db: Session = Depends(get_db),
):
    """
    Delete a user.
    """
    deletion_mode = payload.mode if payload else AccountDeletionMode.ACCOUNT_ONLY
    try:
        result = delete_user_account(
            db=db,
            user_id=current_user.id,
            storage=request.app.state.storage,
            delete_owned_datasets=(
                deletion_mode == AccountDeletionMode.ACCOUNT_AND_DATASETS
            ),
        )
    except StorageError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    settings = request.app.state.settings
    queue_github_issue_updates(
        background_tasks=background_tasks,
        updates=result.github_updates,
        settings=settings.github_issues,
        app_base_url=settings.app_base_url,
    )
    return {
        "status_code": 200,
        "message": "User deleted",
        "datasets_preserved": result.datasets_preserved,
        "datasets_deleted": result.datasets_deleted,
        "dataset_deletion_requests": result.dataset_deletion_requests,
    }
