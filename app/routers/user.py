from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models import Roles
from app.schemas.users import User
from app.crud import users as user_crud
import uuid
from typing import Annotated
from app.security import get_current_active_user
from email_validator import validate_email
from app.crud.users import get_family_name as get_family_name_crud

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/get", response_model=User)
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Get a user.
    """
    user = user_crud.get_user(db=db, user_id=user_id)
    return user if user else HTTPException(status_code=404, detail="User not found")


@router.post("/delete")
def delete_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    """
    Delete a user.
    """
    user_crud.del_user(db, current_user.id)
    return {"status_code": 200, "message": "User deleted"}


@router.post("/change_email")
def change_email_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    email: str,
    db: Session = Depends(get_db),
):
    """
    Change a users email address.
    """

    if user_crud.get_user_by_email(db, email):
        raise HTTPException(status_code=409, detail="Email already in use")
    try:
        validate_email(email)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid email: {e}")

    user_crud.change_user_email(db, email, current_user.id)
    return {"status_code": 200, "message": "User email changed"}


@router.post("/change_device_name")
def change_device_name(
    current_user: Annotated[User, Depends(get_current_active_user)],
    family_id: uuid.UUID,
    device_name: str,
    db: Session = Depends(get_db),
):
    """
    Change a family name (device_name).
    """
    family_owner = user_crud.get_family_owner(db, family_id)
    if not family_owner:
        raise HTTPException(status_code=400, detail="Invalid family_id")
    if not family_owner.id == current_user.id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_crud.set_family_name(db, family_id, device_name)

    return {"status_code": 200, "message": "Family name changed"}


@router.post("/update_password")
def update_password_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    password: str,
    db: Session = Depends(get_db),
):
    """
    update a users password.
    """
    user_crud.update_password(db, current_user.id, password)
    return {"status_code": 200, "message": "User password updated"}


@router.post("/update_role")
def update_role_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    role: Roles,
    db: Session = Depends(get_db),
):
    """
    Update a user role.
    """
    user_crud.update_role(db, current_user.id, role)
    return {"status_code": 200, "message": "User role changed"}


@router.get("/get_family_name")
def get_family_name(
    family_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    return {"status_code": 200, "family_name": get_family_name_crud(db, family_id)}
