import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';
import { UserContext } from '@/contexts/UserContext';
import { UserProvider } from '@/providers/UserProvider';
import { UserService } from '@/services/userService';
import { User } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/services/userService', () => ({
  UserService: {
    getMe: vi.fn(),
  },
}));

const OLD_USER: User = {
  id: 'user-1',
  first_name: 'Old',
  last_name: 'Profile',
  username: 'old-profile',
  email: 'old@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00.000Z',
  datasets: [],
};

const SYNCED_USER: User = {
  ...OLD_USER,
  first_name: 'Synced',
  last_name: 'Profile',
  username: 'synced-profile',
  email: 'synced@example.com',
};

const renderAuthenticatedUserProvider = (queryClient: QueryClient) => {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          isAuthenticated: true,
          isInitializing: false,
          login: vi.fn(),
          loginWithGithub: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <UserProvider>
          <UserContext.Consumer>
            {(value) => <div>{value?.user?.email ?? 'no-user'}</div>}
          </UserContext.Consumer>
        </UserProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
};

describe('UserProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refetches /auth/me on authenticated mount so cached profile data is synchronized', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    queryClient.setQueryData(['users', 'me'], OLD_USER);
    vi.mocked(UserService.getMe).mockResolvedValue(SYNCED_USER);
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true } as AuthContextValue);

    renderAuthenticatedUserProvider(queryClient);

    await waitFor(() => expect(UserService.getMe).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('synced@example.com')).toBeInTheDocument();
  });
});
