import { screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderWithRouter } from '../utils';
import { MyDatasetsPage } from '@/pages/MyDatasetsPage';
import { mockDatasetService } from '../mocks/datasetService';

describe('MyDatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render authentication required message when user is not logged in', () => {
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: null,
      },
    });

    expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
    expect(screen.getByText(/please login to view datasets/i)).toBeInTheDocument();
  });

  it('should render standard user view when logged in as a regular user', async () => {
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: {
          id: 'test-user',
          first_name: 'Test',
          last_name: 'User',
          role: 'user',
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

    expect(
      await screen.findByRole('heading', { level: 3, name: /sample dataset/i }),
    ).toBeInTheDocument();

    expect(screen.queryByText(/expert mode active/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    expect(mockDatasetService.listDatasets).toHaveBeenCalledTimes(1);
  });

  it('should render expert user view with additional controls', async () => {
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
    expect(
      await screen.findByRole('heading', { level: 3, name: /sample dataset/i }),
    ).toBeInTheDocument();

    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    expect(downloadButtons.length).toBeGreaterThan(0);

    const statusTriggers = screen.getAllByRole('combobox');
    expect(statusTriggers.length).toBeGreaterThan(0);
  });

  it('should allow expert to download dataset', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
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

    const downloadBtn = await screen.findByRole('button', { name: /download/i });
    downloadBtn.click();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Mock downloading'));
    alertMock.mockRestore();
  });
});
