from dataclasses import dataclass
import os

STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
LOCAL_UPLOAD_DIR_ENV = "LOCAL_UPLOAD_DIR"
DEFAULT_STORAGE_BACKEND = "local"
DEFAULT_LOCAL_UPLOAD_DIR = "./data/local_uploads"
SUPPORTED_STORAGE_BACKENDS = {"local"}
DEFAULT_EMAIL_BACKEND = "console"
DEFAULT_EMAIL_FROM = "noreply@example.com"
DEFAULT_APP_BASE_URL = "http://localhost:8000"
DEFAULT_EMAIL_VERIFICATION_TTL_HOURS = 24


def _get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


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
class EmailSettings:
    backend: str = DEFAULT_EMAIL_BACKEND
    from_email: str = DEFAULT_EMAIL_FROM
    app_base_url: str = DEFAULT_APP_BASE_URL
    verification_ttl_hours: int = DEFAULT_EMAIL_VERIFICATION_TTL_HOURS
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True

    @classmethod
    def from_env(cls) -> "EmailSettings":
        return cls(
            backend=os.getenv("EMAIL_BACKEND", DEFAULT_EMAIL_BACKEND).strip().lower()
            or DEFAULT_EMAIL_BACKEND,
            from_email=os.getenv("EMAIL_FROM", DEFAULT_EMAIL_FROM).strip()
            or DEFAULT_EMAIL_FROM,
            app_base_url=os.getenv("APP_BASE_URL", DEFAULT_APP_BASE_URL).strip()
            or DEFAULT_APP_BASE_URL,
            verification_ttl_hours=int(
                os.getenv(
                    "EMAIL_VERIFICATION_TTL_HOURS",
                    str(DEFAULT_EMAIL_VERIFICATION_TTL_HOURS),
                )
            ),
            smtp_host=os.getenv("SMTP_HOST", "").strip(),
            smtp_port=int(os.getenv("SMTP_PORT", "587")),
            smtp_username=os.getenv("SMTP_USERNAME", "").strip(),
            smtp_password=os.getenv("SMTP_PASSWORD", ""),
            smtp_use_tls=_get_bool_env("SMTP_USE_TLS", True),
        )


@dataclass(frozen=True)
class Settings:
    # Group settings by domain so config stays centralized and maintainable.
    storage: StorageSettings
    email: EmailSettings

    @classmethod
    def from_env(cls) -> "Settings":
        """Build application settings from centralized domain settings."""
        return cls(
            storage=StorageSettings.from_env(),
            email=EmailSettings.from_env(),
        )
