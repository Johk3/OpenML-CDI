import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { navigateTo } from '../utils';

vi.mock('../../src/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test User', role: 'expert' },
    login: vi.fn(),
    logout: vi.fn(),
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

  it('should render the comments section', async () => {
    navigateTo('/datasets/ds-1');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Assert Discussions section is displayed
    expect(screen.getByText(/discussions/i)).toBeInTheDocument();
  });

  it('should render error state for not found dataset', async () => {
    navigateTo('/datasets/ds-not-found');

    expect(
      await screen.findByRole('heading', { name: /error loading dataset/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/dataset not found/i)).toBeInTheDocument();
  });
});
