# Dataset Detail Page

## Table of Contents

- [Overview](#overview)
- [Routing and Navigation](#routing-and-navigation)
- [Data Types](#data-types)
- [Testing](#testing)

## Overview

The dataset detail page allows users to view information about an uploaded dataset. This includes basic details, Croissant metadata, and associated user/expert comments.

## Routing and Navigation

- The page is mounted at the `<host>/datasets/:id`
- The `MyDatasetsPage` component, located at `<host>/datasets`, renders dataset cards that are wrapped in a `<Link>` component. Clicking on any card will navigate to the matching detail page.
- Both routes are defined in `src/routes/index.tsx`.

## Data Types

The associated mock interfaces for this functionality are located in `src/types/auth.ts`:

- `CroissantMetadata`
- `CroissantVariable`
- `Comment`
- `Dataset`

## Testing

Unit tests for this page can be found in `frontend/tests/unit/DatasetDetailPage.test.tsx`.

---

**Related:** [Frontend Routing](../reference/routing.md) | [Frontend Testing Reference](../reference/fontend-testing.md)

[← Back to documentation index](../index.md)
