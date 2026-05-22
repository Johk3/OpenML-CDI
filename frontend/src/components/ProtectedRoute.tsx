import { useAuth } from '@/hooks/useAuth';
import { useUserContext } from '@/hooks/useUserContext';
import { AlertCircle, Loader2 } from 'lucide-react';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_NOTICE_QUERY_VALUES } from '@/lib/authMessages';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isInitializing } = useAuth();
  const { user, isLoading: userLoading, isError: userError } = useUserContext();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div
        className="container"
        style={{
          padding: '5rem 1.5rem',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Checking session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?notice=${AUTH_NOTICE_QUERY_VALUES.signInRequired}`}
        state={{ from: location }}
        replace
      />
    );
  }

  if (userLoading) {
    return (
      <div
        className="container"
        style={{
          padding: '5rem 1.5rem',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading your profile...
        </div>
      </div>
    );
  }

  if (userError || !user) {
    return (
      <div className="container py-20">
        <div className="max-w-xl rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Unable to load your profile</p>
              <p>Refresh the page or sign in again to continue.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
