# E2E Test Environment guide

## Step 0: Make sure the database includes the newest migrations

## Step 1: Start ClamAV

The upload E2E test confirms the full scan-and-promote path, so the backend must
be able to reach a `clamd` daemon. The default host-mode backend configuration
expects `clamd` on `127.0.0.1:3310`.

## Step 2: Start backend in dev mode

```bash
AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true \
  AUTH_DEV_LOGIN_EMAIL=e2e.github.user@example.com \
  AUTH_DEV_LOGIN_USERNAME=e2e-github-user \
  AUTH_DEV_LOGIN_FIRST_NAME=E2E \
  AUTH_DEV_LOGIN_LAST_NAME=GitHub \
  sops exec-env encrypted.env 'uvicorn app.main:app --reload'
```

```bash
AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true
```

makes sure the backend does not require to authenticate an actual user but still gets a callback from our api

The `AUTH_DEV_LOGIN_*` values isolate the E2E account from normal local dev
accounts. The Playwright setup refuses to delete account data unless the backend
is issuing this documented E2E identity.

## Step 3: Start the frontend

```bash
sops exec-env encrypted.env 'npm run dev -- --host 127.0.0.1 --port 5173'
```

## Step 4: Install the Playwright dependencies

```bash
npm ci
```

## Step 5: Run the test suite

In a separate terminal:

```bash
npm run test:e2e
```

The direct upload, auth, session, and dashboard flows run by default. The multipart
upload tests require S3-compatible storage and are skipped unless you opt in:

```bash
E2E_ENABLE_MULTIPART_UPLOADS=true npm run test:e2e -- e2e/multipart-upload.spec.ts
```

## How the suite works

The setup and teardown steps call the local GitHub dev auth callback, then delete
the dev test account with `mode=account_and_datasets`. This keeps each run isolated
while leaving the first browser sign-in to exercise user provisioning.
