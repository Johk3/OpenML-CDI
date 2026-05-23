import { expect, test } from "./fixtures/auth.fixture";
import {
  cleanupDataset,
  expectDatasetsDashboard,
  openUploadPage,
  submitDatasetUpload,
  writeUploadFixture,
} from "./utils/actions";

test.describe("critical upload E2E", () => {
  test("uploads a dataset end to end and shows it on the dashboard", async ({
    authenticatedPage,
  }, testInfo) => {
    const datasetName = `core-upload-e2e-${Date.now()}`;
    const fixturePath = testInfo.outputPath("core-upload.csv");
    let createdDatasetId: string | null = null;

    try {
      await writeUploadFixture(fixturePath, {
        contents: "sepal_length,sepal_width\n1,2\n3,4\n",
      });
      await openUploadPage(authenticatedPage);
      createdDatasetId = await submitDatasetUpload(authenticatedPage, {
        datasetName,
        filePath: fixturePath,
      });

      await expect(
        authenticatedPage.getByRole("heading", { name: "Upload Complete!" }),
      ).toBeVisible({
        timeout: 60_000,
      });

      await authenticatedPage.goto("/datasets");
      await expectDatasetsDashboard(authenticatedPage);
      await expect(
        authenticatedPage.getByRole("heading", { name: datasetName }),
      ).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await cleanupDataset(createdDatasetId, testInfo);
    }
  });
});
