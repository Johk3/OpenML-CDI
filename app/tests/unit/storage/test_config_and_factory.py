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

    settings = Settings.from_env()

    assert settings.storage.backend == "local"
    assert settings.storage.local_upload_dir == ".local_uploads"
    assert settings.storage.quarantine_dir == ".quarantine"
    assert settings.storage.clamd_socket == ""
    assert settings.storage.clamd_host == "127.0.0.1"
    assert settings.storage.clamd_port == 3310
    assert settings.storage.clamd_timeout_seconds == 10.0


def test_invalid_backend_raises(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")

    with pytest.raises(ValueError):
        Settings.from_env()


def test_factory_returns_local_backend(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    settings = Settings.from_env()

    backend = get_storage_backend(settings)

    assert backend.backend_name() == "local"


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
