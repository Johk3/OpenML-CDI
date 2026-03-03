# 🧪 Unit testing guide

This is a how-to guide for writing **unit tests** in this repo (practical “how”, not deep theory).  
For definitions and “which test type should I write?”, see [`testing.md`](./testing.md).

---

## 🧭 What counts as a unit test here?

A unit test should validate a small piece of behavior (usually a single function/class/module) in **isolation**.

✅ In scope

- Pure logic (business rules, transformations, parsing/formatting).
- Edge cases and error paths.
- Simple orchestration where dependencies are mocked/stubbed.

❌ Out of scope (belongs in integration/E2E)

- Real database, network, queues, filesystem.
- Multiple services/components collaborating for real.
- Full request/response flows (unless everything external is mocked and you’re truly testing one unit).

---

## 🦸 Characteristics of good unit tests

A good unit test is:

- **Fast**: runs in milliseconds; many unit tests should run frequently.
- **Deterministic**: same inputs → same outputs; no reliance on time, randomness, ordering, or external services.
- **Readable**: someone new can understand intent in 30 seconds.
- **Focused**: tests one behavior (i.e. one assert condition); failure tells you what broke.
- **Independent**: doesn’t depend on global state or previous tests.
- **Behavior-based**: verifies externally visible behavior, not internal implementation details.

### ⚠️ Common unit test smells

- “One test checks everything” (hard to debug).
- Excessive mocking (you’re testing your mocks, not your logic).
- Asserting on private/internal details instead of outcomes.
- Using real clocks, sleeping, retry loops, or network calls.

---

## 🏠 Recommended structure: Arrange / Act / Assert (AAA)

Use AAA as the default pattern.

1. **Arrange**: set up inputs and any fakes/mocks.
2. **Act**: call the unit under test.
3. **Assert**: verify results (return value, thrown error, calls to dependencies).

### 🔠 Naming convention

Use a [it ]“behavior + condition + expected result” naming style.

Examples (choose a style and be consistent):

- `does X when Y`
- `given Y, returns X`
- `should X when Y`

---

## What to mock (and what not to)

Mock 🧱 boundaries, not your own logic.

✅ Prefer mocking/stubbing

- Network clients
- Database repositories/ORM calls
- Message queues
- File I/O
- System time (clock)
- Random generators

❌ Avoid mocking

- Your own pure functions (test them directly)
- Simple data classes/DTOs
- Language/runtime built-ins unless necessary

### 💡 Dependency injection makes testing easier

If a module creates dependencies internally (e.g., constructs an HTTP client inside the function), it becomes hard to unit test cleanly. Prefer passing dependencies in, or wrapping them behind interfaces you can stub.

---

## Examples

### Example: TypeScript + Jest (AAA + table-driven)

```ts
// function under test describing a price of with VAT (value added tax)
export function priceWithVat(net: number, vatRate: number): number {
  if (net < 0) throw new Error("net must be >= 0");
  if (vatRate < 0) throw new Error("vatRate must be >= 0");
  return Math.round(net * (1 + vatRate) * 100) / 100;
}
```

```ts
import { priceWithVat } from "./priceWithVat";

describe("priceWithVat", () => {
  // table-driven is useful when testing boundries
  test.each([
    { net: 10, vatRate: 0.21, expected: 12.1 },
    { net: 0, vatRate: 0.21, expected: 0 },
    { net: 10, vatRate: 0, expected: 10 },
  ])(
    "returns expected gross price ($net, $vatRate)",
    ({ net, vatRate, expected }) => {
      // Arrange
      // (no setup needed)

      // Act
      const result = priceWithVat(net, vatRate);

      // Assert
      expect(result).toBe(expected);
    },
  );

  it("throws an error when net is negative", () => {
    // Arrange
    const net = -1;

    // Act + Assert
    expect(() => priceWithVat(net, 0.21)).toThrow("net must be >= 0");
  });
});
```

### Example: Python + pytest (AAA + parametrize)

```py
# function under test
def price_with_vat(net: float, vat_rate: float) -> float:
    if net < 0:
        raise ValueError("net must be >= 0")
    if vat_rate < 0:
        raise ValueError("vat_rate must be >= 0")
    return round(net * (1 + vat_rate), 2)
```

```py
import pytest
from price_with_vat import price_with_vat

@pytest.mark.parametrize(
    "net,vat_rate,expected",
    [
        (10, 0.21, 12.1),
        (0, 0.21, 0.0),
        (10, 0.0, 10.0),
    ],
)
def test_price_with_vat_returns_expected(net, vat_rate, expected):
    # Arrange
    # (no setup needed)

    # Act
    result = price_with_vat(net, vat_rate)

    # Assert
    assert result == expected

def test_price_with_vat_raises_when_net_negative():
    # Arrange
    net = -1

    # Act + Assert
    with pytest.raises(ValueError, match="net must be >= 0"):
        price_with_vat(net, 0.21)
```

---

## Example: unit test with a mocked dependency

This is the pattern to use when your logic depends on an external boundary (DB, API, queue).

### TypeScript-style pseudo-example

```ts
// Unit under test: service logic
export async function createUser(serviceDeps, input) {
  // serviceDeps.userRepo, serviceDeps.idGenerator, serviceDeps.clock
  const id = serviceDeps.idGenerator();
  const now = serviceDeps.clock.now();

  const user = { id, email: input.email, createdAt: now };

  await serviceDeps.userRepo.insert(user);

  return user;
}
```

```ts
import { createUser } from "./createUser";

it("creates a user with deterministic id and timestamp", async () => {
  // Arrange
  const deps = {
    idGenerator: () => "user_123",
    clock: { now: () => new Date("2020-01-01T00:00:00Z") },
    userRepo: { insert: jest.fn().mockResolvedValue(undefined) },
  };

  // Act
  const user = await createUser(deps, { email: "a@example.com" });

  // Assert
  expect(user).toEqual({
    id: "user_123",
    email: "a@example.com",
    createdAt: new Date("2020-01-01T00:00:00Z"),
  });
  expect(deps.userRepo.insert).toHaveBeenCalledTimes(1);
  expect(deps.userRepo.insert).toHaveBeenCalledWith(user);
});
```

---

## ⚠️ Reliability rules (avoid flaky tests)

- Do not use real time; inject a clock or freeze time.
- Do not use real randomness; inject a random generator or seed it so it's reproducable.
- Do not rely on test order; every test must fully arrange its own state.
- Avoid concurrency timing assumptions; don’t assert “eventually” in unit tests.
- Prefer pure functions; the more side effects, the harder tests get.

---

## 📌 Pre-PR checklist (unit tests)

- [ ] I added/updated unit tests for all changed business logic paths.
- [ ] Tests follow Arrange / Act / Assert (or an equivalent consistent pattern).
- [ ] Tests are deterministic (no real time, randomness, network, DB).
- [ ] Each test is focused and readable (clear name + clear assertions).
- [ ] I covered important edge cases (null/empty, boundaries, error paths).
- [ ] I avoided over-mocking and tested behavior, not implementation details.
- [ ] All unit tests pass locally/CI.

---

## 🔗 Related guides

- [General testing guide](./testing.md)
- [Integration testing guide](./integration-test.md)
- [End-to-end testing guide](./e2e-test.md)
