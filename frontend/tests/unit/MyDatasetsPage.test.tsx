import { screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { navigateTo, renderWithRouter } from '../utils';
import { MyDatasetsPage } from '@/pages/MyDatasetsPage';

const mockUseAuth = vi.fn();
vi.mock('../../src/context/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('MyDatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render authentication required message when user is not logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });
    navigateTo('/datasets');

    expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
    expect(screen.getByText(/please login to view datasets/i)).toBeInTheDocument();
  });

  it('should render standard user view when logged in as a regular user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Standard User', role: 'user' },
    });
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: {
          id: 'test-user',
          first_name: 'Test',
          last_name: 'User',
          role: 'uploader',
          email: 'test@test.com',
          username: 'testuser',
          datasets: ['dataset'],
          created_at: 'a',
          is_verified: true,
        },
      },
    });

    expect(screen.getByRole('heading', { name: /my datasets/i })).toBeInTheDocument();
    expect(screen.getByText(/view and manage the datasets you have uploaded/i)).toBeInTheDocument();

    expect(screen.queryByText(/expert mode active/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();

    const datasetTitles = screen.getAllByRole('heading', { level: 3 });
    expect(datasetTitles.length).toBeGreaterThan(0);
  });

  it('should render expert user view with additional controls', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'expert-1', name: 'Expert User', role: 'expert' },
    });
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: {
          id: 'test-user',
          first_name: 'Test',
          last_name: 'User',
          role: 'expert',
          email: 'test@test.com',
          username: 'testuser',
          datasets: ['dataset'],
          created_at: 'a',
          is_verified: true,
        },
      },
    });

    expect(screen.getByRole('heading', { name: /all user datasets/i })).toBeInTheDocument();
    expect(screen.getByText(/expert mode active/i)).toBeInTheDocument();

    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    expect(downloadButtons.length).toBeGreaterThan(0);

    const statusTriggers = screen.getAllByRole('combobox');
    expect(statusTriggers.length).toBeGreaterThan(0);
  });

  it('should allow expert to change dataset status', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockUseAuth.mockReturnValue({
      user: { id: 'expert-1', name: 'Expert User', role: 'expert' },
    });
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: {
          id: 'test-user',
          first_name: 'Test',
          last_name: 'User',
          role: 'expert',
          email: 'test@test.com',
          username: 'testuser',
          datasets: ['dataset'],
          created_at: 'a',
          is_verified: true,
        },
      },
    });

    const firstDatasetTitle = screen.getAllByRole('heading', { level: 3 })[0];
    const card = firstDatasetTitle.closest('[data-slot="card"]');

    expect(card).toBeInTheDocument();

    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThan(0);

    const downloadBtn = within(card as HTMLElement).getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Mock downloading'));

    alertMock.mockRestore();
  });
});
