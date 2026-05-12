import json
import os
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUCKET = "openml-upload-local"
DEFAULT_ENDPOINT = "http://127.0.0.1:9000"
DEFAULT_REGION = "eu-west-1"
DEFAULT_ACCESS_KEY = "minioadmin"
DEFAULT_SECRET_KEY = "minioadmin123"


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT", DEFAULT_ENDPOINT),
        region_name=os.getenv("S3_REGION", DEFAULT_REGION),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY", DEFAULT_ACCESS_KEY),
        aws_secret_access_key=os.getenv("S3_SECRET_KEY", DEFAULT_SECRET_KEY),
        config=Config(
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _load_json(path: str) -> dict | list:
    return json.loads((ROOT / path).read_text())


def _wait_for_s3(client, timeout_seconds: int = 60) -> None:
    deadline = time.monotonic() + timeout_seconds
    while True:
        try:
            client.list_buckets()
            return
        except EndpointConnectionError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)


def _ensure_bucket(client, bucket: str) -> None:
    try:
        client.head_bucket(Bucket=bucket)
        return
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise
    client.create_bucket(Bucket=bucket)


def main() -> None:
    bucket = os.getenv("S3_BUCKET", DEFAULT_BUCKET)
    client = _client()
    _wait_for_s3(client)
    _ensure_bucket(client, bucket)
    client.put_bucket_lifecycle_configuration(
        Bucket=bucket,
        LifecycleConfiguration=_load_json("infra/minio/lifecycle.json"),
    )


if __name__ == "__main__":
    main()
