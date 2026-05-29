# E2E test suite

This directory contains the Playwright end-to-end tests for the OpenML uploading
interface. The suite runs against a real frontend and backend, so start both
servers before running the tests.

For the full local environment setup, including ClamAV and the documented E2E
dev login identity, see
[`docs/how-to/using-e2e-test-environment.md`](../docs/how-to/using-e2e-test-environment.md).

## Prerequisites

Before running Playwright:

1. Apply the newest backend migrations.
2. Start ClamAV on `127.0.0.1:3310` for upload tests.
3. Start the backend in dev auth mode:

   ```sh
   AUTH_DEV_MODE_APPROVE_ALL_LOGINS=true \
     AUTH_DEV_LOGIN_EMAIL=e2e.github.user@example.com \
     AUTH_DEV_LOGIN_USERNAME=e2e-github-user \
     AUTH_DEV_LOGIN_FIRST_NAME=E2E \
     AUTH_DEV_LOGIN_LAST_NAME=GitHub \
     sops exec-env encrypted.env 'sh -c "cd backend && uvicorn app.main:app --reload"'
   ```

4. Start the frontend on the default Playwright base URL:

   ```sh
   VITE_API_BASE_URL=http://localhost:8000/api npm run dev -- --host 127.0.0.1 --port 5173
   ```

5. Install the root Playwright dependencies if needed:

   ```sh
   npm ci
   ```

The default URLs are `http://localhost:8000` for the API and
`http://localhost:5173` for the frontend. Override them with
`E2E_API_BASE_URL` and `E2E_FRONTEND_BASE_URL` when you need to point the suite
at a different local environment.

## Running tests

Run the default Chromium suite from the repository root:

```sh
npm run test:e2e
```

Run one spec while developing:

```sh
npm run test:e2e -- e2e/auth.spec.ts
```

The auth, session, direct upload, and dashboard flows run by default. Multipart
upload coverage requires S3-compatible storage and is skipped unless explicitly
enabled:

```sh
E2E_ENABLE_MULTIPART_UPLOADS=true npm run test:e2e -- e2e/multipart-upload.spec.ts
```

Playwright writes traces, screenshots, videos, HTML reports, and JUnit output to
`artifacts/`.

## Lifecycle

`playwright.config.ts` registers `global-setup.ts` and `global-teardown.ts`.
Both lifecycle hooks call the local GitHub dev auth callback, verify that the
backend is issuing the documented E2E account, delete that account with
`mode=account_and_datasets`, and remove `e2e/.auth/state.json` if it exists.

This means every suite run starts and ends without the previous E2E account or
datasets. The first browser sign-in during a test still goes through the UI so
the suite covers account provisioning, refresh cookies, and logout behavior.

## File structure

```text
e2e/
  README.md
  *.spec.ts              Playwright specs. Add new E2E tests here.
  fixtures/              Playwright test extensions shared by specs.
  global-setup.ts        Suite-level cleanup before tests run.
  global-teardown.ts     Suite-level cleanup after tests run.
  utils/
    actions.ts           Reusable browser actions and assertions.
    api.ts               API helpers for auth and cleanup.
    constants.ts         Shared constants for E2E data.
```

Place new user-flow specs directly in `e2e/` with the `*.spec.ts` suffix. Add a
helper under `utils/` only when more than one spec needs the same browser action,
assertion, file setup, or cleanup behavior. Add a fixture under `fixtures/` when
multiple tests need the same Playwright setup before their test body starts.

## Action helpers

Action helpers belong in `utils/actions.ts`. Extract one when a workflow is
reused, has multiple browser steps, or needs a consistent wait/assertion pattern.
Keep helpers focused on user-visible behavior instead of implementation details.

```ts
import { expect, Page } from "@playwright/test";

export async function openUploadPage(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /account for/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Share Your Dataset" }),
  ).toBeVisible();
}
```

Prefer returning meaningful IDs or values from helpers when the caller needs to
clean up created data, as `submitDatasetUpload` does.

## Fixtures

Fixtures belong in `fixtures/` and should extend Playwright's `test` object.
Use a fixture when each test needs the same setup and teardown around a page,
context, API client, or other Playwright resource.

```ts
import { Page, test as base } from "@playwright/test";
import { signInWithDevGitHub } from "../utils/actions";

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await signInWithDevGitHub(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
```

Specs that need an authenticated session should import from
`./fixtures/auth.fixture`:

```ts
import { expect, test } from "./fixtures/auth.fixture";
```

## Selector conventions

Prefer resilient, user-facing locators:

- Use `getByRole` for buttons, links, headings, and other semantic controls.
- Use `getByLabel` for form inputs.
- Use `getByText` for stable user-visible copy when a role or label is not more
  precise.
- Use `getByTestId` for dynamic status elements or non-semantic UI that needs a
  stable test hook.
- Avoid CSS classes and layout selectors because styling changes should not
  break E2E coverage.

Use direct locators such as `page.locator("#file-input")` only when the browser
API requires a specific element, such as setting files on a hidden native file
input.

## Minimal test template

```ts
import { expect, test } from "./fixtures/auth.fixture";
import {
  cleanupDataset,
  openUploadPage,
  submitDatasetUpload,
  writeUploadFixture,
} from "./utils/actions";

test("uploads a dataset and verifies the result", async ({
  authenticatedPage,
}, testInfo) => {
  const datasetName = `example-e2e-${Date.now()}`;
  const fixturePath = testInfo.outputPath("example.csv");
  let createdDatasetId: string | null = null;

  try {
    await writeUploadFixture(fixturePath, {
      contents: "sepal_length,sepal_width\n1,2\n",
    });

    await openUploadPage(authenticatedPage);
    createdDatasetId = await submitDatasetUpload(authenticatedPage, {
      datasetName,
      filePath: fixturePath,
    });

    await expect(
      authenticatedPage.getByRole("heading", { name: "Upload Complete!" }),
    ).toBeVisible({ timeout: 60_000 });
  } finally {
    await cleanupDataset(createdDatasetId, testInfo);
  }
});
```

Keep tests focused on one critical user journey. Generate unique data, wait for
observable page state instead of sleeping, and clean up data created by the test.
