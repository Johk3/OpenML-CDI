/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FILE_UPLOAD_LIMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
