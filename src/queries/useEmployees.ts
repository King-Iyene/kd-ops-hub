import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

interface EmployeeRow {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  department_id: string | null;
  status: string;
  job_title: string | null;
  photo_url: string | null;
}

export function useEmployeeDirectory() {
  return useSupabaseQuery(
    queryKeys.employees.directory(),
    () =>
      supabase
        .from('profiles_directory')
        .select('*')
        .order('full_name'),
    { staleTime: 30_000 },
  );
}

export function useActiveEmployees() {
  return useSupabaseQuery<EmployeeRow[]>(
    queryKeys.employees.list(),
    () =>
      supabase
        .from('profiles_directory')
        .select('id, full_name, email, role, department_id, status, job_title, photo_url')
        .eq('status', 'active')
        .order('full_name'),
    { staleTime: 30_000 },
  );
}

export function useEmployeeDetail(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.employees.detail(id || ''),
    () =>
      supabase
        .from('profiles')
        .select('*')
        .eq('id', id!)
        .single(),
    { enabled: !!id },
  );
}
