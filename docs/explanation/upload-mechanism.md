# How Uploads Work

The final production-like upload path uses explicit S3-compatible object storage. Local filesystem storage remains available for development and tests, but production readiness should use `STORAGE_BACKEND=s3` so storage configuration failures are visible.

For the detailed storage contract, environment variables, MinIO setup, bucket CORS, lifecycle cleanup, and permissions, see [S3 Storage Architecture and Local Setup](../reference/s3-storage.md).

## Storage selection

- Use `STORAGE_BACKEND=s3` for production and production-like development.
- Use `STORAGE_BACKEND=local` for simple local development and tests that do not need object-storage behavior.
- Avoid `STORAGE_BACKEND=smart` for release verification because its local fallback can hide S3 configuration errors.

- **S3 backend**: Browser uploads are created under a `quarantine/` prefix through short-lived upload contracts.
- **Local backend**: Local development stores upload objects under the configured `LOCAL_UPLOAD_DIR`.

## Upload flow

1. The browser asks the backend for upload contracts through `/api/datasets/upload-url`.
2. The backend creates a pending dataset row and object metadata.
3. For S3 storage, the backend returns short-lived presigned `PUT` contracts targeting the `quarantine/` prefix.
4. The browser uploads bytes directly to S3-compatible storage.
5. The browser confirms completion through `/api/datasets/{id}/confirm-upload`.
6. The backend verifies object metadata before starting the malware scan.

## Safety First: The Malware Scan

As soon as an upload is confirmed, a ClamAV scan is done through a configured `clamd` daemon.

1. It pulls the file from its configured storage backend.
2. It scans a temporary local copy using `CLAMD_SOCKET` or `CLAMD_HOST`/`CLAMD_PORT`.
3. If the file is clean, the storage backend promotes the original object to `ready/<dataset_id>/<original_path>` and the dataset remains `pending` for expert review.
4. The temporary scan copy is always deleted after scanning.
5. Clean S3 quarantine objects are deleted during promotion. Infected, missing, scanner-unavailable, and promotion-error objects remain unavailable for download; their original quarantine object is retained for investigation and bucket lifecycle cleanup.
6. Only objects with `scan_state=clean`, `upload_state=promoted`, `download_state=downloadable`, and a `final_object_key` are exposed through the authenticated download endpoint.
