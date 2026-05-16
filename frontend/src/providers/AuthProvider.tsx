import { publicClient } from '@/lib/apiClient';
import { tokenManager } from '@/lib/tokenManager';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenResponse } from '@/types/auth';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { meQueryKey } from '@/hooks/useUser';

const GITHUB_LOGIN_FALLBACK_ERROR = 'Authentication failed. Please try again.';

type ApiErrorBody = {
  code?: string;
  message?: string;
  field?: string;
};

type ApiErrorResponse = {
  error?: ApiErrorBody;
  detail?: ApiErrorBody | string;
};

const githubProfileConflictMessages: Record<string, string> = {
  email:
    'This GitHub account uses an email address that is already connected to another OpenML account.',
  username:
    'This GitHub account uses a username that is already connected to another OpenML account.',
  github_id: 'This GitHub account is already connected to another OpenML account.',
};

function getApiErrorBody(payload: ApiErrorResponse | undefined): ApiErrorBody | undefined {
  if (!payload) {
    return undefined;
  }
  if (payload.error) {
    return payload.error;
  }
  return typeof payload.detail === 'object' ? payload.detail : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getApiErrorResponse(error: unknown): ApiErrorResponse | undefined {
  if (isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data;
  }
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }
  return isRecord(error.response.data) ? (error.response.data as ApiErrorResponse) : undefined;
}

function getGitHubLoginErrorMessage(error: unknown): string {
  const payload = getApiErrorResponse(error);
  if (payload) {
    const errorBody = getApiErrorBody(payload);
    if (errorBody?.code === 'github_profile_conflict' && errorBody.field) {
      return (
        githubProfileConflictMessages[errorBody.field] ||
        errorBody.message ||
        GITHUB_LOGIN_FALLBACK_ERROR
      );
    }
    if (errorBody?.message) {
      return errorBody.message;
    }
    return GITHUB_LOGIN_FALLBACK_ERROR;
  }

  return error instanceof Error && error.message ? error.message : GITHUB_LOGIN_FALLBACK_ERROR;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !tokenManager.isTokenExpired(),
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useCallback(() => {
    tokenManager.clearToken();
    setIsAuthenticated(false);
    queryClient.removeQueries({ queryKey: meQueryKey });
    navigate('/login');
  }, [navigate, queryClient]);

  const login = useCallback(
    (token: string) => {
      tokenManager.setToken(token);
      setIsAuthenticated(true);
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      navigate('/datasets', { replace: true });
    },
    [navigate, queryClient],
  );

  const loginWithGithub = useCallback(
    async (code: string, state: string) => {
      try {
        const { data } = await publicClient.get<TokenResponse>('/auth/github/callback', {
          params: {
            code,
            state,
          },
        });
        login(data.access_token);
      } catch (error) {
        throw new Error(getGitHubLoginErrorMessage(error));
      }
    },
    [login],
  );

  useEffect(() => {
    tokenManager.registerUnauthenticatedHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, loginWithGithub, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
