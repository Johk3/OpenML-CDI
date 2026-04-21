import { useAuth } from '@/hooks/useAuth';
import { useMe } from '@/hooks/useUser';
import React, { ReactNode } from 'react';
import { UserContext } from '../contexts/UserContext';

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const { data: user, isLoading, isError } = useMe({ enabled: isAuthenticated });

  return (
    <UserContext.Provider value={{ user: user ?? null, isLoading, isError }}>
      {children}
    </UserContext.Provider>
  );
};
