from dataclasses import dataclass
import os

STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
LOCAL_UPLOAD_DIR_ENV = "LOCAL_UPLOAD_DIR"
QUARANTINE_DIR_ENV = "QUARANTINE_DIR"
CLAMD_SOCKET_ENV = "CLAMD_SOCKET"
CLAMD_HOST_ENV = "CLAMD_HOST"
CLAMD_PORT_ENV = "CLAMD_PORT"
CLAMD_TIMEOUT_SECONDS_ENV = "CLAMD_TIMEOUT_SECONDS"
S3_BUCKET_ENV = "S3_BUCKET"
S3_REGION_ENV = "S3_REGION"
S3_ENDPOINT_ENV = "S3_ENDPOINT"
S3_PUBLIC_ENDPOINT_ENV = "S3_PUBLIC_ENDPOINT"
S3_ACCESS_KEY_ENV = "S3_ACCESS_KEY"
S3_SECRET_KEY_ENV = "S3_SECRET_KEY"
S3_FORCE_PATH_STYLE_ENV = "S3_FORCE_PATH_STYLE"
UPLOAD_TARGET_ENV = "UPLOAD_TARGET"
UPLOAD_LOCATION_ENV = "UPLOAD_LOCATION"
UPLOAD_URL_EXPIRES_SECONDS_ENV = "UPLOAD_URL_EXPIRES_SECONDS"
COOKIE_SECURE_ENV = "COOKIE_SECURE"
APP_BASE_URL_ENV = "APP_BASE_URL"
DEFAULT_STORAGE_BACKEND = "local"
DEFAULT_LOCAL_UPLOAD_DIR = ".local_uploads"
DEFAULT_UPLOAD_TARGET = "uploads"
DEFAULT_UPLOAD_LOCATION = "default"
DEFAULT_UPLOAD_URL_EXPIRES_SECONDS = 3600
DEFAULT_COOKIE_SECURE = True
SUPPORTED_STORAGE_BACKENDS = {"local", "smart", "s3"}
DEFAULT_CLAMD_HOST = "127.0.0.1"
DEFAULT_CLAMD_PORT = 3310
DEFAULT_CLAMD_TIMEOUT_SECONDS = 60.0
DEFAULT_APP_BASE_URL = "http://localhost:8000"
DEFAULT_QUARANTINE_DIR = ".quarantine"
DEFAULT_CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
DEFAULT_GITHUB_ISSUES_OWNER = "koevoet1221"
DEFAULT_GITHUB_ISSUES_REPO = "openmlupload-testing"


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
    clamd_socket: str = ""
    clamd_host: str = DEFAULT_CLAMD_HOST
    clamd_port: int = DEFAULT_CLAMD_PORT
    clamd_timeout_seconds: float = DEFAULT_CLAMD_TIMEOUT_SECONDS
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint: str = ""
    s3_public_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_force_path_style: bool = False

    @classmethod
    def from_env(cls) -> "StorageSettings":
        """Read and validate all storage-related environment variables."""
        raw_backend = os.getenv(STORAGE_BACKEND_ENV, DEFAULT_STORAGE_BACKEND)
        backend = raw_backend.strip().lower()

        raw_upload_dir = os.getenv(LOCAL_UPLOAD_DIR_ENV, DEFAULT_LOCAL_UPLOAD_DIR)
        local_upload_dir = raw_upload_dir.strip()

        raw_quarantine_dir = os.getenv(QUARANTINE_DIR_ENV, DEFAULT_QUARANTINE_DIR)
        quarantine_dir = raw_quarantine_dir.strip()

        raw_clamd_socket = os.getenv(CLAMD_SOCKET_ENV, "")
        clamd_socket = raw_clamd_socket.strip()

        raw_clamd_host = os.getenv(CLAMD_HOST_ENV, DEFAULT_CLAMD_HOST)
        clamd_host = raw_clamd_host.strip() or DEFAULT_CLAMD_HOST

        raw_clamd_port = os.getenv(CLAMD_PORT_ENV, str(DEFAULT_CLAMD_PORT))
        try:
            clamd_port = int(raw_clamd_port.strip())
        except ValueError as error:
            raise ValueError("CLAMD_PORT must be an integer") from error
        if clamd_port <= 0:
            raise ValueError("CLAMD_PORT must be > 0")

        raw_clamd_timeout = os.getenv(
            CLAMD_TIMEOUT_SECONDS_ENV,
            str(DEFAULT_CLAMD_TIMEOUT_SECONDS),
        )
        try:
            clamd_timeout_seconds = float(raw_clamd_timeout.strip())
        except ValueError as error:
            raise ValueError("CLAMD_TIMEOUT_SECONDS must be a number") from error
        if clamd_timeout_seconds <= 0:
            raise ValueError("CLAMD_TIMEOUT_SECONDS must be > 0")

        if backend not in SUPPORTED_STORAGE_BACKENDS:
            raise ValueError(
                "Unsupported STORAGE_BACKEND "
                f"'{backend}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_STORAGE_BACKENDS))}"
            )

        s3_bucket = os.getenv(S3_BUCKET_ENV, "").strip()
        if backend == "s3" and not s3_bucket:
            raise ValueError("S3_BUCKET is required when STORAGE_BACKEND=s3")

        return cls(
            backend=backend,
            local_upload_dir=local_upload_dir or DEFAULT_LOCAL_UPLOAD_DIR,
            quarantine_dir=quarantine_dir or DEFAULT_QUARANTINE_DIR,
            clamd_socket=clamd_socket,
            clamd_host=clamd_host,
            clamd_port=clamd_port,
            clamd_timeout_seconds=clamd_timeout_seconds,
            s3_bucket=s3_bucket,
            s3_region=os.getenv(S3_REGION_ENV, "").strip(),
            s3_endpoint=os.getenv(S3_ENDPOINT_ENV, "").strip(),
            s3_public_endpoint=os.getenv(S3_PUBLIC_ENDPOINT_ENV, "").strip(),
            s3_access_key=os.getenv(S3_ACCESS_KEY_ENV, "").strip(),
            s3_secret_key=os.getenv(S3_SECRET_KEY_ENV, "").strip(),
            s3_force_path_style=_get_bool_env(S3_FORCE_PATH_STYLE_ENV, False),
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
class AuthSettings:
    cookie_secure: bool = DEFAULT_COOKIE_SECURE

    @classmethod
    def from_env(cls) -> "AuthSettings":
        return cls(
            cookie_secure=_get_bool_env(COOKIE_SECURE_ENV, DEFAULT_COOKIE_SECURE),
        )


@dataclass(frozen=True)
class GitHubIssuesSettings:
    app_id: int | None = None
    install_id: int | None = None
    private_key: str = ""
    owner: str = DEFAULT_GITHUB_ISSUES_OWNER
    repo: str = DEFAULT_GITHUB_ISSUES_REPO

    @classmethod
    def from_env(cls) -> "GitHubIssuesSettings":
        def get_env_val(key_name: str) -> str:
            # Handle possible trailing spaces in the env keys, e.g. "GH_APP_ID "
            for k, v in os.environ.items():
                if k.strip() == key_name:
                    return v.strip()
            return os.getenv(key_name, "").strip()

        app_id_str = get_env_val("GH_APP_ID")
        install_id_str = get_env_val("GH_INSTALL_ID")
        priv_key_str = get_env_val("GH_PRIV_KEY").replace("\\n", "\n")

        return cls(
            app_id=int(app_id_str) if app_id_str else None,
            install_id=int(install_id_str) if install_id_str else None,
            private_key=priv_key_str,
            owner=get_env_val("GITHUB_ISSUES_OWNER") or DEFAULT_GITHUB_ISSUES_OWNER,
            repo=get_env_val("GITHUB_ISSUES_REPO") or DEFAULT_GITHUB_ISSUES_REPO,
        )


@dataclass(frozen=True)
class Settings:
    # Group settings by domain so config stays centralized and maintainable.
    storage: StorageSettings
    upload: UploadURLSettings
    auth: AuthSettings
    github_issues: GitHubIssuesSettings
    cors_allowed_origins: list[str]
    app_base_url: str

    @classmethod
    def from_env(cls) -> "Settings":
        """Build application settings from centralized domain settings."""
        app_base_url = os.getenv(APP_BASE_URL_ENV, DEFAULT_APP_BASE_URL).strip()
        return cls(
            storage=StorageSettings.from_env(),
            upload=UploadURLSettings.from_env(),
            auth=AuthSettings.from_env(),
            github_issues=GitHubIssuesSettings.from_env(),
            cors_allowed_origins=[
                origin.strip()
                for origin in os.getenv(
                    "CORS_ALLOWED_ORIGINS", DEFAULT_CORS_ALLOWED_ORIGINS
                ).split(",")
                if origin.strip()
            ],
            app_base_url=app_base_url or DEFAULT_APP_BASE_URL,
        )
