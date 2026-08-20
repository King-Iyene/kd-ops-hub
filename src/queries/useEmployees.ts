import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

interface EmployeeRow {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  department_id: string | null;
  department_name: string | null;
  status: string;
  job_title: string | null;
  avatar_url: string | null;
  payroll_category: string | null;
  basic_salary_ngn: number | null;
  bank_name: string | null;
  date_of_hire: string | null;
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
        .select('id, full_name, email, role, department_id, department_name, status, job_title, avatar_url, payroll_category, basic_salary_ngn, bank_name, date_of_hire')
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
