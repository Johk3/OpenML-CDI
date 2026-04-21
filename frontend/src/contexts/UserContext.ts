import { User } from '@/types/auth';
import { createContext } from 'react';

export interface UserContextValue {
  user: User | null | undefined;
  isLoading: boolean;
  isError: boolean;
}

export const UserContext = createContext<UserContextValue | null>(null);
