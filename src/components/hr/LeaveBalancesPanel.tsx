import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CalendarDays, Plane, Stethoscope, Baby, Heart, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

/**
 * LeaveBalancesPanel — world-class per-employee leave summary.
 *
 * Combines three views into one card:
 *   1. Ring stat  — annual leave — earned / used / pending, colour-tuned
 *   2. Policy grid — every leave_policies row with days used vs entitlement
 *   3. Recent history — last 10 leave_requests with status badges
 *
 * Auto-updates when leave gets approved/rejected because balance rows are
 * bumped by the approver flow (Leave.tsx::updateBalanceFor). Read-only
 * here — actions happen on the main Leave page.
 *
 * Innovative bits:
 *   • Accrual math: shows "X earned of Y this year" (not just quota × 12)
 *   • Pending days are subtracted from available in the UI so employees
 *     understand what's actually bookable RIGHT NOW.
 *   • Traffic-light tone: green >30%, amber 10-30%, red <10% remaining.
 */

interface LeavePolicy {
  code: string;
  name: string;
  default_days: number;
  accrual_type: string;
  gender: string | null;
  color: string | null;
}

interface LeaveBalance {
  year: number;
  annual_quota: number;
  annual_used: number;
  sick_used: number;
  unpaid_used: number;
  maternity_used?: number;
  paternity_used?: number;
}

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
}

interface Props {
  employeeId: string;
  employeeStartDate?: string | null;
  employeeGender?: string | null;
}

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  annual: Plane, sick: Stethoscope, maternity: Baby, paternity: Heart,
};

const STATUS_TONE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-destructive/10 text-destructive',
};

/**
 * Monthly accrual: employees earn 1/12 of their annual entitlement per
 * full calendar month worked THIS YEAR (or since start_date, whichever
 * is later). Matches the process_leave_accruals() DB scheduler.
 */
function accruedDays(quota: number, year: number, startDate: string | null): number {
  const now = new Date();
  const yearStart = new Date(year, 0, 1);
  const effectiveStart =
    startDate && new Date(startDate) > yearStart ? new Date(startDate) : yearStart;
  if (now < effectiveStart) return 0;
  const monthsWorked = Math.max(
    0,
    (now.getFullYear() - effectiveStart.getFullYear()) * 12
      + (now.getMonth() - effectiveStart.getMonth()) + 1,
  );
  return Math.min(quota, Math.round((quota / 12) * monthsWorked * 10) / 10);
}

export const LeaveBalancesPanel = ({
  employeeId, employeeStartDate, employeeGender,
}: Props) => {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pRes, bRes, rRes] = await Promise.all([
        supabase
          .from('leave_policies' as any)
          .select('code, name, default_days, accrual_type, gender, color')
          .eq('active', true)
          .order('default_days', { ascending: false }),
        supabase
          .from('leave_balances')
          .select('year, annual_quota, annual_used, sick_used, unpaid_used, maternity_used, paternity_used')
          .eq('employee_id', employeeId)
          .eq('year', year)
          .maybeSingle(),
        supabase
          .from('leave_requests')
          .select('id, leave_type, start_date, end_date, days_requested, status, reason, created_at')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setPolicies(((pRes.data ?? []) as any[]) as LeavePolicy[]);
      setBalance((bRes.data ?? null) as LeaveBalance | null);
      setRequests(((rRes.data ?? []) as any[]) as LeaveRequest[]);
      setLoading(false);
    })();
  }, [employeeId, year]);

  // Compute rich derived state
  const stats = useMemo(() => {
    const quota = balance?.annual_quota ?? 20;
    const used = balance?.annual_used ?? 0;
    const earned = accruedDays(quota, year, employeeStartDate ?? null);
    const pending = requests
      .filter((r) => r.leave_type === 'annual' && r.status === 'pending')
      .reduce((s, r) => s + (r.days_requested || 0), 0);
    const available = Math.max(0, earned - used - pending);
    const pctRemaining = quota > 0 ? Math.round((available / quota) * 100) : 0;
    return { quota, used, earned, pending, available, pctRemaining };
  }, [balance, requests, year, employeeStartDate]);

  const tone = stats.pctRemaining >= 30
    ? { ring: 'text-emerald-600', bg: 'bg-emerald-500', bar: 'bg-emerald-500' }
    : stats.pctRemaining >= 10
    ? { ring: 'text-amber-600',   bg: 'bg-amber-500',   bar: 'bg-amber-500' }
    : { ring: 'text-red-600',     bg: 'bg-red-500',     bar: 'bg-red-500' };

  // Per-policy used count — pulls the matching *_used column when it exists.
  const usedFor = (code: string): number => {
    const b = balance as any;
    if (!b) return 0;
    const key = `${code}_used`;
    return b[key] ?? 0;
  };

  const applicablePolicies = useMemo(() =>
    policies.filter((p) => !p.gender || p.gender === employeeGender)
  , [policies, employeeGender]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading leave balances…</p>;
  }

  return (
    <div className="space-y-4">
      {/* HERO — annual leave ring */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-6 flex-wrap">
            {/* SVG ring */}
            <div className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle
                  cx="60" cy="60" r="52"
                  stroke="currentColor"
                  className="text-muted opacity-30"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="60" cy="60" r="52"
                  stroke="currentColor"
                  className={cn(tone.ring, 'transition-all duration-700')}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(stats.pctRemaining / 100) * 326.7} 326.7`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tabular-nums">{stats.available}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">days left</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 min-w-[200px] space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Annual leave · {year}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {stats.earned} of {stats.quota} earned so far this year (accrues 1/12 per month)
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground">Used</p>
                  <p className="font-bold text-lg tabular-nums">{stats.used}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground">Pending</p>
                  <p className="font-bold text-lg tabular-nums text-amber-600">{stats.pending}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground">Available</p>
                  <p className={cn('font-bold text-lg tabular-nums', tone.ring)}>
                    {stats.available}
                  </p>
                </div>
              </div>
              <Link
                to="/leave"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                Request leave → <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All policies grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All leave types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {applicablePolicies.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No leave policies configured. Add them in Settings → leave_policies.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {applicablePolicies.map((p) => {
                const used = usedFor(p.code);
                const entitlement = p.default_days;
                const pct = entitlement > 0 ? Math.min(100, Math.round((used / entitlement) * 100)) : 0;
                const Icon = ICON[p.code] ?? CalendarDays;
                return (
                  <div
                    key={p.code}
                    className={cn(
                      'rounded-lg border p-3 space-y-1.5',
                      p.accrual_type === 'unpaid' && 'opacity-70',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-6 w-6 rounded-md grid place-items-center shrink-0"
                          style={{ background: (p.color || '#0ea5e9') + '22', color: p.color || '#0ea5e9' }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-sm font-medium truncate">{p.name}</p>
                      </div>
                      {p.accrual_type === 'unpaid' ? (
                        <Badge variant="secondary" className="text-[10px]">unpaid</Badge>
                      ) : (
                        <span className="text-xs font-semibold tabular-nums">
                          {used} / {entitlement}d
                        </span>
                      )}
                    </div>
                    {p.accrual_type !== 'unpaid' && (
                      <Progress value={pct} className="h-1.5" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent requests */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent requests</CardTitle>
          <Link
            to="/leave"
            className="text-[11px] text-primary hover:underline"
          >
            Manage on Leave page →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No leave requests on file.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="capitalize text-sm">{r.leave_type}</TableCell>
                    <TableCell className="text-xs">
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.days_requested}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn('text-[10px]', STATUS_TONE[r.status] || '')}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaveBalancesPanel;
