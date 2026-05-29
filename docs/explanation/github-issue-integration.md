# GitHub Issue Integration

## Table of Contents

- [Introduction](#introduction)
- [How It Works](#how-it-works)
- [Authentication](#authentication)
- [Related Resources](#related-resources)

## Introduction

We integrated GitHub issues with our dataset upload flow to allow expert review and discussion. By automatically creating an issue when a dataset is uploaded, we provide a centralized place for experts to communicate with the uploader and track the status of pending datasets.

## How It Works

The integration operates primarily through background tasks to ensure the main application remains responsive during uploads and metadata edits.

1. **Issue Creation**: When a new dataset is uploaded, a background task (`create_issue_for_dataset`) is triggered. It constructs a Markdown issue body containing the dataset title, a link back to our platform, and the dataset's Croissant metadata. To ensure privacy and readability, we filter out large or sensitive fields (like contact info, malware scan status, and the full file list). The issue is created with a `dataset-upload` label, and the resulting URL is saved to the dataset record in our database.
2. **Issue Synchronization**: If the uploader subsequently modifies the dataset's metadata, another background task (`update_issue_for_dataset`) updates the existing GitHub issue body in real-time. This guarantees the experts always see the latest Croissant Metadata information without navigating away from GitHub.
3. **Discussions**: To bridge the gap between GitHub and our platform, we provide an endpoint to fetch the issue's state and comment thread (`get_issue_with_comments`). This allows discussions that occur on GitHub to be displayed directly on the dataset detail page.

## Authentication

We use a GitHub App rather than a personal access token. The service authenticates using the app's ID, installation ID, and a private key to generate short-lived installation tokens.

## Related Resources

- Check out [Dataset Detail Page](dataset-detail-page.md) for more info on how the data is displayed.
- The core implementation can be found in `backend/app/services/github_issues.py`.

---

[← Back to documentation index](../index.md)
