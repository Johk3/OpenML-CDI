import { expect, Page, test } from "@playwright/test";

async function signInWithDevGitHub(page: Page) {
  await page.goto("/login");
  await page.getByRole("link", { name: /continue with github/i }).click();
  await expect(page.getByRole("heading", { name: "My Datasets" })).toBeVisible({
    timeout: 30_000,
  });
}

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

    await expect(
      page.getByRole("link", { name: /account for dev user/i }),
    ).toBeVisible();
    expect(
      authRequests.some((url) => url.includes("/api/auth/github/login")),
    ).toBe(true);
    expect(
      authRequests.some((url) => url.includes("/api/auth/github/callback")),
    ).toBe(true);
    expect(authRequests.some((url) => url.includes("/api/api/"))).toBe(false);
  });

  test("rehydrates a refresh-cookie session and logs out safely", async ({
    page,
  }) => {
    await signInWithDevGitHub(page);

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: /manage your account/i }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: /manage your account/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /logout/i }).click();
    await expect(
      page.getByRole("heading", { name: /welcome to openml cdi/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/account");
    await expect(page.getByText("Please sign in to continue.")).toBeVisible();
  });
});
