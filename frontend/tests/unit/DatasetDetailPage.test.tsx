import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { navigateTo } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import type { BackendDataset } from '@/types/dataset';
import { useUserContext } from '@/hooks/useUserContext';

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
  });

  it('should render the loading state first', async () => {
    navigateTo('/datasets/ds-1');
    expect(screen.getByText(/loading dataset details.../i)).toBeInTheDocument();
  });

  it('should render the dataset metadata section', async () => {
    navigateTo('/datasets/ds-1');

    // Wait for the main heading to appear, indicating load is complete.
    // there is a mock delay of 800ms however this should still work
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert structural sections are displayed without depending on specific text from data
    expect(screen.getByRole('heading', { name: /croissant metadata/i })).toBeInTheDocument();
    expect(screen.getByText(/Contributors/i)).toBeInTheDocument();
    expect(screen.getByText(/License & Info/i)).toBeInTheDocument();
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

  it('marks pending review downloads as not final approved', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(datasetWithLifecycle('pending_review'));
    navigateTo('/datasets/ds-pending-review-download');

    expect(
      await screen.findByText(/download is available for review; expert approval is pending/i),
    ).toBeInTheDocument();
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

  it('uses lifecycle GitHub state copy without exposing raw provider errors', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce(
      datasetWithLifecycle('integration_failed', {
        lifecycle: lifecycle('integration_failed', {
          github: {
            state: 'failed',
            issue_url: '',
            error_reason: 'permission_error',
            message:
              'GitHub discussion could not be created. Please ask an expert to check the GitHub integration settings.',
            retryable: false,
            attempts: 1,
          },
          download: { available: false },
        }),
      }),
    );

    navigateTo('/datasets/ds-integration-failed');

    expect(
      await screen.findByText(/please ask an expert to check the github integration settings/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/permission_error/i)).not.toBeInTheDocument();
  });

  it('should render error state for not found dataset', async () => {
    navigateTo('/datasets/ds-not-found');

    expect(
      await screen.findByRole('heading', { name: /error loading dataset/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/dataset not found/i)).toBeInTheDocument();
  });
});
