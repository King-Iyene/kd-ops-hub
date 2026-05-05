// My Expenses
//
// Personal view of expenses submitted by the current user. Replaces the older
// "My Requests" page that combined expense claims with fuel requests — fuel
// is now handled exclusively in the Fleet module, and this page focuses on
// expense lifecycle: pending → approved → paid (or rejected).

import { useCallback, useEffect, useState } from 'react';
import {
  Receipt,
  RefreshCw,
  Plus,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { formatDateTime, formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { AuroraHero } from '@/components/AuroraHero';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { usePageTitle } from '@/hooks/usePageTitle';

interface MyExpense {
  id: string;
  category: string;
  amount_ngn: number | null;
  date: string;
  description: string | null;
  status: string;
  receipt_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  payment_status: string | null;
  fuel_request_id: string | null;
}

const MyRequests = () => {
  usePageTitle('My Expenses');
  const { profile } = useAuthStore();

  const [expenses, setExpenses] = useState<MyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('expenses')
        .select(
          'id, category, amount_ngn, date, description, status, receipt_url, ' +
          'rejection_reason, created_at, payment_status, fuel_request_id'
        )
        .eq('submitted_by', profile.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (err) throw err;
      // Hide fuel-mirror rows — those live in Fleet.
      const nonFuel = (data as MyExpense[]).filter((e) => !e.fuel_request_id);
      setExpenses(nonFuel);
    } catch (err: any) {
      setError(err?.message || 'Failed to load your expenses.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchData);

  const totalPending = expenses.filter(
    (e) => e.status === 'pending' || e.status === 'pending_second_approval',
  ).length;

  return (
    <div className="space-y-6">
      <AuroraHero className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 opacity-80 kd-icon-glow" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                My Expenses
              </span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {totalPending === 0 ? 'All up to date.' : `${totalPending} pending`}
            </h1>
            <p className="text-sm opacity-70 mt-1.5">
              Your expense claims and their progress through approval and payment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium">
              <Receipt className="h-3 w-3" /> {expenses.length} claim{expenses.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white text-foreground hover:bg-white/90"
              onClick={() => { window.location.href = '/expenses'; }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New claim
            </Button>
          </div>
        </div>
      </AuroraHero>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : expenses.length === 0 ? (
            <EmptyState
              illustration="empty"
              title="No expense claims yet"
              description="Submit your first expense claim from the Expenses page."
              action={
                <Button variant="outline" size="sm" onClick={() => { window.location.href = '/expenses'; }}>
                  <Plus className="mr-2 h-4 w-4" /> Go to Expenses
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium capitalize">
                          {e.category?.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right currency">
                          {formatNaira(e.amount_ngn)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(e.created_at)}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate text-sm">{e.description || '—'}</div>
                          {e.receipt_url && (
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                            >
                              <ExternalLink className="h-3 w-3" /> View Receipt
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge status={e.status} />
                            {e.rejection_reason && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={e.rejection_reason}>
                                Reason: {e.rejection_reason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {e.status === 'approved' ? (
                            e.payment_status === 'processed' ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                            ) : e.payment_status === 'processing' ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Processing</Badge>
                            ) : e.payment_status === 'failed' ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Failed</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.status === 'rejected' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { window.location.href = '/expenses'; }}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Re-edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="md:hidden p-3 space-y-2">
                {expenses.map((e) => {
                  const accent =
                    e.status === 'pending' || e.status === 'pending_second_approval' ? 'bg-amber-500'
                    : e.status === 'approved' ? 'bg-emerald-500'
                    : e.status === 'rejected' ? 'bg-red-500'
                    : 'bg-muted-foreground';
                  return (
                    <MobileCard key={e.id} accentClassName={accent}>
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <MobileCardTitle className="capitalize">
                            {e.category?.replace(/_/g, ' ')}
                          </MobileCardTitle>
                        </div>
                        <MobileCardMeta className="currency text-base">
                          {formatNaira(e.amount_ngn)}
                        </MobileCardMeta>
                      </MobileCardHeader>
                      {e.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{e.description}</p>
                      )}
                      <MobileCardRow label="Submitted">{formatDateTime(e.created_at)}</MobileCardRow>
                      <MobileCardRow label="Status">
                        <StatusBadge status={e.status} />
                      </MobileCardRow>
                      {e.rejection_reason && (
                        <MobileCardRow label="Reason">
                          <span className="text-xs text-destructive">{e.rejection_reason}</span>
                        </MobileCardRow>
                      )}
                      {e.receipt_url && (
                        <MobileCardRow label="Receipt">
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary text-xs"
                          >
                            <ExternalLink className="h-3 w-3" /> View
                          </a>
                        </MobileCardRow>
                      )}
                      {e.status === 'rejected' && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={() => { window.location.href = '/expenses'; }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" /> Re-edit & Resubmit
                          </Button>
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyRequests;
