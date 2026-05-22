import { describe, expect, it } from 'vitest';
import { hasPendingDeletionRequest, requiresExpertDeletionApproval } from '@/lib/datasetDeletion';

describe('datasetDeletion helpers', () => {
  it('requires expert approval for approved and published datasets', () => {
    expect(requiresExpertDeletionApproval('approved')).toBe(true);
    expect(requiresExpertDeletionApproval('published')).toBe(true);
    expect(requiresExpertDeletionApproval('converted')).toBe(true);
    expect(requiresExpertDeletionApproval('pending')).toBe(false);
  });

  it('detects pending deletion requests in metadata', () => {
    expect(
      hasPendingDeletionRequest({
        deletion_request: { status: 'pending_expert_approval' },
      }),
    ).toBe(true);
    expect(hasPendingDeletionRequest({ deletion_request: { status: 'deleted' } })).toBe(false);
    expect(hasPendingDeletionRequest(undefined)).toBe(false);
  });
});
