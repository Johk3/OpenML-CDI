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

## ZIP vs multi-object upload contract

The upload API stores two related pieces of metadata:

- `objects`: the storage objects that must be scanned, promoted, and downloaded.
- `directory_structure`: the user-facing package contract used to reconstruct the submitted dataset layout.

The browser currently uses a ZIP package for any multi-file or folder selection. The request sends one uploaded filename such as `Folder_Dataset_files.zip`, plus top-level `directory_structure` metadata:

```json
{
  "compressed": true,
  "representation": "zip",
  "root": "dataset",
  "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
  "archive_path": "Folder_Dataset_files.zip",
  "manifest": {
    "version": 1,
    "path_count": 2,
    "source": "browser-selection"
  }
}
```

For ZIP uploads, `objects[0].original_path` is the ZIP archive path. The original submitted paths live in `directory_structure.paths`; this is the manifest the UI and later download/reconstruction code use to describe the dataset layout.
The manifest version must be `1`, and `manifest.path_count` must match the number of preserved paths.
When the upload is confirmed, the backend checks the ZIP entries against `directory_structure.paths` before scanning so the archive contents cannot diverge from the manifest.

Multi-object uploads are accepted when the client uploads one storage object per submitted file. In that case:

- `directory_structure.compressed` is `false`.
- `directory_structure.representation` is `multi_object` when more than one object is uploaded, or `single_object` for one object with a preserved relative path.
- `directory_structure.paths` must exactly match the uploaded filenames.
- `archive_path` must be `null`.

The backend rejects unsafe paths, duplicate manifest paths, ZIP metadata that points at more than one uploaded object, and multi-object metadata whose manifest paths do not match the uploaded object paths.

S3 multipart upload is a transport for one large object split into parts, not a folder representation. The [AWS multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) describes S3 assembling parts into one object, and the [AWS multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) list up to 10,000 parts with a 5 MiB minimum part size except the last part. That means a large ZIP can use multipart transport later without changing the ZIP package contract, while a folder represented as many objects remains a separate multi-object contract.

Dataset detail responses include `upload_package`, a safe copy of the normalized package metadata, so users and experts can see the original folder/package paths without relying on storage keys.

## Safety First: The Malware Scan

As soon as an upload is confirmed, a ClamAV scan is done through a configured `clamd` daemon.

1. It pulls the file from its configured storage backend.
2. It scans a temporary local copy using `CLAMD_SOCKET` or `CLAMD_HOST`/`CLAMD_PORT`.
3. If the file is clean, the storage backend promotes the original object to `ready/<dataset_id>/<original_path>` and the dataset remains `pending` for expert review.
4. The temporary scan copy is always deleted after scanning.
5. Clean S3 quarantine objects are deleted during promotion. Infected, missing, scanner-unavailable, and promotion-error objects remain unavailable for download; their original quarantine object is retained for investigation and bucket lifecycle cleanup.
6. Only objects with `scan_state=clean`, `upload_state=promoted`, `download_state=downloadable`, and a `final_object_key` are exposed through the authenticated download endpoint.
