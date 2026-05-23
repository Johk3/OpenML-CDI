import { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth.fixture";
import {
  cleanupDataset,
  openUploadPage,
  submitDatasetUpload,
  writeUploadFixture,
} from "./utils/actions";

const MULTIPART_SESSION_PREFIX = "openml-multipart-upload-session";
const LARGE_UPLOAD_SIZE = 40 * 1024 * 1024;
const RECOVERY_UPLOAD_SIZE = 17 * 1024 * 1024;
const RUN_MULTIPART_E2E = process.env.E2E_ENABLE_MULTIPART_UPLOADS === "true";
const multipartPartUrlMatcher = (url: URL) =>
  url.searchParams.has("partNumber") && url.searchParams.has("uploadId");

type ApiCounters = {
  aborts: number;
  completes: number;
  confirmUploads: number;
  uploadUrlRequests: number;
};

type MultipartRouteOptions = {
  abortHeldRequests?: boolean;
  delayFirstAttemptsMs?: number;
  delayFailedAttemptsMs?: number;
  failAttemptsByPart?: Record<number, number>;
  holdUntilReleased?: boolean;
};

type MultipartRouteState = {
  attemptsByPart: Map<number, number>;
  firstPartRequested: Promise<void>;
  releaseHeldRequests: () => void;
  waitForPartAttempt: (partNumber: number, attempt?: number) => Promise<void>;
};

function watchUploadProgress(page: Page) {
  return page.evaluate(() => {
    window.localStorage.setItem(
      "openml-e2e-progress-values",
      JSON.stringify([]),
    );
    window.localStorage.setItem(
      "openml-e2e-upload-messages",
      JSON.stringify([]),
    );

    const readProgress = () => {
      const progress = document.querySelector(
        "[data-testid='upload-progress-percent']",
      );
      const numericValue = Number(progress?.textContent?.replace("%", ""));
      const message = document.querySelector(
        "[data-testid='upload-session-message']",
      );

      if (Number.isFinite(numericValue)) {
        const raw =
          window.localStorage.getItem("openml-e2e-progress-values") ?? "[]";
        const values = JSON.parse(raw) as number[];
        values.push(numericValue);
        window.localStorage.setItem(
          "openml-e2e-progress-values",
          JSON.stringify(values),
        );
      }

      if (message?.textContent) {
        const raw =
          window.localStorage.getItem("openml-e2e-upload-messages") ?? "[]";
        const messages = JSON.parse(raw) as string[];
        messages.push(message.textContent);
        window.localStorage.setItem(
          "openml-e2e-upload-messages",
          JSON.stringify(messages),
        );
      }
    };

    readProgress();
    window.setInterval(readProgress, 50);
    const observer = new MutationObserver(readProgress);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

async function progressValues(page: Page) {
  return page.evaluate(() => {
    const raw =
      window.localStorage.getItem("openml-e2e-progress-values") ?? "[]";
    return JSON.parse(raw) as number[];
  });
}

async function uploadMessages(page: Page) {
  return page.evaluate(() => {
    const raw =
      window.localStorage.getItem("openml-e2e-upload-messages") ?? "[]";
    return JSON.parse(raw) as string[];
  });
}

function expectMonotonic(values: number[]) {
  expect(values.length).toBeGreaterThan(0);
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
  }
}

function collectApiCounters(page: Page): ApiCounters {
  const counters = {
    aborts: 0,
    completes: 0,
    confirmUploads: 0,
    uploadUrlRequests: 0,
  };

  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();

    if (method === "POST" && url.endsWith("/api/datasets/upload-url")) {
      counters.uploadUrlRequests += 1;
    }
    if (
      method === "POST" &&
      /\/api\/datasets\/[^/]+\/confirm-upload$/.test(url)
    ) {
      counters.confirmUploads += 1;
    }
    if (
      method === "POST" &&
      /\/api\/datasets\/[^/]+\/multipart-uploads\/[^/]+\/complete$/.test(url)
    ) {
      counters.completes += 1;
    }
    if (
      method === "DELETE" &&
      /\/api\/datasets\/[^/]+\/multipart-uploads\/[^/]+/.test(url)
    ) {
      counters.aborts += 1;
    }
  });

  return counters;
}

async function routeMultipartUploads(
  page: Page,
  options: MultipartRouteOptions = {},
): Promise<MultipartRouteState> {
  const attemptsByPart = new Map<number, number>();
  const partAttemptWaiters: Array<{
    attempt: number;
    partNumber: number;
    resolve: () => void;
  }> = [];
  let firstPartRequestedResolve: () => void = () => undefined;
  let releaseHeldRequestsResolve: () => void = () => undefined;
  const firstPartRequested = new Promise<void>((resolve) => {
    firstPartRequestedResolve = resolve;
  });
  const releaseHeldRequests = new Promise<void>((resolve) => {
    releaseHeldRequestsResolve = resolve;
  });
  const waitForPartAttempt = (partNumber: number, attempt = 1) => {
    if ((attemptsByPart.get(partNumber) ?? 0) >= attempt) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      partAttemptWaiters.push({ attempt, partNumber, resolve });
    });
  };

  const notifyPartAttempt = (partNumber: number, attempt: number) => {
    for (let index = partAttemptWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = partAttemptWaiters[index];
      if (waiter.partNumber === partNumber && attempt >= waiter.attempt) {
        partAttemptWaiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };

  await page.route(multipartPartUrlMatcher, async (route) => {
    const requestUrl = new URL(route.request().url());
    const partNumber = Number(requestUrl.searchParams.get("partNumber"));
    if (!partNumber || route.request().method() !== "PUT") {
      await route.continue();
      return;
    }

    firstPartRequestedResolve();
    const nextAttempt = (attemptsByPart.get(partNumber) ?? 0) + 1;
    attemptsByPart.set(partNumber, nextAttempt);
    notifyPartAttempt(partNumber, nextAttempt);

    const configuredFailures = options.failAttemptsByPart?.[partNumber] ?? 0;
    if (nextAttempt <= configuredFailures) {
      if (options.delayFailedAttemptsMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.delayFailedAttemptsMs),
        );
      }
      await route.abort("failed");
      return;
    }

    if (options.holdUntilReleased) {
      await releaseHeldRequests;
      if (options.abortHeldRequests) {
        await route.abort("failed");
        return;
      }
      await route.continue();
      return;
    }

    if (options.delayFirstAttemptsMs && nextAttempt === 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayFirstAttemptsMs),
      );
    }

    await route.continue();
  });

  return {
    attemptsByPart,
    firstPartRequested,
    releaseHeldRequests: releaseHeldRequestsResolve,
    waitForPartAttempt,
  };
}

function multipartSessionCount(page: Page) {
  return page.evaluate((prefix) => {
    return Object.keys(window.localStorage).filter((key) =>
      key.startsWith(`${prefix}:`),
    ).length;
  }, MULTIPART_SESSION_PREFIX);
}

test.describe("multipart upload E2E", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(
    !RUN_MULTIPART_E2E,
    "Multipart E2E tests require S3-compatible storage; set E2E_ENABLE_MULTIPART_UPLOADS=true to run them.",
  );

  test("shows monotonic progress, retries failed parts, and completes through local S3", async ({
    authenticatedPage: page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-large.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      delayFirstAttemptsMs: 1200,
      delayFailedAttemptsMs: 600,
      failAttemptsByPart: { 2: 1 },
    });
    let createdDatasetId: string | null = null;

    try {
      await writeUploadFixture(fixturePath, { size: LARGE_UPLOAD_SIZE });
      await openUploadPage(page);
      await watchUploadProgress(page);
      createdDatasetId = await submitDatasetUpload(page, {
        filePath: fixturePath,
        datasetName: `multipart-e2e-${Date.now()}`,
        contact: { lastName: "Multipart" },
      });

      await expect(
        page.getByRole("heading", { name: "Upload Complete!" }),
      ).toBeVisible({
        timeout: 120_000,
      });

      expectMonotonic(await progressValues(page));
      expect((await uploadMessages(page)).join("\n")).toContain(
        "Retrying after a network interruption",
      );
      expect(counters.uploadUrlRequests).toBe(1);
      expect(counters.completes).toBe(1);
      expect(counters.confirmUploads).toBe(0);
      expect(routeState.attemptsByPart.get(2)).toBe(2);
      expect(await multipartSessionCount(page)).toBe(0);
    } finally {
      await cleanupDataset(createdDatasetId, testInfo);
    }
  });

  test("pauses queued multipart parts and resumes them without restarting the upload", async ({
    authenticatedPage: page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-pause-resume.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      holdUntilReleased: true,
    });
    let createdDatasetId: string | null = null;

    try {
      await writeUploadFixture(fixturePath, { size: LARGE_UPLOAD_SIZE });
      await openUploadPage(page);
      await watchUploadProgress(page);
      createdDatasetId = await submitDatasetUpload(page, {
        filePath: fixturePath,
        datasetName: `multipart-pause-resume-${Date.now()}`,
        contact: { lastName: "Multipart" },
      });

      await routeState.waitForPartAttempt(4);
      await page.getByRole("button", { name: /pause upload/i }).click();
      await expect(page.getByTestId("upload-session-message")).toContainText(
        "Upload paused",
      );

      const attemptsWhilePaused = Array.from(
        routeState.attemptsByPart.keys(),
      ).sort();
      routeState.releaseHeldRequests();
      await expect
        .poll(() => Array.from(routeState.attemptsByPart.keys()).sort())
        .toEqual(attemptsWhilePaused);
      expect(Array.from(routeState.attemptsByPart.keys()).sort()).toEqual(
        attemptsWhilePaused,
      );

      await page.getByRole("button", { name: /resume upload/i }).click();
      await routeState.waitForPartAttempt(5);
      await expect(
        page.getByRole("heading", { name: "Upload Complete!" }),
      ).toBeVisible({
        timeout: 120_000,
      });

      expect((await uploadMessages(page)).join("\n")).toContain(
        "Upload resumed from saved progress",
      );
      expect(counters.uploadUrlRequests).toBe(1);
      expect(counters.completes).toBe(1);
      expect(counters.confirmUploads).toBe(0);
      expect(await multipartSessionCount(page)).toBe(0);
    } finally {
      routeState.releaseHeldRequests();
      await cleanupDataset(createdDatasetId, testInfo);
    }
  });

  test("recovers a failed multipart upload after reload without restarting completed parts", async ({
    authenticatedPage: page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-recovery.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      delayFailedAttemptsMs: 1000,
      failAttemptsByPart: { 2: 3 },
    });
    let createdDatasetId: string | null = null;

    try {
      await writeUploadFixture(fixturePath, { size: RECOVERY_UPLOAD_SIZE });
      await openUploadPage(page);
      createdDatasetId = await submitDatasetUpload(page, {
        filePath: fixturePath,
        datasetName: `multipart-recovery-${Date.now()}`,
        contact: { lastName: "Multipart" },
      });

      await expect(
        page.getByRole("heading", { name: "Upload Failed" }),
      ).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(/resume the upload/i)).toBeVisible();
      expect(await multipartSessionCount(page)).toBe(1);
      expect(routeState.attemptsByPart.has(1)).toBe(true);
      expect(routeState.attemptsByPart.has(3)).toBe(true);

      await page.unroute(multipartPartUrlMatcher);
      const secondRunRouteState = await routeMultipartUploads(page);
      await page.reload();
      await openUploadPage(page);
      await submitDatasetUpload(page, {
        filePath: fixturePath,
        datasetName: `multipart-recovery-resumed-${Date.now()}`,
        contact: { lastName: "Multipart" },
        waitForUploadUrl: false,
      });

      await expect(
        page.getByRole("heading", { name: "Upload Complete!" }),
      ).toBeVisible({
        timeout: 120_000,
      });

      expect(counters.uploadUrlRequests).toBe(1);
      expect(counters.completes).toBe(1);
      expect(counters.confirmUploads).toBe(0);
      expect(secondRunRouteState.attemptsByPart.has(1)).toBe(false);
      expect(secondRunRouteState.attemptsByPart.get(2)).toBe(1);
      expect(secondRunRouteState.attemptsByPart.has(3)).toBe(false);
      expect(await multipartSessionCount(page)).toBe(0);
    } finally {
      await cleanupDataset(createdDatasetId, testInfo);
    }
  });

  test("cancels an active multipart upload and clears saved progress", async ({
    authenticatedPage: page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-cancel.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      abortHeldRequests: true,
      holdUntilReleased: true,
    });
    let createdDatasetId: string | null = null;

    try {
      await writeUploadFixture(fixturePath, { size: RECOVERY_UPLOAD_SIZE });
      await openUploadPage(page);
      createdDatasetId = await submitDatasetUpload(page, {
        filePath: fixturePath,
        datasetName: `multipart-cancel-${Date.now()}`,
        contact: { lastName: "Multipart" },
      });

      await routeState.firstPartRequested;
      await page.getByRole("button", { name: /cancel upload/i }).click();
      routeState.releaseHeldRequests();

      await expect(
        page.getByRole("heading", { name: "Upload Canceled" }),
      ).toBeVisible({
        timeout: 120_000,
      });

      expect(counters.aborts).toBe(1);
      expect(counters.completes).toBe(0);
      expect(counters.confirmUploads).toBe(0);
      expect(await multipartSessionCount(page)).toBe(0);
    } finally {
      routeState.releaseHeldRequests();
      await cleanupDataset(createdDatasetId, testInfo);
    }
  });
});
