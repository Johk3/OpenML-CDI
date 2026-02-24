export type UserRole = 'customer' | 'expert';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export type DatasetStatus = 'ready' | 'processing' | 'finished' | 'error';

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
}
