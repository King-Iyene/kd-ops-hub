import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  Play,
  DollarSign,
  ShieldAlert,
  Download,
  RotateCw,
  AlertTriangle,
  FileText,
  CalendarClock,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-info/10 text-info',
  funded: 'bg-accent/10 text-accent',
  processing: 'bg-info/10 text-info',
  processed: 'bg-success/10 text-success',
  partially_processed: 'bg-warning/10 text-warning',
  rejected: 'bg-destructive/10 text-destructive',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  funded: 'Funded',
  processing: 'Processing',
  processed: 'Processed',
  partially_processed: 'Partial',
  rejected: 'Rejected',
};

// Role-based access control removed — every signed-in user can approve.

const csvEscape = (v: any): string => {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const escapeHtml = (v: any): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const BatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [batch, setBatch] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    fetchBatch();
  }, [id]);

  const fetchBatch = async () => {
    const [batchRes, itemsRes] = await Promise.all([
      supabase.from('payment_batches').select('*').eq('id', id).single(),
      supabase.from('batch_items').select('*').eq('batch_id', id).order('created_at'),
    ]);
    setBatch(batchRes.data);
    setItems(itemsRes.data || []);
    setLoading(false);
  };

  const canApprove = !!profile;
  const cannotApproveReason: string | null = profile ? null : 'Not authenticated.';

  const updateStatus = async (status: string, extra?: any) => {
    setActionLoading(true);
    try {
      if ((status === 'approved' || status === 'rejected') && !profile) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        setActionLoading(false);
        return;
      }

      const update: any = { status, ...extra };
      if (status === 'approved') update.approved_by = profile?.id;
      const { error } = await supabase.from('payment_batches').update(update).eq('id', id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `Batch ${statusLabels[status]?.toLowerCase() || status}` });

        const amountTxt = formatNaira(batch?.total_amount || 0);
        if (status === 'approved') {
          await logAudit('batch_approved', `Batch "${batch?.name}" approved (${amountTxt}, ${items.length} beneficiaries)`, profile);
        } else if (status === 'rejected') {
          await logAudit('batch_rejected', `Batch "${batch?.name}" rejected: ${extra?.rejection_reason || ''}`, profile);
        } else if (status === 'pending_approval') {
          await logAudit('batch_submitted', `Batch "${batch?.name}" submitted for approval`, profile);
        } else if (status === 'funded') {
          await logAudit('batch_funded', `Batch "${batch?.name}" marked funded`, profile);
        }
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
      setShowReject(false);
    }
  };

  const handleProcess = async () => {
    setActionLoading(true);
    try {
      await supabase.from('payment_batches').update({ status: 'processing' }).eq('id', id);
      // Simulate processing — random small failure rate so the retry UX has
      // realistic state to operate on. In production this is replaced with
      // the real disbursement integration.
      const updates = items.map((it) => {
        const failed = Math.random() < 0.08;
        return supabase
          .from('batch_items')
          .update(
            failed
              ? {
                  status: 'failed',
                  failure_reason:
                    'Simulated rail failure — retry to attempt again.',
                }
              : { status: 'succeeded', failure_reason: null },
          )
          .eq('id', it.id);
      });
      await Promise.all(updates);
      const refreshed = await supabase
        .from('batch_items')
        .select('status')
        .eq('batch_id', id);
      const anyFailed = (refreshed.data || []).some(
        (r) => (r as any).status === 'failed',
      );
      const finalStatus = anyFailed ? 'partially_processed' : 'processed';
      await supabase
        .from('payment_batches')
        .update({ status: finalStatus })
        .eq('id', id);
      await logAudit(
        'batch_processed',
        `Batch "${batch?.name}" ${finalStatus.replace('_', ' ')} (${formatNaira(batch?.total_amount || 0)})`,
        profile,
      );
      toast({
        title: anyFailed ? 'Batch partially processed' : 'Batch processed successfully',
        description: anyFailed
          ? 'Some beneficiaries failed — retry from the table below.'
          : undefined,
      });
      fetchBatch();
    } finally {
      setActionLoading(false);
    }
  };

  const retryItem = async (item: any) => {
    if (!profile) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }
    setRetryingId(item.id);
    try {
      // Mark the item as retried then re-attempt — same simulation logic.
      await supabase
        .from('batch_items')
        .update({ status: 'retry', failure_reason: null })
        .eq('id', item.id);
      await new Promise((r) => setTimeout(r, 350));
      const ok = Math.random() < 0.85;
      await supabase
        .from('batch_items')
        .update(
          ok
            ? { status: 'succeeded', failure_reason: null }
            : {
                status: 'failed',
                failure_reason: 'Retry failed — escalate to bank ops.',
              },
        )
        .eq('id', item.id);
      await logAudit(
        'batch_item_retried',
        `Beneficiary "${item.full_name}" retried — ${ok ? 'succeeded' : 'failed again'}`,
        profile,
      );
      // If everything is now succeeded, flip the batch to processed.
      const refreshed = await supabase
        .from('batch_items')
        .select('status')
        .eq('batch_id', id);
      const anyFailed = (refreshed.data || []).some(
        (r) => (r as any).status === 'failed',
      );
      const allOk = (refreshed.data || []).every(
        (r) => (r as any).status === 'succeeded',
      );
      if (allOk) {
        await supabase
          .from('payment_batches')
          .update({ status: 'processed' })
          .eq('id', id);
      } else if (!anyFailed) {
        await supabase
          .from('payment_batches')
          .update({ status: 'processing' })
          .eq('id', id);
      }
      toast({
        title: ok ? 'Retry succeeded' : 'Retry failed',
        variant: ok ? 'default' : 'destructive',
      });
      fetchBatch();
    } finally {
      setRetryingId(null);
    }
  };

  const exportCsv = () => {
    const header = [
      'full_name',
      'bank_name',
      'account_number',
      'amount_ngn',
      'reference',
      'status',
    ];
    const rows = items.map((i) => [
      i.full_name ?? '',
      i.bank_name ?? '',
      i.account_number ?? '',
      i.amount_ngn ?? 0,
      i.reference ?? '',
      i.status ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeName = (batch?.name || 'batch').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exported', description: `${items.length} beneficiaries exported.` });
  };

  // Open a printable HTML receipt in a new tab — user can save as PDF via the
  // browser print dialog. Avoids pulling in a heavy PDF library.
  const downloadReceipt = async () => {
    if (!batch) return;
    const safeName = (batch.name || 'batch').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const totalSucceeded = items
      .filter((i) => i.status === 'succeeded')
      .reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
    const totalFailed = items
      .filter((i) => i.status === 'failed')
      .reduce((s, i) => s + Number(i.amount_ngn || 0), 0);

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(safeName)} — KDOps Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cabin:wght@400;600;700&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'Cabin', system-ui, sans-serif; color: #0a2533; padding: 32px; max-width: 880px; margin: 0 auto; }
    .brand { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 3px solid #006994; margin-bottom: 24px; }
    .brand .mark { width: 44px; height: 44px; border-radius: 8px; background: #006994; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #006994; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; font-size: 13px; }
    .meta div { padding: 6px 0; }
    .meta .l { color: #5b6b75; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta .v { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e8edf0; }
    th { background: #f6f9fb; color: #5b6b75; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    .right { text-align: right; }
    .totals { margin-top: 16px; padding: 12px 16px; background: #f6f9fb; border-radius: 8px; display: flex; justify-content: flex-end; gap: 24px; font-size: 13px; }
    .totals .v { font-weight: 700; }
    .stamp { margin-top: 32px; padding: 12px; border: 2px dashed #D6AC50; border-radius: 8px; color: #6f5a25; font-size: 12px; text-align: center; }
    .footer { margin-top: 28px; font-size: 11px; color: #8194a0; text-align: center; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .pill.success { background: #e6f7ec; color: #117a3d; }
    .pill.failed  { background: #fde9e9; color: #b22222; }
    .pill.pending { background: #fff5e0; color: #8c6700; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="brand">
    <div class="mark">KD</div>
    <div>
      <h1>Payment Batch Receipt</h1>
      <div style="font-size:12px;color:#5b6b75">KD Squares Ltd · KDOps</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="l">Batch</div><div class="v">${escapeHtml(batch.name)}</div></div>
    <div><div class="l">Status</div><div class="v">${escapeHtml(statusLabels[batch.status] || batch.status)}</div></div>
    <div><div class="l">Payment Date</div><div class="v">${escapeHtml(formatDate(batch.payment_date))}</div></div>
    <div><div class="l">Period</div><div class="v">${escapeHtml(batch.period || '—')}</div></div>
    <div><div class="l">Beneficiaries</div><div class="v">${items.length}</div></div>
    <div><div class="l">Total Amount</div><div class="v">${escapeHtml(formatNaira(batch.total_amount || 0))}</div></div>
    ${batch.scheduled_date ? `<div><div class="l">Scheduled</div><div class="v">${escapeHtml(formatDateTime(batch.scheduled_date))}</div></div>` : ''}
    <div><div class="l">Generated</div><div class="v">${escapeHtml(formatDateTime(new Date()))}</div></div>
  </div>

  <h2>Beneficiaries</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Bank</th>
        <th>Account</th>
        <th class="right">Amount</th>
        <th>Reference</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map((it, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(it.full_name)}</td>
            <td>${escapeHtml(it.bank_name)}</td>
            <td>${escapeHtml(it.account_number)}</td>
            <td class="right">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
            <td>${escapeHtml(it.reference || '')}</td>
            <td><span class="pill ${it.status === 'succeeded' ? 'success' : it.status === 'failed' ? 'failed' : 'pending'}">${escapeHtml(it.status)}</span></td>
          </tr>
        `)
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <div><span class="l">Succeeded:</span> <span class="v">${escapeHtml(formatNaira(totalSucceeded))}</span></div>
    <div><span class="l">Failed:</span> <span class="v">${escapeHtml(formatNaira(totalFailed))}</span></div>
    <div><span class="l">Total:</span> <span class="v">${escapeHtml(formatNaira(batch.total_amount || 0))}</span></div>
  </div>

  <div class="stamp">
    Receipt generated by KDOps · ${escapeHtml(profile?.full_name || profile?.email || 'unknown user')}
    on ${escapeHtml(formatDateTime(new Date()))}
  </div>

  <div class="footer">
    KD Squares Ltd · Operations Platform · This document is system-generated.
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    await logAudit(
      'batch_receipt_downloaded',
      `Receipt opened for batch "${batch.name}"`,
      profile,
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!batch) return <div className="text-center py-12">Batch not found</div>;

  // Role-based access control removed — action buttons are available to any user.
  const canExport = items.length > 0;
  const failedItems = items.filter((i) => i.status === 'failed');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/payments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold">{batch.name}</h1>
          <p className="text-muted-foreground text-sm">{batch.period}</p>
        </div>
        {canExport && (
          <>
            <Button variant="outline" size="sm" onClick={downloadReceipt}>
              <FileText className="mr-2 h-4 w-4" /> Receipt
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </>
        )}
        <Badge variant="secondary" className={statusColors[batch.status]}>
          {statusLabels[batch.status] || batch.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Payment Date</p><p className="font-medium">{formatDate(batch.payment_date)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Beneficiaries</p><p className="font-medium">{batch.beneficiary_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Amount</p><p className="font-bold currency">{formatNaira(batch.total_amount || 0)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Created</p><p className="font-medium">{formatDate(batch.created_at)}</p></CardContent></Card>
      </div>

      {batch.scheduled_date && (
        <Alert className="border-accent/40 bg-accent/5">
          <CalendarClock className="h-4 w-4 text-accent" />
          <AlertDescription className="text-sm">
            Scheduled to run at{' '}
            <span className="font-semibold">
              {formatDateTime(batch.scheduled_date)}
            </span>
            .
          </AlertDescription>
        </Alert>
      )}

      {batch.notes && (
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{batch.notes}</p></CardContent></Card>
      )}

      {batch.rejection_reason && (
        <Card className="border-destructive/30"><CardContent className="pt-4"><p className="text-xs text-destructive mb-1">Rejection Reason</p><p className="text-sm">{batch.rejection_reason}</p></CardContent></Card>
      )}

      {batch.status === 'pending_approval' && cannotApproveReason && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{cannotApproveReason}</AlertDescription>
        </Alert>
      )}

      {failedItems.length > 0 && canApprove && (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm">
            {failedItems.length} beneficiary{failedItems.length === 1 ? '' : 'ies'} failed
            — retry individually below or escalate to bank ops.
          </AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
          {batch.status === 'draft' && batch.created_by === profile?.id && (
            <Button onClick={() => updateStatus('pending_approval')} disabled={actionLoading}>
              Submit for Approval
            </Button>
          )}
          {batch.status === 'pending_approval' && canApprove && (
            <>
              <Button onClick={() => updateStatus('approved')} disabled={actionLoading} size="lg">
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve Batch
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {batch.status === 'approved' && (
            <Button onClick={() => updateStatus('funded')} disabled={actionLoading}>
              <DollarSign className="mr-2 h-4 w-4" /> Confirm Funded
            </Button>
          )}
          {batch.status === 'funded' && (
            <Button onClick={handleProcess} disabled={actionLoading}>
              <Play className="mr-2 h-4 w-4" /> Process Payments
            </Button>
          )}
          {batch.status === 'partially_processed' && failedItems.length > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                for (const it of failedItems) {
                  await retryItem(it);
                }
              }}
              disabled={!!retryingId}
            >
              <RotateCw className="mr-2 h-4 w-4" /> Retry all failed (
              {failedItems.length})
            </Button>
          )}
        </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Beneficiaries ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="kd-transition">
                    <TableCell className="font-medium">{item.full_name}</TableCell>
                    <TableCell>{item.bank_name}</TableCell>
                    <TableCell>{item.account_number}</TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(item.amount_ngn || 0)}
                    </TableCell>
                    <TableCell>{item.reference}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge
                          variant="secondary"
                          className={
                            item.status === 'succeeded'
                              ? 'bg-success/10 text-success'
                              : item.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : item.status === 'retry'
                              ? 'bg-info/10 text-info'
                              : ''
                          }
                        >
                          {item.status}
                        </Badge>
                        {item.failure_reason && (
                          <span className="text-[11px] text-destructive">
                            {item.failure_reason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === 'failed' && canApprove ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingId === item.id}
                          onClick={() => retryItem(item)}
                        >
                          {retryingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="h-3.5 w-3.5 mr-1" />
                          )}
                          Retry
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Batch</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => updateStatus('rejected', { rejection_reason: rejectReason })} disabled={!rejectReason}>
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchDetail;
