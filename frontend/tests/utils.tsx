import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/routes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserContext, UserContextValue } from '@/contexts/UserContext';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';
import { makeUser, makeUserContext } from './mocks/builders';
export { mockNavigate } from './mocks/navigation';

type RouteState = Record<string, unknown>;

const initialEntryFor = (path: string, state?: RouteState) =>
  state ? { pathname: path, state } : path;

export const navigateTo = (path: string, state?: RouteState) => {
  const router = createMemoryRouter(routes, {
    initialEntries: [initialEntryFor(path, state)],
  });

  return render(<RouterProvider router={router} />);
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry on failure in tests
        gcTime: Infinity, // Keep cache alive for the test
      },
    },
  });
}

const defaultAuthContext = (): AuthContextValue => ({
  isAuthenticated: true,
  login: vi.fn(),
  loginWithGithub: vi.fn(),
  logout: vi.fn(),
});

interface QueryClientWrapperOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  routeState?: RouteState;
  queryClient?: QueryClient;
}

export const renderWithQueryClient = (
  ui: React.ReactElement,
  {
    initialRoute = '/',
    routeState,
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: QueryClientWrapperOptions = {},
) => ({
  queryClient,
  ...render(
    <MemoryRouter initialEntries={[initialEntryFor(initialRoute, routeState)]}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>,
    renderOptions,
  ),
});

interface WrapperOptions extends QueryClientWrapperOptions {
  authContext?: Partial<AuthContextValue>;
  userContext?: Partial<UserContextValue>;
}

export const renderWithRouter = (
  ui: React.ReactElement,
  {
    authContext,
    userContext,
    initialRoute = '/',
    routeState,
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: WrapperOptions = {},
) => ({
  queryClient,
  ...render(
    <MemoryRouter initialEntries={[initialEntryFor(initialRoute, routeState)]}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ ...defaultAuthContext(), ...authContext }}>
          <UserContext.Provider
            value={{
              ...makeUserContext({ user: makeUser() }),
              ...userContext,
            }}
          >
            {ui}
          </UserContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
    renderOptions,
  ),
});
