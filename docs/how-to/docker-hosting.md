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

## Running the container

```bash
docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  --name openml-upload \
  openml-upload
```

| Flag                   | Purpose                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `-p 8000:8000`         | Maps the container's application port to your host. Change the first number to use a different host port (e.g. `-p 3000:8000`). |
| `-v openml-data:/data` | Mounts a named Docker volume to `/data` inside the container, where the application persists uploaded files.                    |
| `-d`                   | Runs the container in the background.                                                                                           |

Once running, the application is available at **<http://localhost:8000>**.

## Environment variables

The application reads the following environment variables. Pass them with `-e` flags:

```bash
docker run -d \
  -p 8000:8000 \
  -v openml-data:/data \
  -e STORAGE_BACKEND=local \
  -e LOCAL_UPLOAD_DIR=/data/uploads \
  --name openml-upload \
  openml-upload
```

| Variable           | Default          | Description                                                                                                                                        |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_BACKEND`  | `local`          | Storage backend to use for uploads.                                                                                                                |
| `LOCAL_UPLOAD_DIR` | `.local_uploads` | Directory for locally stored uploads. Set this to a path under `/data` (e.g. `/data/uploads`) so that uploads are persisted on the mounted volume. |

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
