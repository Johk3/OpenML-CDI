# Hosting with Docker

This guide explains how to build, run, and deploy the OpenML Upload application using Docker.

## Prerequisites

-- [Docker](https://docs.docker.com/get-docker/) installed

## Building the image

From the repository root:

```bash
docker build -t openml-upload .
```

The Dockerfile uses a multi-stage build that compiles the React frontend, installs Python dependencies, and produces a slim production image. No extra build arguments are required.

## Running the Compose stack

The easiest way to run a complete instance is the root Compose stack. It starts the application, Postgres, ClamAV, and Caddy:

```bash
cp .env.example .env
docker compose up -d --build
```

With the default `.env` values, the application is available at **[http://localhost:8000](http://localhost:8000)**.

For GitHub login, create a GitHub OAuth App and set these deployment-time credentials in the root `.env` file:

```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_SECRET=your-client-secret
GITHUB_REDIRECT=http://localhost:8000/login/callback
GITHUB_OAUTH_SCOPES=read:user,user:email,read:org
```

The callback URL configured in the GitHub OAuth App must exactly match `GITHUB_REDIRECT`. End users do not provide these values when they log in; they identify this deployed application to GitHub.
The GitHub App settings below should be configured and installed on the repository so the app can use an installation token to verify repository collaborator permissions for expert-role assignment without requesting broad user repository access.

Dataset review issue creation defaults to `koevoet1221/openmlupload-testing` for this test deployment. The GitHub App credentials must also be present for issue creation to run:

```env
GH_APP_ID=your-github-app-id
GH_INSTALL_ID=your-github-app-installation-id
GH_PRIV_KEY=your-github-app-private-key
GITHUB_ISSUES_OWNER=koevoet1221
GITHUB_ISSUES_REPO=openmlupload-testing
```

For the official deployment, update `GITHUB_ISSUES_OWNER` and `GITHUB_ISSUES_REPO` in `.env`.

For a production domain, use the HTTPS callback, for example:

```env
APP_BASE_URL=https://upload.example.com
GITHUB_REDIRECT=https://upload.example.com/login/callback
COOKIE_SECURE=true
CADDY_SITE_ADDRESS=upload.example.com
HTTP_PORT=80
HTTPS_PORT=443
GH_APP_ID=official-github-app-id
GH_INSTALL_ID=official-github-app-installation-id
GH_PRIV_KEY=official-github-app-private-key
GITHUB_ISSUES_OWNER=official-owner
GITHUB_ISSUES_REPO=official-repo
```

For a local smoke test without GitHub OAuth, set:

```env
AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true
```

## Running the container

```bash
docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  --name openml-upload \
  openml-upload
```

| Flag                   | Purpose                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `-p 8000:8000`         | Maps the container's application port to your host. Change the first number to use a different host port (e.g.`-p 3000:8000`). |
| `-v openml-data:/data` | Mounts a named Docker volume to`/data` inside the container, where the application persists uploaded files.                    |
| `-d`                   | Runs the container in the background.                                                                                          |

Once running, the application is available at **[http://localhost:8000](http://localhost:8000)**.

This starts the application container only. Dataset upload confirmation also requires a reachable ClamAV `clamd` daemon; see [Upload malware scanning](#upload-malware-scanning).

## Environment variables

The application reads the following environment variables. Pass them with `-e` flags:

```bash
docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  -e STORAGE_BACKEND=local \
  -e LOCAL_UPLOAD_DIR=/data/uploads \
  -e QUARANTINE_DIR=/data/quarantine \
  -e CLAMD_HOST=clamav \
  -e CLAMD_PORT=3310 \
  --name openml-upload \
  openml-upload
```

| Variable                | Default          | Description                                                                                                                                       |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_BACKEND`       | `local`          | Storage backend to use for uploads.                                                                                                               |
| `LOCAL_UPLOAD_DIR`      | `.local_uploads` | Directory for locally stored uploads. Set this to a path under`/data` (e.g. `/data/uploads`) so that uploads are persisted on the mounted volume. |
| `QUARANTINE_DIR`        | `.quarantine`    | Directory used for temporary scan copies before promotion.                                                                                        |
| `CLAMD_SOCKET`          |                  | Unix socket path for`clamd`. When set, this takes precedence over `CLAMD_HOST` and `CLAMD_PORT`.                                                  |
| `CLAMD_HOST`            | `127.0.0.1`      | Hostname for`clamd` when using TCP.                                                                                                               |
| `CLAMD_PORT`            | `3310`           | TCP port for`clamd`.                                                                                                                              |
| `CLAMD_TIMEOUT_SECONDS` | `60`             | Timeout for ClamAV daemon calls.                                                                                                                  |
| `S3_BUCKET`             |                  | Required when `STORAGE_BACKEND=s3`; bucket for quarantined and promoted dataset objects.                                                          |
| `S3_REGION`             |                  | Region passed to the S3 client.                                                                                                                   |
| `S3_ENDPOINT`           |                  | Custom endpoint for MinIO or another S3-compatible service. Leave empty for AWS S3.                                                               |
| `S3_ACCESS_KEY`         |                  | Static access key for local or static S3 credentials.                                                                                             |
| `S3_SECRET_KEY`         |                  | Static secret key for local or static S3 credentials.                                                                                             |
| `S3_FORCE_PATH_STYLE`   | `false`          | Enables path-style bucket addressing for MinIO and similar S3-compatible services.                                                                |

## Upload malware scanning

Uploaded datasets are scanned before they are promoted from quarantine storage to the ready/downloadable location. Production and production-like deployments must run a ClamAV `clamd` daemon as a sidecar, sibling container, host service, or managed service and configure the application with `CLAMD_SOCKET` or `CLAMD_HOST`/`CLAMD_PORT`.

When `clamd` is reached over TCP, the daemon must be able to read the configured `QUARANTINE_DIR` at the same path as the application. The production Compose stack mounts `openml-data` into the `clamd` container read-only for this reason.

If `clamd` is unavailable, uploaded bytes are not modified, but the scan records an error, the dataset is marked quarantined, and the uploaded objects are not promoted for download or expert review.

For local upload-flow development, prefer the development Compose stack because it starts `clamd` with the backend:

```bash
docker compose -f docker-compose.dev.yml up backend frontend minio minio-init clamd
```

## Using the pre-built image from GHCR

A pre-built image is published to GitHub Container Registry on every push to the default branch.

Because the repository is private, you need to authenticate with GHCR before pulling. Create a [personal access token (classic)](https://github.com/settings/tokens) with the `read:packages` scope, then log in:

```bash
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Once authenticated, pull and run the image:

```bash
docker pull ghcr.io/ludev/openml-upload:latest

docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  -e LOCAL_UPLOAD_DIR=/data/uploads \
  --name openml-upload \
  ghcr.io/ludev/openml-upload:latest
```

See [docker-build.md](../../docker-build.md) for details on the CI workflow and tagging scheme.

## Stopping and removing the container

```bash
docker container rm openml-upload
docker image rm openml-upload
```

Your data is safe in the `openml-data` volume and will be reused the next time you start a container with the same volume.

## Production deployment notes

**Reverse proxy.** In production, place the container behind a reverse proxy (e.g. Nginx, Caddy, or Traefik) that handles TLS termination, rate limiting, and serving on port 443.

**Restart policy.** Add `--restart unless-stopped` to the `docker run` command so the container restarts automatically after a host reboot or crash.

**Resource limits.** You can constrain CPU and memory usage:

```bash
docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  --restart unless-stopped \
  --memory 512m \
  --cpus 1 \
  openml-upload
```

**Security.** The image already runs as a non-root user (`appuser`). Avoid running the container with `--privileged` or overriding the user.

**Logging.** View container logs with:

```bash
docker logs -f openml-upload
```
