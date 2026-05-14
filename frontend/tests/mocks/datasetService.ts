import { vi } from 'vitest';
import { BackendDataset } from '@/types/dataset';

export const mockDatasetService = {
  requestUploadUrl: vi.fn().mockResolvedValue({
    id: 'test-dataset-id',
    presigned_urls: ['http://example.com/presigned'],
  }),
  uploadFileToPresignedUrl: vi.fn().mockResolvedValue(undefined),
  uploadFileInChunks: vi.fn().mockImplementation(async (_url, file, options) => {
    options?.onProgress?.({
      loadedBytes: file.size,
      totalBytes: file.size,
      chunkIndex: 0,
      totalChunks: 1,
      status: 'completed',
    });
  }),
  confirmUpload: vi.fn().mockResolvedValue(undefined),
  listDatasets: vi.fn().mockResolvedValue([
    {
      id: 'dataset-1',
      title: 'Sample Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      dataset_metadata: {
        description: 'Sample description',
        filenames: ['part-0001.parquet'],
        croissantMetadata: undefined,
        malware_scan: undefined,
      },
    },
  ] as unknown as BackendDataset[]),
  getDataset: vi.fn(async (datasetId: string) => {
    if (datasetId === 'ds-not-found') {
      throw new Error('Dataset not found');
    }

    return {
      id: datasetId,
      title: 'Demo Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      dataset_metadata: {
        description: 'Demo dataset description',
        croissantMetadata: {
          title: 'Demo Dataset',
          description: 'Demo dataset description',
          license: 'CC-BY-4.0',
          contributors: ['OpenML Team'],
          variables: [
            {
              name: 'feature_one',
              type: 'string',
              description: 'Example feature',
            },
          ],
        },
        filenames: ['part-0001.parquet'],
        malware_scan: {
          engine: 'clamav',
          scanned_at: '2026-04-01T12:00:00Z',
          files: [
            {
              file: 'part-0001.parquet',
              status: 'clean',
            },
          ],
        },
      },
    } as unknown as BackendDataset;
  }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  downloadDataset: vi.fn().mockResolvedValue({
    blob: new Blob(['mock content'], { type: 'application/octet-stream' }),
    filename: 'sample-dataset.bin',
  }),
  getGitHubDiscussion: vi.fn().mockResolvedValue({
    state: 'open',
    html_url: 'https://github.com/openml/openmlupload-test/issues/1',
    comments: [
      {
        id: 1,
        author: 'github-actions',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        body: 'Dataset uploaded and scanned. Status: clean.',
        created_at: '2026-04-01T12:00:00Z',
        author_association: 'MEMBER',
      },
      {
        id: 2,
        author: 'openml-user',
        body: 'Looks good!',
        created_at: '2026-04-01T13:00:00Z',
        author_association: 'NONE',
      },
    ],
  }),
};
