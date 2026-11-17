import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * The company the Time Tracking module is currently scoped to ("all" = everyone).
 * Saved in this browser, so it stays until it is changed back. It narrows every employee
 * picker and the team reports in the module. A company is a department row.
 */
const KEY = 'kd:timetrack:company';
const listeners = new Set<() => void>();

function read(): string {
  try { return window.localStorage.getItem(KEY) || 'all'; } catch { return 'all'; }
}

export function useCompany(): [string, (id: string) => void] {
  const company = useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener('storage', cb); return () => { listeners.delete(cb); window.removeEventListener('storage', cb); }; },
    read,
    () => 'all',
  );
  const set = useCallback((id: string) => {
    try { window.localStorage.setItem(KEY, id); } catch { /* private mode: still applies this session via listeners below */ }
    listeners.forEach((l) => l());
  }, []);
  return [company, set];
}

export function useCompanies() {
  return useQuery({
    queryKey: ['timetrack', 'companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60_000,
  });
}
