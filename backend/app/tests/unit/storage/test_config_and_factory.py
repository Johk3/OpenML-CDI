import pytest

from app.config import Settings
from app.storage import get_storage_backend


def test_settings_defaults(monkeypatch):
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    monkeypatch.delenv("LOCAL_UPLOAD_DIR", raising=False)
    monkeypatch.delenv("QUARANTINE_DIR", raising=False)
    monkeypatch.delenv("CLAMD_SOCKET", raising=False)
    monkeypatch.delenv("CLAMD_HOST", raising=False)
    monkeypatch.delenv("CLAMD_PORT", raising=False)
    monkeypatch.delenv("CLAMD_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("UPLOAD_TARGET", raising=False)
    monkeypatch.delenv("UPLOAD_LOCATION", raising=False)
    monkeypatch.delenv("UPLOAD_URL_EXPIRES_SECONDS", raising=False)
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    monkeypatch.delenv("GITHUB_ISSUES_OWNER", raising=False)
    monkeypatch.delenv("GITHUB_ISSUES_REPO", raising=False)
    monkeypatch.delenv("GITHUB_PERMISSION_OWNER", raising=False)
    monkeypatch.delenv("GITHUB_PERMISSION_REPO", raising=False)

    settings = Settings.from_env()

    assert settings.auth.cookie_secure is True
    assert settings.storage.backend == "local"
    assert settings.storage.local_upload_dir == ".local_uploads"
    assert settings.storage.quarantine_dir == ".quarantine"
    assert settings.storage.clamd_socket == ""
    assert settings.storage.clamd_host == "127.0.0.1"
    assert settings.storage.clamd_port == 3310
    assert settings.storage.clamd_timeout_seconds == 60.0
    assert settings.github_issues.owner == "koevoet1221"
    assert settings.github_issues.repo == "openmlupload-testing"
    assert settings.github_issues.permission_owner == "koevoet1221"
    assert settings.github_issues.permission_repo == "openmlupload-testing"
    assert settings.app_base_url == "http://localhost:8000"
    assert settings.upload.target == "uploads"
    assert settings.upload.location == "default"
    assert settings.upload.expires_seconds == 3600


def test_cookie_secure_can_be_disabled_for_local_http(monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "false")

    settings = Settings.from_env()

    assert settings.auth.cookie_secure is False


def test_app_base_url_can_be_overridden(monkeypatch):
    monkeypatch.setenv("APP_BASE_URL", " https://upload.example.com ")

    settings = Settings.from_env()

    assert settings.app_base_url == "https://upload.example.com"


def test_upload_settings_can_be_overridden(monkeypatch):
    monkeypatch.setenv("UPLOAD_TARGET", "team-uploads")
    monkeypatch.setenv("UPLOAD_LOCATION", "eu")
    monkeypatch.setenv("UPLOAD_URL_EXPIRES_SECONDS", "7200")

    settings = Settings.from_env()

    assert settings.upload.target == "team-uploads"
    assert settings.upload.location == "eu"
    assert settings.upload.expires_seconds == 7200


def test_invalid_presigned_url_expiry_raises(monkeypatch):
    monkeypatch.setenv("UPLOAD_URL_EXPIRES_SECONDS", "0")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_invalid_backend_raises(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "dropbox")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_s3_backend_requires_bucket(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.delenv("S3_BUCKET", raising=False)

    with pytest.raises(ValueError):
        Settings.from_env()


def test_factory_returns_local_backend(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    settings = Settings.from_env()

    backend = get_storage_backend(settings)

    assert backend.backend_name() == "local"


def test_factory_returns_explicit_s3_backend(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "datasets")
    monkeypatch.setenv("S3_REGION", "eu-west-1")
    monkeypatch.setenv("S3_ENDPOINT", "http://localhost:9000")
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT", "http://localhost:9000")
    monkeypatch.setenv("S3_ACCESS_KEY", "minio")
    monkeypatch.setenv("S3_SECRET_KEY", "minio-secret")
    monkeypatch.setenv("S3_FORCE_PATH_STYLE", "true")

    settings = Settings.from_env()
    backend = get_storage_backend(settings)

    assert settings.storage.s3_bucket == "datasets"
    assert settings.storage.s3_region == "eu-west-1"
    assert settings.storage.s3_endpoint == "http://localhost:9000"
    assert settings.storage.s3_public_endpoint == "http://localhost:9000"
    assert settings.storage.s3_force_path_style is True
    assert backend.backend_name() == "s3"


def test_clamd_settings_can_be_overridden(monkeypatch):
    monkeypatch.setenv("CLAMD_SOCKET", "/tmp/clamd.sock")
    monkeypatch.setenv("CLAMD_HOST", "clamd.internal")
    monkeypatch.setenv("CLAMD_PORT", "3322")
    monkeypatch.setenv("CLAMD_TIMEOUT_SECONDS", "25")

    settings = Settings.from_env()

    assert settings.storage.clamd_socket == "/tmp/clamd.sock"
    assert settings.storage.clamd_host == "clamd.internal"
    assert settings.storage.clamd_port == 3322
    assert settings.storage.clamd_timeout_seconds == 25.0


def test_invalid_clamd_port_raises(monkeypatch):
    monkeypatch.setenv("CLAMD_PORT", "invalid")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_invalid_clamd_timeout_raises(monkeypatch):
    monkeypatch.setenv("CLAMD_TIMEOUT_SECONDS", "0")

    with pytest.raises(ValueError):
        Settings.from_env()
