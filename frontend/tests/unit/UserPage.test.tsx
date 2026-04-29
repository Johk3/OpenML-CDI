import { screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderWithRouter } from '../utils';
import { UserPage } from '@/pages/UserPage';

const mockUseUserContext = vi.fn();
vi.mock('@/hooks/useUserContext', () => ({
  useUserContext: () => mockUseUserContext(),
}));

const MOCK_USER = {
  id: 'user-1',
  first_name: 'John',
  last_name: 'Doe',
  username: 'jdoe',
  email: 'john.doe@example.com',
  role: 'uploader',
  is_verified: true,
  created_at: new Date().toISOString(),
  datasets: [],
};

describe('UserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show a loading spinner while fetching', () => {
    mockUseUserContext.mockReturnValue({
      user: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithRouter(<UserPage />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show an errorcard when the API fails', () => {
    mockUseUserContext.mockReturnValue({
      user: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithRouter(<UserPage />);

    expect(screen.getByText(/error loading user information/i)).toBeInTheDocument();
  });

  it('should show "user not found" when there is no user and no error', () => {
    mockUseUserContext.mockReturnValue({
      user: null,
      isLoading: false,
      isError: false,
    });

    renderWithRouter(<UserPage />);

    expect(screen.getByText(/user information not found/i)).toBeInTheDocument();
  });

  it('should display the user full name and username when loaded', () => {
    mockUseUserContext.mockReturnValue({
      user: MOCK_USER,
      isLoading: false,
      isError: false,
    });

    renderWithRouter(<UserPage />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('@jdoe')).toBeInTheDocument();
  });

  it('should display the user email and role', () => {
    mockUseUserContext.mockReturnValue({
      user: MOCK_USER,
      isLoading: false,
      isError: false,
    });

    renderWithRouter(<UserPage />);

    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getAllByText(/uploader/i).length).toBeGreaterThan(0);
  });
});
