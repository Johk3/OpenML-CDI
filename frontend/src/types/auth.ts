export type UserRole = 'customer' | 'expert';

export interface User {
  id: string;
  name: string;
  role: UserRole;
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
