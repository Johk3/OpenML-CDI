import type { DatasetStatus } from '@/types/auth';

const PROTECTED_DELETION_STATUSES = new Set<DatasetStatus>(['approved', 'published', 'converted']);

export function requiresExpertDeletionApproval(status: DatasetStatus): boolean {
  return PROTECTED_DELETION_STATUSES.has(status);
}

export function hasPendingDeletionRequest(metadata: Record<string, unknown> | undefined): boolean {
  const request = metadata?.deletion_request;
  if (!request || typeof request !== 'object') {
    return false;
  }

  return (request as { status?: unknown }).status === 'pending_expert_approval';
}
