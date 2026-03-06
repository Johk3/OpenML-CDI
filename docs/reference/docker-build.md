# Docker image build & publish

This repository publishes a container image to GitHub Container Registry (GHCR).

## Image name

The image is published as:

- `ghcr.io/ludev/openml-upload`

## When it publishes

The GitHub Actions workflow builds and pushes the image when:

- A push happens on the default branch (for `latest`)

Authentication uses the workflow-provided `GITHUB_TOKEN` (no manual token needed on GitHub-hosted runners).

## Tagging scheme

We publish “normal” tags:

- `latest`: only for the default branch
- A commit SHA tag as a fallback (useful for debugging)

Tags are generated via Docker’s metadata action/tagging patterns.

## Local testing notes

You can build locally with Docker:

```bash
docker build -t ghcr.io/ludev/openml-upload:dev .
```

Pushing to GHCR from a local runner may require extra auth setup and may not behave the same as GitHub Actions, because GitHub’s workflow token permissions are specific to real workflow runs.

## Troubleshooting

If you see “tag is needed when pushing to registry”, it usually means your workflow produced zero tags; ensure your tagging rules always yield at least one tag (e.g., sha) for any triggering event.

If you see permission/scope errors, verify the workflow job has packages: write and that repository Actions permissions allow write access.
