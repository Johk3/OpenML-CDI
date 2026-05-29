# 🔗 Integration testing guide

## Table of Contents

- [What counts as an integration test here?](#-what-counts-as-an-integration-test-here)
- [Keep scope realistic (but not huge)](#-keep-scope-realistic-but-not-huge)
- [External dependencies (DB / network / queues)](#-external-dependencies-db--network--queues)
- [Making integration tests stable (no flakiness)](#️-making-integration-tests-stable-no-flakiness)
- [Recommended structure (AAA still applies)](#-recommended-structure-aaa-still-applies)
- [Minimal example outline (pseudocode)](#-minimal-example-outline-pseudocode)
- [Where integration tests live](#️-where-integration-tests-live)
- [Pre-PR checklist](#-pre-pr-checklist-integration-tests)
- [Related guides](#-related-guides)

This is a how-to guide for writing **integration tests** in this repo (practical “how”).  
For definitions and choosing the right test type, see [`testing.md`](./testing.md).  
For isolated logic tests, see [`unit-test.md`](./unit-test.md).

---

## 🧭 What counts as an integration test here?

An integration test checks that **multiple pieces** work together correctly in a realistic setup.

✅ In scope (common examples)

- Service code + real database (or a DB running locally/in a container).
- API handler/controller + persistence layer (still not “full browser clicking”).
- Data mapping across layers (request → domain → DB and back).
- Producing/consuming messages using a real broker (or a good local equivalent).

❌ Not integration tests (usually)

- Pure business logic in isolation (that’s a unit test).
- Full user journeys across the whole system (that’s end-to-end testing).
- Tests that depend on shared environments or manual steps.

> [!TIP]
> Quick hint: if a bug could come from **wiring/config/schema/IO** (how things connect), it often needs an integration test.

---

## 🧱 Keep scope realistic (but not huge)

Integration tests should be “realistic, but focused.”

- Prefer integrating **one boundary at a time** (example: service + DB), instead of turning every test into “the whole system.”
- Keep the number of moving parts small (fewer services = fewer random failures).
- Use real-ish config (migrations, schemas, env vars), but avoid depending on shared dev/staging systems.

---

## 🧰 External dependencies (DB / network / queues)

### ✅ Best setup: local + throwaway dependencies

Aim for dependencies that start for the test run and can be deleted after (throwaway = safe and repeatable):

- Containers (for DB/queues).
- Docker Compose (for multiple local services).
- In-memory versions only if they behave close enough to production (and you note the differences).

### ✅ Test data setup (pick one style and stick to it)

Consistent data setup makes tests easier to read and maintain.

- Migrations + seed data each run (seed data = a small starting dataset).
- Factory helpers (helpers that create objects with sensible defaults).
- Small example datasets (fixtures = pre-made test data; keep them small so they’re easy to understand).

### ✅ Cleanup + isolation (keep tests from messing with each other)

Pick the simplest option that stays reliable:

- Transaction rollback per test (wrap each test in a DB transaction, then roll it back).
- Truncate tables between tests (delete rows so each test starts clean).
- Fresh database/schema per test run (very reliable and simple to reason about).
- Prefix test data with unique IDs (so parallel tests don’t clash; sometimes called “namespacing” test data).

### ⚠️ Avoid this in integration tests

- Calling real third-party services.
- Using shared dev databases/queues that other people/tests also use.
- Requiring humans to clean up state.

If you _must_ simulate an external service, prefer a local stub server (a local fake API) and document it as a deliberate choice.

---

## ⚠️ Making integration tests stable (no flakiness)

Integration tests usually get flaky because of time, waiting, and shared state.

- Prefer deterministic checks (assert what’s stored in the DB or what message was emitted, not “it probably happened eventually”).
- Avoid `sleep(5)` style waits; if you need to wait, poll with a clear timeout (wait up to X seconds, checking every Y ms).
- Each test should create its own data (no “this test assumes another test ran first”).
- Assume tests may run in parallel (use unique identifiers; isolate resources).
- Keep failure output helpful (clear assert messages; capture logs from containers/services when possible).
- Don’t over-assert on unimportant details (details that aren’t part of the actual behavior you care about, like row order or internal IDs), unless that detail is the point of the test.

---

## 🏠 Recommended structure (AAA still applies)

Integration tests should still follow Arrange / Act / Assert, but “Arrange” includes environment setup.

1. **Arrange**: start dependencies, run migrations, seed data, configure clients.
2. **Act**: call the boundary you’re testing (service method, API handler, repository).
3. **Assert**: verify durable effects (DB rows, emitted messages) and returned outputs.

---

## 🤏 Minimal example outline (pseudocode)

Use this as the baseline shape for most integration tests.

```text
Test: Creating a user stores the right fields

Arrange:
  - Start DB (container/compose/local)
  - Apply migrations
  - Create repository/service with DB connection
  - (Optional) seed prerequisite data

Act:
  - Call createUser(email)

Assert:
  - Query DB for the user row
  - Assert stored fields match expectations
  - Assert constraints are enforced (e.g., unique email)
```

### Example: repository + DB (language-agnostic pseudocode)

```text
arrange:
  db = startDatabase()
  migrate(db)
  repo = UserRepository(db)

act:
  userId = repo.insert(email="a@example.com")

assert:
  row = db.query("select * from users where id = ?", userId)
  expect row.email == "a@example.com"
  expect row.created_at is not null
```

---

## 🗺️ Where integration tests live

Current repo layout:

- `backend/app/tests/integration/` – backend integration tests
- `frontend/tests/integration/` – frontend integration tests
- `backend/app/tests/conftest.py` and `frontend/tests/utils.tsx` – shared test helpers
- `docker-compose.dev.yml` – local dependency setup for the development stack

Keep helpers small and straightforward (so contributors can understand them quickly).

---

## 📌 Pre-PR checklist (integration tests)

- [ ] I wrote an integration test because the behavior crosses boundaries (not just pure logic).
- [ ] The test runs locally in a fresh setup (no shared DB/queues required).
- [ ] Setup and cleanup are automated (no manual steps).
- [ ] The test is stable (no random sleeps; if waiting is needed, it’s bounded by a timeout).
- [ ] Test data is small and clearly tied to the assertions.
- [ ] Failures are easy to debug (clear assertions; useful logs when it fails).

---

## 🔗 Related guides

- [General testing guide](./testing.md)
- [Unit testing guide](./unit-test.md)
- [End-to-end testing guide](./e2e-test.md)
- [Backend Testing Environment](./testing_backend_environment.md)

---

[← Back to documentation index](../index.md)
