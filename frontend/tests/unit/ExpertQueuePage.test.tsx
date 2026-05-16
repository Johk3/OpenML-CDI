import { screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ExpertQueuePage } from '../../src/pages/ExpertQueuePage';
import { DatasetService } from '../../src/services/datasetService';
import { renderWithRouter, mockNavigate } from '../utils';
import { BackendDataset } from '../../src/types/dataset';

describe('ExpertQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const expertUserContext = {
    user: {
      id: 'expert-1',
      email: 'expert@example.com',
      username: 'expert',
      first_name: 'Expert',
      last_name: 'One',
      role: 'expert' as const,
      is_verified: true,
      created_at: '2024-01-01',
      datasets: [],
    },
    isLoading: false,
    isError: false,
  };

  const setupExpertUser = () => {
    vi.mocked(DatasetService.listDatasets).mockResolvedValue([
      {
        id: 'ds-1',
        title: 'Review Ready Dataset',
        status: 'pending_review',
        dataset_metadata: { description: 'Test description 1' },
      } as unknown as BackendDataset,
      {
        id: 'ds-2',
        title: 'Quarantined Dataset',
        status: 'quarantined',
        dataset_metadata: { description: 'Test description 2' },
      } as unknown as BackendDataset,
    ]);
  };

  it('redirects to home if user is not an expert', async () => {
    renderWithRouter(<ExpertQueuePage />, {
      userContext: {
        user: { ...expertUserContext.user, role: 'user' },
        isLoading: false,
        isError: false,
      },
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('displays loading state initially for experts', () => {
    setupExpertUser();
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });
    expect(screen.getByText('Loading queue...')).toBeInTheDocument();
  });

  it('displays page title after loading', async () => {
    setupExpertUser();
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });
    await waitFor(() => {
      expect(screen.getByText('Expert Review Queue')).toBeInTheDocument();
    });
    expect(DatasetService.listDatasets).toHaveBeenCalledWith({ scope: 'review_queue' });
  });

  it('displays pending review dataset by default', async () => {
    setupExpertUser();
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });
    await waitFor(() => {
      expect(screen.getByText('Review Ready Dataset')).toBeInTheDocument();
    });
  });

  it('does not display quarantined dataset by default due to pending review filter', async () => {
    setupExpertUser();
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });
    await waitFor(() => {
      expect(screen.queryByText('Quarantined Dataset')).not.toBeInTheDocument();
    });
  });

  it('allows filtering by status and displays correctly', async () => {
    setupExpertUser();
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Review Ready Dataset');

    const searchInput = screen.getByPlaceholderText('Search datasets...');
    fireEvent.change(searchInput, { target: { value: 'Review Ready' } });

    await waitFor(() => {
      expect(screen.getByText('Review Ready Dataset')).toBeInTheDocument();
    });
  });

  it('calls updateStatus when approve button is clicked', async () => {
    setupExpertUser();
    vi.mocked(DatasetService.updateStatus).mockResolvedValue({} as never);
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Review Ready Dataset');

    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(DatasetService.updateStatus).toHaveBeenCalledWith('ds-1', 'approved');
    });
  });
});
