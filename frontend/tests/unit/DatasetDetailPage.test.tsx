import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { mockNavigate, navigateTo } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import type { BackendDataset } from '@/types/dataset';
import { useUserContext } from '@/hooks/useUserContext';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/hooks/useUserContext', () => ({
  useUserContext: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test User', role: 'expert' },
    isLoading: false,
    isError: false,
  })),
}));

const mockUseUserContext = vi.mocked(useUserContext);

const setUserRole = (role: 'expert' | 'user') => {
  mockUseUserContext.mockReturnValue({
    user: {
      id: 'test-user',
      email: 'test@example.com',
      username: 'test-user',
      first_name: 'Test',
      last_name: 'User',
      role,
      created_at: '2026-04-01T00:00:00Z',
      datasets: [],
    },
    isLoading: false,
    isError: false,
  });
};

const lifecycle = (
  state: string,
  overrides: Partial<NonNullable<BackendDataset['lifecycle']>> = {},
): NonNullable<BackendDataset['lifecycle']> => ({
  state,
  upload: {
    uploaded: !['pending_upload'].includes(state),
    scanning: state === 'scanning',
    quarantined: state === 'quarantined',
  },
  review: {
    ready: state === 'pending_review',
    approved: ['approved', 'published'].includes(state),
    rejected: state === 'rejected',
    published: state === 'published',
  },
  download: {
    available: ['approved', 'published', 'pending_review'].includes(state),
    review_only: state === 'pending_review',
    final_approved: ['approved', 'published'].includes(state),
    message:
      state === 'pending_review'
        ? 'Download is available for review; expert approval is pending.'
        : ['approved', 'published'].includes(state)
          ? 'Download is available from the expert-approved dataset.'
          : 'Dataset files are not ready for download.',
  },
  github: {
    state: state === 'pending_review' ? 'pending' : 'not_ready',
    issue_url: '',
    error_reason: null,
    message:
      state === 'pending_review'
        ? 'GitHub discussion creation is pending.'
        : 'GitHub discussion will be created after upload review is ready.',
    retryable: false,
    attempts: 0,
  },
  ...overrides,
});

const datasetWithLifecycle = (
  state: string,
  overrides: Partial<BackendDataset> = {},
): BackendDataset =>
  ({
    id: `ds-${state}`,
    title: `${state} Dataset`,
    status: state,
    created_at: '2026-04-01T00:00:00Z',
    owner_id: 'test-user',
    issue_url: '',
    dataset_metadata: {
      description: `${state} dataset description`,
      filenames: ['file.csv'],
      malware_scan: {
        engine: 'clamav',
        files: [{ file: 'file.csv', status: state === 'quarantined' ? 'infected' : 'clean' }],
      },
    },
    lifecycle: lifecycle(state),
    ...overrides,
  }) as BackendDataset;

describe('DatasetDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserRole('expert');
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      loginWithGithub: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('should render the loading state first', async () => {
    navigateTo('/datasets/ds-1');
    expect(screen.getByText(/loading dataset details.../i)).toBeInTheDocument();
  });

  it('should render a profile error when the user profile fails to load', () => {
    mockUseUserContext.mockReturnValue({
      user: null,
      isLoading: false,
      isError: true,
    });

    navigateTo('/datasets/ds-1');

    expect(screen.getByText(/unable to load your profile/i)).toBeInTheDocument();
    expect(screen.getByText(/refresh the page or sign in again/i)).toBeInTheDocument();
    expect(screen.queryByText(/authentication required/i)).not.toBeInTheDocument();
  });

  it('should render the dataset metadata section', async () => {
    navigateTo('/datasets/ds-1');

    // Wait for the main heading to appear, indicating load is complete.
    // there is a mock delay of 800ms however this should still work
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert structural sections are displayed without depending on specific text from data
    expect(screen.getByRole('heading', { name: /croissant metadata/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /croissant title/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /croissant description/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Contributors/i)).toBeInTheDocument();
    expect(screen.getByText(/License & Info/i)).toBeInTheDocument();
  });

  it('does not render Croissant title or description values in the metadata section', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'ds-croissant-title',
      title: 'Visible Dataset Title',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      owner_id: 'test-user',
      issue_url: '',
      dataset_metadata: {
        description: 'Visible dataset description',
        croissantMetadata: {
          title: 'Hidden Croissant Title Value',
          description: 'Visible Croissant Description',
          license: 'CC-BY-4.0',
          contributors: ['OpenML Team'],
          variables: [],
        },
        filenames: ['part-0001.parquet'],
        malware_scan: {
          engine: 'clamav',
          files: [{ file: 'part-0001.parquet', status: 'clean' }],
        },
      },
    } as unknown as Awaited<ReturnType<typeof mockDatasetService.getDataset>>);

    navigateTo('/datasets/ds-croissant-title');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visible Dataset Title' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hidden Croissant Title Value')).not.toBeInTheDocument();
    expect(screen.queryByText('Visible Croissant Description')).not.toBeInTheDocument();
  });

  it('does not render a Croissant URL link when it points to the current dataset page', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'ds-self-url',
      title: 'Visible Dataset Title',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      owner_id: 'test-user',
      issue_url: '',
      dataset_metadata: {
        description: 'Visible dataset description',
        croissantMetadata: {
          title: 'Hidden Croissant Title Value',
          description: 'Hidden Croissant Description',
          license: 'CC-BY-4.0',
          contributors: ['OpenML Team'],
          variables: [],
          url: `${window.location.origin}/datasets/ds-self-url`,
        },
        filenames: ['part-0001.parquet'],
        malware_scan: {
          engine: 'clamav',
          files: [{ file: 'part-0001.parquet', status: 'clean' }],
        },
      },
    } as unknown as Awaited<ReturnType<typeof mockDatasetService.getDataset>>);

    navigateTo('/datasets/ds-self-url');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visible Dataset Title' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /link/i })).not.toBeInTheDocument();
  });

  it('renders an external Croissant URL link', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'ds-external-url',
      title: 'Visible Dataset Title',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      owner_id: 'test-user',
      issue_url: '',
      dataset_metadata: {
        description: 'Visible dataset description',
        croissantMetadata: {
          title: 'Hidden Croissant Title Value',
          description: 'Hidden Croissant Description',
          license: 'CC-BY-4.0',
          contributors: ['OpenML Team'],
          variables: [],
          url: 'https://example.org/source-dataset',
        },
        filenames: ['part-0001.parquet'],
        malware_scan: {
          engine: 'clamav',
          files: [{ file: 'part-0001.parquet', status: 'clean' }],
        },
      },
    } as unknown as Awaited<ReturnType<typeof mockDatasetService.getDataset>>);

    navigateTo('/datasets/ds-external-url');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visible Dataset Title' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /link/i })).toHaveAttribute(
      'href',
      'https://example.org/source-dataset',
    );
  });

  it('should render the variables section', async () => {
    navigateTo('/datasets/ds-1');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert Variables section exists
    expect(screen.getByRole('heading', { name: /variables/i })).toBeInTheDocument();

    // Check that structural table headers exist
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /type/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /description/i })).toBeInTheDocument();
  });

  it('renders original folder paths from upload package metadata', async () => {
    const folderDataset = {
      id: 'ds-folder',
      title: 'Folder Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      dataset_metadata: {
        description: 'Folder dataset description',
        croissantMetadata: {
          title: 'Folder Dataset',
          description: 'Folder dataset description',
          license: 'CC-BY-4.0',
          contributors: ['OpenML Team'],
          variables: [],
        },
        filenames: ['Folder_Dataset_files.zip'],
      },
      upload_package: {
        compressed: true,
        representation: 'zip',
        root: 'dataset',
        paths: ['dataset/train/one.csv', 'dataset/test/two.csv'],
        archive_path: 'Folder_Dataset_files.zip',
        manifest: {
          version: 1,
          path_count: 2,
          source: 'browser-selection',
        },
      },
    };
    mockDatasetService.getDataset.mockResolvedValueOnce(
      folderDataset as unknown as Awaited<ReturnType<typeof mockDatasetService.getDataset>>,
    );

    navigateTo('/datasets/ds-folder');

    expect(await screen.findByText('dataset/train/one.csv')).toBeInTheDocument();
    expect(screen.getByText('dataset/test/two.csv')).toBeInTheDocument();
    expect(screen.getByText(/ZIP package/i)).toBeInTheDocument();
  });

  it('should render the comments section and malware scan', async () => {
    navigateTo('/datasets/ds-1');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert GitHub Discussion section is displayed
    expect(screen.getByText(/github discussion/i)).toBeInTheDocument();

    // Check for mock comments
    expect(await screen.findByText(/looks good!/i)).toBeInTheDocument();
    expect(screen.getByText(/github-actions/i)).toBeInTheDocument();

    // Check for author association badge
    expect(screen.getByText(/member/i)).toBeInTheDocument();

    // Assert Malware Scan section is displayed
    expect(screen.getByText(/clamav malware scan/i)).toBeInTheDocument();
    expect(screen.getByText(/CLEAN/)).toBeInTheDocument();
  });

  it('should render GitHub issue creation failure status', async () => {
    mockDatasetService.getGitHubDiscussion.mockResolvedValueOnce({
      state: 'failed',
      html_url: '',
      message:
        'GitHub discussion could not be created because the GitHub App does not have permission.',
      error_reason: 'permission_error',
      retryable: false,
      comments: [],
    });

    navigateTo('/datasets/ds-1');

    expect(await screen.findByText(/github discussion could not be created/i)).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/view on github/i)).not.toBeInTheDocument();
  });

  it('should render GitHub discussion fetch failures', async () => {
    mockDatasetService.getGitHubDiscussion.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'github_discussion_fetch_failed',
            message: 'GitHub discussion creation is temporarily unavailable.',
            reason: 'transient_error',
            retryable: true,
          },
        },
      },
    });

    navigateTo('/datasets/ds-1');

    expect(
      await screen.findByText(/github discussion creation is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Unavailable$/i).length).toBeGreaterThan(0);
  });

  it('should render warning when malware scan is missing', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'ds-no-scan',
      title: 'No Scan Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      owner_id: 'test-user',
      issue_url: '',
      dataset_metadata: {
        description: 'Dataset without scan info',
        filenames: ['file.csv'],
      },
      lifecycle: lifecycle('pending_upload', {
        download: { available: false },
      }),
    } as unknown as BackendDataset);

    navigateTo('/datasets/ds-no-scan');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert Malware Scan Unavailable warning
    expect(screen.getByText(/malware scan unavailable/i)).toBeInTheDocument();
  });

  it.each([
    ['pending_upload', /waiting for upload verification/i, /upload verification/i],
    ['scanning', /malware scan in progress/i, /scan/i],
    ['pending_review', /ready for expert review/i, /review/i],
    ['approved', /approved/i, /review/i],
    ['rejected', /rejected/i, /review/i],
    ['quarantined', /quarantined/i, /scan/i],
    ['integration_failed', /blocked by integration failure/i, /github/i],
  ])('renders lifecycle state %s from backend fields', async (state, stateText, stageText) => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle(state));

    navigateTo(`/datasets/ds-${state}`);

    expect(await screen.findByRole('heading', { name: /dataset lifecycle/i })).toBeInTheDocument();
    expect(screen.getAllByText(stateText).length).toBeGreaterThan(0);
    expect(screen.getAllByText(stageText).length).toBeGreaterThan(0);
  });

  it('hides dataset download when lifecycle marks files unavailable', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(
      datasetWithLifecycle('scanning', {
        lifecycle: lifecycle('scanning', {
          download: { available: false },
        }),
      }),
    );

    navigateTo('/datasets/ds-scanning');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download dataset/i })).not.toBeInTheDocument();
    expect(screen.getByText(/dataset files are not ready for download/i)).toBeInTheDocument();
  });

  it('shows expert action copy when review is ready', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review');

    expect(await screen.findByText(/approve or reject this dataset from the review queue/i));
  });

  it('levels review action buttons in one aligned row', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review');

    const reviewQueueButton = await screen.findByRole('button', { name: /open review queue/i });
    const editButton = screen.getByRole('button', { name: /edit metadata/i });
    const actionRow = reviewQueueButton.parentElement;

    expect(actionRow).toBe(editButton.parentElement);
    expect(actionRow).toHaveClass('flex', 'items-center', 'gap-2');
    expect(reviewQueueButton).not.toHaveClass('mt-1');
    expect(editButton).not.toHaveClass('mt-1');
  });

  it('lets experts open the metadata editor from reviewable dataset details', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review');

    const editButton = await screen.findByRole('button', { name: /edit metadata/i });
    fireEvent.click(editButton);

    expect(mockNavigate).toHaveBeenCalledWith('/metadata', {
      state: {
        datasetId: 'ds-pending_review',
        returnTo: '/datasets/ds-pending_review',
      },
    });
  });

  it('lets experts edit metadata after approval before publication', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('approved'));
    navigateTo('/datasets/ds-approved-edit');

    expect(await screen.findByRole('button', { name: /edit metadata/i })).toBeInTheDocument();
  });

  it('hides metadata editing from non-expert users', async () => {
    setUserRole('user');
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review-uploader');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit metadata/i })).not.toBeInTheDocument();
  });

  it('does not show metadata editing after publication', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('published'));
    navigateTo('/datasets/ds-published');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit metadata/i })).not.toBeInTheDocument();
  });

  it('marks pending review downloads as not final approved', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review-download');

    expect(
      await screen.findByText(/download is available for review; expert approval is pending/i),
    ).toBeInTheDocument();
  });

  it('keeps lifecycle-available downloads reachable without file list metadata', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(
      datasetWithLifecycle('pending_review', {
        dataset_metadata: {
          description: 'No file list dataset',
        },
      }),
    );
    navigateTo('/datasets/ds-pending-review-no-files');

    expect(await screen.findByRole('button', { name: /download dataset/i })).toBeInTheDocument();
    expect(screen.getByText(/no file listing is available/i)).toBeInTheDocument();
  });

  it('shows a recoverable message when dataset download fails', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    mockDatasetService.downloadDataset.mockRejectedValueOnce(
      new Error('Dataset file is missing from storage'),
    );
    navigateTo('/datasets/ds-pending-review-download');

    const downloadButton = await screen.findByRole('button', { name: /download dataset/i });
    fireEvent.click(downloadButton);

    expect(await screen.findByText(/dataset file is missing from storage/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download dataset/i })).toBeEnabled();
  });

  it('shows uploader review copy without expert actions when review is ready', async () => {
    setUserRole('user');
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review-uploader');

    expect(await screen.findByText(/an expert can now review this dataset/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/approve or reject this dataset from the review queue/i),
    ).not.toBeInTheDocument();
  });

  it('lets experts publish approved datasets from the lifecycle panel', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('approved'));
    mockDatasetService.updateStatus.mockResolvedValueOnce({} as never);

    navigateTo('/datasets/ds-approved');

    const publishButton = await screen.findByRole('button', { name: /publish dataset/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(mockDatasetService.updateStatus).toHaveBeenCalledWith('ds-approved', 'published');
    });
    expect(await screen.findByText(/the dataset is published and available/i)).toBeInTheDocument();
  });

  it('does not render a duplicate lifecycle GitHub integration panel', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(
      datasetWithLifecycle('pending_review', {
        lifecycle: lifecycle('pending_review', {
          github: {
            state: 'linked',
            issue_url: 'https://github.com/openml/openmlupload-test/issues/1',
            error_reason: null,
            message: 'GitHub discussion linked.',
            retryable: false,
            attempts: 1,
          },
        }),
      }),
    );

    navigateTo('/datasets/ds-pending-review');

    expect(await screen.findByText(/github discussion/i)).toBeInTheDocument();
    expect(screen.queryByText(/^github integration$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/github integration linked/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /view on github/i })).toHaveLength(1);
  });

  it('should render error state for not found dataset', async () => {
    navigateTo('/datasets/ds-not-found');

    expect(
      await screen.findByRole('heading', { name: /error loading dataset/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/dataset not found/i)).toBeInTheDocument();
  });
});
