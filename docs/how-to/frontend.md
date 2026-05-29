## Run frontend tests

```bash
cd frontend
pnpm install
pnpm run test
```

## Run the frontend

```bash
cd frontend
pnpm install
pnpm run dev
```

Set `VITE_API_BASE_URL` in `frontend/.env` when the backend is not served from
the same origin. For local split frontend/backend development, use:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## CI exception

The frontend defaults the upload size limit to 500 MB when
`VITE_FILE_UPLOAD_LIMIT` is not set, so CI and local tests do not require SOPS.
