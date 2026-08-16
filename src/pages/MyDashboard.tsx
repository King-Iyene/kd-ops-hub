import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatNaira } from '@/lib/format';

interface LeaveBalance {
  id: string;
  leave_type: string;
  used: number;
  total: number;
}

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Goal {
  id: string;
  title: string;
  progress: number;
  status: string;
}

interface Timesheet {
  id: string;
  week_start: string;
  week_end: string;
  total_hours: number;
  status: string;
}

interface Policy {
  id: string;
  title: string;
}

interface StaffLoan {
  id: string;
  purpose: string;
  principal_amount: number;
  amount_repaid: number;
  outstanding_balance: number;
  status: string;
}

function formatLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MyDashboard() {
  usePageTitle('My Dashboard');

  const { user, profile } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [pendingPolicies, setPendingPolicies] = useState<Policy[]>([]);
  const [loans, setLoans] = useState<StaffLoan[]>([]);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const safe = async <T,>(
      fn: () => Promise<{ data: T | null; error: unknown }>,
    ): Promise<T | null> => {
      try {
        const { data, error } = await fn();
        if (error) return null;
        return data;
      } catch {
        return null;
      }
    };

    const [balances, requests, goalRows, tsRows, policies, loanRows] =
      await Promise.all([
        safe<LeaveBalance[]>(() =>
          supabase
            .from('leave_balances')
            .select('id, leave_type, used, total')
            .eq('employee_id', user.id),
        ),
        safe<LeaveRequest[]>(() =>
          supabase
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date, status')
            .eq('employee_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
        ),
        safe<Goal[]>(() =>
          supabase
            .from('goals')
            .select('id, title, progress, status')
            .eq('employee_id', user.id)
            .order('created_at', { ascending: false }),
        ),
        safe<Timesheet[]>(() =>
          supabase
            .from('timesheets')
            .select('id, week_start, week_end, total_hours, status')
            .eq('employee_id', user.id)
            .order('week_start', { ascending: false })
            .limit(4),
        ),
        safe<Policy[]>(async () => {
          const { data: acked } = await supabase
            .from('policy_acknowledgments')
            .select('policy_id')
            .eq('user_id', user.id);

          const ackedIds = (acked ?? []).map((a: { policy_id: string }) => a.policy_id);

          let query = supabase
            .from('handbook_policies')
            .select('id, title')
            .eq('require_acknowledgment', true);

          if (ackedIds.length > 0) {
            query = query.not('id', 'in', `(${ackedIds.join(',')})`);
          }

          return query;
        }),
        safe<StaffLoan[]>(() =>
          supabase
            .from('staff_loans')
            .select('id, purpose, principal_amount, amount_repaid, outstanding_balance, status')
            .eq('employee_id', user.id)
            .in('status', ['active', 'disbursed']),
        ),
      ]);

    setLeaveBalances(balances ?? []);
    setLeaveRequests(requests ?? []);
    setGoals(goalRows ?? []);
    setTimesheets(tsRows ?? []);
    setPendingPolicies(policies ?? []);
    setLoans(loanRows ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Dashboard" description={`Welcome back, ${firstName}`} />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Dashboard" description={`Welcome back, ${firstName}`} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Leave Balances */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Leave Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {leaveBalances.length === 0 ? (
              <EmptyState title="No leave balances" description="Leave balances will appear here once configured" compact />
            ) : (
              leaveBalances.map((b) => {
                const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0;
                return (
                  <div key={b.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{formatLabel(b.leave_type)}</span>
                      <span className="text-muted-foreground">
                        {b.used} / {b.total} days
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Leave Requests */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Leave Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {leaveRequests.length === 0 ? (
              <EmptyState title="No leave requests" description="Your recent leave requests will show here" compact />
            ) : (
              <div className="space-y-3">
                {leaveRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{formatLabel(r.leave_type)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(r.start_date), 'dd MMM')} – {format(parseISO(r.end_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Goals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Goals</CardTitle>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <EmptyState title="No goals" description="Goals assigned to you will appear here" compact />
            ) : (
              <div className="space-y-3">
                {goals.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{g.title}</span>
                      <StatusBadge status={g.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={g.progress ?? 0} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{g.progress ?? 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Timesheets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Timesheets</CardTitle>
          </CardHeader>
          <CardContent>
            {timesheets.length === 0 ? (
              <EmptyState title="No timesheets" description="Recent timesheets will appear here" compact />
            ) : (
              <div className="space-y-3">
                {timesheets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {format(parseISO(t.week_start), 'dd MMM')} – {format(parseISO(t.week_end), 'dd MMM')}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.total_hours} hours</p>
                    </div>
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Acknowledgments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pending Acknowledgments</CardTitle>
              {pendingPolicies.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{pendingPolicies.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingPolicies.length === 0 ? (
              <EmptyState title="All caught up" description="No policies pending your acknowledgment" compact />
            ) : (
              <div className="space-y-2">
                {pendingPolicies.map((p) => (
                  <div key={p.id} className="text-sm py-1 border-b last:border-0">
                    {p.title}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Loans */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Loans</CardTitle>
          </CardHeader>
          <CardContent>
            {loans.length === 0 ? (
              <EmptyState title="No active loans" description="Staff loan details will appear here" compact />
            ) : (
              <div className="space-y-4">
                {loans.map((l) => {
                  const pct =
                    l.principal_amount > 0
                      ? Math.round((l.amount_repaid / l.principal_amount) * 100)
                      : 0;
                  return (
                    <div key={l.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{l.purpose}</span>
                        <span className="text-muted-foreground">
                          {formatNaira(l.outstanding_balance)} left
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        {formatNaira(l.amount_repaid)} of {formatNaira(l.principal_amount)} repaid
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
