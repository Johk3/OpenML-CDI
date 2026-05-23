import { apiClient } from '@/lib/apiClient';
import { tokenManager } from '@/lib/tokenManager';
import MockAdapter from 'axios-mock-adapter';

vi.mock('@/lib/tokenManager', () => ({
  tokenManager: {
    ensureFreshToken: vi.fn(),
    clearToken: vi.fn(),
    triggerUnauthenticated: vi.fn(),
  },
}));

const mock = new MockAdapter(apiClient);

beforeEach(() => {
  mock.reset();
  vi.clearAllMocks();
});

describe('apiClient', () => {
  it('should not intercept requests for the /auth/refresh endpoint', async () => {
    mock.onPost('/auth/refresh').reply(200, { access_token: 'test-token' });

    const response = await apiClient.post('/auth/refresh');

    expect(tokenManager.ensureFreshToken).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ access_token: 'test-token' });
  });

  it('should intercept and attach Bearer tokens to requests', async () => {
    vi.mocked(tokenManager.ensureFreshToken).mockResolvedValue('test-access-token');
    mock.onGet('/endpoint').reply(200, {});

    const response = await apiClient.get('/endpoint');

    expect(response.config.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('should continue the request even if refresh fails', async () => {
    vi.mocked(tokenManager.ensureFreshToken).mockRejectedValue(new Error('test-error'));
    mock.onGet('/endpoint').reply(200, { test: 'test-data' });

    const response = apiClient.get('/endpoint');

    await expect(response).resolves.toBeDefined();
  });

  it('retries the request once on 401 with a new token', async () => {
    vi.mocked(tokenManager.ensureFreshToken).mockResolvedValue('token');
    mock.onGet('/protected').replyOnce(401).onGet('/protected').reply(200, { data: 'ok' });

    const response = await apiClient.get('/protected');

    expect(response.data).toEqual({ data: 'ok' });
    expect(tokenManager.ensureFreshToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry 401 on /auth/refresh (avoids infinite loop)', async () => {
    mock.onPost('/auth/refresh').reply(401);

    await expect(apiClient.post('/auth/refresh')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(tokenManager.clearToken).not.toHaveBeenCalled();
  });

  it('clears token and triggers unauthenticated if retry also fails', async () => {
    vi.mocked(tokenManager.ensureFreshToken)
      .mockResolvedValueOnce('old-token')
      .mockRejectedValueOnce(new Error('refresh failed'));
    mock.onGet('/protected').reply(401);

    await expect(apiClient.get('/protected')).rejects.toBeDefined();

    expect(tokenManager.clearToken).toHaveBeenCalled();
    expect(tokenManager.triggerUnauthenticated).toHaveBeenCalled();
  });
});
