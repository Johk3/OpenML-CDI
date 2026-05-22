import { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';
import { AuthProvider } from '@/providers/AuthProvider';
import { apiClient, publicClient } from '@/lib/apiClient';
import { tokenManager } from '@/lib/tokenManager';
import { mockNavigate } from '../utils';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
  publicClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/tokenManager', () => ({
  tokenManager: {
    clearToken: vi.fn(),
    isTokenExpired: vi.fn(),
    registerUnauthenticatedHandler: vi.fn(),
    setToken: vi.fn(),
  },
}));

const captureAuthContext = (onValue: (value: AuthContextValue) => void) => {
  const Capture = () => {
    const value = useContext(AuthContext);
    if (value) {
      onValue(value);
    }
    return null;
  };
  return Capture;
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    window.sessionStorage.clear();
    vi.mocked(tokenManager.isTokenExpired).mockReturnValue(true);
    vi.mocked(publicClient.post).mockRejectedValue(new Error('No refresh session'));
  });

  it('rehydrates a refresh-cookie session without redirecting away from the current route', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    vi.mocked(publicClient.post).mockResolvedValue({
      data: {
        access_token: 'refreshed-access-token',
        token_type: 'bearer',
      },
    });

    const authStates: AuthContextValue[] = [];
    const Capture = captureAuthContext((value) => {
      authStates.push(value);
    });

    render(
      <MemoryRouter initialEntries={['/account']}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(authStates.at(-1)?.isInitializing).toBe(true);

    await waitFor(() => {
      expect(authStates.at(-1)?.isInitializing).toBe(false);
      expect(authStates.at(-1)?.isAuthenticated).toBe(true);
    });

    expect(publicClient.post).toHaveBeenCalledWith('/auth/refresh', {}, { withCredentials: true });
    expect(tokenManager.setToken).toHaveBeenCalledWith('refreshed-access-token');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears auth state and redirects to login after backend logout', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries');
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    let authContext: AuthContextValue | undefined;
    const Capture = captureAuthContext((value) => {
      authContext = value;
    });

    render(
      <MemoryRouter initialEntries={['/account']}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const context = authContext;
    if (!context) {
      throw new Error('Auth context was not captured');
    }

    await act(async () => {
      await context.logout();
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh/logout');
    expect(tokenManager.clearToken).toHaveBeenCalled();
    expect(removeQueriesSpy).toHaveBeenCalledWith({ queryKey: ['users', 'me'] });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('invalidates the current-user query after GitHub login refreshes backend profile data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.mocked(publicClient.get).mockResolvedValue({
      data: {
        access_token: 'new-access-token',
        token_type: 'bearer',
      },
    });

    let authContext: AuthContextValue | undefined;
    const Capture = captureAuthContext((value) => {
      authContext = value;
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await act(async () => {
      await authContext?.loginWithGithub('github-code', 'oauth-state');
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users', 'me'] }));
  });

  it('returns to the stored protected route after GitHub login succeeds', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    window.sessionStorage.setItem('openml.postAuthRedirectPath', '/metadata?datasetId=abc#review');
    vi.mocked(publicClient.get).mockResolvedValue({
      data: {
        access_token: 'new-access-token',
        token_type: 'bearer',
      },
    });

    let authContext: AuthContextValue | undefined;
    const Capture = captureAuthContext((value) => {
      authContext = value;
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await act(async () => {
      await authContext?.loginWithGithub('github-code', 'oauth-state');
    });

    expect(mockNavigate).toHaveBeenCalledWith('/metadata?datasetId=abc#review', {
      replace: true,
    });
    expect(window.sessionStorage.getItem('openml.postAuthRedirectPath')).toBeNull();
  });

  it('throws a field-specific GitHub profile conflict message', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    vi.mocked(publicClient.get).mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'github_profile_conflict',
            message:
              'This GitHub account uses an email address that is already connected to another OpenML account.',
            field: 'email',
          },
        },
      },
    });

    let authContext: AuthContextValue | undefined;
    const Capture = captureAuthContext((value) => {
      authContext = value;
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    if (!authContext) {
      throw new Error('Auth context was not captured');
    }

    await expect(authContext.loginWithGithub('github-code', 'oauth-state')).rejects.toThrow(
      'This GitHub account uses an email address that is already connected to another OpenML account.',
    );
  });

  it.each([
    [
      'username',
      'This GitHub account uses a username that is already connected to another OpenML account.',
    ],
    ['github_id', 'This GitHub account is already connected to another OpenML account.'],
  ])('throws mapped GitHub profile conflict message for %s', async (field, expectedMessage) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    vi.mocked(publicClient.get).mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'github_profile_conflict',
            message: 'Unable to sync GitHub profile with local account',
            field,
          },
        },
      },
    });

    let authContext: AuthContextValue | undefined;
    const Capture = captureAuthContext((value) => {
      authContext = value;
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Capture />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    if (!authContext) {
      throw new Error('Auth context was not captured');
    }

    await expect(authContext.loginWithGithub('github-code', 'oauth-state')).rejects.toThrow(
      expectedMessage,
    );
  });
});
