export interface UploadUrlPayload {
  name: string;
  description: string | Record<string, unknown>;
  filenames: string[];
  content_types?: (string | undefined)[];
}

export interface UploadUrlResponse {
  id: string;
  presigned_urls: string[];
}
