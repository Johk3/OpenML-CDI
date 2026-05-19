import { apiClient } from '@/lib/apiClient';
import { User } from '@/types/auth';

const USER_ENDPOINT = '/user';

type UserActionResponse = {
  status_code: number;
  message: string;
};

export const UserService = {
  getMe: () => apiClient.get<User>('/auth/me').then((res) => res.data),

  deleteAccount: () =>
    apiClient.post<UserActionResponse>(`${USER_ENDPOINT}/delete`).then((res) => res.data),
};
