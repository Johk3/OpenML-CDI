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
