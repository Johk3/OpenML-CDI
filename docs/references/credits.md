# Credits / Third-Party Libraries

This project is built on the shoulders of many excellent open-source libraries. Below is an acknowledgement of the key dependencies used across the backend, frontend, and tooling.

---

## Backend

| Library              | Role                                                                                                   | Link                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **FastAPI**          | Web framework used to build the REST API, providing automatic OpenAPI docs and async request handling. | <https://fastapi.tiangolo.com>                       |
| **SQLAlchemy**       | ORM and database toolkit used for defining models and querying the database in a Pythonic way.         | <https://www.sqlalchemy.org>                         |
| **Alembic**          | Database migration tool for SQLAlchemy, used to version-control schema changes.                        | <https://alembic.sqlalchemy.org>                     |
| **Argon2-cffi**      | Password hashing library used to securely store and verify user credentials.                           | <https://argon2-cffi.readthedocs.io>                 |
| **PyJWT**            | Library for encoding and decoding JSON Web Tokens, used for stateless authentication.                  | <https://pyjwt.readthedocs.io>                       |
| **python-multipart** | Enables parsing of multipart form data, required for file upload endpoints in FastAPI.                 | <https://github.com/Kludex/python-multipart>         |
| **cryptography**     | Provides low-level cryptographic primitives used for secure token and key operations.                  | <https://cryptography.io>                            |
| **python-dotenv**    | Loads environment variables from `.env` files, used to configure the application locally.              | <https://github.com/theskumar/python-dotenv>         |
| **aiofiles**         | Provides async file I/O support, used for non-blocking file operations in FastAPI endpoints.           | <https://github.com/Tinche/aiofiles>                 |
| **email-validator**  | Validates and normalises email addresses, used when accepting user email input.                        | <https://github.com/JoshData/python-email-validator> |

---

## Frontend

| Library                      | Role                                                                                                                       | Link                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **React**                    | UI library used to build the component-based single-page application.                                                      | <https://react.dev>                         |
| **React Router**             | Client-side routing library that manages navigation and deep-linking within the app.                                       | <https://reactrouter.com>                   |
| **Tailwind CSS**             | Utility-first CSS framework used for all styling and layout across the application.                                        | <https://tailwindcss.com>                   |
| **Radix UI**                 | Headless, accessible component primitives used as the foundation for UI elements such as dialogs, dropdowns, and tooltips. | <https://www.radix-ui.com>                  |
| **Lucide React**             | Icon library providing the SVG icons used throughout the interface.                                                        | <https://lucide.dev>                        |
| **Motion**                   | Animation library (formerly Framer Motion) used for transitions and interactive animations.                                | <https://motion.dev>                        |
| **class-variance-authority** | Utility for building type-safe component variant APIs in combination with Tailwind CSS.                                    | <https://cva.style>                         |
| **tailwind-merge**           | Utility that safely merges Tailwind CSS class names, preventing style conflicts.                                           | <https://github.com/dcastil/tailwind-merge> |
| **clsx**                     | Lightweight utility for conditionally constructing className strings in components.                                        | <https://github.com/lukeed/clsx>            |
| **TypeScript**               | Typed superset of JavaScript used across the entire frontend codebase for type safety.                                     | <https://www.typescriptlang.org>            |
| **shadcn**                   | Collection of accessible, composable UI components built on top of Radix UI and Tailwind CSS.                              | <https://ui.shadcn.com>                     |

---

## Tooling

| Tool                | Role                                                                                                                       | Link                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **pre-commit**      | Framework for managing and running Git pre-commit hooks to enforce code quality checks.                                    | <https://pre-commit.com>                     |
| **Black**           | Opinionated Python code formatter used to enforce a consistent code style on the backend.                                  | <https://black.readthedocs.io>               |
| **Flake8**          | Python linter used to catch style violations and potential errors in backend code.                                         | <https://flake8.pycqa.org>                   |
| **pytest**          | Testing framework used for all backend unit and integration tests.                                                         | <https://pytest.org>                         |
| **pytest-cov**      | pytest plugin that measures test coverage and generates coverage reports for the backend.                                  | <https://pytest-cov.readthedocs.io>          |
| **pytest-order**    | pytest plugin that controls the execution order of backend tests.                                                          | <https://github.com/pytest-dev/pytest-order> |
| **pytest-xdist**    | pytest plugin for parallel test execution, speeding up the backend test suite.                                             | <https://github.com/pytest-dev/pytest-xdist> |
| **Vite**            | Frontend build tool and development server providing fast hot-module replacement.                                          | <https://vitejs.dev>                         |
| **Vitest**          | Fast unit testing framework for the frontend, built on top of Vite.                                                        | <https://vitest.dev>                         |
| **Testing Library** | Utilities for testing React components in a user-centric way.                                                              | <https://testing-library.com>                |
| **ESLint**          | JavaScript/TypeScript linter used to enforce code quality rules across the frontend.                                       | <https://eslint.org>                         |
| **Prettier**        | Opinionated code formatter used to enforce a consistent style across frontend files.                                       | <https://prettier.io>                        |
| **commitlint**      | Lints commit messages against the Conventional Commits specification.                                                      | <https://commitlint.js.org>                  |
| **Docker**          | Containerisation platform used to package and run the application and its services in isolated, reproducible environments. | <https://www.docker.com>                     |
