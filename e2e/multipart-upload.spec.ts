import { expect, Page, test } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const API_BASE_URL = `${process.env.E2E_API_BASE_URL ?? "http://localhost:8000"}/api`;
const AUTH_STATE_PATH = path.resolve(__dirname, ".auth/state.json");
const MULTIPART_SESSION_PREFIX = "openml-multipart-upload-session";
const LARGE_UPLOAD_SIZE = 40 * 1024 * 1024;
const RECOVERY_UPLOAD_SIZE = 17 * 1024 * 1024;
const FIXED_MTIME = new Date("2026-01-01T00:00:00.000Z");
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

async function authToken() {
  const raw = await fs.readFile(AUTH_STATE_PATH, "utf8");
  return JSON.parse(raw).token as string;
}

async function writeUploadFixture(filePath: string, size: number) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.alloc(size, "a"));
  await fs.utimes(filePath, FIXED_MTIME, FIXED_MTIME);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("link", { name: /continue with github/i }).click();
  await expect(page.getByRole("heading", { name: "My Datasets" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: "Upload" }).click();
  await expect(
    page.getByRole("heading", { name: "Share Your Dataset" }),
  ).toBeVisible();
}

async function selectFixtureAndSubmit(
  page: Page,
  filePath: string,
  datasetName: string,
) {
  await page.locator("#file-input").setInputFiles(filePath);
  await expect(page.getByText("Almost there!")).toBeVisible();

  await page.getByLabel(/dataset name/i).fill(datasetName);
  await page.getByLabel(/description/i).fill(`E2E coverage for ${datasetName}`);
  await page.getByLabel(/first name/i).fill("E2E");
  await page.getByLabel(/last name/i).fill("Multipart");
  await page.getByLabel(/email address/i).fill(`${datasetName}@example.test`);
  await page.getByRole("button", { name: /upload dataset/i }).click();
}

async function deleteDataset(datasetId: string | null) {
  if (!datasetId) return;

  const token = await authToken();
  try {
    await fetch(`${API_BASE_URL}/datasets/delete?dataset_id=${datasetId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Cleanup should not mask the original E2E failure.
  }
}

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

  test("shows monotonic progress, retries failed parts, and completes through local S3", async ({
    page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-large.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      delayFirstAttemptsMs: 1200,
      failAttemptsByPart: { 2: 1 },
    });
    let datasetId: string | null = null;

    page.on("response", async (response) => {
      if (
        response.request().method() !== "POST" ||
        !response.url().endsWith("/api/datasets/upload-url")
      ) {
        return;
      }
      datasetId = ((await response.json()) as { id: string }).id;
    });

    try {
      await writeUploadFixture(fixturePath, LARGE_UPLOAD_SIZE);
      await login(page);
      await watchUploadProgress(page);
      await selectFixtureAndSubmit(
        page,
        fixturePath,
        `multipart-e2e-${Date.now()}`,
      );

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
      await deleteDataset(datasetId);
    }
  });

  test("pauses queued multipart parts and resumes them without restarting the upload", async ({
    page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-pause-resume.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      holdUntilReleased: true,
    });
    let datasetId: string | null = null;

    page.on("response", async (response) => {
      if (
        response.request().method() !== "POST" ||
        !response.url().endsWith("/api/datasets/upload-url")
      ) {
        return;
      }
      datasetId = ((await response.json()) as { id: string }).id;
    });

    try {
      await writeUploadFixture(fixturePath, LARGE_UPLOAD_SIZE);
      await login(page);
      await watchUploadProgress(page);
      await selectFixtureAndSubmit(
        page,
        fixturePath,
        `multipart-pause-resume-${Date.now()}`,
      );

      await routeState.waitForPartAttempt(4);
      await page.getByRole("button", { name: /pause upload/i }).click();
      await expect(page.getByTestId("upload-session-message")).toContainText(
        "Upload paused",
      );

      const attemptsWhilePaused = Array.from(
        routeState.attemptsByPart.keys(),
      ).sort();
      routeState.releaseHeldRequests();
      await page.waitForTimeout(750);
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
      await deleteDataset(datasetId);
    }
  });

  test("recovers a failed multipart upload after reload without restarting completed parts", async ({
    page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-recovery.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      delayFailedAttemptsMs: 1000,
      failAttemptsByPart: { 2: 3 },
    });
    let datasetId: string | null = null;

    page.on("response", async (response) => {
      if (
        response.request().method() !== "POST" ||
        !response.url().endsWith("/api/datasets/upload-url")
      ) {
        return;
      }
      datasetId = ((await response.json()) as { id: string }).id;
    });

    try {
      await writeUploadFixture(fixturePath, RECOVERY_UPLOAD_SIZE);
      await login(page);
      await selectFixtureAndSubmit(
        page,
        fixturePath,
        `multipart-recovery-${Date.now()}`,
      );

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
      await login(page);
      await selectFixtureAndSubmit(
        page,
        fixturePath,
        `multipart-recovery-resumed-${Date.now()}`,
      );

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
      await deleteDataset(datasetId);
    }
  });

  test("cancels an active multipart upload and clears saved progress", async ({
    page,
  }, testInfo) => {
    const fixturePath = testInfo.outputPath("multipart-cancel.csv");
    const counters = collectApiCounters(page);
    const routeState = await routeMultipartUploads(page, {
      abortHeldRequests: true,
      holdUntilReleased: true,
    });
    let datasetId: string | null = null;

    page.on("response", async (response) => {
      if (
        response.request().method() !== "POST" ||
        !response.url().endsWith("/api/datasets/upload-url")
      ) {
        return;
      }
      datasetId = ((await response.json()) as { id: string }).id;
    });

    try {
      await writeUploadFixture(fixturePath, RECOVERY_UPLOAD_SIZE);
      await login(page);
      await selectFixtureAndSubmit(
        page,
        fixturePath,
        `multipart-cancel-${Date.now()}`,
      );

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
      await deleteDataset(datasetId);
    }
  });
});
