import pytest

from app.config import Settings
from app.storage import get_storage_backend


def test_settings_defaults(monkeypatch):
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    monkeypatch.delenv("LOCAL_UPLOAD_DIR", raising=False)

    settings = Settings.from_env()

    assert settings.storage.backend == "local"
    assert settings.storage.local_upload_dir == ".local_uploads"


def test_invalid_backend_raises(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_factory_returns_local_backend(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    settings = Settings.from_env()

    backend = get_storage_backend(settings)

    assert backend.backend_name() == "local"
