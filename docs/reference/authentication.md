# Authentication guide

This document describes the current GitHub-only frontend auth contract and the
retained backend auth/session endpoints used by the Vite client.

## Frontend status

The current frontend is GitHub-only for sign-in.

- users do not create accounts manually in the frontend
- users do not sign in with email/password in the frontend
- frontend sign-in starts at GitHub OAuth and completes by exchanging the
  GitHub `code` and `state` with the backend
- the backend returns a short-lived app access token and sets an `HttpOnly`
  refresh cookie
- the frontend stores only the access token in memory and never reads, writes,
  or logs the refresh token

Legacy email/password registration and password-login routes are not part of
the current product flow. The current route table does not expose
`/api/auth/register`, `/api/auth/token`, or `/api/user/update_password`; backend
tests assert those legacy routes return `404` or `405`. Backend helpers may
still create or link local user records during GitHub callback handling.

Related implementation issues: [#84](https://github.com/ludev-nl/2026-40-OpenML_Uploading_Interface/issues/84)
and [#85](https://github.com/ludev-nl/2026-40-OpenML_Uploading_Interface/issues/85).
Those issues cover the OAuth/session implementation. Issue #208 is limited to
the remaining documentation and test audit.

## Endpoint summary

The public API paths include `/api`. Frontend request paths omit `/api` because
`VITE_API_BASE_URL` already includes the full backend API URL, for example
`http://localhost:8000/api`.

| Capability          | Public API path                 | Frontend request path   |
| ------------------- | ------------------------------- | ----------------------- |
| Start GitHub OAuth  | `GET /api/auth/github/login`    | `/auth/github/login`    |
| Complete callback   | `GET /api/auth/github/callback` | `/auth/github/callback` |
| Refresh session     | `POST /api/auth/refresh`        | `/auth/refresh`         |
| Logout              | `POST /api/auth/refresh/logout` | `/auth/refresh/logout`  |
| Current user        | `GET /api/auth/me`              | `/auth/me`              |
| List token families | `GET /api/auth/get_sessions`    | `/auth/get_sessions`    |
| Revoke sessions     | `POST /api/auth/revoke`         | `/auth/revoke`          |

## Endpoints

### `GET /auth/github/login`

Starts the GitHub OAuth flow and redirects the browser to GitHub.

When `AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true`, the backend uses the local
development auth bypass instead of contacting GitHub. The bypass redirects to
the configured frontend callback URL with a generated `code` and `state`, then
uses these optional environment values to create or update the local user:

- `AUTH_DEV_LOGIN_EMAIL`
- `AUTH_DEV_LOGIN_USERNAME`
- `AUTH_DEV_LOGIN_FIRST_NAME`
- `AUTH_DEV_LOGIN_LAST_NAME`

This mode is only for local smoke tests without real GitHub OAuth credentials.
It still exercises the backend callback, local user creation/linking, access
token issuing, and refresh cookie creation.

### `GET /auth/github/callback?code=...&state=...`

Completes GitHub OAuth and returns app tokens.

Success response:

```json
{
  "access_token": "jwt",
  "token_type": "bearer"
}
```

The backend also sets a refresh token in an `HttpOnly` cookie scoped to the
refresh path.

GitHub profile sync behavior:

- backend uses `users.github_id` as the stable account identity for GitHub users
- on callback, backend resolves users in this order:
  1. existing user with matching `github_id`
  2. legacy user with matching email, then backfills `github_id`
  3. create a new local user
- on every successful callback, backend syncs the local profile from GitHub:
  - `email` from the verified primary GitHub email
  - `username` from GitHub `login`
  - `first_name` and `last_name` from GitHub `name`
- role assignment is based on collaborator permission in the configured GitHub
  repository; only elevated collaborator roles such as `maintain` or `admin`
  map to `expert`, while public viewers and lower collaborator roles such as
  `read`, `triage`, or `write` map to `user`
- GitHub App installation credentials should be configured for the permission
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

`field` is deterministic and indicates which unique identity could not be synced:
`email`, `username`, `github_id`, or `profile` fallback.

### `POST /auth/refresh`

Exchanges the `HttpOnly` refresh cookie for a new access token and a rotated
refresh cookie.

Success response:

```json
{
  "access_token": "jwt",
  "token_type": "bearer"
}
```

Missing, malformed, expired, reused, or otherwise invalid refresh tokens return
`401 Unauthorized`.

### `POST /auth/refresh/logout`

Logs out the current session by revoking the current refresh-token family and
clearing the refresh cookie.

The frontend calls this endpoint before clearing local auth state. If the
network request fails, the frontend still clears its in-memory access token,
removes cached current-user data, and navigates back to `/login`.

### `GET /api/auth/me`

Returns the currently authenticated user for frontend hydration after login or
session rehydration. The frontend expects this route to return the same shape as
`User` in the backend schema.

### Retained session-management endpoints

The backend also retains authenticated session-family management endpoints:

- `GET /api/auth/get_sessions`
- `POST /api/auth/revoke`

These endpoints require a valid access token and operate only on token families
owned by the current user.

## Frontend session rehydration

The frontend session model is:

1. GitHub callback returns an access token and sets the refresh cookie.
2. `AuthProvider` stores the access token in memory and invalidates
   `/auth/me` profile data.
3. `UserProvider` fetches `GET /api/auth/me` after the user is authenticated.
4. On page reload, `AuthProvider` calls `POST /auth/refresh` with credentials.
5. `ProtectedRoute` waits while the refresh-cookie check is initializing.
6. If refresh succeeds, protected pages render after `/auth/me` loads.
7. If refresh fails, protected pages redirect to
   `/login?notice=sign-in-required`.
8. Logout calls `POST /auth/refresh/logout`, clears local state, clears cached
   current-user data, and redirects to `/login`.

## Protect routes

Backend routes are protected by requiring the current active user dependency:

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
    user_crud.del_user(db, current_user.id)
    return {"status_code": 200, "message": "User deleted"}
```

Frontend routes that require a signed-in session should be wrapped in
`ProtectedRoute`.

## Frontend environment and CORS assumptions

The current frontend token handling relies on the following browser/server
contract:

- frontend origin: `http://localhost:5173`
- backend API origin: `http://localhost:8000` in local split frontend/backend
  development, with frontend requests pointed at `http://localhost:8000/api`
- `VITE_API_BASE_URL` stores the full backend API URL (for example
  `http://localhost:8000/api`) for local split frontend/backend development.
  When it is unset, the frontend falls back to same-origin `/api`, which is the
  Docker Compose production-style path behind Caddy. Individual frontend request
  paths should not include `/api`.
- refresh and logout requests must be sent with credentials enabled
- backend CORS must allow the exact frontend origin and `allow_credentials=true`
- refresh cookie must be scoped server-side to the refresh path and kept
  `HttpOnly`
- `COOKIE_SECURE=false` is required for local HTTP development; omit it or set
  `COOKIE_SECURE=true` when serving auth over HTTPS

Frontend env vars:

- `VITE_API_BASE_URL` full backend API URL for local split frontend/backend
  development; unset defaults to same-origin `/api`
- `VITE_GITHUB_CLIENT_ID`
- `VITE_GITHUB_OAUTH_SCOPE` default `user:email`
- `VITE_GITHUB_REDIRECT_URI` default `http://localhost:5173/login/callback`

Backend env vars for auth:

- `GITHUB_CLIENT_ID`
- `GITHUB_SECRET`
- `GITHUB_REDIRECT`
- `GITHUB_OAUTH_SCOPES` default `read:user,user:email,read:org`
- `AUTH_DEV_MODE_APPROVE_ALL_LOGINS` for local smoke tests only
- `AUTH_DEV_LOGIN_EMAIL`, `AUTH_DEV_LOGIN_USERNAME`,
  `AUTH_DEV_LOGIN_FIRST_NAME`, and `AUTH_DEV_LOGIN_LAST_NAME` for local smoke
  test identity overrides

## Manual QA

Use this checklist when verifying the local GitHub-only auth flow without real
GitHub OAuth credentials:

1. Start the dev stack with `AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true` and
   `VITE_API_BASE_URL=http://localhost:8000/api`.
2. Open `http://localhost:5173/login` and click `Continue with GitHub`.
3. Confirm the browser reaches the authenticated app state, normally
   `/datasets`, and that the current user profile is visible in the header.
4. In browser devtools, confirm auth requests use `/api/auth/...` paths and do
   not produce `/api/api/...` requests.
5. Reload a protected page such as `/account` and confirm the refresh-cookie
   session rehydrates without sending the user back to the login page.
6. Open a fresh private window and visit `/account`; confirm the app redirects
   to `/login?notice=sign-in-required`.
7. Sign in again, click `Logout`, and confirm the app returns to `/login`.
8. Visit `/account` again after logout and confirm the protected-route redirect
   is restored.

---

**Related:** [Backend Testing Environment](../how-to/testing_backend_environment.md)

[← Back to documentation index](../index.md)
