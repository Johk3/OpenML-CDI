from app.config import Settings
from .base import StorageBackend
from .local import LocalStorageBackend
from .s3 import S3StorageBackend
from .smart import SmartStorageBackend


def get_storage_backend(settings: Settings) -> StorageBackend:
    """Return the configured storage backend instance."""
    if settings.storage.backend == "local":
        return LocalStorageBackend(settings.storage.local_upload_dir)
    if settings.storage.backend == "s3":
        return S3StorageBackend(settings.storage)
    if settings.storage.backend == "smart":
        return SmartStorageBackend(settings.storage)
    raise ValueError(f"Unsupported backend '{settings.storage.backend}'")
