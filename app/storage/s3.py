import re
from pathlib import PurePosixPath
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.config import StorageSettings
from .errors import (
    StorageBucketError,
    StorageConfigurationError,
    StorageCredentialError,
    StorageObjectNotFoundError,
    StorageUnavailableError,
    StorageVerificationError,
)
from .types import MultipartUpload, ObjectMetadata, UploadTarget

SAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class _S3ReadContext:
    def __init__(self, body):
        self._body = body

    def __enter__(self):
        return self._body

    def __exit__(self, _exc_type, _exc, _traceback):
        close = getattr(self._body, "close", None)
        if close:
            close()


class S3StorageBackend:
    def __init__(self, settings: StorageSettings, client=None):
        if not settings.s3_bucket:
            raise StorageConfigurationError("S3_BUCKET is required for S3 storage")

        self.settings = settings
        self.bucket = settings.s3_bucket
        self._client = client or self._create_client(settings)

    def backend_name(self) -> str:
        return "s3"

    def create_upload_target(
        self, filename: str, prefix: str | None = None
    ) -> UploadTarget:
        safe_filename = self._sanitize_filename(filename)
        folder_prefix = prefix or uuid4().hex
        storage_key = f"quarantine/{folder_prefix}/{safe_filename}"
        self._validate_storage_key(storage_key)
        return UploadTarget(storage_key=storage_key, local_path=None)

    def write_bytes(self, storage_key: str, data: bytes) -> None:
        key = self._validate_storage_key(storage_key)
        try:
            self._client.put_object(Bucket=self.bucket, Key=key, Body=data)
        except Exception as error:
            raise self._to_storage_error("write object", error) from error

    def read_bytes(self, storage_key: str) -> bytes:
        key = self._validate_storage_key(storage_key)
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
            body = response["Body"]
            try:
                return body.read()
            finally:
                close = getattr(body, "close", None)
                if close:
                    close()
        except Exception as error:
            raise self._to_storage_error("read object", error) from error

    def open(self, storage_key: str, mode: str = "rb"):
        if mode != "rb":
            raise ValueError("S3StorageBackend.open currently supports read mode only")

        key = self._validate_storage_key(storage_key)
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
            return _S3ReadContext(response["Body"])
        except Exception as error:
            raise self._to_storage_error("open object", error) from error

    def object_exists(self, storage_key: str) -> bool:
        try:
            self.get_metadata(storage_key)
        except StorageObjectNotFoundError:
            return False
        return True

    def get_metadata(self, storage_key: str) -> ObjectMetadata:
        key = self._validate_storage_key(storage_key)
        try:
            response = self._client.head_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            raise self._to_storage_error("read object metadata", error) from error

        return ObjectMetadata(
            backend=self.backend_name(),
            bucket=self.bucket,
            storage_key=key,
            byte_size=int(response.get("ContentLength", 0)),
            content_type=response.get("ContentType"),
            etag=self._clean_etag(response.get("ETag")),
        )

    def delete(self, storage_key: str) -> None:
        key = self._validate_storage_key(storage_key)
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            raise self._to_storage_error("delete object", error) from error

    def create_download_url(self, storage_key: str, expires_seconds: int = 3600) -> str:
        key = self._validate_storage_key(storage_key)
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_seconds,
            )
        except Exception as error:
            raise self._to_storage_error("create download URL", error) from error

    def promote_from_quarantine(
        self, quarantine_key: str, final_key: str
    ) -> ObjectMetadata:
        source_key = self._validate_storage_key(quarantine_key)
        destination_key = self._validate_storage_key(final_key)
        try:
            self._client.copy_object(
                Bucket=self.bucket,
                CopySource={"Bucket": self.bucket, "Key": source_key},
                Key=destination_key,
            )
            self._client.delete_object(Bucket=self.bucket, Key=source_key)
        except Exception as error:
            raise self._to_storage_error("promote object", error) from error

        return self.get_metadata(destination_key)

    def initiate_multipart_upload(
        self, storage_key: str, content_type: str | None = None
    ) -> MultipartUpload:
        key = self._validate_storage_key(storage_key)
        kwargs = {"Bucket": self.bucket, "Key": key}
        if content_type:
            kwargs["ContentType"] = content_type

        try:
            response = self._client.create_multipart_upload(**kwargs)
        except Exception as error:
            raise self._to_storage_error("initiate multipart upload", error) from error

        return MultipartUpload(storage_key=key, upload_id=response["UploadId"])

    def create_multipart_part_url(
        self,
        storage_key: str,
        upload_id: str,
        part_number: int,
        expires_seconds: int = 3600,
    ) -> str:
        key = self._validate_storage_key(storage_key)
        if part_number <= 0:
            raise ValueError("part_number must be > 0")

        try:
            return self._client.generate_presigned_url(
                "upload_part",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "UploadId": upload_id,
                    "PartNumber": part_number,
                },
                ExpiresIn=expires_seconds,
            )
        except Exception as error:
            raise self._to_storage_error("create multipart part URL", error) from error

    def complete_multipart_upload(
        self,
        storage_key: str,
        upload_id: str,
        parts: list[dict[str, str | int]],
    ) -> ObjectMetadata:
        key = self._validate_storage_key(storage_key)
        multipart_parts = [
            {"ETag": str(part["etag"]), "PartNumber": int(part["part_number"])}
            for part in parts
        ]

        try:
            self._client.complete_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": multipart_parts},
            )
        except Exception as error:
            raise self._to_storage_error("complete multipart upload", error) from error

        return self.get_metadata(key)

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        key = self._validate_storage_key(storage_key)
        try:
            self._client.abort_multipart_upload(
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
            )
        except Exception as error:
            raise self._to_storage_error("abort multipart upload", error) from error

    def verify_object(
        self,
        storage_key: str,
        expected_size: int | None = None,
        expected_content_type: str | None = None,
        expected_etag: str | None = None,
    ) -> ObjectMetadata:
        metadata = self.get_metadata(storage_key)
        if expected_size is not None and metadata.byte_size != expected_size:
            raise StorageVerificationError(
                f"Object size mismatch for {storage_key}: "
                f"expected {expected_size}, got {metadata.byte_size}"
            )
        if (
            expected_content_type is not None
            and metadata.content_type != expected_content_type
        ):
            raise StorageVerificationError(
                f"Object content type mismatch for {storage_key}: "
                f"expected {expected_content_type}, got {metadata.content_type}"
            )
        if expected_etag is not None and metadata.etag != self._clean_etag(
            expected_etag
        ):
            raise StorageVerificationError(
                f"Object etag mismatch for {storage_key}: "
                f"expected {self._clean_etag(expected_etag)}, got {metadata.etag}"
            )
        return metadata

    def _create_client(self, settings: StorageSettings):
        session_kwargs = {}
        if settings.s3_access_key:
            session_kwargs["aws_access_key_id"] = settings.s3_access_key
        if settings.s3_secret_key:
            session_kwargs["aws_secret_access_key"] = settings.s3_secret_key
        if settings.s3_region:
            session_kwargs["region_name"] = settings.s3_region

        client_kwargs = {}
        if settings.s3_endpoint:
            client_kwargs["endpoint_url"] = settings.s3_endpoint
        if settings.s3_force_path_style:
            client_kwargs["config"] = Config(s3={"addressing_style": "path"})

        return boto3.Session(**session_kwargs).client("s3", **client_kwargs)

    def _sanitize_filename(self, filename: str) -> str:
        parts = PurePosixPath(filename).parts
        safe_parts = []
        for part in parts:
            cleaned_part = SAFE_FILENAME_CHARS.sub("_", part).strip("._")
            if cleaned_part:
                safe_parts.append(cleaned_part)
        if not safe_parts:
            return "upload.bin"
        return "/".join(safe_parts)

    def _validate_storage_key(self, storage_key: str) -> str:
        key = storage_key.strip()
        if not key:
            raise ValueError("Storage key cannot be empty")

        path = PurePosixPath(key)
        if path.is_absolute() or any(part == ".." for part in path.parts):
            raise ValueError("Storage key cannot be absolute or contain '..'")
        return key

    def _to_storage_error(self, action: str, error: Exception) -> Exception:
        if isinstance(error, StorageVerificationError):
            return error
        if isinstance(error, NoCredentialsError):
            return StorageCredentialError(f"Failed to {action}: credentials missing")
        if isinstance(error, ClientError):
            code = str(error.response.get("Error", {}).get("Code", ""))
            message = str(error.response.get("Error", {}).get("Message", error))
            if code in {"404", "NoSuchKey", "NotFound"}:
                return StorageObjectNotFoundError(f"Failed to {action}: {message}")
            if code in {"NoSuchBucket", "InvalidBucketName"}:
                return StorageBucketError(f"Failed to {action}: {message}")
            if code in {
                "AccessDenied",
                "InvalidAccessKeyId",
                "SignatureDoesNotMatch",
                "ExpiredToken",
            }:
                return StorageCredentialError(f"Failed to {action}: {message}")
            return StorageUnavailableError(f"Failed to {action}: {message}")
        if isinstance(error, BotoCoreError):
            return StorageUnavailableError(f"Failed to {action}: {error}")
        return StorageUnavailableError(f"Failed to {action}: {error}")

    def _clean_etag(self, etag: str | None) -> str | None:
        if etag is None:
            return None
        return etag.strip('"')
