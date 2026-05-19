# User Endpoint Contract

This document specifies the backend contract for retained `/api/user` endpoints.
The app is GitHub-authenticated, so profile fields controlled by GitHub, such as
email, username, first name, and last name, are read-only in this API surface.
Use `GET /api/auth/me` for the authenticated user's profile.

All retained `/api/user` endpoints require an access token:

```http
Authorization: Bearer <access_token>
```

Missing, malformed, expired, or otherwise invalid access tokens return:

```json
{
  "detail": "Not authenticated"
}
```

or, when a token is present but cannot be validated:

```json
{
  "detail": "Could not validate credentials"
}
```

Object-level authorization failures return `403 Forbidden`. Authentication
failures return `401 Unauthorized`.

## User Shape

Authenticated profile responses are provided by `GET /api/auth/me` and use this
shape:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "user@example.com",
  "username": "user-name",
  "first_name": "Example",
  "last_name": "User",
  "role": "user",
  "created_at": "2026-05-13T12:00:00Z",
  "datasets": ["5a54dd7a-9ca4-4e38-9717-2dbdc03d7f56"]
}
```

`role` is currently `user` or `expert`.

## `POST /api/user/delete`

Deletes the authenticated user's account. By default, datasets owned by the user
are preserved and marked as pending deletion review. Clients may request owned
dataset deletion explicitly.

Request:

```http
POST /api/user/delete
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "mode": "account_only"
}
```

Supported `mode` values:

- `account_only`: delete the user account and preserve owned datasets.
- `account_and_datasets`: delete the user account and delete owned datasets.

Success response (`200 OK`):

```json
{
  "status_code": 200,
  "message": "User deleted",
  "datasets_preserved": 1,
  "datasets_deleted": 0,
  "dataset_deletion_requests": 1
}
```

Failure responses:

- `401 Unauthorized`: access token is missing or invalid.
- `502 Bad Gateway`: account deletion could not finish storage cleanup.

## Removed Legacy Endpoints

These legacy endpoints are intentionally not part of the retained `/api/user`
surface:

- `GET /api/user/get`: use `GET /api/auth/me`.
- `POST /api/user/change_email`: email comes from the GitHub profile.
- `POST /api/user/change_device_name`: session family display names are not
  exposed.
- `GET /api/user/get_family_name`: session family display names are not
  exposed.

## Security Rules

- No retained `/api/user` endpoint is public.
- GitHub-controlled profile fields are not editable through `/api/user`.
- Private user fields such as email and role are never exposed through
  unauthenticated requests or cross-user lookups.
