# How Uploads Work

We designed an upload mechanism that tries to upload to S3, but falls back to local storage if S3 is not available.

## smart_popen storage solution

- **Try S3 first**: If we have an S3 bucket configured, we try to put our file there first
- **Fallback to Local**: If the S3 upload fails for any reason (maybe the bucket is full, or the credentials dont exist), the backend reroutes the stream to a local folder on our server (`.local_uploads`), if the files are malicious they are moved to `.quanrantine`.

## Safety First: The Malware Scan

As soon as an upload is confirmed, a ClamAV scan is done through a configured `clamd` daemon.

1. It pulls the file from its storage (whether that was S3 or local).
2. It scans the quarantined file using `CLAMD_SOCKET` or `CLAMD_HOST`/`CLAMD_PORT`.
3. If the file is clean, it is moved to `<LOCAL_UPLOAD_DIR>/ready` and the dataset is marked `claimed`.
4. If the file is infected, or ClamAV is unavailable, the dataset is marked `quarantined` and the quarantine copy is deleted.
