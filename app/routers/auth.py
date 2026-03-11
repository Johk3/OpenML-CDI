from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.auth import RegisterRequest, RegisterResponse
from app.security import decode_refresh_JWT, verify_hash, create_tokens
from app.crud.users import (
    TokenReuseDetectedError,
    get_family_owner,
    get_user_model_by_identifier,
    verify_jti,
    get_families,
)
from app.crud.users import revoke_family as revoke_family_crud
from app.services.email import EmailDeliveryError
from app.services.registration import (
    RegistrationConflictError,
    RegistrationValidationError,
    register_user,
)
from fastapi.security import OAuth2PasswordRequestForm
from typing import Annotated
from app.schemas.users import User
from app.security import get_current_active_user
import uuid

router = APIRouter(tags=["auth"])


@router.post("/auth/token")
def login_for_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    normalized_identifier = form_data.username.strip().lower()
    db_user = get_user_model_by_identifier(db, normalized_identifier)
    authenticated = verify_hash(
        db_user.password_hash if db_user else "",
        form_data.password,
    )
    if not authenticated or not db_user or not db_user.is_verified:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token, refresh_token = create_tokens(db_user.id, db)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # SET TO True FOR PRODUCTION, FALSE FOR TESTING FIXME
        samesite="strict",
        path="/auth/refresh",
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/auth/refresh")
def refresh_access(
    response: Response, refresh_token: str = Cookie(None), db: Session = Depends(get_db)
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    decoded_jwt = decode_refresh_JWT(refresh_token)
    refresh_token = decoded_jwt.get("jti", "")
    if decoded_jwt.get("type" != "refresh"):
        raise HTTPException(status_code=401, detail="Invalid JTI")
    try:
        user, family_id = verify_jti(
            db, refresh_token
        )  # will be comitted in create_tokens -> update_jti
    except TokenReuseDetectedError:
        raise HTTPException(status_code=401, detail="Invalid JTI")

    if not user or not family_id:
        raise HTTPException(status_code=401, detail="Invalid JTI")
    access_token, new_refresh_token = create_tokens(user.id, db, family_id)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=False,  # SET TO True FOR PRODUCTION, FALSE FOR TESTING FIXME
        samesite="strict",
        path="/auth/refresh",
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/auth/register", response_model=RegisterResponse, status_code=201)
def register(
    register_request: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        return register_user(
            db=db,
            request=register_request,
            email_sender=request.app.state.email_sender,
            app_base_url=request.app.state.settings.email.app_base_url,
            verification_ttl_hours=(
                request.app.state.settings.email.verification_ttl_hours
            ),
        )
    except RegistrationValidationError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Invalid request body",
                    "fields": exc.fields,
                }
            },
        )
    except RegistrationConflictError:
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "registration_conflict",
                    "message": "Unable to create account with provided credentials",
                }
            },
        )
    except EmailDeliveryError:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "verification_delivery_failed",
                    "message": "Unable to createrefresh_token account at this time",
                }
            },
        )


@router.post("/auth/refresh/logout")
def logout(
    current_user: Annotated[User, Depends(get_current_active_user)],
    response: Response,
    refresh_token: str = Cookie(None),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    decoded_jwt = decode_refresh_JWT(refresh_token)
    refresh_token = decoded_jwt.get("jti", "")
    _, family_id = verify_jti(
        db, refresh_token
    )  # verify_jti also revokes it, checking if the user is the
    # right one is not necessary as using a stolen JTI to revoke it would be benificial
    # it does still need to be comitted to remove the lock
    if not family_id:
        raise HTTPException(status_code=401, detail="Invalid family ID")
    revoke_family_crud(db, family_id)
    db.commit()
    response.delete_cookie(
        key="refresh_token",
        path="/auth/refresh",
        httponly=True,
        secure=False,  # SET TO True FOR PRODUCTION, FALSE FOR TESTING FIXME
        samesite="strict",
    )
    return {"status_code": 200, "message": "Succesfully logged out."}


@router.get("/auth/get_sessions")
def get_sessions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    return {"status_code": 200, "family_ids": get_families(db, current_user.id)}


@router.post("/auth/revoke")
def revoke_family(
    family_ids: list[uuid.UUID],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):  # TODO checks
    for family_id in family_ids:
        family_id_owner = get_family_owner(db, family_id)
        if family_id_owner and family_id_owner.id == current_user.id:
            revoke_family_crud(db, family_id)
    return {"status_code": 200, "message": "Succesfully revoked sessions."}
