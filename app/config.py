from dataclasses import dataclass
import os


STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
LOCAL_UPLOAD_DIR_ENV = "LOCAL_UPLOAD_DIR"
DEFAULT_STORAGE_BACKEND = "local"
DEFAULT_LOCAL_UPLOAD_DIR = ".local_uploads"
SUPPORTED_STORAGE_BACKENDS = {"local"}


@dataclass(frozen=True)
class StorageSettings:
    backend: str = DEFAULT_STORAGE_BACKEND
    local_upload_dir: str = DEFAULT_LOCAL_UPLOAD_DIR

    @classmethod
    def from_env(cls) -> "StorageSettings":
        """Read and validate all storage-related environment variables."""
        raw_backend = os.getenv(STORAGE_BACKEND_ENV, DEFAULT_STORAGE_BACKEND)
        backend = raw_backend.strip().lower()

        raw_upload_dir = os.getenv(LOCAL_UPLOAD_DIR_ENV, DEFAULT_LOCAL_UPLOAD_DIR)
        local_upload_dir = raw_upload_dir.strip()

        if backend not in SUPPORTED_STORAGE_BACKENDS:
            raise ValueError(
                "Unsupported STORAGE_BACKEND " f"'{backend}'. " "Supported: local"
            )

        return cls(
            backend=backend,
            local_upload_dir=local_upload_dir or DEFAULT_LOCAL_UPLOAD_DIR,
        )


@dataclass(frozen=True)
class Settings:
    # Group settings by domain so config stays centralized and maintainable.
    storage: StorageSettings

    @classmethod
    def from_env(cls) -> "Settings":
        """Build application settings from centralized domain settings."""
        return cls(storage=StorageSettings.from_env())
