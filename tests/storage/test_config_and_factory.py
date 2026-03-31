import pytest

from app.config import Settings
from app.storage import get_storage_backend


def test_settings_defaults(monkeypatch):
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    monkeypatch.delenv("LOCAL_UPLOAD_DIR", raising=False)
    monkeypatch.delenv("UPLOAD_TARGET", raising=False)
    monkeypatch.delenv("UPLOAD_LOCATION", raising=False)
    monkeypatch.delenv("UPLOAD_URL_EXPIRES_SECONDS", raising=False)

    settings = Settings.from_env()

    assert settings.storage.backend == "local"
    assert settings.storage.local_upload_dir == ".local_uploads"
    assert settings.email.backend == "console"
    assert settings.upload.target == "uploads"
    assert settings.upload.location == "default"
    assert settings.upload.expires_seconds == 3600


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
    monkeypatch.setenv("STORAGE_BACKEND", "s3")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_factory_returns_local_backend(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    settings = Settings.from_env()

    backend = get_storage_backend(settings)

    assert backend.backend_name() == "local"
