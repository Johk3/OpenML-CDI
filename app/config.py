from dataclasses import dataclass
import os

STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
LOCAL_UPLOAD_DIR_ENV = "LOCAL_UPLOAD_DIR"
UPLOAD_TARGET_ENV = "UPLOAD_TARGET"
UPLOAD_LOCATION_ENV = "UPLOAD_LOCATION"
UPLOAD_URL_EXPIRES_SECONDS_ENV = "UPLOAD_URL_EXPIRES_SECONDS"
DEFAULT_STORAGE_BACKEND = "local"
DEFAULT_LOCAL_UPLOAD_DIR = ".local_uploads"
DEFAULT_UPLOAD_TARGET = "uploads"
DEFAULT_UPLOAD_LOCATION = "default"
DEFAULT_UPLOAD_URL_EXPIRES_SECONDS = 3600
SUPPORTED_STORAGE_BACKENDS = {"local", "smart"}
DEFAULT_EMAIL_BACKEND = "console"
DEFAULT_EMAIL_FROM = "noreply@example.com"
DEFAULT_APP_BASE_URL = "http://localhost:8000"
DEFAULT_EMAIL_VERIFICATION_TTL_HOURS = 24
DEFAULT_QUARANTINE_DIR = ".quarantine"


def _get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class StorageSettings:
    backend: str = DEFAULT_STORAGE_BACKEND
    local_upload_dir: str = DEFAULT_LOCAL_UPLOAD_DIR
    quarantine_dir: str = DEFAULT_QUARANTINE_DIR
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""

    @classmethod
    def from_env(cls) -> "StorageSettings":
        """Read and validate all storage-related environment variables."""
        raw_backend = os.getenv(STORAGE_BACKEND_ENV, DEFAULT_STORAGE_BACKEND)
        backend = raw_backend.strip().lower()

        raw_upload_dir = os.getenv(LOCAL_UPLOAD_DIR_ENV, DEFAULT_LOCAL_UPLOAD_DIR)
        local_upload_dir = raw_upload_dir.strip()

        raw_quarantine_dir = os.getenv("QUARANTINE_DIR", DEFAULT_QUARANTINE_DIR)
        quarantine_dir = raw_quarantine_dir.strip()

        if backend not in SUPPORTED_STORAGE_BACKENDS:
            raise ValueError(
                "Unsupported STORAGE_BACKEND " f"'{backend}'. " "Supported: local"
            )

        return cls(
            backend=backend,
            local_upload_dir=local_upload_dir or DEFAULT_LOCAL_UPLOAD_DIR,
            quarantine_dir=quarantine_dir or DEFAULT_QUARANTINE_DIR,
            s3_bucket=os.getenv("S3_BUCKET", "").strip(),
            s3_region=os.getenv("S3_REGION", "").strip(),
            s3_endpoint=os.getenv("S3_ENDPOINT", "").strip(),
            s3_access_key=os.getenv("S3_ACCESS_KEY", "").strip(),
            s3_secret_key=os.getenv("S3_SECRET_KEY", "").strip(),
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
class UploadURLSettings:
    target: str = DEFAULT_UPLOAD_TARGET
    location: str = DEFAULT_UPLOAD_LOCATION
    expires_seconds: int = DEFAULT_UPLOAD_URL_EXPIRES_SECONDS

    @classmethod
    def from_env(cls) -> "UploadURLSettings":
        raw_target = os.getenv(UPLOAD_TARGET_ENV, DEFAULT_UPLOAD_TARGET)
        target = raw_target.strip() or DEFAULT_UPLOAD_TARGET

        raw_location = os.getenv(UPLOAD_LOCATION_ENV, DEFAULT_UPLOAD_LOCATION)
        location = raw_location.strip() or DEFAULT_UPLOAD_LOCATION

        raw_expiry = os.getenv(
            UPLOAD_URL_EXPIRES_SECONDS_ENV,
            str(DEFAULT_UPLOAD_URL_EXPIRES_SECONDS),
        )
        try:
            expires_seconds = int(raw_expiry.strip())
        except ValueError as error:
            raise ValueError("UPLOAD_URL_EXPIRES_SECONDS must be an integer") from error

        if expires_seconds <= 0:
            raise ValueError("UPLOAD_URL_EXPIRES_SECONDS must be > 0")

        return cls(
            target=target,
            location=location,
            expires_seconds=expires_seconds,
        )


@dataclass(frozen=True)
class Settings:
    # Group settings by domain so config stays centralized and maintainable.
    storage: StorageSettings
    email: EmailSettings
    upload: UploadURLSettings

    @classmethod
    def from_env(cls) -> "Settings":
        """Build application settings from centralized domain settings."""
        return cls(
            storage=StorageSettings.from_env(),
            email=EmailSettings.from_env(),
            upload=UploadURLSettings.from_env(),
        )
