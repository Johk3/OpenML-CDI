import { createContext } from 'react';

export interface AuthContextValue {
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (token: string) => void;
  loginWithGithub: (code: string, state: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
