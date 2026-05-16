import { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';
import { AuthProvider } from '@/providers/AuthProvider';
import { publicClient } from '@/lib/apiClient';
import { tokenManager } from '@/lib/tokenManager';

vi.mock('@/lib/apiClient', () => ({
  publicClient: {
    get: vi.fn(),
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
    vi.mocked(tokenManager.isTokenExpired).mockReturnValue(true);
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
