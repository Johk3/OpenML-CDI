import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderWithRouter } from '../utils';
import { MyDatasetsPage } from '@/pages/MyDatasetsPage';
import { mockDatasetService } from '../mocks/datasetService';
import type { BackendDataset } from '@/types/dataset';

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

    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();

    const statusTriggers = screen.getAllByRole('combobox');
    expect(statusTriggers.length).toBeGreaterThan(0);
  });

  it('should hide expert download when lifecycle marks files unavailable', async () => {
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-scanning',
        title: 'Scanning Dataset',
        status: 'scanning',
        created_at: '2026-04-01T00:00:00Z',
        dataset_metadata: { description: 'Scanning dataset' },
        lifecycle: {
          state: 'scanning',
          upload: { uploaded: true, scanning: true, quarantined: false },
          review: { ready: false, approved: false, rejected: false, published: false },
          download: {
            available: false,
            message: 'Dataset files are not ready for download.',
          },
          github: {
            state: 'not_ready',
            issue_url: '',
          },
        },
      } as unknown as BackendDataset,
    ]);

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

    expect(
      await screen.findByRole('heading', { level: 3, name: /scanning dataset/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('should allow expert to download lifecycle-available dataset', async () => {
    const createObjectURL = vi.fn(() => 'blob:dataset-download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-ready',
        title: 'Ready Dataset',
        status: 'pending_review',
        created_at: '2026-04-01T00:00:00Z',
        dataset_metadata: { description: 'Ready dataset' },
        lifecycle: {
          state: 'pending_review',
          upload: { uploaded: true, scanning: false, quarantined: false },
          review: { ready: true, approved: false, rejected: false, published: false },
          download: {
            available: true,
            review_only: true,
            final_approved: false,
            message: 'Download is available for review; expert approval is pending.',
          },
          github: {
            state: 'pending',
            issue_url: '',
          },
        },
      } as unknown as BackendDataset,
    ]);

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
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockDatasetService.downloadDataset).toHaveBeenCalledWith('dataset-ready');
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dataset-download');
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });
});
