import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Users, UserX } from 'lucide-react';
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
  driver: 'Driver role (paid via Fleet, not Payroll)',
  no_salary: 'No salary configured (₦0 or empty)',
  segment: 'Outside the selected payroll segment',
};

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

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="rounded-lg border border-border/60 bg-muted/30">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
        >
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
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
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60 px-3 py-2 space-y-3 text-xs">
        {included.length > 0 && (
          <div>
            <p className="font-medium text-foreground mb-1">Will be paid ({included.length})</p>
            <ul className="space-y-0.5">
              {included
                .slice()
                .sort((a, b) => empName(a).localeCompare(empName(b)))
                .map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      {empName(e)}
                      {!e.bank_account_number && (
                        <span className="ml-1.5 text-amber-600 dark:text-amber-400" title="No bank account on file">⚠</span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{formatNaira(e.salary_ngn)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {(Object.keys(excludedByReason) as ExclusionReason[]).map((reason) => {
          const list = excludedByReason[reason];
          if (!list.length) return null;
          return (
            <div key={reason}>
              <p className="font-medium text-muted-foreground mb-1">{REASON_LABEL[reason]} ({list.length})</p>
              <ul className="space-y-0.5 pl-1">
                {list.map((e) => <li key={e.id} className="text-muted-foreground">{empName(e)}</li>)}
              </ul>
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
