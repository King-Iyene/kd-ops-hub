import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatDateTime, formatNaira, maskAccountNumber } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import {
  writeRejectionNotification,
  isValidRejectionReason,
} from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  generateKdopsRef,
  verifyTransfer,
  getBankCode,
  paystackTransferFee,
  stampDutyFor,
  buildNarration,
  friendlyPaystackError,
  type NarrationKind,
} from '@/lib/paystack';
import { PaymentSummaryModal } from '@/components/PaymentSummaryModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { burst } from '@/components/Burst';
import { ApprovalCommentThread } from '@/components/ApprovalCommentThread';
import { StatusBadge, statusLabel } from '@/components/ui-kit/StatusBadge';
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
  Trash2,
  CalendarClock,
} from 'lucide-react';


const APPROVER_ROLES = ['admin', 'finance', 'super_admin'] as const;

/**
 * Statuses where the batch can be safely soft-deleted. Anything past 'funded'
 * means a transfer might be in flight or already settled — never delete those
 * because the audit chain must be preserved.
 */
const DELETABLE_STATUSES = ['draft', 'pending_approval', 'rejected', 'approved', 'funded'] as const;
const REASON_REQUIRED_STATUSES = new Set(['approved', 'funded']);

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

/**
 * Total platform deduction (Paystack fee + stamp duty if applicable) for a
 * single transfer amount. Stamp duty is ₦50 on transfers ≥ ₦10,000 from
 * 18 Feb 2026 (Nigeria Tax Act 2025). Payroll merchant exemption is honored
 * via the `exempt` flag — keep at false unless your Paystack account is
 * explicitly registered as exempt.
 */
function fullChargeForAmount(amountNgn: number): number {
  return paystackTransferFee(amountNgn) + stampDutyFor(amountNgn);
}

/**
 * Map a payment_batches row + batch_item to a NarrationKind so we know what
 * narration to send. Falls back to "generic" if the type is unknown.
 */
function narrationKindForBatch(batch: any): NarrationKind {
  const t = batch?.batch_type || batch?.payment_category || '';
  if (batch?.is_quick_pay) return 'quick_pay';
  if (t === 'employee_salary' || t === 'salary') return 'salary';
  if (t === 'employee_bonus' || t === 'bonus' || batch?.bonus_type) return 'bonus';
  if (t === 'employee_advance' || t === 'advance' || batch?.advance_reason) return 'advance';
  if (t === 'fuel_reimbursement' || t === 'fuel') return 'fuel';
  if (t === 'expense' || batch?.payment_category === 'expense_reimbursement') return 'expense';
  if (t === 'contractor' || t === 'contractor_payment') return 'contractor';
  return 'generic';
}

/** Build the narration that recipients see on their bank statement. */
function narrationForBatchItem(batch: any, item: any): string {
  return buildNarration({
    kind: narrationKindForBatch(batch),
    recipientName: item?.full_name || undefined,
    period: batch?.period || undefined,
    label: batch?.name || undefined,
  });
}

/**
 * Resolve the Paystack transfer fee for a batch item with graceful fallbacks.
 * Order of precedence:
 *   1. The structured `paystack_fee_ngn` column (populated by webhook).
 *   2. `paystack_raw.fee` (kobo) on the same row, populated by every webhook
 *      payload — works even before the column-add migration is applied.
 *   3. The full-tier estimate (Paystack fee + stamp duty) for succeeded
 *      transfers, so the UI never goes blank just because a webhook hasn't
 *      fired yet.
 *   4. Zero for non-succeeded items.
 */
function getItemFee(item: any): number {
  const direct = Number(item?.paystack_fee_ngn || 0);
  if (direct > 0) return direct;

  const rawFeeKobo = Number(item?.paystack_raw?.fee || 0);
  if (rawFeeKobo > 0) return rawFeeKobo / 100;

  if (item?.status === 'succeeded') {
    return fullChargeForAmount(Number(item?.amount_ngn || 0));
  }
  return 0;
}

const printItemReceipt = (item: any, batch: any, generatedBy?: string, companyName?: string, logoUrl?: string | null) => {
  const isFailed = item.status === 'failed';
  const isSucceeded = item.status === 'succeeded';
  const txnDateStr = item.processed_at || item.created_at
    ? new Date(item.processed_at || item.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const generatedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const narration = batch?.description || batch?.notes || `${companyName || 'KDOps'} · ${batch?.name || 'batch'}`;
  const statusText = isFailed ? 'FAILED' : isSucceeded ? 'SUCCESSFUL' : (item.status?.toUpperCase() || 'PENDING');
  const statusBg = isFailed ? '#fef2f2' : isSucceeded ? '#f0fdf4' : '#fffbeb';
  const statusColor = isFailed ? '#b91c1c' : isSucceeded ? '#15803d' : '#b45309';
  const accentColor = isFailed ? '#b91c1c' : '#006994';
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="logo" style="height:44px;width:auto;object-fit:contain;border-radius:6px;" />`
    : `<div style="width:44px;height:44px;border-radius:8px;background:#0a2533;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;">${escapeHtml((companyName || 'KD').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase())}</div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment Receipt — ${escapeHtml(item.full_name || '')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; color: #111827; background: #f9fafb; }
    .page { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #0a2533 0%, #0d3347 100%); padding: 24px 28px; display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .company-name { font-size: 17px; font-weight: 700; color: #fff; }
    .company-sub { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
    .status-pill { padding: 5px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: ${statusBg}; color: ${statusColor}; }
    .amount-section { padding: 24px 28px 20px; border-bottom: 1px solid #f3f4f6; }
    .amount-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 6px; }
    .amount { font-size: 38px; font-weight: 800; color: ${isFailed ? '#b91c1c' : '#111827'}; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
    .amount-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .details { padding: 20px 28px; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .row .lbl { color: #6b7280; flex-shrink: 0; }
    .row .val { font-weight: 500; text-align: right; word-break: break-all; }
    .row .val.mono { font-family: monospace; font-size: 11px; }
    ${isFailed ? `.watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg); font-size: 72px; font-weight: 900; color: rgba(185,28,28,0.06); letter-spacing: 0.1em; pointer-events: none; }` : ''}
    .alert { margin: 0 28px 20px; padding: 14px 16px; border-radius: 10px; font-size: 12px; }
    .alert.failed { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
    .alert.retry { background: #fffbeb; border: 1px solid #fde68a; color: #78350f; margin-top: -8px; }
    .footer { padding: 14px 28px; border-top: 1px solid #f3f4f6; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print { body { background: #fff; } .page { margin: 0; border-radius: 0; box-shadow: none; } .header { background: #0a2533 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  ${isFailed ? '<div class="watermark">FAILED</div>' : ''}
  <div class="page">
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div>
          <div class="company-name">${escapeHtml(companyName || 'KD Squares Ltd')}</div>
          <div class="company-sub">Payment Receipt</div>
        </div>
      </div>
      <div class="status-pill">${escapeHtml(statusText)}</div>
    </div>

    <div class="amount-section">
      <div class="amount-label">Amount Transferred</div>
      <div class="amount">${escapeHtml(item.amount_ngn != null ? `₦${Number(item.amount_ngn).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '—')}</div>
      <div class="amount-sub">${escapeHtml(narration)}</div>
    </div>

    <div class="details">
      <div class="row"><span class="lbl">Recipient</span><span class="val">${escapeHtml(item.full_name || '—')}</span></div>
      <div class="row"><span class="lbl">Bank</span><span class="val">${escapeHtml(item.bank_name || '—')}</span></div>
      <div class="row"><span class="lbl">Account</span><span class="val mono">${escapeHtml(maskAccountNumber(item.account_number) || '—')}</span></div>
      <div class="row"><span class="lbl">Paystack ref</span><span class="val mono">${escapeHtml(item.paystack_reference || '—')}</span></div>
      <div class="row"><span class="lbl">Transaction date</span><span class="val">${escapeHtml(txnDateStr)}</span></div>
      <div class="row"><span class="lbl">Batch</span><span class="val">${escapeHtml(batch?.name || '—')}</span></div>
      <div class="row"><span class="lbl">Status</span><span class="val" style="color:${statusColor};font-weight:700">${escapeHtml(statusText)}</span></div>
      ${isFailed ? `<div class="row"><span class="lbl">Failure reason</span><span class="val" style="color:#b91c1c">${escapeHtml(item.failure_reason || 'Transfer rejected')}</span></div>` : ''}
      ${isSucceeded ? (() => {
        const amount = Number(item.amount_ngn) || 0;
        const psFee = paystackTransferFee(amount);
        const duty = stampDutyFor(amount);
        const total = amount + psFee + duty;
        const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        return `
      <div class="row" style="background:#fffbeb;border-radius:6px;padding:10px 8px;margin-top:4px;">
        <span class="lbl" style="color:#92400e;">Paystack transfer fee</span>
        <span class="val" style="color:#b45309;">${fmtNgn(psFee)}</span>
      </div>
      ${duty > 0 ? `<div class="row" style="background:#fffbeb;border-radius:6px;padding:10px 8px;">
        <span class="lbl" style="color:#92400e;">Stamp duty (transfers ≥ ₦10,000)</span>
        <span class="val" style="color:#b45309;">${fmtNgn(duty)}</span>
      </div>` : ''}
      <div class="row" style="font-weight:700;font-size:14px;border-top:2px solid #f3f4f6;margin-top:4px;">
        <span class="lbl" style="color:#111827;">Total debited from wallet</span>
        <span class="val">${fmtNgn(total)}</span>
      </div>`;
      })() : ''}
    </div>

    ${isFailed ? `
    <div class="alert failed"><strong>No funds were debited.</strong> ${escapeHtml(item.failure_reason || 'Transfer rejected by Paystack or the recipient bank.')}</div>
    <div class="alert retry">To retry: return to the Payment Batch in KDOps and click <strong>Retry</strong> on this beneficiary row.</div>` : ''}

    <div class="footer">
      Generated by KDOps · ${escapeHtml(generatedBy || 'System')} · ${escapeHtml(generatedAt)}<br/>
      This is a system-generated receipt. No signature required.
    </div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,width=640,height=860');
  if (!win) return;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const BatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canApprovePerm = usePermission('payments.approve_batches');
  const [batch, setBatch] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [processingIdx, setProcessingIdx] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [processingName, setProcessingName] = useState('');
  const [processResults, setProcessResults] = useState<{ succeeded: number; failed: number; pending: number } | null>(null);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [savingResubmit, setSavingResubmit] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [recurFrequency, setRecurFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'custom'>('monthly');
  const [companyName, setCompanyName] = useState('KD Squares Ltd');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [recurDay, setRecurDay] = useState<number>(1);
  const [recurCustomDays, setRecurCustomDays] = useState(30);
  const itemsRef = useRef<any[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fetchBatch = async () => {
    const [batchRes, itemsRes] = await Promise.all([
      supabase.from('payment_batches').select('*').eq('id', id).single(),
      supabase.from('batch_items').select('*').eq('batch_id', id).order('created_at'),
    ]);
    const b = batchRes.data;
    const allItems = itemsRes.data || [];

    if (b && (b.status === 'processing' || b.status === 'partially_processed') && allItems.length > 0) {
      // Distinguish items Paystack has accepted (has reference) from items
      // never dispatched (no reference). An unstarted-pending item must NOT
      // keep the batch locked in 'processing' — it needs a recoverable status
      // so the UI can show a Retry button without Supabase dashboard access.
      const activePending  = allItems.some((r: any) => (r.status === 'pending' || r.status === 'retry') && r.paystack_reference);
      const unstarted      = allItems.filter((r: any) => r.status === 'pending' && !r.paystack_reference);
      const succeededCount = allItems.filter((r: any) => r.status === 'succeeded').length;
      const anyFailed      = allItems.some((r: any) => r.status === 'failed');

      let correctStatus: string;
      if (activePending) {
        correctStatus = 'processing';           // Paystack transfers in-flight
      } else if (unstarted.length > 0 && succeededCount > 0) {
        correctStatus = 'partially_processed';  // Some sent, some never started
      } else if (unstarted.length > 0 && succeededCount === 0) {
        correctStatus = 'funded';               // Nothing sent — allow full retry
      } else if (anyFailed) {
        correctStatus = 'partially_processed';  // All dispatched, some failed
      } else {
        correctStatus = 'processed';            // Everything succeeded
      }

      if (correctStatus !== b.status) {
        await supabase.from('payment_batches').update({ status: correctStatus }).eq('id', id);
        b.status = correctStatus;
      }
    }

    setBatch(b);
    setItems(allItems);
    setLoading(false);
  };

  useEffect(() => {
    fetchBatch();
    supabase.from('company_settings').select('company_name, logo_url')
      .eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle()
      .then(({ data: cs }) => {
        if (cs) {
          setCompanyName((cs as any).company_name || 'KD Squares Ltd');
          setLogoUrl((cs as any).logo_url || null);
        }
      })
      .catch((err) => console.warn('[KDOps] company settings fetch failed:', err));
  }, [id]);

  const canApprove =
    !!profile && APPROVER_ROLES.includes(profile.role as any) && canApprovePerm;

  const cannotApproveReason = (() => {
    if (!profile) return 'Not authenticated.';
    if (!APPROVER_ROLES.includes(profile.role as any)) {
      return 'Only Admin or Finance roles can approve payment batches.';
    }
    if (!canApprovePerm) {
      return 'Your permissions do not allow approving payment batches.';
    }
    return null;
  })();

  const updateStatus = async (status: string, extra?: any, expectedFrom?: string | string[]) => {
    setActionLoading(true);
    try {
      if (status === 'approved' || status === 'rejected') {
        if (!profile) {
          toast({ title: 'Not authenticated', variant: 'destructive' });
          setActionLoading(false);
          return;
        }
        if (!APPROVER_ROLES.includes(profile.role as any)) {
          toast({
            title: 'Not authorized',
            description: 'Only Admin or Finance roles can approve or reject batches.',
            variant: 'destructive',
          });
          setActionLoading(false);
          return;
        }
      }

      const update: any = { status, ...extra };
      if (status === 'approved') update.approved_by = profile?.id;
      // Concurrency guard: only allow the transition if the row is still in
      // the expected state. Two admins racing on the same batch will both
      // pass the client check, but only one update will hit a matching row;
      // the other returns rowcount 0 and we abort with a stale-state toast.
      let query = supabase.from('payment_batches').update(update).eq('id', id);
      if (expectedFrom) {
        query = Array.isArray(expectedFrom)
          ? query.in('status', expectedFrom)
          : query.eq('status', expectedFrom);
      }
      const { data: updated, error } = await query.select('id, status');
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else if (expectedFrom && (!updated || updated.length === 0)) {
        toast({
          title: 'Batch state has changed',
          description: 'Someone else may have just acted on this batch. Refreshing…',
          variant: 'destructive',
        });
        await fetchBatch();
      } else {
        toast({ title: `Batch ${statusLabel(status)?.toLowerCase() || status}` });

        const amountTxt = formatNaira(batch?.total_amount || 0);
        if (status === 'approved') {
          burst({ palette: 'success', count: 70 });
          await logAudit('batch_approved', `Batch "${batch?.name}" approved (${amountTxt}, ${items.length} beneficiaries)`, profile);
          if (batch?.created_by) {
            await notifyUser({
              userId: batch.created_by,
              type: 'batch_approved',
              module: 'payments',
              title: 'Your batch was approved',
              body: `"${batch?.name}" — ${amountTxt}`,
            });
          }
        } else if (status === 'rejected') {
          await writeRejectionNotification({
            entity: 'batch',
            entityLabel: 'payment batch',
            amount: batch?.total_amount,
            reason: extra?.rejection_reason || '',
            submitterId: batch?.created_by || null,
            actor: profile,
            auditType: 'batch_rejected',
            auditDescription: `Batch "${batch?.name}" rejected: ${extra?.rejection_reason || ''}`,
          });
        } else if (status === 'pending_approval') {
          await logAudit('batch_submitted', `Batch "${batch?.name}" submitted for approval`, profile);
          await notifyRoles({
            roles: ['super_admin', 'admin', 'finance'],
            type: 'batch_submitted',
            module: 'payments',
            priority: 'high',
            title: `Batch submitted for approval`,
            body: `"${batch?.name}" — ${amountTxt}, ${items.length} beneficiaries`,
          });
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

  /**
   * Kick one batch_item through Paystack:
   *   1. Create a transferrecipient if we don't have one yet.
   *   2. Initiate the transfer with a deterministic reference.
   *   3. Store transfer_code + reference so the poller can verify status.
   */
  const processOneItem = async (it: any, customNarration?: string): Promise<{ ok: boolean; reason?: string }> => {
    const markFailed = async (reason: string) => {
      await supabase.from('batch_items')
        .update({ status: 'failed', failure_reason: reason })
        .eq('id', it.id);
      await logAudit('paystack_transfer_failed', `Transfer failed for ${it.full_name}: ${reason}`, profile);
      return { ok: false, reason };
    };
    try {
      const amount = Number(it.amount_ngn || 0);
      if (amount < 1) return markFailed('Minimum transfer amount is ₦1.');
      if (amount > 5_000_000) return markFailed('Single transfer limit is ₦5,000,000. For larger amounts contact your bank operations team.');
      const bankCode = getBankCode(it.bank_name);
      if (!bankCode) return markFailed(`Unknown bank "${it.bank_name}" — no Paystack bank code`);
      let recipientCode: string | null = it.paystack_recipient_code || null;
      // Recipient cache: if no code on the batch_item but we have an
      // employee_id, look up the cached code on profiles. Saves an extra
      // /transferrecipient round-trip per payment for repeat employees.
      if (!recipientCode && it.employee_id) {
        const { data: cachedProfile } = await supabase
          .from('profiles')
          .select('paystack_recipient_code')
          .eq('id', it.employee_id)
          .maybeSingle();
        if (cachedProfile?.paystack_recipient_code) {
          recipientCode = cachedProfile.paystack_recipient_code;
        }
      }
      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: it.full_name || 'Unknown Recipient',
          account_number: it.account_number,
          bank_code: bankCode,
        });
        recipientCode = recipient.recipient_code;
        // Cache on the employee profile so future payments skip recipient
        // creation. The trigger clears this if bank details change later.
        if (it.employee_id) {
          await supabase
            .from('profiles')
            .update({
              paystack_recipient_code: recipientCode,
              paystack_recipient_verified_at: new Date().toISOString(),
            })
            .eq('id', it.employee_id);
        }
        await logAudit(
          'paystack_recipient_created',
          `Recipient created for ${it.full_name} (${it.bank_name})`,
          profile,
        );
      }
      const ref = generateKdopsRef(it.id);
      const transfer = await initiateTransferIdempotent({
        recipient_code: recipientCode!,
        amount_ngn: Number(it.amount_ngn || 0),
        reference: ref,
        reason: customNarration || narrationForBatchItem(batch, it),
      });

      // Self-healing path: if Paystack reported a duplicate ref, the helper
      // verified the existing transfer and returned its current status. Map
      // that to our state machine so the row reflects what really happened.
      if (transfer.recovered) {
        const v = (transfer.verified_status || transfer.status || '').toLowerCase();
        const mappedStatus =
          v === 'success' ? 'succeeded'
          : v === 'failed' || v === 'reversed' ? v
          : 'pending';
        await supabase
          .from('batch_items')
          .update({
            status: mappedStatus,
            paystack_recipient_code: recipientCode,
            paystack_transfer_code: transfer.transfer_code,
            paystack_reference: transfer.reference,
            failure_reason: mappedStatus === 'failed' ? 'Transfer rejected (recovered from duplicate ref)' : null,
            processed_at: mappedStatus === 'succeeded' ? new Date().toISOString() : null,
          })
          .eq('id', it.id);
        await logAudit(
          'paystack_transfer_recovered',
          `Recovered duplicate-ref for ${it.full_name}: Paystack says "${v}" (ref ${transfer.reference})`,
          profile,
        );
        return { ok: mappedStatus !== 'failed' };
      }

      await supabase
        .from('batch_items')
        .update({
          status: 'pending',
          paystack_recipient_code: recipientCode,
          paystack_transfer_code: transfer.transfer_code,
          paystack_reference: transfer.reference,
          failure_reason: null,
        })
        .eq('id', it.id);
      await logAudit(
        'paystack_transfer_initiated',
        `Transfer initiated for ${it.full_name} (${formatNaira(Number(it.amount_ngn || 0))}) ref ${transfer.reference}`,
        profile,
      );
      return { ok: true };
    } catch (err: any) {
      return markFailed(err?.message || 'Transfer failed');
    }
  };

  /**
   * Reconcile the batch with Paystack. For every batch_item that already has
   * a paystack_reference, query the live transfer status and patch the row
   * if the platform's view is out of date. This is the self-healing escape
   * hatch when the webhook missed an event or when a transfer that was
   * actually successful is showing as 'failed' in the UI.
   */
  const runReconcile = async () => {
    if (!APPROVER_ROLES.includes(profile?.role as any)) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    setReconciling(true);
    let synced = 0;
    let unchanged = 0;
    let errors = 0;
    try {
      const dispatched = items.filter((i: any) => i.paystack_reference);
      for (const it of dispatched) {
        try {
          const v = await verifyTransfer(it.paystack_reference);
          const live = (v.status || '').toLowerCase();
          const targetStatus =
            live === 'success' ? 'succeeded'
            : live === 'failed' || live === 'reversed' ? live
            : null;
          if (!targetStatus || targetStatus === it.status) {
            unchanged++;
            continue;
          }
          const feeKobo = Number(v.raw?.fee || 0);
          await supabase
            .from('batch_items')
            .update({
              status: targetStatus,
              processed_at: targetStatus === 'succeeded' ? new Date().toISOString() : it.processed_at || null,
              paystack_raw: v.raw,
              paystack_fee_ngn: feeKobo > 0 ? feeKobo / 100 : it.paystack_fee_ngn || 0,
              failure_reason: targetStatus === 'failed'
                ? (v.reason || it.failure_reason || 'Transfer rejected')
                : targetStatus === 'reversed'
                ? 'Transfer reversed by Paystack'
                : null,
            })
            .eq('id', it.id);
          synced++;
        } catch {
          errors++;
        }
      }
      await logAudit(
        'batch_reconciled',
        `Batch "${batch?.name}" reconciled with Paystack — ${synced} updated, ${unchanged} unchanged, ${errors} errors`,
        profile,
      );
      toast({
        title: 'Reconcile complete',
        description: `${synced} updated · ${unchanged} unchanged${errors ? ` · ${errors} errors` : ''}`,
      });
      await fetchBatch();
    } finally {
      setReconciling(false);
    }
  };

  /**
   * Soft-delete the current batch via the soft_delete_payment_batch RPC.
   * The RPC enforces role + status rules and writes its own audit row.
   */
  const handleDelete = async () => {
    if (!batch) return;
    const requiresReason = REASON_REQUIRED_STATUSES.has(batch.status);
    if (requiresReason && deleteReason.trim().length < 5) {
      toast({
        title: 'Reason required',
        description: 'Approved/funded batches need a reason of at least 5 characters.',
        variant: 'destructive',
      });
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('soft_delete_payment_batch', {
        p_batch_id: id,
        p_reason: deleteReason.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Batch deleted', description: `"${batch.name}" was removed.` });
      navigate('/payments');
    } catch (err: any) {
      toast({
        title: 'Could not delete batch',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDelete(false);
      setDeleteReason('');
    }
  };

  /**
   * Operator clicked "Process" — open the pre-flight confirmation modal.
   * The actual dispatch happens in executeProcess() once the operator
   * confirms with full visibility of cost, fees, balance, and narration.
   */
  const handleProcess = async () => {
    if (items.filter((i) => i.status !== 'succeeded').length === 0) {
      toast({ title: 'Nothing to process', description: 'All beneficiaries are already paid.' });
      return;
    }
    setShowProcessConfirm(true);
  };

  const executeProcess = async (customNarration?: string) => {
    setShowProcessConfirm(false);
    setActionLoading(true);
    setProcessResults(null);
    const toProcess = items.filter((it) => it.status !== 'succeeded');
    setProcessingTotal(toProcess.length);
    setProcessingIdx(0);
    setProcessingName('');
    try {
      // Concurrency guard: only flip to 'processing' if the batch is still
      // 'funded' or 'partially_processed'. If two admins click Process at
      // the same time, only the first wins; the loser sees a stale-state
      // toast instead of dispatching every Paystack transfer a second time.
      const { data: claimed, error: claimErr } = await supabase
        .from('payment_batches')
        .update({ status: 'processing' })
        .eq('id', id)
        .in('status', ['funded', 'partially_processed'])
        .select('id, status');

      if (claimErr) {
        toast({ title: 'Could not start processing', description: claimErr.message, variant: 'destructive' });
        setActionLoading(false);
        setProcessingTotal(0);
        return;
      }
      if (!claimed || claimed.length === 0) {
        toast({
          title: 'Batch is no longer ready to process',
          description: 'It may already be running or have changed state. Refreshing…',
          variant: 'destructive',
        });
        await fetchBatch();
        setActionLoading(false);
        setProcessingTotal(0);
        return;
      }

      // Process each item serially in the browser using the deployed
      // paystack-transfer edge function. Tab must stay open during processing.
      for (let i = 0; i < toProcess.length; i++) {
        const it = toProcess[i];
        setProcessingIdx(i + 1);
        setProcessingName(it.full_name);
        await processOneItem(it, customNarration);
      }

      const { data: refreshed } = await supabase
        .from('batch_items').select('status').eq('batch_id', id);
      const all = refreshed || [];
      const succeededCount = all.filter((r: any) => r.status === 'succeeded').length;
      const failedCount    = all.filter((r: any) => r.status === 'failed').length;
      const pendingCount   = all.filter((r: any) => r.status === 'pending' || r.status === 'processing').length;
      setProcessResults({ succeeded: succeededCount, failed: failedCount, pending: pendingCount });
      setProcessingIdx(0);
      setProcessingTotal(0);
      setProcessingName('');

      let batchStatus = 'processing';
      if (pendingCount === 0 && failedCount === 0)         batchStatus = 'processed';
      else if (pendingCount === 0 && succeededCount > 0)   batchStatus = 'partially_processed';
      else if (pendingCount === 0 && succeededCount === 0) batchStatus = 'failed';
      // If loop was interrupted and items are still pending, set to a
      // recoverable state so the user can retry without Supabase dashboard access.
      else if (pendingCount > 0 && succeededCount > 0)    batchStatus = 'partially_processed';
      else if (pendingCount > 0 && succeededCount === 0)  batchStatus = 'funded';

      await supabase
        .from('payment_batches')
        .update({ status: batchStatus })
        .eq('id', id);
      await logAudit(
        'batch_processed',
        `Batch "${batch?.name}" dispatched via Paystack — ${batchStatus.replace('_', ' ')} (${succeededCount} sent, ${failedCount} failed)`,
        profile,
      );
      toast({
        title: failedCount > 0
          ? 'Batch dispatched with failures'
          : pendingCount > 0
          ? 'Batch dispatched — polling Paystack'
          : 'Batch processed successfully',
        description: failedCount > 0
          ? 'Some transfers could not be initiated — retry from the row.'
          : pendingCount > 0
          ? 'KDOps will poll Paystack every 30s until every transfer settles.'
          : undefined,
      });
      fetchBatch();
    } finally {
      setActionLoading(false);
    }
  };

  // Poll pending Paystack transfers while the batch is processing.
  //
  // Smart polling rules (avoid blowing the Paystack quota at scale):
  //   • Skip ticks while the tab is hidden (document.hidden === true).
  //   • Exponential backoff after consecutive ticks with no state change:
  //     15s → 30s → 60s → 120s (capped). Resets to 15s on any change.
  //   • Stop polling after 30 minutes of no progress (manual refresh still works).
  useEffect(() => {
    if (!batch) return;
    if (batch.status !== 'processing' && batch.status !== 'partially_processed') return;

    let cancelled = false;
    let intervalMs = 15_000;
    const MAX_INTERVAL_MS = 120_000;
    const GIVE_UP_AT = Date.now() + 30 * 60 * 1000;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      // Don't poll Paystack while user isn't looking at the page.
      if (typeof document !== 'undefined' && document.hidden) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      if (Date.now() > GIVE_UP_AT) {
        console.info('[KDOps] BatchDetail polling stopped after 30 min of no progress.');
        return;
      }

      const pending = itemsRef.current.filter(
        (it) => (it.status === 'pending' || it.status === 'retry') && it.paystack_reference,
      );
      if (pending.length === 0) {
        fetchBatch();
        return;
      }
      let changed = false;
      for (const it of pending) {
        try {
          const res = await verifyTransfer(it.paystack_reference);
          if (cancelled) return;
          if (res.status === 'success') {
            await supabase
              .from('batch_items')
              .update({
                status: 'succeeded',
                failure_reason: null,
                processed_at: new Date().toISOString(),
                paystack_raw: res.raw,
                paystack_fee_ngn: Math.round(Number(res.raw?.fee || 0)) / 100,
              })
              .eq('id', it.id);
            await logAudit(
              'paystack_transfer_succeeded',
              `Transfer succeeded for ${it.full_name} (ref ${it.paystack_reference})`,
              profile,
            );
            changed = true;
          } else if (['failed', 'reversed'].includes(res.status)) {
            await supabase
              .from('batch_items')
              .update({
                status: 'failed',
                failure_reason: res.reason || `Paystack ${res.status}`,
                processed_at: new Date().toISOString(),
                paystack_raw: res.raw,
              })
              .eq('id', it.id);
            await logAudit(
              'paystack_transfer_failed',
              `Transfer ${res.status} for ${it.full_name}: ${res.reason || '—'}`,
              profile,
            );
            changed = true;
          }
        } catch {
          // Transient Paystack error — keep polling.
        }
      }
      if (changed) {
        fetchBatch();
        intervalMs = 15_000; // Reset backoff on any progress.
      } else {
        intervalMs = Math.min(intervalMs * 2, MAX_INTERVAL_MS);
      }
      if (!cancelled) timer = window.setTimeout(tick, intervalMs);
    };

    // First poll happens immediately, subsequent polls follow the
    // recursive setTimeout chain above.
    tick();

    // Re-poll right away when the user comes back to the tab.
    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timer) { window.clearTimeout(timer); timer = null; }
        intervalMs = 15_000;
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.status]);

  const retryItem = async (item: any) => {
    if (!APPROVER_ROLES.includes(profile?.role as any)) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can retry payments.',
        variant: 'destructive',
      });
      return;
    }
    setRetryingId(item.id);
    try {
      // Mark as retrying, then run the real Paystack flow again. A brand new
      // reference is minted so Paystack accepts the retry even if the previous
      // one is still on file.
      await supabase
        .from('batch_items')
        .update({ status: 'retry', failure_reason: null, paystack_reference: null })
        .eq('id', item.id);
      const result = await processOneItem(item);
      await logAudit(
        result.ok ? 'paystack_transfer_retried' : 'paystack_transfer_failed',
        `Beneficiary "${item.full_name}" retry ${result.ok ? 'initiated' : `failed: ${result.reason}`}`,
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
        title: result.ok ? 'Retry initiated' : 'Retry failed',
        description: result.ok
          ? 'KDOps will poll Paystack for the final status.'
          : result.reason,
        variant: result.ok ? 'default' : 'destructive',
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
      'paystack_fee_ngn',
      'reference',
      'status',
    ];
    const rows = items.map((i) => [
      i.full_name ?? '',
      i.bank_name ?? '',
      i.account_number ?? '',
      i.amount_ngn ?? 0,
      getItemFee(i),
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
    const computedTotal = items.reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
    const amountDisplay = computedTotal > 100_000_000
      ? 'Amount error — please contact support'
      : escapeHtml(formatNaira(computedTotal));
    const hasFailed = batch.status === 'failed' || batch.status === 'partially_processed';
    const failedRows = items.filter((i) => i.status === 'failed');
    const truncRef = (ref: string | null) => {
      if (!ref) return '—';
      return ref.length > 20 ? escapeHtml(ref.slice(0, 20)) + '…' : escapeHtml(ref);
    };
    const reasonCell = (it: any) => {
      if (it.status === 'failed') return `<span style="color:#b22222">${escapeHtml(it.failure_reason || 'Transfer rejected by bank')}</span>`;
      if (it.status === 'succeeded') return '<span style="color:#117a3d">Successful</span>';
      return '<span style="color:#8c6700">Pending</span>';
    };

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(safeName)} — KDOps Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cabin:wght@400;600;700&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'Cabin', system-ui, sans-serif; color: #0a2533; padding: 32px; max-width: 900px; margin: 0 auto; }
    .brand { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 3px solid #006994; margin-bottom: 24px; }
    .brand .mark { width: 44px; height: 44px; border-radius: 8px; background: #006994; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #006994; }
    .failed-banner { background: #fde9e9; border: 2px solid #f5c0c0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; color: #8b0000; font-size: 13px; }
    .failed-banner strong { display: block; font-size: 15px; margin-bottom: 6px; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; font-size: 13px; }
    .meta div { padding: 6px 0; }
    .meta .l { color: #5b6b75; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta .v { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { padding: 7px 8px; text-align: left; border-bottom: 1px solid #e8edf0; }
    th { background: #f6f9fb; color: #5b6b75; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    td.mono { font-family: monospace; font-size: 10px; }
    .right { text-align: right; }
    .totals { margin-top: 16px; padding: 12px 16px; background: #f6f9fb; border-radius: 8px; display: flex; justify-content: flex-end; gap: 24px; font-size: 13px; }
    .totals .v { font-weight: 700; }
    .stamp { margin-top: 32px; padding: 12px; border: 2px dashed #D6AC50; border-radius: 8px; color: #6f5a25; font-size: 12px; text-align: center; }
    .footer { margin-top: 28px; font-size: 11px; color: #8194a0; text-align: center; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .pill.success { background: #e6f7ec; color: #117a3d; }
    .pill.failed  { background: #fde9e9; color: #b22222; }
    .pill.pending { background: #fff5e0; color: #8c6700; }
    .failed-section { margin-top: 28px; }
    .failed-section h2 { color: #b22222; }
    .bank-ops-note { margin-top: 12px; padding: 10px 14px; background: #fff5e0; border: 1px solid #f0d890; border-radius: 6px; font-size: 11px; color: #6f5a25; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="brand">
    ${logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="logo" style="height:40px;width:auto;object-fit:contain;border-radius:6px;" />`
      : `<div class="mark">${escapeHtml(companyName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase())}</div>`
    }
    <div>
      <h1>Payment Batch Receipt</h1>
      <div style="font-size:12px;color:#5b6b75">${escapeHtml(companyName)} · KDOps</div>
    </div>
  </div>

  ${hasFailed ? `
  <div class="failed-banner">
    <strong>⚠️ FAILED PAYMENT — No funds were transferred to failed recipients</strong>
    ${failedRows.length} of ${items.length} transfer${failedRows.length !== 1 ? 's' : ''} failed.
    Successful transfers are unaffected. Review the Failed Payments section below.
  </div>` : ''}

  <div class="meta">
    <div><div class="l">Batch</div><div class="v">${escapeHtml(batch.name)}</div></div>
    <div><div class="l">Status</div><div class="v">${escapeHtml(statusLabel(batch.status) || batch.status)}</div></div>
    <div><div class="l">Transaction Date</div><div class="v">${escapeHtml(formatDateTime(batch.created_at))}</div></div>
    <div><div class="l">Period</div><div class="v">${escapeHtml(batch.period || '—')}</div></div>
    <div><div class="l">Beneficiaries</div><div class="v">${items.length}</div></div>
    <div><div class="l">Total Amount</div><div class="v">${amountDisplay}</div></div>
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
        <th>Paystack Ref</th>
        <th>Status</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map((it, i) => `
          <tr${it.status === 'failed' ? ' style="background:#fff8f8"' : ''}>
            <td>${i + 1}</td>
            <td>${escapeHtml(it.full_name || 'Unknown Recipient')}</td>
            <td>${escapeHtml(it.bank_name)}</td>
            <td>${escapeHtml(maskAccountNumber(it.account_number))}</td>
            <td class="right">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
            <td class="mono">${truncRef(it.paystack_reference)}</td>
            <td><span class="pill ${it.status === 'succeeded' ? 'success' : it.status === 'failed' ? 'failed' : 'pending'}">${escapeHtml(it.status)}</span></td>
            <td>${reasonCell(it)}</td>
          </tr>
        `)
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <div><span style="color:#5b6b75;font-size:11px;text-transform:uppercase">Succeeded:</span> <span class="v">${escapeHtml(formatNaira(totalSucceeded))}</span></div>
    <div><span style="color:#5b6b75;font-size:11px;text-transform:uppercase">Failed:</span> <span class="v">${escapeHtml(formatNaira(totalFailed))}</span></div>
    <div><span style="color:#5b6b75;font-size:11px;text-transform:uppercase">Total:</span> <span class="v">${amountDisplay}</span></div>
  </div>

  ${hasFailed && failedRows.length > 0 ? `
  <div class="failed-section">
    <h2>⚠️ Failed Payments (${failedRows.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Bank</th>
          <th>Account</th>
          <th class="right">Amount</th>
          <th>Failure Reason</th>
        </tr>
      </thead>
      <tbody>
        ${failedRows.map((it) => `
          <tr>
            <td>${escapeHtml(it.full_name || 'Unknown Recipient')}</td>
            <td>${escapeHtml(it.bank_name)}</td>
            <td>${escapeHtml(maskAccountNumber(it.account_number))}</td>
            <td class="right">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
            <td style="color:#b22222">${escapeHtml(it.failure_reason || 'Transfer rejected by bank')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="bank-ops-note">
      Contact your bank operations team if the failure reason is unclear. No funds were debited for the failed recipients listed above.
    </div>
  </div>` : ''}

  <div class="stamp">
    Receipt generated by KDOps · ${escapeHtml(profile?.full_name || profile?.email || 'unknown user')}
    on ${escapeHtml(formatDateTime(new Date()))}
  </div>

  <div class="footer">
    ${escapeHtml(companyName)} · Operations Platform · This is a system-generated receipt.
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
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (!batch) return <div className="text-center py-12 text-muted-foreground">Batch not found</div>;

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isFinance = profile?.role === 'finance';
  const canExport = items.length > 0;
  const failedItems = items.filter((i) => i.status === 'failed');

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button onClick={() => navigate('/payments')} className="hover:text-foreground kd-transition font-medium">Payments</button>
        <span className="text-border">›</span>
        <span className="text-foreground font-medium truncate max-w-xs">{batch.name}</span>
      </nav>

      {/* Batch header */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" aria-label="Back to payments" className="h-8 w-8 shrink-0 rounded-lg" onClick={() => navigate('/payments')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight truncate">{batch.name}</h1>
                <StatusBadge status={batch.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{batch.period || 'No period set'}</p>
            </div>
          </div>
          {canExport && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadReceipt}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Receipt
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(() => {
            const succeededAmount = items
              .filter((i) => i.status === 'succeeded')
              .reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
            const totalFees = items.reduce((s, i) => s + getItemFee(i), 0);
            const succeededCount = items.filter((i) => i.status === 'succeeded').length;
            const totalCost = succeededAmount + totalFees;
            const cells: Array<{ label: string; value: any; bold?: boolean }> = [
              { label: 'Payment Date', value: formatDate(batch.payment_date) },
              { label: 'Beneficiaries', value: batch.beneficiary_count },
              { label: 'Total Amount', value: formatNaira(batch.total_amount || 0), bold: true },
              { label: 'Created', value: formatDate(batch.created_at) },
            ];
            // Show the cost breakdown as soon as anything has succeeded so the
            // operator sees fees immediately, not only after a webhook backfill.
            if (succeededCount > 0) {
              cells.push(
                { label: 'Disbursed (succeeded)', value: formatNaira(succeededAmount) },
                { label: 'Paystack Fees', value: formatNaira(totalFees) },
                { label: 'Total Cost', value: formatNaira(totalCost), bold: true },
              );
            }
            return cells.map(({ label, value, bold }) => (
              <div key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
                <p className={`text-sm mt-0.5 currency ${bold ? 'font-bold text-foreground' : 'font-medium'}`}>{value}</p>
              </div>
            ));
          })()}
        </div>
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
        <Card className="border-destructive/30">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs text-destructive mb-1">Rejection Reason</p>
                <p className="text-sm">{batch.rejection_reason}</p>
              </div>
              {batch.status === 'rejected' && batch.created_by === profile?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={savingResubmit}
                  onClick={async () => {
                    setSavingResubmit(true);
                    await supabase
                      .from('payment_batches')
                      .update({ status: 'pending_approval', rejection_reason: null })
                      .eq('id', id);
                    await logAudit(
                      'resubmission_created',
                      `Batch "${batch.name}" re-edited and resubmitted`,
                      profile,
                    );
                    toast({ title: 'Resubmitted for approval' });
                    fetchBatch();
                    setSavingResubmit(false);
                  }}
                >
                  Re-edit & Resubmit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
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
      {(isAdmin || isFinance) && (
        <div className="flex gap-2 flex-wrap items-center">
          {batch.status === 'draft' && batch.created_by === profile?.id && (
            <>
              <Button variant="outline" onClick={() => navigate(`/payments/${id}/edit`)} disabled={actionLoading}>
                Edit Batch
              </Button>
              <Button onClick={() => updateStatus('pending_approval', undefined, ['draft', 'rejected'])} disabled={actionLoading}>
                Submit for Approval
              </Button>
            </>
          )}
          {batch.status === 'pending_approval' && canApprove && (
            <>
              <Button onClick={() => updateStatus('approved', undefined, 'pending_approval')} disabled={actionLoading} size="lg">
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve Batch
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {batch.status === 'approved' && (
            <Button onClick={() => updateStatus('funded', undefined, 'approved')} disabled={actionLoading}>
              <DollarSign className="mr-2 h-4 w-4" /> Confirm Funded
            </Button>
          )}
          {batch.status === 'funded' && (
            <Button onClick={handleProcess} disabled={actionLoading}>
              <Play className="mr-2 h-4 w-4" /> Process Payments
            </Button>
          )}
          {(['partially_processed', 'failed'].includes(batch.status) ||
            (batch.status === 'processing' && items.some(i => (i.status === 'failed' || i.status === 'pending') && !i.paystack_reference))) &&
            items.some(i => i.status === 'failed' || (i.status === 'pending' && !i.paystack_reference)) && (
            <Button
              variant="outline"
              onClick={async () => {
                setRetryingAll(true);
                const toRetry = items.filter(i => i.status === 'failed' || (i.status === 'pending' && !i.paystack_reference));
                for (const it of toRetry) {
                  await retryItem(it);
                }
                setRetryingAll(false);
                fetchBatch();
              }}
              disabled={!!retryingId || retryingAll || actionLoading}
            >
              <RotateCw className="mr-2 h-4 w-4" />
              {retryingAll ? 'Retrying…' : `Retry unsent (${items.filter(i => i.status === 'failed' || (i.status === 'pending' && !i.paystack_reference)).length})`}
            </Button>
          )}
          {/* Reconcile: ask Paystack for the latest status of every dispatched
               item and update our records. Lets finance recover items that are
               'success' on Paystack but stuck on the platform — no SQL needed. */}
          {items.some((i: any) => i.paystack_reference) && (
            <Button
              variant="outline"
              onClick={runReconcile}
              disabled={reconciling || actionLoading}
              title="Re-check every dispatched transfer with Paystack and sync the status"
            >
              {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
              {reconciling ? 'Reconciling…' : 'Reconcile with Paystack'}
            </Button>
          )}
          {(batch.status === 'approved' || batch.status === 'funded' || batch.status === 'processed') && (
            <Button
              variant="outline"
              onClick={() => setShowRecurring(true)}
            >
              <CalendarClock className="mr-2 h-4 w-4" /> Make recurring
            </Button>
          )}
          {DELETABLE_STATUSES.includes(batch.status) && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
              onClick={() => setShowDelete(true)}
              disabled={actionLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete batch
            </Button>
          )}
        </div>
      )}

      {actionLoading && processingTotal > 0 && (
        <div className="px-1 py-2 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Processing payment <span className="font-semibold text-foreground">{processingIdx}</span> of{' '}
            <span className="font-semibold text-foreground">{processingTotal}</span>
            {processingName && (
              <> — <span className="font-semibold text-foreground">{processingName}</span></>
            )}
          </span>
        </div>
      )}

      {processResults && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-green-600 dark:text-green-400 font-semibold">
              ✓ {processResults.succeeded} payments successful
            </span>
            <span className="text-destructive font-semibold">
              ✗ {processResults.failed} payments failed
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              ◷ {processResults.pending} payments pending
            </span>
          </div>
          {processResults.failed > 0 && items.filter((i) => i.status === 'failed').length > 0 && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              {items
                .filter((i) => i.status === 'failed')
                .map((i) => {
                  const f = friendlyPaystackError(i.failure_reason);
                  return (
                    <div key={i.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-destructive">{i.full_name || 'Unknown'}</span>
                        <span className="font-medium text-destructive/80">{f.title}</span>
                      </div>
                      <p className="text-muted-foreground">{f.hint}</p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Beneficiaries</CardTitle>
            <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'recipient' : 'recipients'}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Bank</TableHead>
                  <TableHead className="text-xs">Account</TableHead>
                  <TableHead className="text-right text-xs">Amount</TableHead>
                  <TableHead className="text-right text-xs">Fee</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Paystack Ref</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.status === 'failed' ? 'border-l-4 border-l-destructive bg-destructive/5 kd-transition' : 'kd-transition'}
                  >
                    <TableCell className="font-medium">
                      <div>{item.full_name || 'Unknown Recipient'}</div>
                      {item.failure_reason && (() => {
                        const f = friendlyPaystackError(item.failure_reason);
                        return (
                          <p
                            className="text-[11px] text-destructive mt-0.5"
                            title={item.failure_reason}
                          >
                            <span className="font-semibold">{f.title}.</span>{' '}
                            <span className="text-muted-foreground">{f.hint}</span>
                          </p>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{item.bank_name}</TableCell>
                    <TableCell>{maskAccountNumber(item.account_number)}</TableCell>
                    <TableCell className="text-right">
                      <span className="currency">{formatNaira(item.amount_ngn || 0)}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {(() => {
                        const fee = getItemFee(item);
                        if (fee > 0) {
                          return <span className="currency">{formatNaira(fee)}</span>;
                        }
                        return item.status === 'succeeded'
                          ? <span title="Webhook not yet received">…</span>
                          : '—';
                      })()}
                    </TableCell>
                    <TableCell>{item.reference}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.paystack_reference || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {item.status === 'failed' && canApprove && (
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
                        )}
                        {(item.paystack_reference || item.status === 'failed' || item.status === 'succeeded') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => printItemReceipt(item, batch, profile?.full_name || profile?.email, companyName, logoUrl)}
                            title="Print receipt"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Receipt
                          </Button>
                        )}
                        {!item.paystack_reference && item.status !== 'failed' && item.status !== 'succeeded' && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {id && <ApprovalCommentThread entityType="batch" entityId={id} title="Batch discussion" />}

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Batch</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => updateStatus('rejected', { rejection_reason: rejectReason.trim() }, 'pending_approval')} disabled={!isValidRejectionReason(rejectReason)}>
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecurring} onOpenChange={setShowRecurring}>
        <DialogContent>
          <DialogHeader><DialogTitle>Make this batch recurring</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select
                value={recurFrequency}
                onValueChange={(v) => setRecurFrequency(v as any)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom interval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurFrequency === 'weekly' && (
              <div className="space-y-1">
                <Label>Day of week</Label>
                <Select
                  value={String(recurDay)}
                  onValueChange={(v) => setRecurDay(Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {recurFrequency === 'monthly' && (
              <div className="space-y-1">
                <Label>Day of month</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={recurDay || new Date(batch?.payment_date || '').getDate() || 1}
                  onChange={(e) => setRecurDay(Number(e.target.value))}
                />
              </div>
            )}
            {recurFrequency === 'custom' && (
              <div className="space-y-1">
                <Label>Every N days</Label>
                <Input
                  type="number"
                  min={1}
                  value={recurCustomDays}
                  onChange={(e) => setRecurCustomDays(Number(e.target.value) || 7)}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              KDOps will auto-create a new draft batch on schedule and submit it
              for approval. You can cancel the schedule at any time.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecurring(false)}>Cancel</Button>
            <Button disabled={savingSchedule} onClick={async () => {
              setSavingSchedule(true);
              const today = new Date();
              let nextDate: Date;
              if (recurFrequency === 'weekly') {
                nextDate = new Date(today);
                nextDate.setDate(today.getDate() + ((recurDay - today.getDay() + 7) % 7 || 7));
              } else if (recurFrequency === 'biweekly') {
                nextDate = new Date(today);
                nextDate.setDate(today.getDate() + 14);
              } else if (recurFrequency === 'monthly') {
                nextDate = new Date(today.getFullYear(), today.getMonth() + 1, recurDay || 1);
              } else {
                nextDate = new Date(today);
                nextDate.setDate(today.getDate() + recurCustomDays);
              }
              const { error } = await supabase.from('recurring_schedules').insert({
                source_batch_id: id,
                frequency: recurFrequency,
                day_of_week: recurFrequency === 'weekly' ? recurDay : null,
                day_of_month: recurFrequency === 'monthly' ? recurDay : null,
                custom_interval_days: recurFrequency === 'custom' ? recurCustomDays : null,
                next_run_date: nextDate.toISOString().slice(0, 10),
                created_by: profile?.id,
              });
              if (error) {
                toast({ title: 'Could not create schedule', description: error.message, variant: 'destructive' });
                setSavingSchedule(false);
                return;
              }
              await logAudit(
                'batch_scheduled',
                `Batch "${batch?.name}" set to recur ${recurFrequency}`,
                profile,
              );
              toast({
                title: 'Recurring schedule created',
                description: `Next run: ${nextDate.toLocaleDateString('en-GB')}`,
              });
              setShowRecurring(false);
              setSavingSchedule(false);
            }}>
              Create schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentSummaryModal
        open={showProcessConfirm}
        onOpenChange={setShowProcessConfirm}
        items={items
          .filter((i) => i.status !== 'succeeded')
          .map((i) => ({ full_name: i.full_name, amount_ngn: Number(i.amount_ngn || 0) }))}
        narrationKind={narrationKindForBatch(batch)}
        period={batch?.period || undefined}
        label={batch?.name || undefined}
        title={`Confirm "${batch?.name || 'batch'}"`}
        onConfirm={(narration) => executeProcess(narration)}
      />

      <Dialog open={showDelete} onOpenChange={(v) => !deleting && setShowDelete(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete this batch?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              You're about to delete{' '}
              <span className="font-semibold">"{batch?.name}"</span> (status:{' '}
              <span className="font-mono">{batch?.status}</span>). The batch will be
              hidden from all lists. Audit history is preserved.
            </p>
            {batch && REASON_REQUIRED_STATUSES.has(batch.status) && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  This batch is {batch.status} — please explain why you're deleting it.
                </p>
                <Textarea
                  placeholder="e.g. Funds returned to wallet — payroll cancelled for April"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {batch?.status === 'funded'
                  ? 'Funds are on your Paystack balance. Deleting here does NOT recall them — handle the recall separately.'
                  : 'This action is logged. Restore is via the database only — ask an engineer if needed.'}
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchDetail;
