import type { User, DatasetLifecycleSummary } from '@/types/auth';
import type { UserContextValue } from '@/contexts/UserContext';
import type { BackendDataset } from '@/types/dataset';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user',
    first_name: 'Test',
    last_name: 'User',
    role: 'user',
    email: 'test@test.com',
    username: 'testuser',
    datasets: ['dataset'],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

type UserContextOverrides = Omit<Partial<UserContextValue>, 'user'> & {
  user?: Partial<User> | User | null;
};

export function makeUserContext(overrides: UserContextOverrides = {}): UserContextValue {
  const { user, ...contextOverrides } = overrides;

  return {
    user: user === null ? null : makeUser(user),
    isLoading: false,
    isError: false,
    ...contextOverrides,
  };
}

export function makeLifecycle(
  state = 'pending_review',
  overrides: Partial<DatasetLifecycleSummary> = {},
): DatasetLifecycleSummary {
  return {
    state,
    upload: {
      uploaded: state !== 'pending_upload',
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
  };
}

export function makeBackendDataset(overrides: Partial<BackendDataset> = {}): BackendDataset {
  const id = overrides.id ?? 'dataset-1';
  const status = overrides.status ?? 'pending';

  return {
    id,
    title: 'Sample Dataset',
    status,
    created_at: '2026-04-01T00:00:00Z',
    owner_id: 'test-user',
    issue_url: '',
    dataset_metadata: {
      description: 'Sample description',
      filenames: ['part-0001.parquet'],
      croissantMetadata: undefined,
      malware_scan: undefined,
    },
    ...overrides,
  };
}
