import { TokenResponse } from '@/types/auth';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenManager } from './tokenManager';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});
export const publicClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

async function callRefreshEndpoint(): Promise<string> {
  const response = await axios.post<TokenResponse>(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return response.data.access_token;
}
// Interceptor for checking access_token validity
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.url?.endsWith('/auth/refresh')) return config;
  if (
    (
      config as InternalAxiosRequestConfig & {
        _retried?: boolean;
      }
    )?._retried
  )
    return config; // if the 401 interceptor already attached.

  try {
    const token = await tokenManager.ensureFreshToken(callRefreshEndpoint);
    config.headers.Authorization = `Bearer ${token}`;
  } catch {
    console.warn('Failed to refresh token before request');
  }
  return config;
});

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
      !originalConfig.url?.endsWith('/auth/refresh')
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
