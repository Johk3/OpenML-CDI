from app.config import Settings
from .base import StorageBackend
from .local import LocalStorageBackend


def get_storage_backend(settings: Settings) -> StorageBackend:
    """Return the configured storage backend instance."""
    if settings.storage.backend == "local":
        return LocalStorageBackend(settings.storage.local_upload_dir)
    raise ValueError(f"Unsupported backend '{settings.storage.backend}'")
