# CI pipeline

## Table of Contents

- [Description](#description)
- [Migrating from pre-commit](#migrating-from-pre-commit)
- [Installation](#installation)
- [Usage](#usage)

## Description

To ensure consistency across multiple developers both in code formatting and error handling we need some static code analysis tool. Static refers to the code being analyzed without running it. In our repository we use tool called [Lefthook](https://lefthook.dev/intro.html) to automate the analysis of our code.
We run tests for:

- White space at the end of files
- Preventing large files from being added
- Formatting to ensure that the code style is consistent throughout all contributions
- Linting to catch as much errors as possible before running any tests
- Searching for and preventing secrets and API keys from being added

## Migrating from pre-commit

If you still have pre-commit installed and you want to work with the new lefhook pipeline follow these steps to uninstall pre-commit:

- run `pre-commit uninstall` at the root of the git repo
- uninstall the pre-commit package the way you have installed it
- proceed to the installation of lefthook

## Installation

Please refer to the [Lefthook documentation](https://lefthook.dev/installation) on how to install lefthook.
Quick reference:

```sh
pipx install lefthook
```

After installing run the following command at the root of the repo:

```sh
lefthook install
```

### Requirements

In order to run all tests the following tools have to be installed on your computer:

- [python](https://www.python.org/)
- [node](https://nodejs.org/en)
- [pipx](https://github.com/pypa/pipx)
- npm(comes with node) or [pnpm](https://pnpm.io/)

## Usage

After installing the script should run automatically after you run the commit command. Before the commit has been made the tool tests the checks mentioned an fixes most errors.
If a check failed you most likely have to stage the changed files and run commit again.
To check that all tests will pass manually you can run the following command:

```sh
lefthook run pre-commit --all-files
```

---

**Related:** [How to Write a Commit Message](./commit-messages.md)

[← Back to documentation index](../index.md)
