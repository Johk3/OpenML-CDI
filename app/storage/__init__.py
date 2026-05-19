from app.config import Settings
from .local import LocalStorageBackend
from .s3 import S3StorageBackend

ConfiguredStorageBackend = LocalStorageBackend | S3StorageBackend


def get_storage_backend(settings: Settings) -> ConfiguredStorageBackend:
    """Return the configured storage backend instance."""
    if settings.storage.backend == "local":
        return LocalStorageBackend(settings.storage.local_upload_dir)
    if settings.storage.backend == "s3":
        return S3StorageBackend(settings.storage)
    raise ValueError(f"Unsupported backend '{settings.storage.backend}'")
