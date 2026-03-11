# Authentication guide

This document describes the current backend authentication endpoints and the
new registration flow.

## Endpoints

### `POST /auth/register`

Create a new account and trigger a verification email.

Request body:

```json
{
  "email": "new.user@example.com",
  "username": "new_user",
  "password": "StrongPass!234",
  "first_name": "New",
  "last_name": "User"
}
```

Success response (`201 Created`):

```json
{
  "id": "uuid",
  "email": "new.user@example.com",
  "username": "new_user",
  "first_name": "New",
  "last_name": "User",
  "role": "uploader",
  "is_verified": false,
  "created_at": "2026-03-03T12:34:56Z"
}
```

Validation response (`400 Bad Request`):

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request body",
    "fields": {
      "email": ["value is not a valid email address"],
      "password": ["Must contain at least one uppercase letter"]
    }
  }
}
```

Duplicate response (`409 Conflict`):

```json
{
  "error": {
    "code": "registration_conflict",
    "message": "Unable to create account with provided credentials"
  }
}
```

Verification email failure (`503 Service Unavailable`):

```json
{
  "error": {
    "code": "verification_delivery_failed",
    "message": "Unable to create account at this time"
  }
}
```

Validation rules:

- `email` is required, trimmed, lowercased, and must be valid
- `username` is required, trimmed, lowercased, 3-32 characters, and may only
  contain lowercase letters, digits, `.`, `_`, and `-`
- `first_name` and `last_name` are required, trimmed, and cannot be blank
- `password` is required, 12-128 characters, and must contain lowercase,
  uppercase, digit, and special characters

Verification behavior:

- successful registration creates the account as `is_verified=false`
- a verification email is triggered immediately
- login is currently still allowed before verification is completed

### `POST /auth/token`

Authenticate with the existing OAuth form flow.

Form fields:

- `username`: email or username
- `password`: plain-text password

Success response:

```json
{
  "access_token": "jwt",
  "token_type": "bearer",
  "refresh_token": "jwt"
}
```

### `POST /auth/refresh`

Exchange a refresh token for a new access token and rotated refresh token.

## Protect Routes

To protect a route you must simply put current user in the function parameters, it will fail if tried to access without being logged in.

```py
current_user: Annotated[User, Depends(get_current_active_user)]
```

Example:

```py
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
```

## Environment variables

Registration and email delivery use the following settings:

- `EMAIL_BACKEND` default `console`
- `EMAIL_FROM` default `noreply@example.com`
- `APP_BASE_URL` default `http://localhost:8000`
- `EMAIL_VERIFICATION_TTL_HOURS` default `24`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_USE_TLS`

When `EMAIL_BACKEND=console`, verification links are printed locally instead of
being sent through SMTP.
