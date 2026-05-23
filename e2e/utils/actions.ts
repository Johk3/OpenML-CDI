import { expect, Page, TestInfo } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { API_BASE_URL, e2eDevDisplayName, requestDevAuthToken } from "./api";

const DEFAULT_FIXTURE_MTIME = new Date("2026-01-01T00:00:00.000Z");

type UploadFixtureOptions = {
  contents?: Buffer | string;
  fill?: string;
  modifiedAt?: Date;
  size?: number;
};

type DatasetUploadOptions = {
  contact?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  datasetName: string;
  description?: string;
  filePath: string;
  waitForUploadUrl?: boolean;
};

export async function signInWithDevGitHub(page: Page) {
  await page.goto("/login");
  await page.getByRole("link", { name: /continue with github/i }).click();
  await expectDatasetsDashboard(page);
}

export async function expectDatasetsDashboard(page: Page) {
  await expect(
    page.getByRole("heading", { name: /^(my datasets|all user datasets)$/i }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function expectDevAccountLink(page: Page) {
  await expect(
    page.getByRole("link", {
      name: new RegExp(`account for ${escapeRegex(e2eDevDisplayName())}`, "i"),
    }),
  ).toBeVisible();
}

export async function openUploadPage(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /account for/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Share Your Dataset" }),
  ).toBeVisible();
}

export async function writeUploadFixture(
  filePath: string,
  options: UploadFixtureOptions = {},
) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const contents =
    options.contents ?? Buffer.alloc(options.size ?? 1024, options.fill ?? "a");
  await fs.writeFile(filePath, contents);

  const modifiedAt = options.modifiedAt ?? DEFAULT_FIXTURE_MTIME;
  await fs.utimes(filePath, modifiedAt, modifiedAt);
}

export async function submitDatasetUpload(
  page: Page,
  {
    contact = {},
    datasetName,
    description = `E2E coverage for ${datasetName}`,
    filePath,
    waitForUploadUrl = true,
  }: DatasetUploadOptions,
) {
  const uploadUrlResponse = waitForUploadUrl
    ? page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/datasets/upload-url"),
      )
    : null;

  await page.locator("#file-input").setInputFiles(filePath);
  await expect(page.getByText("Almost there!")).toBeVisible();

  await page.getByLabel(/dataset name/i).fill(datasetName);
  await page.getByLabel(/description/i).fill(description);
  await page.getByLabel(/first name/i).fill(contact.firstName ?? "E2E");
  await page.getByLabel(/last name/i).fill(contact.lastName ?? "Upload");
  await page
    .getByLabel(/email address/i)
    .fill(contact.email ?? `${datasetName}@example.test`);
  await page.getByRole("button", { name: /upload dataset/i }).click();

  if (!uploadUrlResponse) {
    return null;
  }

  const response = await uploadUrlResponse;
  if (!response.ok()) {
    throw new Error(
      `Upload URL request failed with status ${response.status()}`,
    );
  }

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string") {
    throw new Error("Upload URL response did not include a dataset id");
  }

  return payload.id;
}

export async function deleteDataset(datasetId: string | null) {
  if (!datasetId) return;

  const token = await requestDevAuthToken();
  const response = await fetch(
    `${API_BASE_URL}/datasets/delete?dataset_id=${encodeURIComponent(datasetId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Dataset cleanup failed with status ${response.status} for ${datasetId}`,
    );
  }
}

export async function cleanupDataset(
  datasetId: string | null,
  testInfo: TestInfo,
) {
  try {
    await deleteDataset(datasetId);
  } catch (error) {
    if (testInfo.errors.length > 0) {
      console.warn(
        `Dataset cleanup failed after test failure: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    throw error;
  }
}
