import { UserService } from '@/services/userService';
import { User } from '@/types/auth';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export const useMe = (options?: Partial<UseQueryOptions<User>>) => {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: UserService.getMe,
    staleTime: 1000 * 60 * 5, // 5 mins
    ...options,
  });
};
