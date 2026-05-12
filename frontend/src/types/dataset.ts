export interface UploadUrlPayload {
  name: string;
  description?: string | Record<string, unknown>;
  filenames: string[];
  content_types?: (string | undefined)[];
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
}

export interface ChunkedUploadSession {
  fileKey: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  uploadedBytes: number;
  uploadedChunks: number[];
  updatedAt: number;
}

export interface ChunkedUploadProgress {
  loadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
  status: 'uploading' | 'paused' | 'resumed' | 'completed';
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
}
