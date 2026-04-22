import { apiClient } from '@/lib/apiClient';
import { UploadUrlPayload, UploadUrlResponse } from '@/types/dataset';
import { AxiosProgressEvent } from 'axios';

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
};
