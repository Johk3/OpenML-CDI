import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubCallbackPage } from '@/pages/GitHubCallbackPage';
import { mockNavigate, renderWithRouter } from '../utils';
import { useAuth } from '@/hooks/useAuth';
import { AuthContextValue } from '@/contexts/AuthContext';

describe('GitHubCallbackPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('passes the GitHub callback code and state to auth on success', async () => {
    const loginWithGithub = vi.fn().mockResolvedValue(undefined) as (
      code: string,
      state: string,
    ) => Promise<void>;
    vi.mocked(useAuth).mockReturnValue({ loginWithGithub } as AuthContextValue);

    renderWithRouter(<GitHubCallbackPage />, {
      initialRoute: '/login/callback?code=github-code&state=oauth-state',
      authContext: { loginWithGithub },
    });

    await waitFor(() => {
      expect(loginWithGithub).toHaveBeenCalledWith('github-code', 'oauth-state');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('routes back to login with a known user-facing GitHub callback error', async () => {
    const loginWithGithub = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'This GitHub account uses an email address that is already connected to another OpenML account.',
        ),
      ) as (code: string, state: string) => Promise<void>;
    vi.mocked(useAuth).mockReturnValue({ loginWithGithub } as AuthContextValue);

    renderWithRouter(<GitHubCallbackPage />, {
      initialRoute: '/login/callback?code=github-code&state=oauth-state',
      authContext: { loginWithGithub },
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/login?error=This%20GitHub%20account%20uses%20an%20email%20address%20that%20is%20already%20connected%20to%20another%20OpenML%20account.',
        { replace: true },
      ),
    );
  });

  it('sanitizes raw GitHub callback errors before routing back to login', async () => {
    const loginWithGithub = vi
      .fn()
      .mockRejectedValue(new Error('Provider stack trace: secret-token')) as (
      code: string,
      state: string,
    ) => Promise<void>;
    vi.mocked(useAuth).mockReturnValue({ loginWithGithub } as AuthContextValue);

    renderWithRouter(<GitHubCallbackPage />, {
      initialRoute: '/login/callback?code=github-code&state=oauth-state',
      authContext: { loginWithGithub },
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/login?error=Authentication%20failed.%20Please%20try%20again.',
        { replace: true },
      ),
    );
  });
});
