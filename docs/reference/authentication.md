# Authentication guide

This document describes the backend authentication endpoints and the frontend
auth contract currently expected by the Vite client.

## Frontend status

The current frontend is GitHub-only for sign-in.

- users do not create accounts manually in the frontend
- users do not sign in with email/password in the frontend
- frontend sign-in happens through GitHub OAuth, then the frontend exchanges the
  GitHub `code` with the backend for an app access token plus an `HttpOnly`
  refresh cookie

The email/password and registration endpoints below are kept for backend
reference only and should be treated as legacy from the frontend point of view.

## Table of Contents

- [Endpoints](#endpoints)
  - [POST /auth/register](#legacy--backend-only-post-authregister)
  - [POST /auth/token](#legacy--backend-only-post-authtoken)
  - [POST /auth/refresh](#post-authrefresh)
- [Protect Routes](#protect-routes)

This document describes the current backend authentication endpoints and the
new registration flow.

## Endpoints

### Legacy / backend-only: `POST /auth/register`

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

### Legacy / backend-only: `POST /auth/token`

Authenticate with the legacy form-based flow.

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

### `GET /api/auth/github/login`

Starts the GitHub OAuth flow and redirects the browser to GitHub.

### `GET /api/auth/github/callback?code=...&state=...`

Completes GitHub OAuth and returns app tokens.

Success response:

```json
{
  "access_token": "jwt",
  "token_type": "bearer"
}
```

GitHub profile sync behavior:

- backend uses `users.github_id` as the stable account identity for GitHub users
- on callback, backend resolves users in this order:
  1. existing user with matching `github_id`
  2. legacy user with matching email (then backfills `github_id`)
  3. create new local user
- on every successful callback, backend syncs the local profile from GitHub:
  - `email` from the verified primary GitHub email
  - `username` from GitHub `login`
  - `first_name` and `last_name` from GitHub `name`
- role assignment is based on collaborator permission in
  `koevoet1221/openmlupload-testing`; any collaborator role maps to `expert`,
  and non-collaborators map to `user`
- GitHub App installation credentials should be configured for this permission
  check so normal user login only needs profile, email, and organization scopes
- this prevents duplicate local users when GitHub profile fields change

Conflict response (`409 Conflict`):

```json
{
  "error": {
    "code": "github_profile_conflict",
    "message": "Unable to sync GitHub profile with local account",
    "field": "email"
  }
}
```

`field` is deterministic and indicates which unique identity could not be synced
(`email`, `username`, `github_id`, or `profile` fallback).

Behavior assumptions used by the frontend:

- frontend redirects users to GitHub directly using the configured OAuth client
  id and callback URI
- GitHub redirects back to
  `http://localhost:5173/login/callback?code=...&state=...`
- frontend sends that callback `code` and `state` to
  `GET /api/auth/github/callback?code=...&state=...`
- backend responds with the access token in the JSON body and sets the refresh
  token in an `HttpOnly` cookie
- frontend stores only the access token in memory and never reads, writes, or
  logs the refresh token

### `GET /api/auth/me`

Return the currently authenticated user for frontend hydration after login.

The frontend expects this route to return the same user shape as `User` in the
backend schema.

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

## Frontend environment and CORS assumptions

The current frontend token handling relies on the following browser/server
contract:

- frontend origin: `http://localhost:5173`
- backend API origin: `http://localhost:8000` with frontend requests pointed at
  `http://localhost:8000/api`
- `VITE_API_BASE_URL` stores the backend origin with the `/api` (for example
  `http://localhost:8000/api`). The frontend uses the full api url to make requests so there is no need ot include the `/api` in the forntend requests.
- refresh and logout requests must be sent with credentials enabled
- backend CORS must allow the exact frontend origin and `allow_credentials=true`
- refresh cookie must be scoped server-side to the refresh path and kept
  `HttpOnly`
- `COOKIE_SECURE=false` is required for local HTTP development; omit it or set
  `COOKIE_SECURE=true` when serving auth over HTTPS

Frontend env vars:

- `VITE_API_BASE_URL` backend origin, default `http://localhost:8000`
- `VITE_GITHUB_CLIENT_ID`
- `VITE_GITHUB_OAUTH_SCOPE` default `user:email`
- `VITE_GITHUB_REDIRECT_URI` default `http://localhost:5173/login/callback`

---

**Related:** [Backend Testing Environment](../how-to/testing_backend_environment.md)

[← Back to documentation index](../index.md)
