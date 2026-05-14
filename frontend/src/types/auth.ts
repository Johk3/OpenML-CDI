export type UserRole = 'expert' | 'user';

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

export type DatasetStatus =
  | 'pending'
  | 'claimed'
  | 'converted'
  | 'quarantined'
  | 'approved'
  | 'rejected'
  | 'published';

export interface CroissantVariable {
  name: string;
  type: string;
  description?: string;
}

export interface CroissantDistribution {
  name?: string;
  description?: string;
  contentUrl?: string;
  encodingFormat?: string;
  sha256?: string;
  md5?: string;
  contentSize?: string;
}

export interface CroissantMetadata {
  title: string;
  description: string;
  contributors: string[];
  license: string;
  variables: CroissantVariable[];
  url?: string;
  distribution?: CroissantDistribution[];
}

export interface Comment {
  id: string;
  author: string;
  role: UserRole;
  text: string;
  date: string;
}

export interface MalwareScanFile {
  status: 'clean' | 'infected' | 'error' | 'missing' | 'pending';
  engine: string;
  file: string;
  message?: string;
  signature?: string;
}

export interface MalwareScan {
  engine?: string;
  files?: MalwareScanFile[];
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
  files?: string[];
  contact?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  malwareScan?: MalwareScan;
  rawMetadata?: Record<string, unknown>;
}
