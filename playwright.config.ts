import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI || process.env.ci);

/**
 * read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from "dotenv";
// import path from "path";
// dotenv.config({ path: path.resolve(__dirname, ".env") });

/**
 * see https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",

  outputDir: "artifacts/",

  globalSetup: "./e2e/global-setup.ts",

  globalTeardown: "./e2e/global-teardown.ts",
  /* run tests in files in parallel */
  fullyParallel: true,
  /* fail the build on ci if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* retry on ci only */
  retries: isCI ? 2 : 0,
  /* The local GitHub dev bypass uses one deterministic user account. */
  workers: 1,
  /* reporter to use. see https://playwright.dev/docs/test-reporters */
  reporter: [["html"], ["junit", { outputFile: "artifacts/junit.xml" }]],
  /* shared settings for all the projects below. see https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* base url to use in actions like `await page.goto('')`. */
    baseURL: process.env.E2E_FRONTEND_BASE_URL ?? "http://localhost:5173",

    /* collect trace when retrying the failed test. see https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    screenshot: "only-on-failure",

    video: { mode: "retain-on-failure" },
  },

  /* configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["desktop chrome"] },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["desktop firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["desktop safari"] },
    // },

    /* test against mobile viewports. */
    // {
    //   name: 'mobile chrome',
    //   use: { ...devices['pixel 5'] },
    // },
    // {
    //   name: 'mobile safari',
    //   use: { ...devices['iphone 12'] },
    // },

    /* test against branded browsers. */
    // {
    //   name: 'microsoft edge',
    //   use: { ...devices['desktop edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'google chrome',
    //   use: { ...devices['desktop chrome'], channel: 'chrome' },
    // },
  ],

  /* run your local dev server before starting the tests */
  // webserver: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseexistingserver: !process.env.ci,
  // },
});
