import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/apiClient';
import { UserService } from '@/services/userService';
import { makeUser } from '../mocks/builders';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient);

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the authenticated user from /auth/me', async () => {
    const user = makeUser({ email: 'ada@example.com' });
    mockedApiClient.get.mockResolvedValue({ data: user });

    await expect(UserService.getMe()).resolves.toBe(user);

    expect(mockedApiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  it('deletes the current account through the user endpoint', async () => {
    const response = { status_code: 200, message: 'deleted' };
    mockedApiClient.post.mockResolvedValue({ data: response });

    await expect(UserService.deleteAccount()).resolves.toBe(response);

    expect(mockedApiClient.post).toHaveBeenCalledWith('/user/delete');
  });
});
