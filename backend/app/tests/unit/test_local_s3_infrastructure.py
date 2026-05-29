import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = ROOT / "backend"


def _read(path: str) -> str:
    return (ROOT / path).read_text()


def _read_backend(path: str) -> str:
    return (BACKEND_ROOT / path).read_text()


def test_backend_files_live_under_backend_directory():
    assert (BACKEND_ROOT / "app").is_dir()
    assert (BACKEND_ROOT / "alembic").is_dir()
    assert (BACKEND_ROOT / "requirements.txt").is_file()
    assert not (ROOT / "app").exists()
    assert not (ROOT / "alembic").exists()


def test_dev_compose_has_self_contained_backend_and_frontend_env():
    compose = _read("docker-compose.dev.yml")

    assert "JWT_SECRET=dev-only-change-me" in compose
    assert "./.env:/backend/.env" not in compose
    assert "set -e" in compose
    assert "alembic upgrade head" in compose
    assert "GITHUB_REDIRECT=http://localhost:5173/login/callback" in compose
    assert "VITE_API_BASE_URL=http://localhost:8000/api" in compose
    assert "VITE_API_URL=" not in compose


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
    assert "- ./backend/app/data:/backend/app/data" in backend_block
    assert "volumes:" in clamd_block
    assert "- ./backend/app/data:/backend/app/data:ro" in clamd_block


def test_production_compose_fails_fast_when_migrations_fail():
    compose = _read("compose.yml")

    assert "set -e" in compose
    assert "alembic upgrade head" in compose


def test_token_family_name_migration_does_not_reference_non_unique_token_family():
    migration = _read(
        "backend/alembic/versions/"
        "2026_03_09_2022_add_name_for_token_families_0e04539fed93.py"
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
        path.read_text()
        for path in sorted((BACKEND_ROOT / "alembic/versions").glob("*.py"))
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


def test_ci_starts_minio_and_runs_backend_s3_checks():
    workflow = _read(".github/workflows/docker-check.yaml")
    setup_script = _read_backend("scripts/setup_local_s3.py")

    assert "minio/minio:" in workflow
    assert "backend/scripts/setup_local_s3.py" in workflow
    assert (
        "MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:5173,http://127.0.0.1:5173"
        in workflow
    )
    assert "STORAGE_BACKEND: s3" in workflow
    assert "S3_ENDPOINT: http://127.0.0.1:9000" in workflow
    assert "pytest" in workflow
    assert 'request_checksum_calculation="when_required"' in setup_script
    assert "put_bucket_cors" not in setup_script
