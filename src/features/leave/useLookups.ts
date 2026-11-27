import { useMemo } from 'react';
import { useLeaveTypes, usePeople } from './leaveApi';
import { titleCase } from './leaveMath';
import type { Person } from './types';

const FALLBACK_COLORS: Record<string, string> = {
  annual: '#0ea5e9', sick: '#f97316', maternity: '#ec4899', paternity: '#8b5cf6',
  compassionate: '#64748b', casual: '#84cc16', study: '#14b8a6', unpaid: '#94a3b8',
};

/** Names for people and leave types, looked up in one place. */
export function useLookups() {
  const { data: people } = usePeople();
  const { data: types } = useLeaveTypes();
  return useMemo(() => {
    const byId = new Map<string, Person>((people ?? []).map((p) => [p.id, p]));
    const typeBy = new Map((types ?? []).map((t) => [t.code, t]));
    return {
      people: people ?? [],
      types: types ?? [],
      person: (id: string | null | undefined) => (id ? byId.get(id) : undefined),
      nameOf: (id: string | null | undefined) => (id ? byId.get(id)?.full_name ?? 'Someone' : 'Someone'),
      typeName: (code: string) => typeBy.get(code)?.name ?? `${titleCase(code)} Leave`,
      typeColor: (code: string) => typeBy.get(code)?.color ?? FALLBACK_COLORS[code] ?? '#94a3b8',
    };
  }, [people, types]);
}
