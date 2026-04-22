# How Uploads Work

We designed an upload mechanism that tries to upload to S3, but falls back to local storage if S3 is not available.

## smart_popen storage solution

- **Try S3 first**: If we have an S3 bucket configured, we try to put our file there first
- **Fallback to Local**: If the S3 upload fails for any reason (maybe the bucket is full, or the credentials dont exist), the backend reroutes the stream to a local folder on our server (`.local_uploads`), if the files are malicious they are moved to `.quanrantine`.

## Safety First: The Malware Scan

As soon as an upload is confirmed, a malware scan is done (Currently signature based).

1. It pulls the file from its storage (whether that was S3 or local).
2. It runs a signature-based malware scan.
3. If its clean its moved to .local_uploads if its not then its moved to .quanrantine
