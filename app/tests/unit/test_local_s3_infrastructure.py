from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _read(path: str) -> str:
    return (ROOT / path).read_text()


def test_docker_compose_provisions_local_s3_stack():
    compose = _read("docker-compose.dev.yml")

    assert "minio:" in compose
    assert "minio/minio:" in compose
    assert "minio-init:" in compose
    assert "mc mb --ignore-existing local/openml-upload-local" in compose
    assert "mc ilm import local/openml-upload-local" in compose
    assert (
        "MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:5173,http://127.0.0.1:5173"
        in compose
    )
    assert "STORAGE_BACKEND=s3" in compose
    assert "S3_ENDPOINT=http://minio:9000" in compose
    assert "S3_FORCE_PATH_STYLE=true" in compose


def test_local_s3_policy_files_define_cors_and_lifecycle_cleanup():
    lifecycle = _read("infra/minio/lifecycle.json")
    docs = _read("docs/how-to/local-s3-storage.md")

    assert "AbortIncompleteMultipartUpload" not in lifecycle
    assert '"Prefix": "quarantine/"' in lifecycle
    assert '"Days": 7' in lifecycle
    assert "AbortIncompleteMultipartUpload" in docs
    assert "deployed S3 bucket" in docs


def test_ci_starts_minio_and_runs_backend_s3_checks():
    workflow = _read(".github/workflows/docker-check.yaml")
    setup_script = _read("scripts/setup_local_s3.py")

    assert "minio/minio:" in workflow
    assert "scripts/setup_local_s3.py" in workflow
    assert (
        "MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:5173,http://127.0.0.1:5173"
        in workflow
    )
    assert "STORAGE_BACKEND: s3" in workflow
    assert "S3_ENDPOINT: http://127.0.0.1:9000" in workflow
    assert "pytest" in workflow
    assert 'request_checksum_calculation="when_required"' in setup_script
    assert "put_bucket_cors" not in setup_script


def test_docs_explain_local_storage_vs_local_s3():
    docs = _read("docs/how-to/local-s3-storage.md")
    index = _read("docs/index.md")

    assert "local storage" in docs.lower()
    assert "local s3" in docs.lower()
    assert "docker compose" in docs.lower()
    assert "lifecycle" in docs.lower()
    assert "local-s3-storage.md" in index
