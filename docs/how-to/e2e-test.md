# 🌐 End-to-end (E2E) testing guide

## Table of Contents

- [What counts as an E2E test here?](#-what-counts-as-an-e2e-test-here)
- [Scope and strategy: Less is more](#-scope-and-strategy-less-is-more)
- [Test data: Setup and cleanup](#-test-data-setup-and-cleanup)
- [Avoiding flaky tests](#️-avoiding-flaky-tests)
- [Minimal example outline (pseudocode)](#-minimal-example-outline-pseudocode)
- [Pre-PR checklist](#-pre-pr-checklist-e2e-tests)
- [Related guides](#-related-guides)

This is a how-to guide for writing **end-to-end (E2E) tests** in this repo.  
For definitions and choosing the right test type, see [`testing.md`](./testing.md).

---

## 🧭 What counts as an E2E test here?

An E2E test validates the system exactly as a real user or external client would interact with it, from the absolute outer boundary (UI, CLI, or public API) all the way down to the database and back.

✅ In scope (common examples)

- A browser automation test clicking through a checkout flow.
- A script hitting public API endpoints to create an account, verify an email, and log in.
- Workflows that span multiple decoupled services (e.g., frontend + backend + worker queue).

❌ Not E2E tests

- Testing a single service API while mocking the database (that's an integration test).
- Testing edge cases of a specific function (that's a unit test).

> [!TIP]
> E2E tests answer one question: **"Does the core product actually work for the user?"**

---

## 🧱 Scope and strategy: Less is more

E2E tests are slow, expensive to run, and prone to flakiness. **You should have very few of them.**

Instead of trying to test every feature, focus only on **critical user journeys**.

- **Do** test the "Happy Path" of your most important features (e.g., User can sign up, User can pay).
- **Don't** use E2E tests to verify every validation error message or edge case (push those down to unit or integration tests).

---

## 🧰 Test data: Setup and cleanup

Because E2E tests run against a fully integrated environment, managing state is the hardest part.

### ✅ Use realistic, isolated data

- **Create data via APIs, not the UI:** If your test needs a logged-in user with 5 items in their cart, don't use the UI to click "add to cart" 5 times. Use your backend APIs to quickly seed that state, then use the UI only for the final checkout step you are actually testing.
- **Generate unique data per test:** Never hardcode emails like `test@example.com`. Generate a unique string (e.g., `test-12345@example.com`) for every test run so parallel tests don't step on each other's toes.

### ✅ Cleaning up

- If possible, run E2E tests against an ephemeral environment (like a temporary database container or a pull-request preview environment) that gets completely destroyed after the run.
- If you must run against a shared staging environment, ensure your test runner has an `afterAll` hook to delete the specific entities it created.

---

## ⚠️ Avoiding flaky tests

A flaky E2E test (one that randomly passes or fails without code changes) will destroy developer trust.

- **Wait for state, don't sleep:** Never use `sleep(5000)`. Always use the test runner's built-in methods to wait for an element to appear in the DOM or an API response to return.
- **Use robust selectors:** If testing a UI, do not select elements by CSS classes (which change frequently). Use data attributes specifically meant for testing (e.g., `data-testid="submit-button"`) or accessible roles (e.g., "button with text 'Submit'").
- **Mock third-party volatility:** If your flow relies on a third-party service you don't control (like Stripe or an external weather API), it is acceptable to mock that specific external boundary so your tests don't fail when the third party goes down.

---

## 🧪 Minimal example outline (pseudocode)

```text
Test: User can successfully purchase an item

Arrange:
  - (API) Create a new user with a unique ID
  - (API) Seed the database with a test product
  - (UI) Programmatically log the user in to bypass the login screen

Act:
  - (UI) Navigate to the product page
  - (UI) Click [data-testid="add-to-cart"]
  - (UI) Navigate to checkout
  - (UI) Enter dummy payment details and click [data-testid="pay-button"]

Assert:
  - (UI) Wait for the success page to load
  - (UI) Assert the order confirmation message is visible
  - (API) Query the database to ensure the order status is "paid"
```

---

## 📌 Pre-PR checklist (E2E tests)

- [ ] I am only writing an E2E test for a highly critical user flow.
- [ ] I am generating unique test data (no hardcoded emails/IDs).
- [ ] I am using API calls to set up prerequisites, saving UI interactions only for the actual test.
- [ ] I am waiting for elements/network requests explicitly (no arbitrary `sleep` commands).
- [ ] I am using resilient selectors (like `data-testid`) rather than fragile CSS classes.
- [ ] The test cleans up its own data or runs in a disposable environment.

---

## 🔗 Related guides

- [General testing guide](./testing.md)
- [Unit testing guide](./unit-test.md)
- [Integration testing guide](./integration-test.md)
- [Backend Testing Environment](./testing_backend_environment.md)

---

[← Back to documentation index](../index.md)
