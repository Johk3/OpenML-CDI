import { UserContext, UserContextValue } from '@/contexts/UserContext';
import { useContext } from 'react';

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUserContext must be used inside <UserProvider>');
  return ctx;
}
