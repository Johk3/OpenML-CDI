import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { UserContext, type UserContextValue } from '@/contexts/UserContext';
import { useAuth } from '@/hooks/useAuth';
import { makeUser } from '../mocks/builders';

const renderProtectedRoute = (
  userContext: UserContextValue = {
    user: makeUser(),
    isLoading: false,
    isError: false,
  },
) =>
  render(
    <MemoryRouter>
      <UserContext.Provider value={userContext}>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </UserContext.Provider>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      loginWithGithub: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('waits for the authenticated user profile before rendering children', () => {
    renderProtectedRoute({
      user: null,
      isLoading: true,
      isError: false,
    });

    expect(screen.getByText(/loading your profile/i)).toBeInTheDocument();
    expect(screen.queryByText(/protected content/i)).not.toBeInTheDocument();
  });

  it('renders a terminal profile error when the authenticated user profile fails', () => {
    renderProtectedRoute({
      user: null,
      isLoading: false,
      isError: true,
    });

    expect(screen.getByText(/unable to load your profile/i)).toBeInTheDocument();
    expect(screen.getByText(/refresh the page or sign in again/i)).toBeInTheDocument();
    expect(screen.queryByText(/protected content/i)).not.toBeInTheDocument();
  });

  it('renders children after auth and profile checks pass', () => {
    renderProtectedRoute();

    expect(screen.getByText(/protected content/i)).toBeInTheDocument();
  });
});
