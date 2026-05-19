from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app


def test_app_initializes_storage_in_app_state(monkeypatch, tmp_path):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_UPLOAD_DIR", str(tmp_path))

    with TestClient(app) as client:
        client_app = cast(FastAPI, client.app)
        # Storage wiring should attach both parsed settings and backend instance.
        assert client_app.state.settings.storage.backend == "local"
        assert client_app.state.storage.backend_name() == "local"


def test_root_endpoint_still_works_after_storage_wiring(monkeypatch, tmp_path):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_UPLOAD_DIR", str(tmp_path))

    with TestClient(app) as client:
        response = client.get("/")

    # Wiring must not change the existing root route behavior.
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
