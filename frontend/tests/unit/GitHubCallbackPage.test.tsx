import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubCallbackPage } from '@/pages/GitHubCallbackPage';
import { mockNavigate, renderWithRouter } from '../utils';

describe('GitHubCallbackPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('routes back to login with the specific GitHub callback error', async () => {
    const loginWithGithub = vi
      .fn()
      .mockRejectedValue(new Error('This GitHub account uses an email address already in use.'));

    renderWithRouter(<GitHubCallbackPage />, {
      initialRoute: '/login/callback?code=github-code&state=oauth-state',
      authContext: { loginWithGithub },
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/login?error=This%20GitHub%20account%20uses%20an%20email%20address%20already%20in%20use.',
        { replace: true },
      ),
    );
  });
});
