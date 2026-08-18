/**
 * Earned Wage Access — employees can draw a portion of accrued salary
 * mid-month, automatically deducted from their next payslip.
 *
 * Page shows three sections:
 *   1. Your earned wages — a visual progress bar of accrual + a draw button
 *   2. Your history — every EWA request the current user has made
 *   3. Pending requests (admin/finance only) — approve / reject queue
 *
 * The math runs server-side via RPCs so client-side tampering can't widen
 * the available amount or bypass the open-request lock.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Sparkles,
  Info,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { confirm } from '@/hooks/use-confirm';
import {
  fetchEligibility,
  requestEwa,
  approveEwa,
  rejectEwa,
  cancelEwa,
  EWA_STATUS_LABEL,
  type EwaEligibility,
  type EwaRequest,
  type EwaStatus,
} from '@/lib/ewa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { logAudit } from '@/lib/audit';
import { notifyChannels } from '@/lib/notify';
import { scanEwaAnomaliesSafe } from '@/lib/anomalies';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<EwaStatus, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
  disbursed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  settled: 'bg-success/10 text-success',
  cancelled: 'bg-muted text-muted-foreground',
};

interface AdminRequestRow extends EwaRequest {
  full_name?: string | null;
  phone?: string | null;
}

export default function EarnedWageAccess() {
  usePageTitle('Earned Wage Access');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const isFinance = profile?.role === 'admin' || profile?.role === 'finance' || profile?.role === 'super_admin';

  const [eligibility, setEligibility] = useState<EwaEligibility | null>(null);
  const [history, setHistory] = useState<EwaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request dialog
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reject dialog
  const [rejecting, setRejecting] = useState<AdminRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Admin queue
  const [pending, setPending] = useState<AdminRequestRow[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const elig = await fetchEligibility();
      setEligibility(elig);
    } catch (err: any) {
      setError(err?.message || 'Could not load eligibility');
    }
    const { data: hist } = await supabase
      .from('ewa_requests')
      .select('id, created_at, amount_ngn, status, reason, rejection_reason')
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory((hist as EwaRequest[]) || []);

    if (isFinance) {
      const { data: pendings } = await supabase
        .from('ewa_requests')
        .select('id, employee_id, amount_ngn, reason, created_at, settlement_period, profile:profiles!ewa_requests_employee_id_fkey(full_name, phone)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      const enriched = ((pendings as any[]) || []).map((r) => ({
        ...r,
        full_name: r.profile?.full_name ?? null,
        phone: r.profile?.phone ?? null,
      })) as AdminRequestRow[];
      setPending(enriched);
    }
    setLoading(false);
  }, [profile?.id, isFinance]);

  useEffect(() => {
    load();
  }, [load]);

  const accrualPct = useMemo(() => {
    if (!eligibility || eligibility.monthly_salary_ngn <= 0) return 0;
    return Math.min(100, (eligibility.accrued_to_date_ngn / eligibility.monthly_salary_ngn) * 100);
  }, [eligibility]);

  const availablePctOfMax = useMemo(() => {
    if (!eligibility || eligibility.max_for_month_ngn <= 0) return 0;
    return Math.min(100, (eligibility.available_now_ngn / eligibility.max_for_month_ngn) * 100);
  }, [eligibility]);

  const handleSubmitRequest = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await requestEwa(amt, reason.trim() || undefined);
      await logAudit('ewa_requested', `EWA request ${formatNaira(amt)}`, profile);
      toast({ title: 'Request submitted', description: 'Finance will review it shortly.' });
      setOpen(false);
      setAmount('');
      setReason('');
      load();
    } catch (err: any) {
      toast({ title: 'Could not submit request', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (req: EwaRequest) => {
    if (req.status !== 'pending') return;
    if (!(await confirm({ title: 'Cancel request?', description: 'Cancel this pending request?' }))) return;
    try {
      await cancelEwa(req.id);
      toast({ title: 'Request cancelled' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not cancel', description: err?.message, variant: 'destructive' });
    }
  };

  const handleApprove = async (req: AdminRequestRow) => {
    setActionId(req.id);
    try {
      await approveEwa(req.id);
      await logAudit(
        'ewa_approved',
        `EWA approved for ${req.full_name || req.employee_id} — ${formatNaira(req.amount_ngn)}`,
        profile,
      );
      // Fire-and-forget notification — never blocks the approval if it fails.
      notifyChannels({
        user: { id: req.employee_id, full_name: req.full_name, phone: req.phone },
        category: 'ewa',
        kind: 'ewa_approved',
        payload: {
          name: req.full_name || undefined,
          amount_ngn: Number(req.amount_ngn),
          settlement_period: req.settlement_period,
        },
        idempotencyKey: `ewa_approved:${req.id}`,
      });
      // Run anomaly scan — fire-and-forget. Catches velocity / max-eligibility /
      // inactive-employee patterns. Toast is suppressed; flags surface in /anomalies.
      scanEwaAnomaliesSafe(req.id);
      toast({ title: 'Approved', description: 'WhatsApp + in-app notification sent.' });
      load();
    } catch (err: any) {
      toast({ title: 'Approve failed', description: err?.message, variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejecting) return;
    if (rejectReason.trim().length < 5) {
      toast({ title: 'Please write a reason (≥ 5 characters)', variant: 'destructive' });
      return;
    }
    setRejectSubmitting(true);
    try {
      await rejectEwa(rejecting.id, rejectReason.trim());
      await logAudit(
        'ewa_rejected',
        `EWA rejected for ${rejecting.full_name || rejecting.employee_id} — ${rejectReason}`,
        profile,
      );
      notifyChannels({
        user: { id: rejecting.employee_id, full_name: rejecting.full_name, phone: rejecting.phone },
        category: 'ewa',
        kind: 'ewa_rejected',
        payload: {
          name: rejecting.full_name || undefined,
          amount_ngn: Number(rejecting.amount_ngn),
          reason: rejectReason.trim(),
        },
        idempotencyKey: `ewa_rejected:${rejecting.id}`,
      });
      toast({ title: 'Rejected', description: 'WhatsApp + in-app notification sent.' });
      setRejecting(null);
      setRejectReason('');
      load();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRejectSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earned Wage Access"
        description="Draw a portion of the salary you've already earned this month. Repaid automatically on your next payslip."
        icon={Wallet}
      />

      {/* Eligibility hero */}
      {loading ? (
        <Card><CardContent className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't load your eligibility</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : eligibility ? (
        <Card className="overflow-hidden rounded-xl border-primary/20">
          <CardHeader className="bg-primary/5 border-b border-border">
            <CardTitle className="kd-section-title flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Available to draw right now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">{formatNaira(eligibility.available_now_ngn)}</span>
              <span className="text-sm text-muted-foreground currency">
                of {formatNaira(eligibility.max_for_month_ngn)} max this month ({Math.round(eligibility.max_draw_percent * 100)}%)
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Accrued ({eligibility.day_of_month} of {eligibility.days_in_month} days)</span>
                <span className="currency">{formatNaira(eligibility.accrued_to_date_ngn)} of {formatNaira(eligibility.monthly_salary_ngn)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary/70 to-primary transition-all"
                  style={{ width: `${accrualPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Already drawn this month</span>
                <span className="currency">{formatNaira(eligibility.already_drawn_ngn)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-warning/60"
                  style={{ width: `${100 - availablePctOfMax}%` }}
                />
              </div>
            </div>

            {eligibility.can_request ? (
              <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
                <TrendingUp className="mr-2 h-4 w-4" />
                Request a draw
              </Button>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Not eligible to draw right now</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                    {eligibility.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      {eligibility && (
        <div className="kd-stat-grid">
          <StatCard title="Monthly salary"   value={formatNaira(eligibility.monthly_salary_ngn)}  icon={Wallet}     tone="primary" />
          <StatCard title="Accrued so far"   value={formatNaira(eligibility.accrued_to_date_ngn)} icon={TrendingUp} tone="success" />
          <StatCard title="Already drawn"    value={formatNaira(eligibility.already_drawn_ngn)}   icon={Clock}      tone="warning" />
          <StatCard title="Available now"    value={formatNaira(eligibility.available_now_ngn)}   icon={Sparkles}   tone="primary" />
        </div>
      )}

      {/* Admin queue */}
      {isFinance && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="kd-section-title flex items-center gap-2">
              <Inbox className="h-4 w-4 text-warning" /> Pending requests
              {pending.length > 0 && (
                <Badge variant="secondary" className="bg-warning/10 text-warning">{pending.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={3} cols={5} />
            ) : pending.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing pending"
                description="All EWA requests are reviewed. New ones will appear here for approval."
              />
            ) : (
              <>
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name || r.employee_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.reason || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionId === r.id}
                            onClick={() => handleApprove(r)}
                            className="bg-success/5 border-success/30 text-success hover:bg-success/10"
                          >
                            {actionId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionId === r.id}
                            onClick={() => { setRejecting(r); setRejectReason(''); }}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile card list — same data, thumb-friendly */}
              <div className="md:hidden p-3 space-y-2">
                {pending.map((r) => {
                  const busy = actionId === r.id;
                  return (
                    <MobileCard key={r.id}>
                      <MobileCardHeader>
                        <MobileCardTitle>{r.full_name || r.employee_id.slice(0, 8)}</MobileCardTitle>
                        <MobileCardMeta className="currency">{formatNaira(r.amount_ngn)}</MobileCardMeta>
                      </MobileCardHeader>
                      <MobileCardRow label="Reason">{r.reason || '—'}</MobileCardRow>
                      <MobileCardRow label="Requested">{formatDate(r.created_at)}</MobileCardRow>
                      <MobileCardFooter>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { setRejecting(r); setRejectReason(''); }}
                          className="flex-1 h-9 text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="h-4 w-4 mr-1.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => handleApprove(r)}
                          className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          )}
                          Approve
                        </Button>
                      </MobileCardFooter>
                    </MobileCard>
                  );
                })}
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* User history */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="kd-section-title">Your EWA history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No requests yet"
              description="Your accrued earnings can be drawn from above. Requests show up here once submitted."
            />
          ) : (
            <>
            <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason / Notes</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-right currency">{formatNaira(r.amount_ngn)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                        {EWA_STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {r.status === 'rejected' && r.rejection_reason
                        ? <span className="text-destructive">{r.rejection_reason}</span>
                        : (r.reason || '—')}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(r)}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Mobile card list — same data, thumb-friendly */}
            <div className="md:hidden p-3 space-y-2">
              {history.map((r) => (
                <MobileCard key={r.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{formatDate(r.created_at)}</MobileCardTitle>
                    <MobileCardMeta className="currency">{formatNaira(r.amount_ngn)}</MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Status">
                    <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                      {EWA_STATUS_LABEL[r.status]}
                    </Badge>
                  </MobileCardRow>
                  <MobileCardRow label="Reason / Notes">
                    {r.status === 'rejected' && r.rejection_reason
                      ? <span className="text-destructive">{r.rejection_reason}</span>
                      : (r.reason || '—')}
                  </MobileCardRow>
                  {r.status === 'pending' && (
                    <MobileCardFooter>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(r)} className="flex-1 h-9">
                        Cancel
                      </Button>
                    </MobileCardFooter>
                  )}
                </MobileCard>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={(v) => !submitting && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request earned wages</DialogTitle>
            <DialogDescription>
              Repaid automatically on your next payslip. No interest, no fees.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="kd-label">Amount (₦)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(eligibility?.available_now_ngn ?? '')}
              />
              <p className="kd-field-hint">
                Min ₦{eligibility?.min_draw_ngn?.toLocaleString() ?? '5,000'} •
                {' '}Max ₦{eligibility?.available_now_ngn?.toLocaleString() ?? '0'} for this period
              </p>
            </div>
            <div>
              <Label className="kd-label">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Emergency car repair"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(v) => !rejectSubmitting && !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              {rejecting && (
                <>Tell {rejecting.full_name || 'the employee'} why their request for {formatNaira(rejecting.amount_ngn)} can't go through.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Outstanding employee advance must be cleared first."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={rejectSubmitting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={rejectSubmitting || rejectReason.trim().length < 5}
            >
              {rejectSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

