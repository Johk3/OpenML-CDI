export type UserRole = 'expert' | 'uploader';

export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_verified: boolean;
  created_at: string;
  datasets: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type DatasetStatus = 'ready' | 'processing' | 'finished' | 'error';

export interface CroissantVariable {
  name: string;
  type: string;
  description?: string;
}

export interface CroissantMetadata {
  title: string;
  description: string;
  contributors: string[];
  license: string;
  variables: CroissantVariable[];
  url?: string;
}

export interface Comment {
  id: string;
  author: string;
  role: UserRole;
  text: string;
  date: string;
}

export interface Dataset {
  id: string;
  title: string;
  description: string;
  date: string;
  status: DatasetStatus;
  metrics?: {
    instances: number;
    features: number;
  };
  croissantMetadata?: CroissantMetadata;
  comments?: Comment[];
}
