import { expect, test } from "@playwright/test";
import { test as authenticatedTest } from "./fixtures/auth.fixture";
import {
  expectDatasetsDashboard,
  expectDevAccountLink,
  signInWithDevGitHub,
} from "./utils/actions";

test.describe("GitHub auth E2E", () => {
  test("redirects protected routes to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/account");

    await expect(
      page.getByRole("heading", { name: /welcome to openml cdi/i }),
    ).toBeVisible();
    await expect(page.getByText("Please sign in to continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/login\?notice=sign-in-required$/);
  });

  test("signs in through the local GitHub auth flow without duplicated api paths", async ({
    page,
  }) => {
    const authRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/auth/")) {
        authRequests.push(url);
      }
    });

    await signInWithDevGitHub(page);

    await expectDevAccountLink(page);
    expect(
      authRequests.some((url) => url.includes("/api/auth/github/login")),
    ).toBe(true);
    expect(
      authRequests.some((url) => url.includes("/api/auth/github/callback")),
    ).toBe(true);
    expect(authRequests.some((url) => url.includes("/api/api/"))).toBe(false);
  });

  authenticatedTest(
    "opens the datasets dashboard from an authenticated session",
    async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/datasets");

      await expectDatasetsDashboard(authenticatedPage);
      await expectDevAccountLink(authenticatedPage);
    },
  );

  authenticatedTest(
    "rehydrates a refresh-cookie session and logs out safely",
    async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/account");
      await expect(
        authenticatedPage.getByRole("heading", {
          name: /manage your account/i,
        }),
      ).toBeVisible();

      await authenticatedPage.reload();
      await expect(
        authenticatedPage.getByRole("heading", {
          name: /manage your account/i,
        }),
      ).toBeVisible();

      await authenticatedPage.getByRole("button", { name: /logout/i }).click();
      await expect(
        authenticatedPage.getByRole("heading", {
          name: /welcome to openml cdi/i,
        }),
      ).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/login$/);

      await authenticatedPage.goto("/account");
      await expect(
        authenticatedPage.getByText("Please sign in to continue."),
      ).toBeVisible();
    },
  );
});
