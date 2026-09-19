import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Users, UserX, AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, initials } from '@/lib/utils';
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
  use_salary_components: boolean | null;
  basic_ngn: number | null;
  housing_ngn: number | null;
  transport_ngn: number | null;
  other_allowances_ngn: number | null;
};

/**
 * What this person is actually paid a month.
 *
 * Everywhere else that decides who gets paid derives gross this way — from
 * the components when the employee is on the components plan, from
 * salary_ngn otherwise. This panel used to read salary_ngn alone, which is
 * correct only while salary_ngn is kept equal to the components total.
 *
 * It is, today: the compensation form writes the computed gross into
 * salary_ngn on every save, and the CSV import only ever creates flat-salary
 * employees. But nothing at the database level enforces it, and the failure
 * mode if it ever breaks is the worst kind here — a components employee with
 * salary_ngn of 0 is silently binned as "No salary configured" and quietly
 * not paid, on the very screen whose job is to show who is getting paid.
 * Deriving it the same way as everyone else removes the dependency rather
 * than trusting it.
 */
const grossOf = (e: RosterEmployee): number =>
  e.use_salary_components
    ? Number(e.basic_ngn || 0)
      + Number(e.housing_ngn || 0)
      + Number(e.transport_ngn || 0)
      + Number(e.other_allowances_ngn || 0)
    : Number(e.salary_ngn || 0);

type ExclusionReason = 'inactive' | 'driver' | 'no_salary' | 'segment' | 'other_company';

const REASON_LABEL: Record<ExclusionReason, string> = {
  inactive: 'Inactive',
  driver: 'Fleet Staff role (paid via Fleet, not Payroll)',
  no_salary: 'No salary configured (₦0 or empty)',
  segment: 'Outside the selected payroll segment',
  other_company: 'Not part of the selected company',
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

/** Fetches every employee (paginated) once and re-derives who's in/out whenever the filter changes. */
function useRoster(rules: PayrollSegmentFilterRules | null, companyId?: string | null) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  // pay_group_id -> company_id, so "who gets paid" can be scoped to the
  // company a run is being drafted for — an employee's company is derived
  // from their pay group, there is no separate company field on profiles.
  const [payGroupCompanyById, setPayGroupCompanyById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const PAGE_SIZE = 1000;
    async function fetchAll() {
      const all: RosterEmployee[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email, role, status, salary_ngn, bank_account_number, department_id, employment_type, pay_group_id, use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn')
          .range(from, from + PAGE_SIZE - 1);
        if (cancelled) return;
        const rows = (data || []) as RosterEmployee[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setEmployees(all);
      setLoading(false);
    }
    fetchAll();
    supabase
      .from('pay_groups')
      .select('id, company_id')
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const g of (data || []) as { id: string; company_id: string }[]) map[g.id] = g.company_id;
        setPayGroupCompanyById(map);
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const included: RosterEmployee[] = [];
    const excludedByReason: Record<ExclusionReason, RosterEmployee[]> = {
      inactive: [], driver: [], no_salary: [], segment: [], other_company: [],
    };
    for (const e of employees) {
      let reason: ExclusionReason | null = null;
      if ((e.status ?? 'active') !== 'active') reason = 'inactive';
      else if (e.role === 'driver') reason = 'driver';
      else if (companyId && payGroupCompanyById[e.pay_group_id ?? ''] !== companyId) reason = 'other_company';
      else if (grossOf(e) <= 0) reason = 'no_salary';
      else if (rules && !matchesSegment(e, rules)) reason = 'segment';

      if (reason) excludedByReason[reason].push(e);
      else included.push(e);
    }
    const missingBankDetails = included.filter((e) => !e.bank_account_number);
    const totalNgn = included.reduce((s, e) => s + grossOf(e), 0);
    return { loading, included, excludedByReason, missingBankDetails, totalNgn };
  }, [employees, rules, loading, companyId, payGroupCompanyById]);
}

const empName = (e: RosterEmployee) => displayName(e.first_name, e.last_name, e.full_name || e.email || 'Unnamed');


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
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-3xs font-bold', avatarColour(e.id))}>
        {initials(name)}
      </span>
      <span className="min-w-0 truncate text-foreground" title={name}>{name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground text-right w-[92px]">{formatNaira(grossOf(e))}</span>
      {missingBank && (
        <span className="col-start-2 col-span-2 -mt-0.5 flex items-center gap-1 text-2xs text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No bank account on file
          <Link
            to={`/employees/${e.id}?tab=job_pay`}
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
  companyId,
  defaultExpanded = false,
}: {
  payrollSegmentId?: string | null;
  rulesOverride?: PayrollSegmentFilterRules | null;
  /** Scope "who gets paid" to one company — an employee's company is derived
   * from their pay group. Omit to show everyone regardless of company. */
  companyId?: string | null;
  defaultExpanded?: boolean;
}) {
  const [savedRules, setSavedRules] = useState<PayrollSegmentFilterRules | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [excludedOpen, setExcludedOpen] = useState(false);

  useEffect(() => {
    if (rulesOverride !== undefined) return; // override mode — no lookup needed
    fetchSegmentRules(payrollSegmentId).then(setSavedRules);
  }, [payrollSegmentId, rulesOverride]);

  const rules = rulesOverride !== undefined ? rulesOverride : savedRules;
  const { loading, included, excludedByReason, missingBankDetails, totalNgn } = useRoster(rules, companyId);

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
                <Badge variant="outline" className="border-warning/40 text-warning">
                  {missingBankDetails.length} missing bank details
                </Badge>
              )}
            </span>
            {included.length > 0 && (
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 max-w-[220px] overflow-hidden rounded-full bg-border/70">
                  <span
                    className={cn('block h-full rounded-full', readyPct === 100 ? 'bg-success' : 'bg-warning')}
                    style={{ width: `${readyPct}%` }}
                  />
                </span>
                <span className="text-2xs text-muted-foreground shrink-0">
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
            <Input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Find someone…"
              aria-label="Search employees"
              className="w-full py-1.5 pl-8 pr-2.5 text-xs h-auto"
            />
          </div>
        )}

        {needsAttention.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 font-medium text-warning mb-1">
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

        {/* Everyone NOT being paid, behind one disclosure at the very bottom.
            These used to render as four always-open lists — Inactive (19),
            No salary (2), Outside the segment (17), Not part of the company
            (10) — which filled the whole dialog with ~48 people who are not
            being paid and pushed the ones who ARE off the screen. It read as
            "the filter isn't working" when the filter was in fact doing
            exactly its job. Who is getting paid is the question this step
            answers; who isn't is a footnote you open only if a number looks
            wrong. */}
        {totalExcluded > 0 && (
          <Collapsible open={excludedOpen} onOpenChange={setExcludedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-[32px] w-full items-center gap-1.5 border-t border-border/60 pt-2.5 text-left text-2xs font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={excludedOpen}
              >
                <UserX className="h-3.5 w-3.5 shrink-0" />
                View excluded ({totalExcluded})
                <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', excludedOpen && 'rotate-180')} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2.5 pt-2">
              {(Object.keys(excludedByReason) as ExclusionReason[]).map((reason) => {
                const list = excludedByReason[reason];
                if (!list.length) return null;
                // Inactive/driver exclusions are expected and not actionable
                // during payroll review — naming every former employee is
                // noise. No-salary/segment/other-company exclusions might mean
                // a real config problem, so those stay listed by name.
                const listNames = reason === 'no_salary' || reason === 'segment' || reason === 'other_company';
                return (
                  <div key={reason}>
                    <p className="mb-1 font-medium text-muted-foreground">{REASON_LABEL[reason]} ({list.length})</p>
                    {listNames && (
                      <ul className="space-y-0.5 pl-1">
                        {list.map((e) => <li key={e.id} className="text-muted-foreground">{empName(e)}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
        {included.length === 0 && totalExcluded === 0 && (
          <p className="text-muted-foreground">No employees found.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
