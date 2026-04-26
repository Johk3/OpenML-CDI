import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/routes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { User } from '@/types/auth';
import { UserContext, UserContextValue } from '@/contexts/UserContext';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';
export { mockNavigate } from './mocks/navigation';

export const navigateTo = (path: string) => {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  render(<RouterProvider router={router} />);
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry on failure in tests
        gcTime: Infinity, // Keep cache alive for the test
      },
    },
  });
}

const defaultUser: User = {
  id: 'test-user',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  email: 'test@test.com',
  username: 'testuser',
  datasets: ['dataset'],
  created_at: 'a',
  is_verified: true,
};

const defaultUserContext: UserContextValue = {
  user: defaultUser,
  isLoading: false,
  isError: false,
};

const defaultAuthContext: AuthContextValue = {
  isAuthenticated: true,
  login: vi.fn(),
  loginWithGithub: vi.fn(),
  logout: vi.fn(),
};

interface WrapperOptions extends RenderOptions {
  authContext?: Partial<AuthContextValue>;
  userContext?: Partial<UserContextValue>;
  initialRoute?: string;
}

export const renderWithRouter = (
  ui: React.ReactElement,
  { authContext, userContext, initialRoute = '/' }: WrapperOptions = {},
) => {
  const queryClient = createTestQueryClient();

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ ...defaultAuthContext, ...authContext }}>
          <UserContext.Provider value={{ ...defaultUserContext, ...userContext }}>
            {ui}
          </UserContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};
