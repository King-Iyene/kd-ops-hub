import { useMemo } from 'react';
import { useActiveEmployees as useAllActiveEmployees, useEmployeeDirectory } from '@/queries/useEmployees';
import { isFieldTeam } from '@/lib/fieldTeam';
import { useCompany } from './company';

/**
 * Drop-in replacement for useActiveEmployees inside the Time Tracking module: same shape,
 * narrowed to the company chosen in the page header (saved until changed back).
 * The KD Squares field team is never part of Track, so it is left out of every list and picker here.
 */
export function useActiveEmployees() {
  const q = useAllActiveEmployees();
  const [company] = useCompany();
  const data = useMemo(
    () => (q.data ?? []).filter((e) => !isFieldTeam(e) && (company === 'all' || (company === 'none' ? !e.department_id : e.department_id === company))),
    [q.data, company],
  );
  return { ...q, data };
}

/**
 * Ids of the people Track should show: the ones in the chosen company, never the field team.
 * null means "no one to leave out" (all companies and no field team), so callers can skip filtering.
 */
export function useCompanyEmployeeIds(): Set<string> | null {
  const active = useAllActiveEmployees();
  const directory = useEmployeeDirectory();
  const [company] = useCompany();
  return useMemo(() => {
    if (company === 'all') {
      const everyone = (directory.data ?? []) as { id: string; role?: string | null; job_title?: string | null }[];
      // Until the directory has loaded there is nothing to leave out yet; it is re-checked the moment it arrives.
      if (!everyone.some((e) => isFieldTeam(e))) return null;
      return new Set(everyone.filter((e) => !isFieldTeam(e)).map((e) => e.id));
    }
    return new Set((active.data ?? []).filter((e) => !isFieldTeam(e) && (company === 'none' ? !e.department_id : e.department_id === company)).map((e) => e.id));
  }, [active.data, directory.data, company]);
}

/** Ids of the field team (never shown in Track). Empty until the directory has loaded. */
export function useFieldTeamIds(): Set<string> {
  const directory = useEmployeeDirectory();
  return useMemo(
    () => new Set(((directory.data ?? []) as { id: string; role?: string | null; job_title?: string | null }[]).filter((e) => isFieldTeam(e)).map((e) => e.id)),
    [directory.data],
  );
}
