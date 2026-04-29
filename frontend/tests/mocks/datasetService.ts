import { vi } from 'vitest';

export const mockDatasetService = {
  requestUploadUrl: vi.fn().mockResolvedValue({
    id: 'test-dataset-id',
    presigned_urls: ['http://example.com/presigned'],
  }),
  uploadFileToPresignedUrl: vi.fn().mockResolvedValue(undefined),
  confirmUpload: vi.fn().mockResolvedValue(undefined),
  listDatasets: vi.fn().mockResolvedValue([
    {
      id: 'dataset-1',
      title: 'Sample Dataset',
      status: 'pending',
      created_at: '2026-04-01T00:00:00Z',
      dataset_metadata: {
        description: 'Sample description',
      },
    },
  ]),
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
      },
    };
  }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  downloadDataset: vi.fn().mockResolvedValue({
    blob: new Blob(['mock content'], { type: 'application/octet-stream' }),
    filename: 'sample-dataset.bin',
  }),
};
