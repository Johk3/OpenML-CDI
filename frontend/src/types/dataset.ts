import type { DatasetLifecycleSummary } from './auth';

export type UploadRepresentation = 'single_object' | 'multi_object' | 'zip';

export interface UploadDirectoryStructure {
  compressed: boolean;
  representation: UploadRepresentation;
  root: string | null;
  paths: string[];
  archive_path?: string | null;
  manifest: {
    version: number;
    path_count: number;
    source: string;
  };
}

export interface UploadUrlPayload {
  name: string;
  description?: string | Record<string, unknown>;
  filenames: string[];
  content_types?: (string | undefined)[];
  byte_sizes?: (number | undefined)[];
  checksums?: (string | undefined)[];
  directory_structure?: UploadDirectoryStructure;
}

export interface UploadUrlResponse {
  id: string;
  presigned_urls: string[];
  upload_contracts?: DatasetUploadContract[];
}

export interface DatasetUploadContract {
  original_path: string;
  object_key: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  content_type?: string | null;
  expires_seconds: number;
  upload_mode?: 'direct' | 'multipart';
}

export interface ChunkedUploadSession {
  fileKey: string;
  fileIdentity: string;
  fileName: string;
  fileSize: number;
  datasetId: string;
  objectKey: string;
  originalPath: string;
  contentType?: string | null;
  chunkSize: number;
  uploadId: string;
  uploadedBytes: number;
  uploadedParts: DatasetMultipartUploadedPart[];
  expiresSeconds?: number;
  status: 'active' | 'completed' | 'aborted';
  updatedAt: number;
}

export interface ChunkedUploadProgress {
  loadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
  status: 'uploading' | 'paused' | 'resumed' | 'retrying' | 'finalizing' | 'completed' | 'aborted';
}

export interface ChunkedUploadController {
  pause: () => void;
  resume: () => void;
  abort: () => void;
  isPaused: () => boolean;
}

export interface BackendDataset {
  id: string;
  title: string;
  status: string;
  created_at: string;
  owner_id: string;
  dataset_metadata: Record<string, unknown>;
  issue_url: string;
  download_url?: string | null;
  storage_objects?: Record<string, unknown>[];
  upload_package?: UploadDirectoryStructure | null;
  lifecycle?: DatasetLifecycleSummary;
}

export interface DatasetMultipartUploadResponse {
  dataset_id: string;
  object_key: string;
  upload_id: string;
  part_size: number;
  expires_seconds: number;
  status: string;
}

export interface DatasetMultipartPartUrlResponse {
  url: string;
  method: string;
  headers: Record<string, string>;
  expires_seconds: number;
}

export interface DatasetMultipartUploadedPart {
  part_number: number;
  etag: string;
  size?: number | null;
}

export interface DatasetMultipartPartsResponse {
  object_key: string;
  upload_id: string;
  parts: DatasetMultipartUploadedPart[];
}
