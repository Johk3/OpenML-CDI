import { publicClient } from '@/lib/apiClient';
import { tokenManager } from '@/lib/tokenManager';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenResponse } from '@/types/auth';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '../contexts/AuthContext';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !tokenManager.isTokenExpired(),
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useCallback(() => {
    tokenManager.clearToken();
    setIsAuthenticated(false);
    queryClient.removeQueries({ queryKey: ['users', 'me'] });
    navigate('/login');
  }, [navigate, queryClient]);

  const login = useCallback(
    (token: string) => {
      tokenManager.setToken(token);
      setIsAuthenticated(true);
      navigate('/datasets', { replace: true });
    },
    [navigate],
  );

  const loginWithGithub = useCallback(
    async (code: string, state: string) => {
      const { data } = await publicClient.get<TokenResponse>('/auth/github/callback', {
        params: {
          code,
          state,
        },
      });
      login(data.access_token);
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
