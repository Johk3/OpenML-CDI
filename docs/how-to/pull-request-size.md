# Pull Request Size Guidelines

In our project, we aim to keep Pull Requests (PRs) **small and focused**.

Research shows that reviewing more than 400 lines of code at once causes the reviewer's attention to drop off significantly, leading to missed bugs and superficial "Looks Good To Me" (LGTM) reviews.

## The Golden Rules

1. **One PR = One Logical Change**
   A PR should only do one thing. If you are fixing a bug, do not sneak in a code refactor or a new feature in the same PR.
2. **Aim for Under 250 Lines of Code (LOC)**
   The ideal PR is between 50 and 250 lines of code (excluding auto-generated files like `package-lock.json` or Alembic migration scripts).
3. **Keep File Changes Low**
   Try to touch fewer than 10 files per PR. Touching too many files usually means the PR's scope has gotten too large.

## Why Small PRs Matter

- **Faster Reviews:** A 200-line PR takes about 20 minutes to review. A 1000-line PR can take hours, meaning it will sit in the "In Review" column for days.
- **Fewer Merge Conflicts:** The less code you touch at once, the less likely you are to collide with a teammate's work.
- **Easier Rollbacks:** If a bug makes it to the `main` branch, it is much easier to click "Revert" on a small, isolated PR than trying to untangle a massive 1,500-line update.

## Separate Refactoring from Features

If you realize some old code needs to be cleaned up before you can build your new feature:

- **PR 1:** Clean up the old code (no change in functionality).
- **PR 2:** Build the new feature using the clean code.

## Stack Your PRs

If your work fundamentally requires a lot of code, break it into chunks. For example, build the Database Model in one PR. Once that is merged, create a new branch for the API endpoint that relies on it.

## What if a PR must be large?

Sometimes, large PRs are unavoidable (e.g., initial project setup or installing a massive new library). When this happens:

- Warn the team in Whatsapp before requesting a review.
- Write a highly detailed PR description.
- Leave inline comments on your own code explaining _why_ you made certain decisions, guiding the reviewer through the massive file changes.
