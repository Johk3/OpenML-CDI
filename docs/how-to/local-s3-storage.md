# Local S3-Compatible Storage

Use local storage for fast backend-only development when direct browser uploads are not part of the change. Use local S3-compatible storage when working on upload contracts, direct upload behavior, object metadata, scan promotion, download behavior, or e2e upload flows.

Use MinIO for local multipart upload testing. It exercises the same S3-compatible upload session, part URL, ETag, complete, abort, and resume semantics that production S3 uses; the local filesystem storage backend only supports direct PUT uploads.

## Start local S3

The development Compose stack includes MinIO and a bucket initializer:

```bash
docker compose -f docker-compose.dev.yml up backend frontend minio minio-init clamd
```

The initializer creates the `openml-upload-local` bucket and imports lifecycle cleanup rules. MinIO itself starts with global CORS origins for local Vite development.

MinIO endpoints:

- API: `http://localhost:9000`
- Console: `http://localhost:9001`
- User: `minioadmin`
- Password: `minioadmin123`

## Backend configuration

When the backend runs inside Compose, use the internal endpoint:

```env
STORAGE_BACKEND=s3
S3_BUCKET=openml-upload-local
S3_REGION=eu-west-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_FORCE_PATH_STYLE=true
```

When the backend runs directly on the host against Compose MinIO, use:

```env
S3_ENDPOINT=http://localhost:9000
```

## CORS

Local direct uploads require MinIO to allow the Vite origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

Browsers can only read multipart upload `ETag` response headers when the storage CORS policy exposes `ETag`. The frontend falls back to the backend list-parts endpoint when that header is hidden, but deployed S3 buckets should expose `ETag` to avoid the extra lookup.

MinIO community releases do not support bucket-level CORS through `PutBucketCors` or `mc cors set`. The development stack configures global CORS with `MINIO_API_CORS_ALLOW_ORIGIN` instead.

## Lifecycle cleanup

The local lifecycle policy lives in `infra/minio/lifecycle.json`.

It expires stale quarantine objects after 7 days and ready test objects after 30 days. These values are deliberately short for local and CI usage.

MinIO community releases do not support the `AbortIncompleteMultipartUpload` lifecycle action through `PutBucketLifecycleConfiguration`. Configure stale multipart upload cleanup on the deployed S3 bucket, where the provider supports that lifecycle action.

## Manual bucket setup

If MinIO is already running, configure the bucket with:

```bash
python scripts/setup_local_s3.py
```

The script reads the same `S3_*` environment variables as the backend and is used by CI. CORS is configured when the MinIO service starts, not by this script.
