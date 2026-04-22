export interface UploadUrlPayload {
  name: string;
  description: string | Record<string, unknown>;
  filename: string;
  content_type?: string;
}

export interface UploadUrlResponse {
  id: string;
  presigned_url: string;
}
