import { apiClient } from '@/lib/apiClient';
import {
  BackendDataset,
  ChunkedUploadController,
  ChunkedUploadProgress,
  ChunkedUploadSession,
  UploadUrlPayload,
  UploadUrlResponse,
} from '@/types/dataset';
import { DatasetStatus } from '@/types/auth';
import { AxiosProgressEvent } from 'axios';

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const RESUME_STORAGE_PREFIX = 'openml-upload-session';

const createFileKey = (file: File, uploadUrl: string) =>
  `${uploadUrl}|${file.name}|${file.size}|${file.lastModified}`;

const sessionStorageKey = (fileKey: string) => `${RESUME_STORAGE_PREFIX}:${fileKey}`;

const loadSession = (fileKey: string): ChunkedUploadSession | null => {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey(fileKey));
    return raw ? (JSON.parse(raw) as ChunkedUploadSession) : null;
  } catch {
    return null;
  }
};

const saveSession = (session: ChunkedUploadSession) => {
  window.localStorage.setItem(
    sessionStorageKey(session.fileKey),
    JSON.stringify({ ...session, updatedAt: Date.now() }),
  );
};

const clearSession = (fileKey: string) => {
  window.localStorage.removeItem(sessionStorageKey(fileKey));
};

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

  /** Upload a file in resumable chunks and persist chunk progress locally. */
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
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    const fileKey = createFileKey(file, presignedUrl);
    const existingSession = loadSession(fileKey);
    const uploadedChunks = new Set(existingSession?.uploadedChunks ?? []);
    const controller = options?.controller;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      if (uploadedChunks.has(chunkIndex)) continue;

      if (controller?.isPaused()) {
        options?.onProgress?.({
          loadedBytes: uploadedChunks.size * chunkSize,
          totalBytes: file.size,
          chunkIndex,
          totalChunks,
          status: 'paused',
        });
        await waitUntilResumed(controller);
        options?.onProgress?.({
          loadedBytes: uploadedChunks.size * chunkSize,
          totalBytes: file.size,
          chunkIndex,
          totalChunks,
          status: 'resumed',
        });
      }

      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      await apiClient.put(presignedUrl, chunk, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
          'X-Upload-Chunk-Index': String(chunkIndex),
          'X-Upload-Chunk-Total': String(totalChunks),
          ...options?.headers,
        },
        onUploadProgress: (event) => {
          options?.onProgress?.({
            loadedBytes: start + event.loaded,
            totalBytes: file.size,
            chunkIndex,
            totalChunks,
            status: 'uploading',
          });
        },
      });

      uploadedChunks.add(chunkIndex);
      const uploadedBytes = Math.min(end, file.size);
      saveSession({
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        chunkSize,
        uploadedBytes,
        uploadedChunks: Array.from(uploadedChunks),
        updatedAt: Date.now(),
      });
      options?.onProgress?.({
        loadedBytes: uploadedBytes,
        totalBytes: file.size,
        chunkIndex,
        totalChunks,
        status: 'uploading',
      });
    }

    clearSession(fileKey);
    options?.onProgress?.({
      loadedBytes: file.size,
      totalBytes: file.size,
      chunkIndex: totalChunks - 1,
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
};
