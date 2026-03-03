# 📌 Contributing

When contributing to this repository, please first discuss the change you wish to make via issue,
email, or any other method with the members of this repository before making a change.
This project follows an Agile/Scrum workflow. To keep our work organized, we use specific templates and labels for all Issues and Pull Requests. Please make use of them.

## CI - Code Integration
To ensure consistency across multiple developers both in code formatting and error handling we need some static code analysis tool.
For a setup guide of our CI tooling, see [docs/how-to/CI-pipeline.md](docs/how-to/CI-pipeline.md).


## Branch Prefixes and Naming
Stick to lowercase for branch names and use hyphens to separate words. For instance, feature/new-login or bugfix/header-styling.

Using prefixes in branch names helps to quickly identify the purpose of the branches. Here are some common types of branches with their corresponding prefixes:
| Prefix    | Use for                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| feature/  | These branches are used for developing new features. For instance, feature/login-system.                                    |
| bugfix/   | These branches are used to fix bugs in the code. For example, bugfix/header-styling.                                        |
| hotfix/   | These branches are used to fix critical bugs in the production environment. For instance, hotfix/critical-security-issue.   |
| release/  | These branches are used to prepare for a new production release. For example, release/v1.0.1.                               |
| docs/     | These branches are used to write, update, or fix documentation eg. the README.md file. For instance, docs/api-endpoints.    |

## Commit messages
For commit naming conventions, see [docs/how-to/commit-messages.md](docs/how-to/commit-messages.md).

## Issues
Before you start working on a task, it **MUST be tracked** on our GitHub Scrum board.
- Go to the **Issues** tab and click **New Issue**.
- **Do not start from a blank issue.** Choose one of the provided templates:
  - **Backlog Task**: For new features, database models, or API endpoints.
  - **Bug Report**: For reporting unexpected behavior or broken features.
- Fill out the template completely. **Acceptance Criteria** are mandatory for Backlog Tasks; the issue cannot be moved to "Done" until all criteria are met.

### 1. Issue Title Prefixes
When writing your issue title, replace `[PREFIX]` with one of the following prefixes so we can easily scan the board:

| Prefix     | Use for                          |
| ---------- | -------------------------------- |
| [DB]       | Database models and migrations   |
| [Backend]  | FastAPI endpoints and services   |
| [Frontend] | React pages and components       |
| [Auth]     | Authentication and authorization |
| [CI/Test]  | Tests and CI pipeline            |
| [Docs]     | Documentation and README updates |

### 2. Working on a Task
- Assign the issue to yourself so no one else picks it up.
- Move the issue card to the **In Progress** column on the Scrum board.
- Create a new branch off of `main` using the issue number. 
  - *Example:* `git checkout -b feature/15-dataset-upload`

## 3. 🧪 Testing

Before opening a PR, make sure your changes are covered by the appropriate tests. We use three levels of testing in this repo — if you're not sure which one to write, start with the general testing guide below.
### 📚 Guides

| Guide | When to read it |
| --- | --- |
| [General testing guide](docs/how-to/testing.md) | Not sure which test type to write? Start here. |
| [Unit testing guide](docs/how-to/unit-test.md) | You changed business logic, fixed a bug, or refactored code. |
| [Integration testing guide](docs/how-to/integration-test.md) | Your change touches how components connect (service + DB, API + queue, etc.). |
| [End-to-end testing guide](docs/how-to/e2e-test.md) | You changed a critical user-facing flow. |

## 4. Submitting a Pull Request (PR)
When your work is complete and tested locally, push your branch and open a Pull Request.
- The PR description will automatically populate with our standard **Pull Request Template**.
- **Link the Issue:** Under the "Related Issue" section, write `Closes #XYZ` (where XYZ is your issue number). This ensures GitHub automatically closes the issue when your PR is merged.
- **Self-Review:** Go through the "Definition of Done" checklist in the template. If you haven't run your tests or formatted your code, do not request a review yet.
- **Review Process:** Request a review from at least one other team member. They will use the *How to Test* instructions you provided in the template to verify your code.

### Pull Request Process

On a guide on how big a PR should be, see [docs/how-to/pull-request-size.md](docs/how-to/pull-request-size.md).
On a guide on to do a code review, see [docs/how-to/code-reviews.md](docs/how-to/code-reviews.md).
