import logging
from typing import Any
from uuid import uuid4
import smart_open

from app.config import StorageSettings
from .local import LocalStorageBackend
from .types import UploadTarget

logger = logging.getLogger(__name__)


class SmartStorageBackend:
    def __init__(self, settings: StorageSettings):
        """Initialize with S3 and local fallback capabilities."""
        self.settings = settings
        self.local = LocalStorageBackend(settings.local_upload_dir)
        self.s3_enabled = bool(settings.s3_bucket)

    def backend_name(self) -> str:
        """Return the name of the backend."""
        return "smart" if self.s3_enabled else "local"

    def create_upload_target(
        self, filename: str, prefix: str | None = None
    ) -> UploadTarget:
        """
        Create an upload target, optionally grouped under a common prefix.
        """
        safe_filename = self.local._sanitize_filename(filename)
        # Use provided prefix batch UUID or generate a new one per file
        folder_prefix = prefix or uuid4().hex
        storage_key = f"datasets/{folder_prefix}/{safe_filename}"
        local_path = self.local._resolve_storage_key_path(storage_key)
        return UploadTarget(storage_key=storage_key, local_path=local_path)

    def write_bytes(self, storage_key: str, data: bytes) -> None:
        """Try writing to S3, fallback to local storage on failure."""
        if self.s3_enabled:
            s3_uri = self._get_s3_uri(storage_key)
            try:
                logger.info(f"Attempting to write to S3: {s3_uri}")
                with smart_open.open(
                    s3_uri, "wb", transport_params=self._get_s3_params()
                ) as fout:
                    fout.write(data)
                return
            except Exception as e:
                logger.warning(f"S3 upload failed, falling back to local: {e}")

        logger.info(f"Writing to local storage: {storage_key}")
        self.local.write_bytes(storage_key, data)

    def read_bytes(self, storage_key: str) -> bytes:
        """Try reading from S3, fallback to local storage."""
        if self.s3_enabled:
            s3_uri = self._get_s3_uri(storage_key)
            try:
                with smart_open.open(
                    s3_uri, "rb", transport_params=self._get_s3_params()
                ) as fin:
                    return fin.read()
            except Exception as e:
                logger.warning(f"S3 read failed, trying local: {e}")

        return self.local.read_bytes(storage_key)

    def open(self, storage_key: str, mode: str = "rb") -> Any:
        """
        Return a file-like object using smart_open.
        """
        if self.s3_enabled:
            s3_uri = self._get_s3_uri(storage_key)
            try:
                return smart_open.open(
                    s3_uri, mode, transport_params=self._get_s3_params()
                )
            except Exception as e:
                logger.warning(
                    f"Smart open S3 failed for mode {mode}, trying local: {e}"
                )

        return self.local.open(storage_key, mode)

    def _get_s3_uri(self, storage_key: str) -> str:
        """Get the S3 URI for a given storage key."""
        bucket = self.settings.s3_bucket
        return f"s3://{bucket}/{storage_key}"

    def _get_s3_params(self) -> dict:
        """Get the S3 parameters for smart_open."""
        import boto3

        session_kwargs = {}
        if self.settings.s3_access_key:
            session_kwargs["aws_access_key_id"] = self.settings.s3_access_key
        if self.settings.s3_secret_key:
            session_kwargs["aws_secret_access_key"] = self.settings.s3_secret_key
        if self.settings.s3_region:
            session_kwargs["region_name"] = self.settings.s3_region

        client_kwargs = {}
        if self.settings.s3_endpoint:
            client_kwargs["endpoint_url"] = self.settings.s3_endpoint

        session = boto3.Session(**session_kwargs)
        return {"client": session.client("s3", **client_kwargs)}
