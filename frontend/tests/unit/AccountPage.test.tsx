import { AccountPage } from '@/pages/AccountPage';
import { UserService } from '@/services/userService';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '../utils';
import { useAuth } from '@/hooks/useAuth';
import { AuthContextValue } from '@/contexts/AuthContext';

vi.mock('@/services/userService', () => ({
  UserService: {
    getMe: vi.fn(),
    deleteAccount: vi.fn(),
  },
}));

const mockedDeleteAccount = vi.mocked(UserService.deleteAccount);

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeleteAccount.mockResolvedValue({ status_code: 200, message: 'User deleted' });
  });

  it('renders read-only account details and no edit button', () => {
    renderWithRouter(<AccountPage />);

    expect(screen.getByText(/^Profile details$/i)).toBeInTheDocument();
    expect(screen.getByText(/test@test.com/i)).toBeInTheDocument();
    expect(screen.getByText(/^User$/)).toBeInTheDocument();
    expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('renders expert role with display capitalization', () => {
    renderWithRouter(<AccountPage />, {
      userContext: {
        user: {
          id: 'expert-user',
          first_name: 'Expert',
          last_name: 'Reviewer',
          role: 'expert',
          email: 'expert@test.com',
          username: 'expertuser',
          datasets: [],
          created_at: 'a',
        },
      },
    });

    expect(screen.getByText(/^Expert$/)).toBeInTheDocument();
    expect(screen.queryByText(/^expert$/)).not.toBeInTheDocument();
  });

  it('does not call delete endpoint when the in-app confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = screen.getByRole('dialog', { name: /delete account/i });
    expect(dialog).toHaveTextContent(/this action cannot be undone/i);

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(mockedDeleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /delete account/i })).not.toBeInTheDocument();
  });

  it('deletes account and logs out when the in-app confirmation is accepted', async () => {
    const user = userEvent.setup();
    const logout = vi.fn() as () => void;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(useAuth).mockReturnValue({ logout } as AuthContextValue);

    renderWithRouter(<AccountPage />, {
      authContext: { logout },
    });

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = screen.getByRole('dialog', { name: /delete account/i });
    await user.click(within(dialog).getByRole('button', { name: /delete account/i }));

    await waitFor(() => {
      expect(mockedDeleteAccount).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error feedback when account deletion fails', async () => {
    const user = userEvent.setup();
    mockedDeleteAccount.mockRejectedValue(new Error('Delete failed'));
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = screen.getByRole('dialog', { name: /delete account/i });
    await user.click(within(dialog).getByRole('button', { name: /delete account/i }));

    expect(await screen.findByText(/delete failed/i)).toBeInTheDocument();
  });
});
