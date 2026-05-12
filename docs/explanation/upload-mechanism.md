# How Uploads Work

We designed an upload mechanism that tries to upload to S3, but falls back to local storage if S3 is not available.

## Storage backend

- **S3 backend**: Browser uploads are created under a `quarantine/` prefix through short-lived upload contracts.
- **Local backend**: Local development stores upload objects under the configured `LOCAL_UPLOAD_DIR`.

## Safety First: The Malware Scan

As soon as an upload is confirmed, a ClamAV scan is done through a configured `clamd` daemon.

1. It pulls the file from its storage (whether that was S3 or local).
2. It scans a temporary local copy using `CLAMD_SOCKET` or `CLAMD_HOST`/`CLAMD_PORT`.
3. If the file is clean, the storage backend promotes the original object to `ready/<dataset_id>/<original_path>` and the dataset remains `pending` for expert review.
4. The temporary scan copy is always deleted after scanning.
5. Clean S3 quarantine objects are deleted during promotion. Infected, missing, scanner-unavailable, and promotion-error objects remain unavailable for download; their original quarantine object is retained for investigation and bucket lifecycle cleanup.
6. Only objects with `scan_state=clean`, `upload_state=promoted`, `download_state=downloadable`, and a `final_object_key` are exposed through the authenticated download endpoint.
