# E2E Test Environment guide

## Step 0: Make sure the database includes the newest migrations

## Step 1: Start backend in dev mode

```bash
AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true sops exec-env encrypted.env 'uvicorn app.main:app --reload'
```

```bash
AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true
```

makes sure the backend does not require to authenticate an actual user but still gets a callback from our api

## Step 2: Start the frontend

```bash
sops exec-env encrypted.env 'npm run dev'
```

## Step 4: Run the test suite

In a separate terminal:

```bash
npm run test:e2e
```

## How the suite works

There is a global-setup.ts file where a user is created via `GET /api/auth/github/callback` which returns an access token and is saved in `e2e/.auth/state.json`

On teardown the `e2e/.auth/state.json` is used to delete the test user. After the user is deleted, the `e2e/.auth/state.json` is also deleted.
