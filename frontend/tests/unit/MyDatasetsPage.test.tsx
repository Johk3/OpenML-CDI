import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderWithRouter } from '../utils';
import { MyDatasetsPage } from '@/pages/MyDatasetsPage';
import { mockDatasetService } from '../mocks/datasetService';
import { makeBackendDataset, makeUser } from '../mocks/builders';
import type { BackendDataset } from '@/types/dataset';

describe('MyDatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when the user profile is not yet available', () => {
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: null,
        isLoading: true,
      },
    });

    expect(screen.getByText(/loading your datasets.../i)).toBeInTheDocument();
  });

  it('should render a profile error when the user profile fails to load', () => {
    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: null,
        isLoading: false,
        isError: true,
      },
    });

    expect(screen.getByText(/unable to load your profile/i)).toBeInTheDocument();
    expect(screen.getByText(/refresh the page or sign in again/i)).toBeInTheDocument();
    expect(screen.queryByText(/authentication required/i)).not.toBeInTheDocument();
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

  it('does not delete a dataset when the in-app confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm');

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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /sample dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog', { name: /delete dataset/i });
    expect(dialog).toHaveTextContent(/this cannot be undone/i);
    expect(nativeConfirm).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(mockDatasetService.deleteDataset).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /delete dataset/i })).not.toBeInTheDocument();
    nativeConfirm.mockRestore();
  });

  it('deletes a dataset after the in-app confirmation is accepted', async () => {
    const user = userEvent.setup();

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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /sample dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog', { name: /delete dataset/i });
    await user.click(within(dialog).getByRole('button', { name: /delete dataset/i }));

    await waitFor(() => {
      expect(mockDatasetService.deleteDataset).toHaveBeenCalledWith('dataset-1');
    });
    expect(
      screen.queryByRole('heading', { level: 3, name: /sample dataset/i }),
    ).not.toBeInTheDocument();
  });

  it('requests expert approval when deleting an approved dataset', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      makeBackendDataset({
        id: 'approved-dataset',
        title: 'Approved Dataset',
        status: 'approved',
      }),
    ]);
    mockDatasetService.deleteDataset.mockResolvedValueOnce({
      status_code: 202,
      message: 'Dataset deletion requires expert approval',
    });
    mockDatasetService.getDataset.mockResolvedValueOnce(
      makeBackendDataset({
        id: 'approved-dataset',
        title: 'Approved Dataset',
        status: 'approved',
        dataset_metadata: {
          description: 'Approved dataset',
          deletion_request: {
            status: 'pending_expert_approval',
            reason: 'dataset_owner_requested',
          },
        },
      }),
    );

    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: makeUser(),
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /approved dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog', { name: /delete dataset/i });
    expect(within(dialog).getByText(/expert must approve/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /request deletion/i }));

    await waitFor(() => {
      expect(mockDatasetService.deleteDataset).toHaveBeenCalledWith('approved-dataset');
    });
    expect(await screen.findByText(/deletion request submitted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deletion pending/i })).toBeDisabled();
  });

  it('lets experts confirm a pending deletion request', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      makeBackendDataset({
        id: 'approved-dataset',
        title: 'Approved Dataset',
        status: 'approved',
        dataset_metadata: {
          description: 'Approved dataset',
          deletion_request: {
            status: 'pending_expert_approval',
            reason: 'dataset_owner_requested',
          },
        },
      }),
    ]);

    renderWithRouter(<MyDatasetsPage />, {
      userContext: {
        user: makeUser({ role: 'expert' }),
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /approved dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm deletion/i }));
    const dialog = screen.getByRole('dialog', { name: /delete dataset/i });
    await user.click(within(dialog).getByRole('button', { name: /confirm deletion/i }));

    await waitFor(() => {
      expect(mockDatasetService.deleteDataset).toHaveBeenCalledWith('approved-dataset');
    });
    expect(await screen.findByText(/dataset deleted permanently/i)).toBeInTheDocument();
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

  it('hides the stale download action after an expert rejects a dataset', async () => {
    const user = userEvent.setup();
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
        },
      },
    });

    expect(await screen.findByRole('button', { name: /download/i })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /pending expert review/i }));
    await user.click(screen.getByRole('option', { name: /rejected/i }));

    await waitFor(() => {
      expect(mockDatasetService.updateStatus).toHaveBeenCalledWith('dataset-ready', 'rejected');
    });
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('shows a recoverable message when expert dataset download fails', async () => {
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
    mockDatasetService.downloadDataset.mockRejectedValueOnce(
      new Error('Dataset file storage is unavailable'),
    );

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
        },
      },
    });

    const downloadBtn = await screen.findByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    expect(await screen.findByText(/dataset file storage is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
  });

  it('keeps the dataset card visible when an expert status update fails', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-published',
        title: 'Published Dataset',
        status: 'published',
        created_at: '2026-05-17T00:00:00Z',
        dataset_metadata: { description: 'Published dataset' },
      } as unknown as BackendDataset,
    ]);
    mockDatasetService.updateStatus.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Invalid dataset lifecycle transition: pending_review -> scanning',
        },
      },
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /published dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /processing error/i }));

    await waitFor(() => {
      expect(mockDatasetService.updateStatus).toHaveBeenCalledWith(
        'dataset-published',
        'integration_failed',
      );
    });

    expect(
      screen.getByRole('heading', { level: 3, name: /published dataset/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Invalid dataset lifecycle transition: pending_review -> scanning'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
  });

  it('uses canonical expert status values and shows selected status labels', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-review-ready',
        title: 'Review Ready Dataset',
        status: 'pending_review',
        created_at: '2026-05-17T00:00:00Z',
        dataset_metadata: { description: 'Ready for review' },
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /review ready dataset/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /pending expert review/i })).toHaveClass(
      'w-[210px]',
    );

    await user.click(screen.getByRole('combobox', { name: /pending expert review/i }));
    await user.click(screen.getByRole('option', { name: /ongoing processing/i }));

    await waitFor(() => {
      expect(mockDatasetService.updateStatus).toHaveBeenCalledWith(
        'dataset-review-ready',
        'scanning',
      );
    });
  });

  it('does not offer scanning for review-ready clean datasets', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-clean-review-ready',
        title: 'Clean Review Ready Dataset',
        status: 'pending_review',
        created_at: '2026-05-17T00:00:00Z',
        dataset_metadata: {
          description: 'Ready for review',
          malware_scan: {
            files: [{ file: 'data.csv', status: 'clean' }],
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /clean review ready dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /pending expert review/i }));

    expect(screen.queryByRole('option', { name: /ongoing processing/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /approved/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /rejected/i })).toBeInTheDocument();
  });

  it('allows experts to reopen rejected datasets for review', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-rejected',
        title: 'Rejected Dataset',
        status: 'rejected',
        created_at: '2026-05-18T00:00:00Z',
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
        lifecycle: {
          state: 'rejected',
          upload: { uploaded: true, scanning: false, quarantined: false },
          review: { ready: false, approved: false, rejected: true, published: false },
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /rejected dataset/i }),
    ).toBeInTheDocument();

    const statusControl = screen.getByRole('combobox', { name: /rejected/i });
    expect(statusControl).toBeEnabled();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();

    await user.click(statusControl);
    await user.click(screen.getByRole('option', { name: /pending expert review/i }));

    await waitFor(() => {
      expect(mockDatasetService.updateStatus).toHaveBeenCalledWith(
        'dataset-rejected',
        'pending_review',
      );
    });
    expect(await screen.findByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('does not reopen rejected datasets that are not review-ready', async () => {
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-rejected',
        title: 'Rejected Dataset',
        status: 'rejected',
        created_at: '2026-05-18T00:00:00Z',
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
        lifecycle: {
          state: 'rejected',
          upload: { uploaded: true, scanning: false, quarantined: false },
          review: { ready: false, approved: false, rejected: true, published: false },
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /rejected dataset/i }),
    ).toBeInTheDocument();

    const statusControl = screen.getByRole('combobox', { name: /rejected/i });
    expect(statusControl).toBeDisabled();
    expect(statusControl).toHaveTextContent('Rejected');
  });

  it('rolls back optimistic status changes when the backend rejects the transition', async () => {
    const user = userEvent.setup();
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-review-ready',
        title: 'Review Ready Dataset',
        status: 'pending_review',
        created_at: '2026-05-18T00:00:00Z',
        dataset_metadata: { description: 'Ready for review' },
        lifecycle: {
          state: 'pending_review',
          upload: { uploaded: true, scanning: false, quarantined: false },
          review: { ready: true, approved: false, rejected: false, published: false },
          download: {
            available: true,
            review_only: true,
            message: 'Download is available for review; expert approval is pending.',
          },
          github: {
            state: 'open',
            issue_url: 'https://github.com/openml/openmlupload-test/issues/1',
          },
        },
      } as unknown as BackendDataset,
    ]);
    mockDatasetService.updateStatus.mockRejectedValueOnce(new Error('invalid transition'));

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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /review ready dataset/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /pending expert review/i }));
    await user.click(screen.getByRole('option', { name: /ongoing processing/i }));

    expect(await screen.findByText('invalid transition')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /pending expert review/i })).toHaveTextContent(
      'Pending Expert Review',
    );
  });

  it('renders expert status text through the Radix select value slot', async () => {
    const { container } = renderWithRouter(<MyDatasetsPage />, {
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /sample dataset/i }),
    ).toBeInTheDocument();

    const statusControl = screen.getByRole('combobox', { name: /pending expert review/i });
    expect(statusControl.querySelector('[data-slot="select-value"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="select-value"]')).toHaveTextContent(
      'Pending Expert Review',
    );
  });

  it('keeps expert status controls outside the dataset detail link', async () => {
    mockDatasetService.listDatasets.mockResolvedValueOnce([
      {
        id: 'dataset-review-ready',
        title: 'Review Ready Dataset',
        status: 'pending_review',
        created_at: '2026-05-17T00:00:00Z',
        dataset_metadata: { description: 'Ready for review' },
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
        },
      },
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: /review ready dataset/i }),
    ).toBeInTheDocument();

    const statusControl = screen.getByRole('combobox', { name: /pending expert review/i });
    expect(statusControl.closest('a')).toBeNull();
  });
});
