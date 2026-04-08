# Testing Reference

## Table of Contents

- [Important links](#important-links)
- [Test Directory Structure](#test-directory-structure)
- [Shared Test Files](#shared-test-files)
- [Suggested Naming Conventions](#suggested-naming-conventions)
- [Running Tests](#running-tests)
- [Recommended Working Model](#recommended-working-model)
- [Example Future Structure](#example-future-structure)

## Important links

To be able to test rendering we use the react test library. In order to find elements in the DOM the package includes some useful queries

[testing library queries](https://testing-library.com/docs/queries/about)

```tsx
screen.getBySomething(); // Something refers to a query type found in the link
```

To be able to test additional react specific functionality more easily we use the jest-dom testing libary that includes additonal hooks.

[expect hooks for for react components](https://github.com/testing-library/jest-dom#readme)

```tsx
expect(something).toBeDisabled(); // To be disabled is one of these found in the link
```

---

## Test Directory Structure

Recommended interpretation of the current structure:

```text
tests/
├── integration/
│   └── routing.test.tsx      # integration tests for routing / multiple parts working together
├── main.test.ts              # app entry-level or bootstrap-related tests
├── setup.ts                  # shared test setup
├── unit/
│   └── components/
│       └── footer.test.tsx   # focused component unit tests
└── utils.tsx                 # shared test utilities / wrappers / helpers
```

### Unit tests

Unit tests should focus on one component, hook, or function in isolation.

Examples:

- rendering a single component
- verifying props behavior
- testing a helper function
- checking event handlers with minimal surrounding setup

Suggested location pattern:

```text
tests/unit/components/
tests/unit/hooks/
tests/unit/utils/
```

### Integration tests

Integration tests should verify multiple parts working together.

Examples:

- routing behavior
- page-level rendering
- providers + components working together
- form flow across multiple components

Suggested location pattern:

```text
tests/integration/
tests/integration/routes/
tests/integration/pages/
```

---

## Shared Test Files

### `tests/setup.ts`

Use this file for one-time shared test setup, for example:

- extending matchers
- global mocks
- cleanup behavior
- common environment configuration

A typical setup file often includes things like:

```ts
import "@testing-library/jest-dom";
```

If this file is meant to run automatically for every test, add it to `vitest.config.ts` using `setupFiles`.

Example:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

### `tests/utils.tsx`

Use this file for shared render helpers and wrappers.

Typical examples:

- custom `render` with providers
- router wrappers
- auth context wrappers
- test factories and helper functions

Example pattern:

```ts
import { render } from "@testing-library/react";

export function renderWithProviders(ui: React.ReactNode) {
  return render(ui);
}
```

---

## Suggested Naming Conventions

Use one naming style consistently:

- `*.test.ts`
- `*.test.tsx`

Examples from the current structure:

- `tests/main.test.ts`
- `tests/unit/components/footer.test.tsx`
- `tests/integration/routing.test.tsx`

Suggested convention:

- use `.test.ts` for non-React logic files
- use `.test.tsx` for React component and page tests

---

## Running Tests

Typical local commands:

```bash
npx vitest
```

Run once:

```bash
npx vitest run
```

Run with coverage:

```bash
npx vitest run coverage
```

Run a specific test file:

```bash
npx vitest run tests/unit/components/footer.test.tsx
```

Run tests related to changed source files:

```bash
npx vitest related --run src/components/Footer.tsx
```

---

## Recommended Working Model

A practical way to maintain this project is:

- Keep all tests inside `tests/`
- Put focused component/function tests in `tests/unit/`
- Put route/page/provider interaction tests in `tests/integration/`
- Keep shared wrappers in `tests/utils.tsx`
- Keep global setup in `tests/setup.ts`
- Add `setupFiles` to Vitest if `tests/setup.ts` should run automatically
- Add `tests` to TypeScript include paths if TypeScript issues appear in test files
- Mirror the React plugin in `vitest.config.ts` if JSX-related test errors appear

---

## Example Future Structure

```text
tests/
├── integration/
│   ├── pages/
│   │   ├── about-page.test.tsx
│   │   └── login-page.test.tsx
│   ├── routes/
│   │   └── routing.test.tsx
│   └── upload-flow.test.tsx
├── main.test.ts
├── setup.ts
├── unit/
│   ├── components/
│   │   ├── button.test.tsx
│   │   ├── footer.test.tsx
│   │   ├── header.test.tsx
│   │   └── input.test.tsx
│   ├── context/
│   │   └── use-auth.test.ts
│   └── utils/
│       └── auth-helpers.test.ts
└── utils.tsx
```

This keeps the current centralized testing approach while making the purpose of each area clear.

---

**Related:** [Testing Guide](../how-to/testing.md) | [Unit Testing Guide](../how-to/unit-test.md) | [Integration Testing Guide](../how-to/integration-test.md)

[← Back to documentation index](../index.md)
