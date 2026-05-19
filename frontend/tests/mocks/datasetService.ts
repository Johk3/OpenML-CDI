import { vi } from 'vitest';
import { makeBackendDataset } from './builders';

export const mockDatasetService = {
  requestUploadUrl: vi.fn(),
  uploadFileToPresignedUrl: vi.fn(),
  uploadFileMultipart: vi.fn(),
  shouldUseMultipartUpload: vi.fn(),
  getRestorableMultipartUpload: vi.fn(),
  uploadContractFromSession: vi.fn(),
  abortMultipartUpload: vi.fn(),
  confirmUpload: vi.fn(),
  listDatasets: vi.fn(),
  getDataset: vi.fn(),
  deleteDataset: vi.fn(),
  updateMetadata: vi.fn(),
  updateStatus: vi.fn(),
  downloadDataset: vi.fn(),
  getGitHubDiscussion: vi.fn(),
};

export function resetDatasetServiceMocks() {
  mockDatasetService.requestUploadUrl.mockReset().mockResolvedValue({
    id: 'test-dataset-id',
    presigned_urls: ['http://example.com/presigned'],
    upload_contracts: [
      {
        original_path: 'data.csv',
        object_key: 'quarantine/batch/data.csv',
        url: 'http://example.com/presigned',
        method: 'PUT',
        headers: { 'Content-Type': 'text/csv' },
        content_type: 'text/csv',
        expires_seconds: 3600,
      },
    ],
  });
  mockDatasetService.uploadFileToPresignedUrl.mockReset().mockResolvedValue(undefined);
  mockDatasetService.uploadFileMultipart
    .mockReset()
    .mockImplementation(async (_datasetId, _contract, file, options) => {
      options?.onProgress?.({
        loadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: 0,
        totalChunks: 1,
        status: 'completed',
      });
    });
  mockDatasetService.shouldUseMultipartUpload
    .mockReset()
    .mockImplementation(
      (file: File, contract?: { url?: string; upload_mode?: string }) =>
        contract?.upload_mode === 'multipart' ||
        (contract?.upload_mode !== 'direct' &&
          file.size > 8 * 1024 * 1024 &&
          !contract?.url?.includes('/api/datasets/upload/')),
    );
  mockDatasetService.getRestorableMultipartUpload.mockReset().mockReturnValue(null);
  mockDatasetService.uploadContractFromSession.mockReset();
  mockDatasetService.abortMultipartUpload.mockReset().mockResolvedValue(undefined);
  mockDatasetService.confirmUpload.mockReset().mockResolvedValue(undefined);
  mockDatasetService.listDatasets.mockReset().mockResolvedValue([makeBackendDataset()]);
  mockDatasetService.getDataset.mockReset().mockImplementation(async (datasetId: string) => {
    if (datasetId === 'ds-not-found') {
      throw new Error('Dataset not found');
    }

    return makeBackendDataset({
      id: datasetId,
      title: 'Demo Dataset',
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
    });
  });
  mockDatasetService.deleteDataset.mockReset().mockResolvedValue(undefined);
  mockDatasetService.updateMetadata.mockReset().mockResolvedValue(undefined);
  mockDatasetService.updateStatus.mockReset().mockResolvedValue(undefined);
  mockDatasetService.downloadDataset.mockReset().mockResolvedValue({
    blob: new Blob(['mock content'], { type: 'application/octet-stream' }),
    filename: 'sample-dataset.bin',
  });
  mockDatasetService.getGitHubDiscussion.mockReset().mockResolvedValue({
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
  });
}

resetDatasetServiceMocks();
