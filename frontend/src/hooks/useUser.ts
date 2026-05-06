import { UserService } from '@/services/userService';
import { User } from '@/types/auth';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export const meQueryKey = ['users', 'me'] as const;

type UseMeOptions = Omit<UseQueryOptions<User>, 'queryKey' | 'queryFn'>;

export const useMe = (options?: Partial<UseMeOptions>) => {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: UserService.getMe,
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  });
};
