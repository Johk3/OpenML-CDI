import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenManager } from '@/lib/tokenManager';
import { jwtDecode } from 'jwt-decode';

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

const mockedJwtDecode = vi.mocked(jwtDecode);

describe('tokenManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenManager.clearToken();
    tokenManager.registerUnauthenticatedHandler(() => undefined);
  });

  it('treats a missing token as expired', () => {
    expect(tokenManager.isTokenExpired()).toBe(true);
  });

  it('keeps a token valid when its expiry is outside the refresh buffer', () => {
    tokenManager.setToken('valid-token');
    mockedJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });

    expect(tokenManager.isTokenExpired()).toBe(false);
  });

  it('treats expired or unreadable tokens as expired', () => {
    tokenManager.setToken('expired-token');
    mockedJwtDecode.mockReturnValueOnce({ exp: Math.floor(Date.now() / 1000) - 1 });

    expect(tokenManager.isTokenExpired()).toBe(true);

    tokenManager.setToken('bad-token');
    mockedJwtDecode.mockImplementationOnce(() => {
      throw new Error('decode failed');
    });

    expect(tokenManager.isTokenExpired()).toBe(true);
  });

  it('returns the current token without refreshing when it is still valid', async () => {
    tokenManager.setToken('current-token');
    mockedJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 60 });
    const refresh = vi.fn();

    await expect(tokenManager.ensureFreshToken(refresh)).resolves.toBe('current-token');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shares an in-flight refresh and stores the new token', async () => {
    let resolveRefresh!: (token: string) => void;
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = tokenManager.ensureFreshToken(refresh);
    const second = tokenManager.ensureFreshToken(refresh);
    resolveRefresh('new-token');

    await expect(Promise.all([first, second])).resolves.toEqual(['new-token', 'new-token']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(tokenManager.getToken()).toBe('new-token');
  });

  it('clears tokens and calls the registered unauthenticated handler', () => {
    const handler = vi.fn();
    tokenManager.setToken('current-token');
    tokenManager.registerUnauthenticatedHandler(handler);

    tokenManager.clearToken();
    tokenManager.triggerUnauthenticated();

    expect(tokenManager.getToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
