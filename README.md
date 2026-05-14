# Contributing

Please follow the projects guidelines on contributing.
For more information, see [CONTRIBUTING.md](CONTRIBUTING.md).

For guides on testing, CI, code reviews, and more, see the [documentation index](docs/index.md).

# How to run

install requirements
run `uvicorn app.main:app --reload` to start server

## Docker

You can also build and run the application as a Docker container:

```bash
docker build -t openml-upload .
docker run -d -p 8000:8000 -v openml-data:/data openml-upload
```

The app will be available at **http://localhost:8000**. A pre-built image is also published to `ghcr.io/ludev/openml-upload:latest` on every push to the default branch.

Dataset upload confirmation requires a reachable ClamAV `clamd` daemon. If `clamd` is unavailable, uploads are quarantined and not promoted for download. For local upload-flow development, use the Compose stack documented in [Local S3-Compatible Storage](docs/how-to/local-s3-storage.md).

For full instructions — including environment variables, volume configuration, and production deployment notes — see the [Docker hosting guide](docs/how-to/docker-hosting.md).

## Storage setup

The app supports local filesystem storage for development/tests and explicit S3-compatible object storage for production-like upload flows.

For S3-compatible storage, set:

```bash
STORAGE_BACKEND=s3
S3_BUCKET=openml-datasets
S3_REGION=eu-west-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
UPLOAD_URL_EXPIRES_SECONDS=3600
```

`S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` are mainly for local S3-compatible services such as MinIO. Leave `S3_ENDPOINT` empty for AWS S3. For the full architecture, upload lifecycle, MinIO setup, bucket CORS, cleanup rules, and minimum permissions, see [docs/reference/s3-storage.md](docs/reference/s3-storage.md).

## Run tests and automation

For a fresh clone, install Lefthook once from the repository root:

```bash
pipx install lefthook
lefthook install
```

Then you can run the local checks with:

```bash
pytest -q
lefthook run pre-commit --all-files
```

Lefthook runs the same formatting, linting, secret-scanning, and test checks that are also wired into GitHub Actions under `.github/workflows/`.

For the full step-by-step setup guide, see [docs/how-to/CI-pipeline.md](docs/how-to/CI-pipeline.md).

# Credits / Third-party libraries

This project builds oSn a number of open-source libraries and tools across the backend, frontend, and tooling. See [docs/references/credits.md](docs/references/credits.md) for the full list with descriptions and links.
