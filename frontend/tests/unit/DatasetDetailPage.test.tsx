import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { navigateTo } from '../utils';
import { BackendDataset } from '@/types/dataset';

vi.mock('@/hooks/useUserContext', () => ({
  useUserContext: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test User', role: 'expert' },
    isLoading: false,
    isError: false,
  })),
}));

describe('DatasetDetailPage', () => {
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

  it('should render warning when malware scan is missing', async () => {
    const { mockDatasetService } = await import('../mocks/datasetService');
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'ds-no-scan',
      title: 'No Scan Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      dataset_metadata: {
        description: 'Dataset without scan info',
        filenames: ['file.csv'],
      },
    } as unknown as BackendDataset);

    navigateTo('/datasets/ds-no-scan');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert Malware Scan Unavailable warning
    expect(screen.getByText(/malware scan unavailable/i)).toBeInTheDocument();
  });

  it('should render error state for not found dataset', async () => {
    navigateTo('/datasets/ds-not-found');

    expect(
      await screen.findByRole('heading', { name: /error loading dataset/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/dataset not found/i)).toBeInTheDocument();
  });
});
