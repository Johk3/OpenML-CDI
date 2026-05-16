import { apiClient } from '@/lib/apiClient';
import {
  BackendDataset,
  ChunkedUploadController,
  ChunkedUploadProgress,
  ChunkedUploadSession,
  DatasetMultipartPartsResponse,
  DatasetMultipartPartUrlResponse,
  DatasetMultipartUploadedPart,
  DatasetMultipartUploadResponse,
  DatasetUploadContract,
  UploadUrlPayload,
  UploadUrlResponse,
} from '@/types/dataset';
import { DatasetStatus } from '@/types/auth';
import axios, { AxiosProgressEvent } from 'axios';

const DEFAULT_MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const DEFAULT_MULTIPART_CONCURRENCY = 4;
const DEFAULT_MAX_PART_ATTEMPTS = 3;
const RESUME_STORAGE_PREFIX = 'openml-multipart-upload-session';

const createFileIdentity = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

const createFileKey = (file: File, datasetId: string, objectKey: string) =>
  `${createFileIdentity(file)}|${datasetId}|${objectKey}`;

const sessionStorageKey = (fileKey: string) => `${RESUME_STORAGE_PREFIX}:${fileKey}`;

const canUseLocalStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const loadSession = (fileKey: string): ChunkedUploadSession | null => {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(sessionStorageKey(fileKey));
    return raw ? (JSON.parse(raw) as ChunkedUploadSession) : null;
  } catch {
    return null;
  }
};

const saveSession = (session: ChunkedUploadSession) => {
  if (!canUseLocalStorage()) return;

  window.localStorage.setItem(
    sessionStorageKey(session.fileKey),
    JSON.stringify({ ...session, updatedAt: Date.now() }),
  );
};

const clearSession = (fileKey: string) => {
  if (!canUseLocalStorage()) return;

  window.localStorage.removeItem(sessionStorageKey(fileKey));
};

const getRestorableSession = (file: File): ChunkedUploadSession | null => {
  if (!canUseLocalStorage()) return null;

  const fileIdentity = createFileIdentity(file);
  let newestSession: ChunkedUploadSession | null = null;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(`${RESUME_STORAGE_PREFIX}:`)) continue;

    try {
      const raw = window.localStorage.getItem(key);
      const session = raw ? (JSON.parse(raw) as ChunkedUploadSession) : null;
      if (session?.fileIdentity !== fileIdentity || session.status !== 'active') continue;
      if (!newestSession || session.updatedAt > newestSession.updatedAt) {
        newestSession = session;
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return newestSession;
};

const waitUntilResumed = (
  controller: ChunkedUploadController,
  shouldAbort: () => boolean = () => false,
) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (shouldAbort()) {
        window.clearInterval(timer);
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }

      if (!controller.isPaused()) {
        window.clearInterval(timer);
        resolve();
      }
    }, 100);
  });

const delay = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => window.setTimeout(resolve, ms));

const isAbortError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (axios.isCancel?.(error)) return true;

  const maybeError = error as { code?: unknown; name?: unknown } | null | undefined;
  return maybeError?.name === 'CanceledError' || maybeError?.code === 'ERR_CANCELED';
};

const stripEtag = (etag: unknown) => {
  if (typeof etag !== 'string') return '';
  return etag.trim().replace(/^"|"$/g, '');
};

const readResponseEtag = (headers: unknown) => {
  const headerRecord = headers as Record<string, unknown> | undefined;
  return stripEtag(headerRecord?.etag ?? headerRecord?.ETag);
};

const isBackendUploadUrl = (url: string) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost';
    return new URL(url, baseUrl).pathname.includes('/api/datasets/upload/');
  } catch {
    return url.includes('/api/datasets/upload/');
  }
};

const partSizeForNumber = (file: File, partSize: number, partNumber: number) => {
  const start = (partNumber - 1) * partSize;
  return Math.max(0, Math.min(partSize, file.size - start));
};

const uploadedBytesFromParts = (
  file: File,
  partSize: number,
  parts: DatasetMultipartUploadedPart[],
) =>
  parts.reduce(
    (total, part) => total + (part.size ?? partSizeForNumber(file, partSize, part.part_number)),
    0,
  );

const mergeUploadedParts = (
  file: File,
  partSize: number,
  parts: DatasetMultipartUploadedPart[],
) => {
  const byPartNumber = new Map<number, DatasetMultipartUploadedPart>();

  for (const part of parts) {
    if (!part.etag) continue;
    byPartNumber.set(part.part_number, {
      part_number: part.part_number,
      etag: stripEtag(part.etag),
      size: part.size ?? partSizeForNumber(file, partSize, part.part_number),
    });
  }

  return Array.from(byPartNumber.values()).sort((a, b) => a.part_number - b.part_number);
};

const createUploadSession = ({
  datasetId,
  file,
  contract,
  upload,
}: {
  datasetId: string;
  file: File;
  contract: DatasetUploadContract;
  upload: DatasetMultipartUploadResponse;
}): ChunkedUploadSession => {
  const fileIdentity = createFileIdentity(file);
  const fileKey = createFileKey(file, datasetId, contract.object_key);

  return {
    fileKey,
    fileIdentity,
    fileName: file.name,
    fileSize: file.size,
    datasetId,
    objectKey: upload.object_key,
    originalPath: contract.original_path,
    contentType: contract.content_type,
    chunkSize: upload.part_size,
    uploadId: upload.upload_id,
    uploadedBytes: 0,
    uploadedParts: [],
    expiresSeconds: upload.expires_seconds,
    status: 'active',
    updatedAt: Date.now(),
  };
};

const sessionToUploadContract = (session: ChunkedUploadSession): DatasetUploadContract => ({
  original_path: session.originalPath,
  object_key: session.objectKey,
  url: '',
  method: 'PUT',
  headers: session.contentType ? { 'Content-Type': session.contentType } : {},
  content_type: session.contentType,
  expires_seconds: session.expiresSeconds ?? 0,
  upload_mode: 'multipart',
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
    headers: Record<string, string> = {},
  ) => {
    const uploadConfig = {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...headers,
      },
      onUploadProgress: onProgress,
    };

    return isBackendUploadUrl(presignedUrl)
      ? apiClient.put(presignedUrl, file, uploadConfig)
      : axios.put(presignedUrl, file, uploadConfig);
  },

  shouldUseMultipartUpload: (file: File, contract?: DatasetUploadContract) =>
    contract?.upload_mode === 'multipart' ||
    (contract?.upload_mode !== 'direct' &&
      file.size > DEFAULT_MULTIPART_PART_SIZE &&
      (!contract?.url || !isBackendUploadUrl(contract.url))),

  getRestorableMultipartUpload: (file: File) => getRestorableSession(file),

  uploadContractFromSession: (session: ChunkedUploadSession) => sessionToUploadContract(session),

  initiateMultipartUpload: (
    datasetId: string,
    contract: DatasetUploadContract,
    partSize = DEFAULT_MULTIPART_PART_SIZE,
  ) =>
    apiClient
      .post<DatasetMultipartUploadResponse>(`/datasets/${datasetId}/multipart-uploads`, {
        object_key: contract.object_key,
        content_type: contract.content_type,
        part_size: partSize,
      })
      .then((res) => res.data),

  requestMultipartPartUrl: (
    datasetId: string,
    uploadId: string,
    objectKey: string,
    partNumber: number,
  ) =>
    apiClient
      .post<DatasetMultipartPartUrlResponse>(
        `/datasets/${datasetId}/multipart-uploads/${uploadId}/parts/${partNumber}/url`,
        { object_key: objectKey },
      )
      .then((res) => res.data),

  listMultipartUploadedParts: (datasetId: string, uploadId: string, objectKey: string) =>
    apiClient
      .get<DatasetMultipartPartsResponse>(
        `/datasets/${datasetId}/multipart-uploads/${uploadId}/parts`,
        { params: { object_key: objectKey } },
      )
      .then((res) => res.data.parts),

  completeMultipartUpload: (
    datasetId: string,
    uploadId: string,
    objectKey: string,
    parts: DatasetMultipartUploadedPart[],
  ) =>
    apiClient
      .post(`/datasets/${datasetId}/multipart-uploads/${uploadId}/complete`, {
        object_key: objectKey,
        parts: parts.map((part) => ({
          part_number: part.part_number,
          etag: part.etag,
        })),
      })
      .then((res) => res.data),

  abortMultipartUpload: (datasetId: string, uploadId: string, objectKey: string) =>
    apiClient.delete(`/datasets/${datasetId}/multipart-uploads/${uploadId}`, {
      params: { object_key: objectKey },
    }),

  /** Upload a file through S3 multipart session endpoints and persist part state locally. */
  uploadFileMultipart: async (
    datasetId: string,
    contract: DatasetUploadContract,
    file: File,
    options?: {
      chunkSize?: number;
      concurrency?: number;
      controller?: ChunkedUploadController;
      maxRetries?: number;
      retryDelayMs?: number;
      onFinalizing?: () => void;
      onProgress?: (progress: ChunkedUploadProgress) => void;
    },
  ) => {
    const requestedPartSize = options?.chunkSize ?? DEFAULT_MULTIPART_PART_SIZE;
    const sessionKey = createFileKey(file, datasetId, contract.object_key);
    const maxAttempts = options?.maxRetries ?? DEFAULT_MAX_PART_ATTEMPTS;
    const retryDelayMs = options?.retryDelayMs ?? 500;
    const controller = options?.controller;
    const activeAbortControllers = new Set<AbortController>();
    let upload: ChunkedUploadSession | null = null;
    let aborted = false;
    let stopWorkers = false;
    let firstError: unknown = null;
    let partSize = requestedPartSize;
    let totalChunks = Math.max(1, Math.ceil(file.size / requestedPartSize));
    let uploadedParts: DatasetMultipartUploadedPart[] = [];
    const inFlightBytes = new Map<number, number>();

    const emitProgress = (status: ChunkedUploadProgress['status'], partNumber: number) => {
      const inFlightLoaded = Array.from(inFlightBytes.values()).reduce(
        (total, loaded) => total + loaded,
        0,
      );
      const committedBytes = uploadedBytesFromParts(file, partSize, uploadedParts);

      options?.onProgress?.({
        loadedBytes: Math.min(file.size, committedBytes + inFlightLoaded),
        totalBytes: file.size,
        chunkIndex: Math.max(0, partNumber - 1),
        totalChunks,
        status,
      });
    };

    const originalAbort = controller?.abort;
    if (controller && originalAbort) {
      controller.abort = () => {
        aborted = true;
        stopWorkers = true;
        activeAbortControllers.forEach((abortController) => abortController.abort());
        originalAbort();
      };
    }

    const createAbortError = () => new DOMException('Upload aborted', 'AbortError');

    const throwIfAborted = () => {
      if (aborted) throw createAbortError();
    };

    const abortStoredUpload = async () => {
      if (!upload) return;

      try {
        await DatasetService.abortMultipartUpload(datasetId, upload.uploadId, upload.objectKey);
      } finally {
        clearSession(upload.fileKey);
      }
    };

    const persistUploadedPart = (part: DatasetMultipartUploadedPart) => {
      if (!upload) return;

      uploadedParts = mergeUploadedParts(file, partSize, [...uploadedParts, part]);
      saveSession({
        ...upload,
        uploadedParts,
        uploadedBytes: uploadedBytesFromParts(file, partSize, uploadedParts),
      });
    };

    const getUploadedPartFromStorage = async (
      partNumber: number,
      expectedSize: number,
    ): Promise<DatasetMultipartUploadedPart | null> => {
      if (!upload) return null;

      const remoteParts = await DatasetService.listMultipartUploadedParts(
        datasetId,
        upload.uploadId,
        upload.objectKey,
      );
      const remotePart = remoteParts.find((part) => part.part_number === partNumber);
      const etag = stripEtag(remotePart?.etag);
      if (!remotePart || !etag) return null;

      return {
        part_number: partNumber,
        etag,
        size: remotePart.size ?? expectedSize,
      };
    };

    const uploadPart = async (partNumber: number) => {
      if (!upload) return;
      throwIfAborted();

      if (controller?.isPaused()) {
        emitProgress('paused', partNumber);
        await waitUntilResumed(controller, () => aborted);
        emitProgress('resumed', partNumber);
      }

      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const body = file.slice(start, end);

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfAborted();
        const abortController = new AbortController();
        activeAbortControllers.add(abortController);

        try {
          const partUrl = await DatasetService.requestMultipartPartUrl(
            datasetId,
            upload.uploadId,
            upload.objectKey,
            partNumber,
          );
          const response = await axios.put(partUrl.url, body, {
            headers: partUrl.headers,
            signal: abortController.signal,
            onUploadProgress: (event) => {
              inFlightBytes.set(partNumber, Math.min(body.size, event.loaded));
              emitProgress('uploading', partNumber);
            },
          });
          const etag = readResponseEtag(response.headers);
          const uploadedPart = etag
            ? {
                part_number: partNumber,
                etag,
                size: body.size,
              }
            : await getUploadedPartFromStorage(partNumber, body.size);

          if (!uploadedPart) {
            throw new Error(
              `Upload failed while sending part ${partNumber} of ${totalChunks}. The storage response did not include an ETag.`,
            );
          }

          inFlightBytes.delete(partNumber);
          persistUploadedPart(uploadedPart);
          emitProgress('uploading', partNumber);
          return;
        } catch (error) {
          inFlightBytes.delete(partNumber);
          if (aborted) {
            throw createAbortError();
          }
          if (stopWorkers || abortController.signal.aborted) {
            throw error;
          }
          if (isAbortError(error)) {
            throw createAbortError();
          }
          if (attempt >= maxAttempts) {
            throw new Error(
              `Upload failed while sending part ${partNumber} of ${totalChunks}. Please check your connection and resume the upload.`,
            );
          }
          emitProgress('retrying', partNumber);
          await delay(retryDelayMs);
        } finally {
          activeAbortControllers.delete(abortController);
        }
      }
    };

    try {
      const existingSession = loadSession(sessionKey);
      upload =
        existingSession ??
        createUploadSession({
          datasetId,
          file,
          contract,
          upload: await DatasetService.initiateMultipartUpload(
            datasetId,
            contract,
            requestedPartSize,
          ),
        });

      throwIfAborted();
      saveSession(upload);

      partSize = upload.chunkSize;
      totalChunks = Math.max(1, Math.ceil(file.size / partSize));
      uploadedParts = mergeUploadedParts(file, partSize, upload.uploadedParts);

      try {
        const remoteParts = await DatasetService.listMultipartUploadedParts(
          datasetId,
          upload.uploadId,
          upload.objectKey,
        );
        throwIfAborted();
        uploadedParts = mergeUploadedParts(file, partSize, [...uploadedParts, ...remoteParts]);
        saveSession({
          ...upload,
          uploadedParts,
          uploadedBytes: uploadedBytesFromParts(file, partSize, uploadedParts),
        });
      } catch {
        if (aborted) throw createAbortError();
        saveSession(upload);
      }

      const uploadedPartNumbers = new Set(uploadedParts.map((part) => part.part_number));
      const pendingPartNumbers = Array.from(
        { length: totalChunks },
        (_, index) => index + 1,
      ).filter((partNumber) => !uploadedPartNumbers.has(partNumber));
      let nextPartIndex = 0;

      const workerCount = Math.min(
        options?.concurrency ?? DEFAULT_MULTIPART_CONCURRENCY,
        pendingPartNumbers.length,
      );
      const workers = Array.from({ length: workerCount }, async () => {
        while (!stopWorkers && nextPartIndex < pendingPartNumbers.length) {
          const partNumber = pendingPartNumbers[nextPartIndex];
          nextPartIndex += 1;
          try {
            await uploadPart(partNumber);
          } catch (error) {
            firstError = firstError ?? error;
            stopWorkers = true;
            activeAbortControllers.forEach((abortController) => abortController.abort());
          }
        }
      });

      await Promise.all(workers);
      if (firstError) throw firstError;

      const completedParts = mergeUploadedParts(file, partSize, uploadedParts);
      options?.onFinalizing?.();
      options?.onProgress?.({
        loadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: totalChunks,
        totalChunks,
        status: 'finalizing',
      });
      await DatasetService.completeMultipartUpload(
        datasetId,
        upload.uploadId,
        upload.objectKey,
        completedParts,
      );
      clearSession(upload.fileKey);
      options?.onProgress?.({
        loadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: totalChunks - 1,
        totalChunks,
        status: 'completed',
      });
    } catch (error) {
      if (aborted || isAbortError(error)) {
        await abortStoredUpload();
        options?.onProgress?.({
          loadedBytes: uploadedBytesFromParts(file, partSize, uploadedParts),
          totalBytes: file.size,
          chunkIndex: 0,
          totalChunks,
          status: 'aborted',
        });
        throw createAbortError();
      }
      throw error;
    } finally {
      if (controller && originalAbort) {
        controller.abort = originalAbort;
      }
    }
  },

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
    let aborted = false;
    const originalAbort = controller?.abort;

    if (controller && originalAbort) {
      controller.abort = () => {
        aborted = true;
        originalAbort();
      };
    }

    try {
      if (controller?.isPaused()) {
        options?.onProgress?.({
          loadedBytes: 0,
          totalBytes: file.size,
          chunkIndex: 0,
          totalChunks,
          status: 'paused',
        });
        await waitUntilResumed(controller, () => aborted);
        options?.onProgress?.({
          loadedBytes: 0,
          totalBytes: file.size,
          chunkIndex: 0,
          totalChunks,
          status: 'resumed',
        });
      }

      if (aborted) {
        throw new DOMException('Upload aborted', 'AbortError');
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
    } finally {
      if (controller && originalAbort) {
        controller.abort = originalAbort;
      }
    }
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
  listDatasets: (params?: { scope?: 'mine' | 'review_queue'; offset?: number; limit?: number }) =>
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
        message?: string;
        error_reason?: string | null;
        retryable?: boolean;
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
