import { AccountPage } from '@/pages/AccountPage';
import { UserService } from '@/services/userService';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '../utils';

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
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('does not call delete endpoint when deletion is not confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));

    expect(mockedDeleteAccount).not.toHaveBeenCalled();
  });

  it('deletes account and logs out when deletion is confirmed', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithRouter(<AccountPage />, {
      authContext: { logout },
    });

    await user.click(screen.getByRole('button', { name: /delete account/i }));

    await waitFor(() => {
      expect(mockedDeleteAccount).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error feedback when account deletion fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedDeleteAccount.mockRejectedValue(new Error('Delete failed'));
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));

    expect(await screen.findByText(/delete failed/i)).toBeInTheDocument();
  });
});
