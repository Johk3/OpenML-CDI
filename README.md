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

For full instructions — including environment variables, volume configuration, and production deployment notes — see the [Docker hosting guide](docs/how-to/docker-hosting.md).

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
