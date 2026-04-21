import { TokenResponse } from '@/types/auth';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenManager } from './tokenManager';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});
export const publicClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

async function callRefreshEndpoint(): Promise<string> {
  // We use a plain axios request instead of the apiClient to avoid interceptor loops (i.e. we do not need to check auth with this request)
  const response = await axios.post<TokenResponse>(
    `${BASE_URL}/api/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return response.data.access_token;
}

// Interceptor for checking access_token validity
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (config.url?.includes('/auth/refresh')) return config;

    try {
      const token = await tokenManager.ensureFreshToken(callRefreshEndpoint);
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      console.warn('Failed to refresh token before request');
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Interceptor for 401 response
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalConfig._retried &&
      !originalConfig.url?.includes('/auth/refresh')
    ) {
      originalConfig._retried = true;

      try {
        const newToken = await tokenManager.ensureFreshToken(callRefreshEndpoint);
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalConfig);
      } catch {
        tokenManager.clearToken();
        tokenManager.triggerUnauthenticated();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
