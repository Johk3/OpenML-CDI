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

  it('calls updateStatus when reject button is clicked', async () => {
    setupExpertUser();
    vi.mocked(DatasetService.updateStatus).mockResolvedValue({} as never);
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Review Ready Dataset');

    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(DatasetService.updateStatus).toHaveBeenCalledWith('ds-1', 'rejected');
    });
  });

  it('allows experts to reopen rejected datasets from the rejected filter', async () => {
    vi.mocked(DatasetService.listDatasets).mockResolvedValue([
      {
        id: 'ds-rejected',
        title: 'Rejected Dataset',
        status: 'rejected',
        dataset_metadata: {
          description: 'Rejected dataset',
          objects: [
            {
              upload_state: 'promoted',
              scan_state: 'clean',
              download_state: 'downloadable',
              final_object_key: 'datasets/rejected/clean.csv',
            },
          ],
        },
      } as unknown as BackendDataset,
    ]);
    vi.mocked(DatasetService.updateStatus).mockResolvedValue({} as never);
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Expert Review Queue');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Rejected' }));

    expect(await screen.findByText('Rejected Dataset')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reopen review/i }));

    await waitFor(() => {
      expect(DatasetService.updateStatus).toHaveBeenCalledWith('ds-rejected', 'pending_review');
    });
  });

  it('does not offer reopen for rejected datasets that are not review-ready', async () => {
    vi.mocked(DatasetService.listDatasets).mockResolvedValue([
      {
        id: 'ds-rejected',
        title: 'Rejected Dataset',
        status: 'rejected',
        dataset_metadata: {
          description: 'Rejected dataset',
          objects: [
            {
              scan_state: 'clean',
              download_state: 'unavailable',
              final_object_key: null,
            },
          ],
        },
      } as unknown as BackendDataset,
    ]);
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Expert Review Queue');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Rejected' }));

    expect(await screen.findByText('Rejected Dataset')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reopen review/i })).not.toBeInTheDocument();
  });

  it('keeps the queue visible when a status update fails', async () => {
    vi.mocked(DatasetService.listDatasets).mockResolvedValue([
      {
        id: 'ds-rejected',
        title: 'Rejected Dataset',
        status: 'rejected',
        dataset_metadata: {
          description: 'Rejected dataset',
          objects: [
            {
              upload_state: 'promoted',
              scan_state: 'clean',
              download_state: 'downloadable',
              final_object_key: 'datasets/rejected/clean.csv',
            },
          ],
        },
      } as unknown as BackendDataset,
    ]);
    vi.mocked(DatasetService.updateStatus).mockRejectedValueOnce(new Error('not ready'));
    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    await screen.findByText('Expert Review Queue');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Rejected' }));
    fireEvent.click(await screen.findByRole('button', { name: /reopen review/i }));

    expect(await screen.findByText('Rejected Dataset')).toBeInTheDocument();
    expect(screen.getByText('Failed to update dataset status.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reopen review/i })).toBeInTheDocument();
  });

  it('exposes GitHub integration state for experts in the review queue', async () => {
    vi.mocked(DatasetService.listDatasets).mockResolvedValue([
      {
        id: 'ds-linked',
        title: 'Linked Discussion Dataset',
        status: 'pending_review',
        created_at: '2026-04-01T00:00:00Z',
        issue_url: 'https://github.com/openml/openmlupload-test/issues/5',
        dataset_metadata: {
          description: 'Linked GitHub discussion.',
          github_issue: {
            status: 'linked',
            issue_url: 'https://github.com/openml/openmlupload-test/issues/5',
            message: 'GitHub discussion linked.',
            retryable: false,
            attempts: 1,
          },
        },
      } as unknown as BackendDataset,
      {
        id: 'ds-failed',
        title: 'Failed Discussion Dataset',
        status: 'pending_review',
        created_at: '2026-04-02T00:00:00Z',
        issue_url: '',
        dataset_metadata: {
          description: 'GitHub discussion failed.',
          github_issue: {
            status: 'failed',
            error_reason: 'permission_error',
            message:
              'GitHub discussion could not be created because the GitHub App does not have permission.',
            retryable: false,
            attempts: 1,
          },
        },
      } as unknown as BackendDataset,
    ]);

    renderWithRouter(<ExpertQueuePage />, { userContext: expertUserContext });

    expect(await screen.findByText('Linked Discussion Dataset')).toBeInTheDocument();
    expect(screen.getByText('GitHub linked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open github discussion/i })).toHaveAttribute(
      'href',
      'https://github.com/openml/openmlupload-test/issues/5',
    );
    expect(screen.getByText('Failed Discussion Dataset')).toBeInTheDocument();
    expect(screen.getByText('GitHub failed')).toBeInTheDocument();
    expect(screen.getByText(/GitHub discussion could not be created/i)).toBeInTheDocument();
    expect(screen.queryByText(/permission_error/i)).not.toBeInTheDocument();
  });
});
