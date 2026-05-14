import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@/services/datasetService');

const putMock = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    put: putMock,
  },
}));

describe('DatasetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ data: {} });
    window.localStorage.clear();
  });

  it('uploads the complete object with one PUT for standard upload URLs', async () => {
    const { DatasetService } = await import('@/services/datasetService');
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'large.zip', {
      type: 'application/zip',
    });

    await DatasetService.uploadFileInChunks('/api/datasets/upload/datasets/batch/large.zip', file);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      '/api/datasets/upload/datasets/batch/large.zip',
      file,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/zip',
        },
      }),
    );
  });
});
