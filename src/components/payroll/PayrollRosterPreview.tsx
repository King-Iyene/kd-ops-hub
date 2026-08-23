import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Users, UserX, AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  fetchSegmentRules,
  matchesSegment,
  type PayrollSegmentFilterRules,
  type SegmentableEmployee,
} from '@/lib/payroll-segments';
import { displayName } from '@/lib/name';
import { formatNaira } from '@/lib/format';

type RosterEmployee = SegmentableEmployee & {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  salary_ngn: number | null;
  bank_account_number: string | null;
};

type ExclusionReason = 'inactive' | 'driver' | 'no_salary' | 'segment';

const REASON_LABEL: Record<ExclusionReason, string> = {
  inactive: 'Inactive',
  driver: 'Fleet Staff role (paid via Fleet, not Payroll)',
  no_salary: 'No salary configured (₦0 or empty)',
  segment: 'Outside the selected payroll segment',
};

// Same rotating palette the Pay Groups admin screen and the wizard's pay-
// group cards already use, so an avatar chip here reads as the same visual
// language rather than a one-off.
const AVATAR_COLOURS = [
  'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
];

/** Fetches every employee once and re-derives who's in/out whenever the filter changes. */
function useRoster(rules: PayrollSegmentFilterRules | null) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, role, status, salary_ngn, bank_account_number, department_id, employee_category, employment_type, pay_group_id')
      .limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        setEmployees((data || []) as RosterEmployee[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const included: RosterEmployee[] = [];
    const excludedByReason: Record<ExclusionReason, RosterEmployee[]> = {
      inactive: [], driver: [], no_salary: [], segment: [],
    };
    for (const e of employees) {
      let reason: ExclusionReason | null = null;
      if ((e.status ?? 'active') !== 'active') reason = 'inactive';
      else if (e.role === 'driver') reason = 'driver';
      else if (!e.salary_ngn || Number(e.salary_ngn) <= 0) reason = 'no_salary';
      else if (rules && !matchesSegment(e, rules)) reason = 'segment';

      if (reason) excludedByReason[reason].push(e);
      else included.push(e);
    }
    const missingBankDetails = included.filter((e) => !e.bank_account_number);
    const totalNgn = included.reduce((s, e) => s + Number(e.salary_ngn || 0), 0);
    return { loading, included, excludedByReason, missingBankDetails, totalNgn };
  }, [employees, rules, loading]);
}

const empName = (e: RosterEmployee) => displayName(e.first_name, e.last_name, e.full_name || e.email || 'Unnamed');

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
};

// Deterministic so the same person always gets the same colour across
// renders/sessions, without needing to store anything.
const avatarColour = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
};

function RosterRow({ e }: { e: RosterEmployee }) {
  const name = empName(e);
  const missingBank = !e.bank_account_number;
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-0 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', avatarColour(e.id))}>
        {initials(name)}
      </span>
      <span className="min-w-0 truncate text-foreground" title={name}>{name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground text-right w-[92px]">{formatNaira(e.salary_ngn)}</span>
      {missingBank && (
        <span className="col-start-2 col-span-2 -mt-0.5 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No bank account on file
          <Link
            to={`/employees/${e.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-semibold text-primary hover:underline"
          >
            Fix now
          </Link>
        </span>
      )}
    </li>
  );
}

/**
 * Shows exactly who a payroll run will and won't pay before it's drafted —
 * generatePayslips()'s employee query (status='active', role<>'driver',
 * salary_ngn>0, matches segment) silently drops everyone else with no
 * visibility into who or why. This surfaces that filter instead of hiding it.
 *
 * Pass either a saved segment id (payrollSegmentId) or an in-progress,
 * not-yet-saved filter (rulesOverride) — the segment builder uses the
 * latter so the match list updates live as someone toggles Pay
 * Groups/categories/departments, before they've clicked "Create segment".
 */
export function PayrollRosterPreview({
  payrollSegmentId,
  rulesOverride,
  defaultExpanded = false,
}: {
  payrollSegmentId?: string | null;
  rulesOverride?: PayrollSegmentFilterRules | null;
  defaultExpanded?: boolean;
}) {
  const [savedRules, setSavedRules] = useState<PayrollSegmentFilterRules | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (rulesOverride !== undefined) return; // override mode — no lookup needed
    fetchSegmentRules(payrollSegmentId).then(setSavedRules);
  }, [payrollSegmentId, rulesOverride]);

  const rules = rulesOverride !== undefined ? rulesOverride : savedRules;
  const { loading, included, excludedByReason, missingBankDetails, totalNgn } = useRoster(rules);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Checking who matches…</p>;
  }

  const totalExcluded = Object.values(excludedByReason).reduce((s, l) => s + l.length, 0);
  const readyCount = included.length - missingBankDetails.length;
  const readyPct = included.length > 0 ? Math.round((readyCount / included.length) * 100) : 0;

  const q = query.trim().toLowerCase();
  const matches = (e: RosterEmployee) => !q || empName(e).toLowerCase().includes(q);
  const needsAttention = included.filter((e) => !e.bank_account_number && matches(e)).sort((a, b) => empName(a).localeCompare(empName(b)));
  const ready = included.filter((e) => e.bank_account_number && matches(e)).sort((a, b) => empName(a).localeCompare(empName(b)));

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="rounded-lg border border-border/60 bg-muted/30">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium text-foreground currency">
                <Users className="h-3.5 w-3.5" /> {included.length} will be paid · {formatNaira(totalNgn)}
              </span>
              {totalExcluded > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <UserX className="h-3.5 w-3.5" /> {totalExcluded} excluded
                </span>
              )}
              {missingBankDetails.length > 0 && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                  {missingBankDetails.length} missing bank details
                </Badge>
              )}
            </span>
            {included.length > 0 && (
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 max-w-[220px] overflow-hidden rounded-full bg-border/70">
                  <span
                    className={cn('block h-full rounded-full', readyPct === 100 ? 'bg-success' : 'bg-amber-500')}
                    style={{ width: `${readyPct}%` }}
                  />
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {readyCount}/{included.length} ready to pay
                </span>
              </span>
            )}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60 px-3 py-2.5 space-y-3.5 text-xs">
        {included.length > 6 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Find someone…"
              className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-primary/50"
            />
          </div>
        )}

        {needsAttention.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs attention ({needsAttention.length})
            </p>
            <ul className="space-y-px max-h-64 overflow-y-auto">
              {needsAttention.map((e) => <RosterRow key={e.id} e={e} />)}
            </ul>
          </div>
        )}

        {ready.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 font-medium text-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Ready to pay ({ready.length})
            </p>
            <ul className="space-y-px max-h-64 overflow-y-auto">
              {ready.map((e) => <RosterRow key={e.id} e={e} />)}
            </ul>
          </div>
        )}

        {q && needsAttention.length === 0 && ready.length === 0 && (
          <p className="text-muted-foreground">No one matching "{query}" will be paid.</p>
        )}

        {(Object.keys(excludedByReason) as ExclusionReason[]).map((reason) => {
          const list = excludedByReason[reason];
          if (!list.length) return null;
          // Inactive/driver exclusions are expected and not actionable during
          // payroll review — naming all 16 former employees one by one is
          // just noise. No-salary/segment exclusions might mean a real
          // config problem, so those stay listed by name.
          const listNames = reason === 'no_salary' || reason === 'segment';
          return (
            <div key={reason}>
              <p className="font-medium text-muted-foreground mb-1">{REASON_LABEL[reason]} ({list.length})</p>
              {listNames && (
                <ul className="space-y-0.5 pl-1">
                  {list.map((e) => <li key={e.id} className="text-muted-foreground">{empName(e)}</li>)}
                </ul>
              )}
            </div>
          );
        })}
        {included.length === 0 && totalExcluded === 0 && (
          <p className="text-muted-foreground">No employees found.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
