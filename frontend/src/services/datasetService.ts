import { apiClient } from '@/lib/apiClient';
import {
  BackendDataset,
  ChunkedUploadController,
  ChunkedUploadProgress,
  UploadUrlPayload,
  UploadUrlResponse,
} from '@/types/dataset';
import { DatasetStatus } from '@/types/auth';
import { AxiosProgressEvent } from 'axios';

const waitUntilResumed = (controller: ChunkedUploadController) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (!controller.isPaused()) {
        window.clearInterval(timer);
        resolve();
      }
    }, 100);

    const abort = controller.abort;
    controller.abort = () => {
      window.clearInterval(timer);
      abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
  });

export const DatasetService = {
  /** Register a new dataset record and get a pre siigned PUT URL. */
  requestUploadUrl: (payload: UploadUrlPayload) =>
    apiClient.post<UploadUrlResponse>('/datasets/upload-url', payload).then((res) => res.data),

  /** PUT the raw file directly to the storage URL. */
  uploadFileToPresignedUrl: (
    presignedUrl: string,
    file: File,
    onProgress?: (progressEvent: AxiosProgressEvent) => void,
  ) =>
    apiClient.put(presignedUrl, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      onUploadProgress: onProgress,
    }),

  /** Upload the complete file to a standard object PUT URL. */
  uploadFileInChunks: async (
    presignedUrl: string,
    file: File,
    options?: {
      chunkSize?: number;
      controller?: ChunkedUploadController;
      headers?: Record<string, string>;
      onProgress?: (progress: ChunkedUploadProgress) => void;
    },
  ) => {
    const controller = options?.controller;
    const totalChunks = 1;

    if (controller?.isPaused()) {
      options?.onProgress?.({
        loadedBytes: 0,
        totalBytes: file.size,
        chunkIndex: 0,
        totalChunks,
        status: 'paused',
      });
      await waitUntilResumed(controller);
      options?.onProgress?.({
        loadedBytes: 0,
        totalBytes: file.size,
        chunkIndex: 0,
        totalChunks,
        status: 'resumed',
      });
    }

    await apiClient.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...options?.headers,
      },
      onUploadProgress: (event) => {
        options?.onProgress?.({
          loadedBytes: event.loaded,
          totalBytes: file.size,
          chunkIndex: 0,
          totalChunks,
          status: 'uploading',
        });
      },
    });

    options?.onProgress?.({
      loadedBytes: file.size,
      totalBytes: file.size,
      chunkIndex: 0,
      totalChunks,
      status: 'completed',
    });
  },

  /** Notify the backend that the upload finished and trigger the virus scan. */
  confirmUpload: (datasetId: string) =>
    apiClient.post(`/datasets/${datasetId}/confirm-upload`).then((res) => res.data),

  /** Persist Croissant / metadata for an existing dataset. */
  updateMetadata: (datasetId: string, metadata: Record<string, unknown>) =>
    apiClient
      .post(`/datasets/metadata`, metadata, { params: { dataset_id: datasetId } })
      .then((res) => res.data),

  /** Retrieve a single dataset by ID. */
  getDataset: (datasetId: string) =>
    apiClient.get(`/datasets/get`, { params: { dataset_id: datasetId } }).then((res) => res.data),

  /** Delete a dataset. */
  deleteDataset: (datasetId: string) =>
    apiClient
      .post(`/datasets/delete`, null, { params: { dataset_id: datasetId } })
      .then((res) => res.data),

  /** List datasets for the current user (AND all datasets for experts). */
  listDatasets: (params?: { offset?: number; limit?: number }) =>
    apiClient.get<BackendDataset[]>('/datasets/list', { params }).then((res) => res.data),

  /** Update dataset status (experts ONLY!!). */
  updateStatus: (datasetId: string, status: DatasetStatus) =>
    apiClient.post('/datasets/status', null, { params: { dataset_id: datasetId, status } }),

  /** Download dataset files through AUTHENTICATED! API. */
  downloadDataset: async (datasetId: string) => {
    const response = await apiClient.get<Blob>(`/datasets/${datasetId}/download`, {
      responseType: 'blob',
    });
    const disposition = response.headers['content-disposition'] || '';
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    return {
      blob: response.data,
      filename: filenameMatch?.[1] || `dataset-${datasetId}.bin`,
    };
  },

  /** Fetch GitHub issue state and comments for a dataset. */
  getGitHubDiscussion: (datasetId: string) =>
    apiClient
      .get<{
        state: string;
        html_url: string;
        title?: string;
        comments: {
          id: number;
          author: string;
          avatar_url: string;
          body: string;
          created_at: string;
          author_association: string;
        }[];
      }>(`/datasets/${datasetId}/github-discussion`)
      .then((res) => res.data),
};
