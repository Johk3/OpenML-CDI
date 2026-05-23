import re
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
    assert "GITHUB_REDIRECT=http://localhost:5173/login/callback" in compose
    assert "VITE_API_BASE_URL=http://localhost:8000/api" in compose
    assert "VITE_API_URL=" not in compose


def test_frontend_env_example_uses_full_api_base_path():
    env_example = _read("frontend/.env.example")

    assert "VITE_API_BASE_URL=http://localhost:8000/api" in env_example
    assert "VITE_API_BASE_URL=http://localhost:8000\n" not in env_example


def test_backend_black_config_uses_standard_pyproject_filename():
    pyproject = ROOT / "app/pyproject.toml"

    assert pyproject.is_file()
    assert not (ROOT / "app/pytproject.toml").exists()
    assert "target-version = ['py312']" in pyproject.read_text()


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


def test_production_compose_shares_local_upload_volume_with_clamd():
    compose = _read("compose.yml")
    app_block = compose.split("\n  app:\n", 1)[1].split("\n  database:\n", 1)[0]
    clamd_block = compose.split("\n  clamd:\n", 1)[1].split("\n  proxy:\n", 1)[0]

    assert "LOCAL_UPLOAD_DIR: /data/uploads" in compose
    assert "QUARANTINE_DIR: /data/quarantine" in compose
    assert "CLAMD_TIMEOUT_SECONDS: ${CLAMD_TIMEOUT_SECONDS:-60}" in app_block
    assert "condition: service_healthy" in app_block
    assert "volumes:" in clamd_block
    assert "- openml-data:/data:ro" in clamd_block


def test_production_compose_allows_local_dev_frontend_origin():
    compose = _read("compose.yml")

    assert (
        "CORS_ALLOWED_ORIGINS: "
        "${CORS_ALLOWED_ORIGINS:-"
        "http://localhost:8000,http://127.0.0.1:8000,"
        "http://localhost:5173,http://127.0.0.1:5173}"
    ) in compose


def test_caddy_preserves_fastapi_docs_before_spa_fallback():
    caddyfile = _read("infra/caddy/Caddyfile")

    fallback_position = caddyfile.index("rewrite * /")
    docs_position = caddyfile.index("@fastapi_docs path")
    assert docs_position < fallback_position
    assert "/docs /docs/*" in caddyfile
    assert "/redoc /redoc/*" in caddyfile
    assert "/openapi.json" in caddyfile
    assert caddyfile.index("handle @fastapi_docs") < fallback_position


def test_dev_compose_shares_scan_quarantine_volume_with_clamd():
    compose = _read("docker-compose.dev.yml")
    backend_block = compose.split("\n  backend:\n", 1)[1].split("\n  frontend:\n", 1)[0]
    clamd_block = compose.split("\n  clamd:\n", 1)[1].split("\n  minio:\n", 1)[0]

    assert "- QUARANTINE_DIR=/backend/app/data/quarantine" in backend_block
    assert "- CLAMD_TIMEOUT_SECONDS=60" in backend_block
    assert "condition: service_healthy" in backend_block
    assert "- ./app/data:/backend/app/data" in backend_block
    assert "volumes:" in clamd_block
    assert "- ./app/data:/backend/app/data:ro" in clamd_block


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


def test_timezone_migration_updates_existing_core_timestamp_columns():
    migrations = "\n".join(
        path.read_text() for path in sorted((ROOT / "alembic/versions").glob("*.py"))
    )

    assert re.search(r'op\.alter_column\(\s*"users",\s*"created_at"', migrations)
    assert re.search(r'op\.alter_column\(\s*"datasets",\s*"created_at"', migrations)
    assert re.search(
        r'op\.alter_column\(\s*"refresh_tokens",\s*"created_at"', migrations
    )
    assert re.search(
        r'op\.alter_column\(\s*"refresh_tokens",\s*"expires_at"', migrations
    )
    assert "sa.DateTime(timezone=True)" in migrations


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
