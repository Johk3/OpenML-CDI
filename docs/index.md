# Documentation Index

Welcome to the project documentation. Use this index to navigate all available guides.

## Table of Contents

- [Explanation](#explanation)
- [How-To Guides](#how-to-guides)
- [Reference](#reference)

---

## Explanation

Background concepts and design decisions.

| Document                                                             | Description                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Code Review and Ownership Philosophy](explanation/review-policy.md) | Why we review code the way we do, and how ownership is assigned |
| [Dataset Detail Page](explanation/dataset-detail-page.md)            | Overview of the dataset detail page feature                     |
| [Upload Mechanism](explanation/upload-mechanism.md)                  | High-level upload, scan, and storage flow                       |
| [GitHub Issue Integration](explanation/github-issue-integration.md)  | How GitHub issues are created and synced for dataset reviews    |
| [Dropbox and S3 Storage Spike](explanation/storage-backend-dropbox-s3-spike.md) | Earlier provider comparison; superseded by the final S3 storage reference |

---

## How-To Guides

Step-by-step guides for common tasks.

### Contributing

| Document                                                    | Description                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [How to Write a Commit Message](how-to/commit-messages.md)  | Conventional Commits format, types, scopes, and size rules |
| [Pull Request Size Guidelines](how-to/pull-request-size.md) | Keeping PRs small, focused, and reviewable                 |
| [How to Do a Code Review](how-to/code-reviews.md)           | Step-by-step guide for authors and reviewers               |
| [CI Pipeline](how-to/CI-pipeline.md)                        | Lefthook pre-commit checks: setup, installation, and usage |

### Testing

| Document                                                             | Description                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Testing Guide](how-to/testing.md)                                   | Overview of all test types, when to use each, and PR expectations      |
| [Unit Testing Guide](how-to/unit-test.md)                            | How to write unit tests (AAA pattern, mocking, examples)               |
| [Integration Testing Guide](how-to/integration-test.md)              | How to write integration tests (DB, boundaries, stability)             |
| [End-to-End Testing Guide](how-to/e2e-test.md)                       | How to write E2E tests (critical flows, data setup, flakiness)         |
| [Backend Testing Environment](how-to/testing_backend_environment.md) | pytest fixtures, in-memory DB, coverage, and CI output                 |
| [Local S3-Compatible Storage](how-to/local-s3-storage.md)            | How to run local MinIO for direct upload and storage lifecycle testing |

### Database

| Document                                         | Description                   |
| ------------------------------------------------ | ----------------------------- |
| [Migrating the Database](how-to/migrating_db.md) | How to run Alembic migrations |

---

## Reference

Technical specifications and API details.

| Document                                                           | Description                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [Authentication](reference/authentication.md)                      | Auth endpoints (`/auth/register`, `/auth/token`, `/auth/refresh`), route protection, env vars       |
| [User Endpoint Contract](reference/user-endpoints.md)              | `/api/user` request parameters, response shapes, authentication, and authorization rules            |
| [Docker Build & Publish](reference/docker-build.md)                | GHCR image publishing, tagging scheme, local build, troubleshooting                                 |
| [S3 Storage Architecture and Local Setup](reference/s3-storage.md) | S3-compatible storage architecture, env vars, MinIO setup, CORS, lifecycle cleanup, and permissions |
| [Frontend Routing](reference/routing.md)                           | React Router setup, adding routes, 404 handling                                                     |
| [Frontend Testing Reference](reference/fontend-testing.md)         | Testing Library queries, test structure, Vitest commands                                            |
| [Dataset Detail Page](reference/dataset-detail-page.md)            | Routes, data types, and test locations for the dataset detail page                                  |

> **Note:** `references/routing.md` contains a duplicate of `reference/routing.md`. See [references/routing.md](references/routing.md).
