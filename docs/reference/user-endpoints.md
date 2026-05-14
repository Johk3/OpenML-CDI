# User Endpoint Contract

This document specifies the backend contract for `/api/user` endpoints.

All endpoints in this document require an access token:

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

User responses use this shape:

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

## `GET /api/user/get`

Returns the authenticated user's profile. The `user_id` query parameter must
match the authenticated token subject.

Request:

```http
GET /api/user/get?user_id=3fa85f64-5717-4562-b3fc-2c963f66afa6
Authorization: Bearer <access_token>
```

Success response (`200 OK`):

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "user@example.com",
  "username": "user-name",
  "first_name": "Example",
  "last_name": "User",
  "role": "user",
  "created_at": "2026-05-13T12:00:00Z",
  "datasets": []
}
```

Failure responses:

- `400 Bad Request`: `user_id` is missing or is not a valid UUID.
- `401 Unauthorized`: access token is missing or invalid.
- `403 Forbidden`: `user_id` does not match the authenticated user.

## `POST /api/user/delete`

Deletes the authenticated user's account.

Request:

```http
POST /api/user/delete
Authorization: Bearer <access_token>
```

Success response (`200 OK`):

```json
{
  "status_code": 200,
  "message": "User deleted"
}
```

Failure responses:

- `401 Unauthorized`: access token is missing or invalid.

## `POST /api/user/change_email`

Changes the authenticated user's email address.

Request:

```http
POST /api/user/change_email?email=new.user@example.com
Authorization: Bearer <access_token>
```

Success response (`200 OK`):

```json
{
  "status_code": 200,
  "message": "User email changed"
}
```

Failure responses:

- `400 Bad Request`: `email` is missing or is not a valid email address.
- `401 Unauthorized`: access token is missing or invalid.
- `409 Conflict`: another user already uses the email address.

## `POST /api/user/change_device_name`

Sets a display name for one of the authenticated user's refresh-token families.
The API currently refers to this display name as a device name.

Request:

```http
POST /api/user/change_device_name?family_id=9cf6314b-c18e-4a01-8f74-22bbf90a8d55&device_name=Laptop
Authorization: Bearer <access_token>
```

Success response (`200 OK`):

```json
{
  "status_code": 200,
  "message": "Family name changed"
}
```

Failure responses:

- `400 Bad Request`: `family_id` is missing, invalid, or not known.
- `401 Unauthorized`: access token is missing or invalid.
- `403 Forbidden`: `family_id` belongs to a different user.

## `GET /api/user/get_family_name`

Returns the display name for one of the authenticated user's refresh-token
families.

Request:

```http
GET /api/user/get_family_name?family_id=9cf6314b-c18e-4a01-8f74-22bbf90a8d55
Authorization: Bearer <access_token>
```

Success response (`200 OK`):

```json
{
  "status_code": 200,
  "family_name": "Laptop"
}
```

Failure responses:

- `400 Bad Request`: `family_id` is missing, invalid, or not known.
- `401 Unauthorized`: access token is missing or invalid.
- `403 Forbidden`: `family_id` belongs to a different user.
- `404 Not Found`: `family_id` exists but no display name has been set.

## Security Rules

- No `/api/user` endpoint is public.
- `/api/user/get` may only return the authenticated user's own profile.
- Session metadata endpoints may only read or modify refresh-token families owned
  by the authenticated user.
- Private user fields such as email and role are never exposed through
  unauthenticated requests or cross-user lookups.
