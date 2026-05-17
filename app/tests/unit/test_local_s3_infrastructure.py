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


def test_dev_compose_has_self_contained_backend_and_frontend_env():
    compose = _read("docker-compose.dev.yml")

    assert "JWT_SECRET=dev-only-change-me" in compose
    assert "./.env:/backend/.env" not in compose
    assert "set -e" in compose
    assert "alembic upgrade head" in compose
    assert "VITE_API_BASE_URL=http://localhost:8000" in compose
    assert "VITE_API_URL=" not in compose


def test_frontend_env_example_uses_api_origin_not_api_path():
    env_example = _read("frontend/.env.example")

    assert "VITE_API_BASE_URL=http://localhost:8000" in env_example
    assert "VITE_API_BASE_URL=http://localhost:8000/api" not in env_example


def test_frontend_dev_dockerfile_installs_pnpm_without_corepack():
    dockerfile = _read("frontend/Dockerfile.dev")

    assert "npm install -g pnpm@latest" in dockerfile
    assert "corepack enable pnpm" not in dockerfile


def test_frontend_docker_context_ignores_local_artifacts():
    dockerignore = _read("frontend/.dockerignore")

    assert "node_modules" in dockerignore
    assert "dist" in dockerignore
    assert ".env" in dockerignore


def test_compose_uses_multi_arch_clamav_image():
    production_compose = _read("compose.yml")
    development_compose = _read("docker-compose.dev.yml")

    assert "clamav/clamav-debian:stable" in production_compose
    assert "clamav/clamav-debian:stable" in development_compose
    assert "clamav/clamav:stable" not in production_compose
    assert "clamav/clamav:stable" not in development_compose


def test_dockerignore_excludes_nested_dependency_directories():
    dockerignore = _read(".dockerignore")

    assert "**/node_modules" in dockerignore
    assert "**/dist" in dockerignore
    assert ".env" in dockerignore
    assert "app/.env" in dockerignore
    assert "encrypted.env*" in dockerignore


def test_production_compose_fails_fast_when_migrations_fail():
    compose = _read("compose.yml")

    assert "set -e" in compose
    assert "alembic upgrade head" in compose


def test_token_family_name_migration_does_not_reference_non_unique_token_family():
    migration = _read(
        "alembic/versions/2026_03_09_2022_add_name_for_token_families_0e04539fed93.py"
    )

    assert (
        "ForeignKeyConstraint(['family_id'], ['refresh_tokens.family_id']"
        not in migration
    )
    assert (
        'ForeignKeyConstraint(["family_id"], ["refresh_tokens.family_id"]'
        not in migration
    )


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
