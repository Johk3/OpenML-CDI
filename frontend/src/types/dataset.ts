export interface UploadUrlPayload {
  name: string;
  description?: string | Record<string, unknown>;
  filenames: string[];
  content_types?: (string | undefined)[];
}

export interface UploadUrlResponse {
  id: string;
  presigned_urls: string[];
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
