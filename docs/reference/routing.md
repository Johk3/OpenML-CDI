# Routing in OpenML CDI

## Table of Contents

- [Route Definitions](#route-definitions)
- [How to Add a New Route](#how-to-add-a-new-route)
- [Handling 404 Routes](#handling-404-routes)

This application uses react router for client-side routing. This document outlines how routes are organized and how to add new ones.

## Route Definitions

All route definitions are centralized in `src/routes/index.tsx`. The application uses the standard nested `<Outlet />` pattern to inject the page content inside the shared layout `MainLayout`.

Our router is initialized using `createBrowserRouter` to enable APIs and history state management, allowing deep links and consistent 404 pages.

### Authentication and route protection

Routes fall into two intentional groups:

| Route group       | Paths                                                                  | Protection                                                                                                 |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Public entry      | `/`, `/login`, `/login/callback`, `/about`                             | No `ProtectedRoute`. Upload redirects to login when an unauthenticated user selects files.                 |
| Authenticated app | `/datasets`, `/datasets/:id`, `/account`, `/metadata`, `/expert-queue` | Wrapped in `ProtectedRoute`, which waits for the initial refresh-cookie check before redirecting to login. |

Use `ProtectedRoute` for any new page that requires a signed-in session. Keep marketing or callback pages public and gate specific actions inside the page when a softer entry flow is needed.

### Example Route Structure

```tsx
export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: (
      <MainLayout>
        <NotFoundPage />
      </MainLayout>
    ),
    children: [
      {
        index: true,
        element: <UploadPage />,
      },
      // Insert new pages here
    ],
  },
]);
```

## How to Add a New Route

1. **Create the Page Component**: Add a new `.tsx` file in `src/pages/` (e.g., `NewPage.tsx`).
2. **Export the Page Component**: `export const NewPage: React.FC = () => { return <div>...</div> }`
3. **Register the Route**: Open `src/routes/index.tsx`, import your new page, and add a new object to the `children` array under the root path `/`.

```tsx
{
  path: 'new-route', // this corresponds to /new-route
  element: <NewPage />,
}
```

1. **Add Navigation (Optional)**: If this page needs to be accessible from the header nav, open `src/components/Header.tsx` and add a `<NavLink to="/new-route">New Route</NavLink>` inside the `.nav-links` container.

## Handling 404 Routes

Navigating to any path not explicitly defined in the `children` array will fallback to `path: '*'` or the main `errorElement`, which renders the `NotFoundPage` wrapped inside the `MainLayout`.

---

**Related:** [Dataset Detail Page](./dataset-detail-page.md) | [Frontend Testing Reference](./fontend-testing.md)

[← Back to documentation index](../index.md)
