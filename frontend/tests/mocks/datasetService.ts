import { vi } from 'vitest';

export const mockDatasetService = {
  requestUploadUrl: vi.fn().mockResolvedValue({
    id: 'test-dataset-id',
    presigned_urls: ['http://example.com/presigned'],
  }),
  uploadFileToPresignedUrl: vi.fn().mockResolvedValue(undefined),
  confirmUpload: vi.fn().mockResolvedValue(undefined),
};
