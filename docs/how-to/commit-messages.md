# How to Write a Commit Message

## Table of Contents

- [Types](#types)
- [Scope](#scope)
- [Short Description Rules](#short-description-rules)
- [Examples](#examples)
- [Commit Size](#commit-size)
- [Quick Checklist Before Committing](#quick-checklist-before-committing)

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) standard.
Every commit message must follow this format:

```sh
<type>(<scope>): <short description>
<optional body>
```

## Types

Use one of the following type to signal the kind of change you have made:

| Type     | When to use                                                   |
| -------- | ------------------------------------------------------------- |
| feat     | Adding a new feature (e.g., a new endpoint or React page)     |
| fix      | Fixing a bug                                                  |
| chore    | Project setup, configs, tooling (no application code changes) |
| docs     | Changes to documentation or README only                       |
| test     | Adding or updating tests                                      |
| refactor | Code cleanup that doesn't add a feature or fix a bug          |
| style    | Formatting only (e.g., running black or eslint)               |
| ci       | Changes to the GitHub Actions CI pipeline                     |

## Scope

Use one of the following scopes to indicate which part of the project was affected:

| Scope    | Use for                            |
| -------- | ---------------------------------- |
| auth     | Authentication/JWT logic           |
| db       | Database models or migrations      |
| api      | FastAPI endpoints                  |
| frontend | React components and pages         |
| github   | Issue/PR templates, GitHub Actions |
| docs     | Documentation files                |
| tests    | Test files                         |

## Short Description Rules

Use the imperative mood (e.g., "add login endpoint", not "added login endpoint").

Keep it under 72 characters.

Do not end with a full stop.

## Examples

Simple single-line commit:

```txt
feat(api): add POST /datasets/upload endpoint
```

Commit with a body:

```txt
feat(auth): add JWT login endpoint

- Accepts email and password via POST /auth/login
- Returns a signed JWT token on success
- Returns 401 if credentials are invalid
```

Bug fix:

```txt
fix(frontend): correct redirect after successful login
```

Chore (no application code):

```txt
chore(github): add issue and PR templates, update contributing guidelines
```

## Commit Size

A commit should represent **one logical change**. A good rule of thumb is:
if you struggle to write a short, accurate commit message for your changes,
your commit is probably too large and should be split up.

### ✅ A good commit

- Implements a single endpoint, model, or component
- Fixes one specific bug
- Can be reviewed by a teammate in under 10 minutes
- Can be reverted without affecting unrelated work

### ❌ Avoid commits that

- Mix unrelated changes (e.g., fixing a bug AND adding a new feature)
- Bundle an entire sprint's worth of work into one push
- Include commented-out code, debug prints, or leftover `console.log` statements
- Contain changes to both `frontend/` and `backend/` unless they are tightly coupled

### Commit message examples

**Too large — should be split:**

```txt
feat(api): add user model, auth endpoints, file upload, and github integration
```

**Just right — one logical unit:**

```txt
feat(db): create User model with email, password_hash, and role fields
```

## Quick Checklist Before Committing

- [ ] Does my type (feat, fix, etc.) accurately describe the change?
- [ ] Have I specified the correct scope?
- [ ] Is my description written in the imperative mood and under 72 characters?
- [ ] If the change is complex, did I add a body with bullet points?
- [ ] Does this commit represent **one** logical change only?
- [ ] Have I removed all debug prints, `console.log` statements, and commented-out

---

**Related:** [CI Pipeline](./CI-pipeline.md) | [Pull Request Size Guidelines](./pull-request-size.md)

[← Back to documentation index](../index.md)
