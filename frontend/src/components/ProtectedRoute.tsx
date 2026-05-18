import { useAuth } from '@/hooks/useAuth';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_NOTICE_QUERY_VALUES } from '@/lib/authMessages';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?notice=${AUTH_NOTICE_QUERY_VALUES.signInRequired}`}
        state={{ from: location }}
        replace
      />
    );
  }

  return <>{children}</>;
};
