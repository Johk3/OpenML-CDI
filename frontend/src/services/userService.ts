import { apiClient } from '@/lib/apiClient';
import { User } from '@/types/auth';

// const ENDPOINT = '/user';

export const UserService = {
  getMe: () => apiClient.get<User>(`/auth/me`).then((res) => res.data),
  // TODO: Implement other endpoints

  getUser: (userId: string) =>
    apiClient.get<User>('/user/get', { params: { user_id: userId } }).then((res) => res.data),
};
