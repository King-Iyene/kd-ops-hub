import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
  type QueryKey,
} from '@tanstack/react-query';
import type { PostgrestSingleResponse, PostgrestResponse } from '@supabase/supabase-js';

type SupabaseQueryFn<T> = () => PromiseLike<PostgrestSingleResponse<T> | PostgrestResponse<T>>;

export function useSupabaseQuery<T>(
  queryKey: QueryKey,
  queryFn: SupabaseQueryFn<T>,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, Error>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await queryFn();
      if (error) throw new Error(error.message);
      return data as T;
    },
    ...options,
  });
}

export function useSupabaseMutation<TData, TVariables>(
  mutationFn: (vars: TVariables) => PromiseLike<PostgrestSingleResponse<TData> | PostgrestResponse<TData>>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>,
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (vars) => {
      const { data, error } = await mutationFn(vars);
      if (error) throw new Error(error.message);
      return data as TData;
    },
    ...options,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
}
