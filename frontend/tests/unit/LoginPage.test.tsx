import { screen } from '@testing-library/react';
import { LoginPage } from '@/pages/LoginPage';
import { renderWithRouter } from '../utils';

describe('LoginPage', () => {
  it('renders the GitHub-only login screen', () => {
    renderWithRouter(<LoginPage />);

    expect(screen.getByRole('heading', { name: /welcome to openml cdi/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in with github to continue/i)).toBeInTheDocument();
    expect(screen.getByText(/login to your account/i)).toBeInTheDocument();
    expect(screen.getByText(/your session stays active/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue with github/i })).toBeInTheDocument();
  });

  it('uses a same-origin GitHub login URL when no API base URL is configured', () => {
    renderWithRouter(<LoginPage />);

    expect(screen.getByRole('link', { name: /continue with github/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/github/login'),
    );
  });

  it('shows the authentication error from the error query parameter', () => {
    renderWithRouter(<LoginPage />, {
      initialRoute: '/login?error=GitHub%20authentication%20was%20cancelled',
    });

    expect(screen.getByText('GitHub authentication was cancelled')).toBeInTheDocument();
  });

  it('sanitizes unknown authentication errors from the error query parameter', () => {
    renderWithRouter(<LoginPage />, {
      initialRoute: '/login?error=Provider%20stack%20trace%3A%20secret-token',
    });

    expect(screen.getByText('Authentication failed. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/secret-token/i)).not.toBeInTheDocument();
  });

  it('shows a sign-in notice from the notice query parameter', () => {
    renderWithRouter(<LoginPage />, {
      initialRoute: '/login?notice=sign-in-required',
    });

    expect(screen.getByText('Please sign in to continue.')).toBeInTheDocument();
  });

  it('does not render email, password, or registration fields', () => {
    renderWithRouter(<LoginPage />);

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
  });
});
