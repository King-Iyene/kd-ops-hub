import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatDateTime, formatNaira, formatReceiptDateTime, maskAccountNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import {
  writeRejectionNotification,
  isValidRejectionReason,
} from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import {
  approvePaymentBatch,
  confirmSecondApproval,
  rejectPaymentBatch,
  resetBatchToDraft,
  markBatchFunded,
  startBatchProcessing,
  finalizeBatch,
  syncBatchStatusFromItems,
  fetchEligibleApprovers,
  previewCapCheck,
  isCoApprovalRequired,
  type EligibleApprover,
} from '@/lib/transfer-safety';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  generateKdopsRef,
  verifyTransfer,
  getBankCode,
  resolveAccount,
  paystackTransferFee,
  stampDutyFor,
  buildNarration,
  friendlyPaystackError,
  type NarrationKind,
} from '@/lib/paystack';
import { PaymentSummaryModal } from '@/components/PaymentSummaryModal';
import { ReceiptModal } from '@/components/ReceiptModal';
import { BatchRiskFlags } from '@/components/BatchRiskFlags';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  Search,
  Info,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


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


const BatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canApprovePerm = usePermission('payments.approve_batches');
  const [batch, setBatch] = useState<any>(null);
  const [receiptItem, setReceiptItem] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [riskFlagsAcknowledged, setRiskFlagsAcknowledged] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<{ itemId: string; ok: boolean; bankCode: string; account: string; bank: string; result: string } | null>(null);
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
  const [secondApprovers, setSecondApprovers] = useState<EligibleApprover[]>([]);
  const [firstApproverName, setFirstApproverName] = useState<string | null>(null);
  const [secondApproverName, setSecondApproverName] = useState<string | null>(null);
  // Pre-flight cap + co-approval preview shown above the Approve button.
  const [capPreview, setCapPreview] = useState<{ allowed: boolean; reason: string | null; appliedKind: string | null; appliedLimit: number | null } | null>(null);
  const [coThreshold, setCoThreshold] = useState<number | null>(null);
  const [itemFilter, setItemFilter] = useState<'all' | 'succeeded' | 'failed' | 'pending'>('all');
  const [itemSearch, setItemSearch] = useState('');

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
        try {
          const synced = await syncBatchStatusFromItems(id);
          if (synced?.status) b.status = synced.status as typeof b.status;
        } catch (err) {
          console.warn('[KDOps] sync_batch_status_from_items failed:', err);
        }
      }
    }

    setBatch(b);
    setItems(allItems);
    setLoading(false);

    // Resolve approver names + (when relevant) the eligible second-approver
    // pool. Failures are silent — the rest of the page renders fine without
    // them and the RPCs themselves remain authoritative.
    if (b) {
      const approverIds = [b.approved_by, b.second_approver_id].filter(Boolean) as string[];
      if (approverIds.length > 0) {
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', approverIds)
          .then(({ data: rows }) => {
            const map = new Map<string, string>();
            for (const r of (rows ?? []) as any[]) {
              map.set(r.id, r.full_name || r.email || r.id.slice(0, 8));
            }
            setFirstApproverName(b.approved_by ? map.get(b.approved_by) ?? null : null);
            setSecondApproverName(b.second_approver_id ? map.get(b.second_approver_id) ?? null : null);
          });
      } else {
        setFirstApproverName(null);
        setSecondApproverName(null);
      }

      if (b.status === 'pending_second_approval' && b.created_by && b.approved_by) {
        fetchEligibleApprovers('payment_batch', 'second', b.created_by, b.approved_by)
          .then(setSecondApprovers)
          .catch(() => setSecondApprovers([]));
      } else {
        setSecondApprovers([]);
      }

      // Pre-flight: when the current user can act on this batch, preview cap +
      // fetch their effective co-approval threshold so we can show "ready to
      // approve" / "will route to second approver" / "blocked by cap" before
      // they click.  Also fetched for the submitter on a draft batch so they
      // know up-front whether dual approval will be needed.
      const userCanAct =
        profile?.id
        && (
          ((b.status === 'pending_approval' || b.status === 'pending_second_approval')
            && APPROVER_ROLES.includes(profile.role as any))
          || (b.status === 'draft' && b.created_by === profile.id)
        );
      if (userCanAct && profile?.id) {
        const total = Number(b.total_amount) || 0;
        previewCapCheck(profile.id, total)
          .then((c) => {
            if (!c) { setCapPreview(null); return; }
            setCapPreview({
              allowed: c.allowed,
              reason: c.reason,
              appliedKind: c.applied_limit_kind,
              appliedLimit: c.applied_limit_ngn,
            });
          })
          .catch(() => setCapPreview(null));
        // Fetch the caller's co-approval threshold (user override → role default).
        const { data: row } = await supabase
          .from('transfer_limits')
          .select('co_approval_threshold_ngn')
          .eq('user_id', profile.id)
          .maybeSingle();
        if (row?.co_approval_threshold_ngn != null) {
          setCoThreshold(Number(row.co_approval_threshold_ngn));
        } else {
          const { data: rdef } = await supabase
            .from('transfer_limits')
            .select('co_approval_threshold_ngn')
            .is('user_id', null)
            .eq('role', profile.role)
            .maybeSingle();
          setCoThreshold(rdef?.co_approval_threshold_ngn != null ? Number(rdef.co_approval_threshold_ngn) : null);
        }
      } else {
        setCapPreview(null);
        setCoThreshold(null);
      }
    }
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

  /**
   * Submit the batch for approval (draft / rejected → pending_approval). This
   * is the only legal authenticated status transition for batches; all other
   * lifecycle moves (approve / fund / process / finalize) route through the
   * SECURITY DEFINER RPCs below so direct cap-bypassing UPDATEs are blocked.
   */
  const submitForApproval = async () => {
    setActionLoading(true);
    try {
      const { data: updated, error } = await supabase
        .from('payment_batches')
        .update({ status: 'pending_approval' })
        .eq('id', id)
        .in('status', ['draft', 'rejected'])
        .select('id, status');
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else if (!updated || updated.length === 0) {
        toast({
          title: 'Batch state has changed',
          description: 'Someone else may have just acted on this batch. Refreshing…',
          variant: 'destructive',
        });
        await fetchBatch();
      } else {
        const amountTxt = formatNaira(batch?.total_amount || 0);
        toast({ title: 'Batch submitted for approval' });
        await logAudit('batch_submitted', `Batch "${batch?.name}" submitted for approval`, profile);
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'batch_submitted',
          module: 'payments',
          priority: 'high',
          title: 'Batch submitted for approval',
          body: `"${batch?.name}" — ${amountTxt}, ${items.length} beneficiaries`,
        });
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
      setShowReject(false);
    }
  };

  /** Mark Funded — routes through mark_batch_funded RPC. */
  const markFunded = async (ref?: string) => {
    if (!id) return;
    setActionLoading(true);
    try {
      await markBatchFunded(id, ref ? { reference: ref } : null);
      toast({ title: 'Batch marked funded' });
      await logAudit(
        'batch_funded',
        `Batch "${batch?.name}" marked funded${ref ? ` (top-up ref: ${ref})` : ''}`,
        profile,
      );
      fetchBatch();
    } catch (err: any) {
      toast({
        title: 'Could not mark funded',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** First approval — routes through approve_payment_batch RPC. */
  const approveBatch = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const result = await approvePaymentBatch(id);
      const amountTxt = formatNaira(batch?.total_amount || 0);
      if (result?.status === 'pending_second_approval') {
        toast({
          title: 'First approval recorded',
          description: 'A second approver must confirm this batch before it can proceed.',
        });
      } else {
        burst({ palette: 'success', count: 70 });
        toast({ title: 'Batch approved' });
      }
      await logAudit(
        result?.status === 'pending_second_approval'
          ? 'batch_first_approved'
          : 'batch_approved',
        `Batch "${batch?.name}" approved (${amountTxt}, ${items.length} beneficiaries)`,
        profile,
      );
      if (batch?.created_by && result?.status === 'approved') {
        await notifyUser({
          userId: batch.created_by,
          type: 'batch_approved',
          module: 'payments',
          title: 'Your batch was approved',
          body: `"${batch?.name}" — ${amountTxt}`,
        });
      }
      fetchBatch();
    } catch (err: any) {
      toast({
        title: 'Approval failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** Second approval — routes through confirm_second_approval RPC. */
  const confirmSecondApproveBatch = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await confirmSecondApproval(id);
      burst({ palette: 'success', count: 70 });
      toast({ title: 'Batch fully approved' });
      const amountTxt = formatNaira(batch?.total_amount || 0);
      await logAudit(
        'batch_second_approved',
        `Batch "${batch?.name}" second-approved (${amountTxt})`,
        profile,
      );
      fetchBatch();
    } catch (err: any) {
      toast({
        title: 'Second approval failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** Rejection — routes through reject_payment_batch RPC. */
  const rejectBatch = async (reason: string) => {
    if (!id) return;
    setActionLoading(true);
    try {
      await rejectPaymentBatch(id, reason);
      await writeRejectionNotification({
        entity: 'batch',
        entityLabel: 'payment batch',
        amount: batch?.total_amount,
        reason,
        submitterId: batch?.created_by || null,
        actor: profile,
        auditType: 'batch_rejected',
        auditDescription: `Batch "${batch?.name}" rejected: ${reason}`,
      });
      toast({ title: 'Batch rejected' });
      setShowReject(false);
      fetchBatch();
    } catch (err: any) {
      toast({
        title: 'Reject failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
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
      // Per-amount caps live exclusively in check_transfer_caps now (read by
      // paystack-transfer + batch-worker + the approval RPCs). Removing the
      // duplicated client-side ₦5M literal closes H-7 — if a NIBSS-style hard
      // ceiling is needed, set company_settings.max_single_transfer_ngn.
      const bankCode = getBankCode(it.bank_name);
      if (!bankCode) return markFailed(`Unknown bank "${it.bank_name}" — no Paystack bank code`);
      // Heal whitespace/dashes/unicode garbage in the stored account number so
      // future retries and the receipt show the clean value. createTransferRecipient
      // also strips on its way out for a belt-and-braces guarantee.
      const cleanedAccount = String(it.account_number || '').replace(/\D/g, '');
      if (!cleanedAccount) return markFailed('Account number is empty after stripping non-digits — re-enter it.');
      if (cleanedAccount !== String(it.account_number)) {
        await supabase.from('batch_items')
          .update({ account_number: cleanedAccount })
          .eq('id', it.id);
      }
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
      let verifiedAccountName: string | null = null;
      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: it.full_name || 'Unknown Recipient',
          account_number: cleanedAccount,
          bank_code: bankCode,
        });
        recipientCode = recipient.recipient_code;
        verifiedAccountName = recipient.details?.account_name || null;
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
      const finalNarration = customNarration || it.narration || narrationForBatchItem(batch, it);
      const transfer = await initiateTransferIdempotent({
        recipient_code: recipientCode!,
        amount_ngn: Number(it.amount_ngn || 0),
        reference: ref,
        reason: finalNarration,
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
            narration: finalNarration,
            ...(verifiedAccountName ? { account_name: verifiedAccountName } : {}),
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
          narration: finalNarration,
          ...(verifiedAccountName ? { account_name: verifiedAccountName } : {}),
          // Surface OTP-required state immediately. Paystack puts high-value
          // transfers into status="otp" and the transfer sits there until a
          // merchant approves via OTP on dashboard.paystack.co. Without this
          // signal the row just shows "pending" and finance can't tell that
          // human action is needed.
          failure_reason: String(transfer.status || '').toLowerCase() === 'otp'
            ? 'Awaiting OTP authorization — approve on dashboard.paystack.co (Transfers → pending) to release this transfer.'
            : null,
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
      // Concurrency guard: routes through start_batch_processing RPC, which
      // does FOR UPDATE locking + role check + status whitelist. If two admins
      // click Process at the same time, only the first reaches 'processing';
      // the loser raises and falls through to the catch.
      try {
        await startBatchProcessing(id!);
      } catch (claimErr: any) {
        toast({
          title: 'Batch is no longer ready to process',
          description: claimErr?.message || 'It may already be running or have changed state. Refreshing…',
          variant: 'destructive',
        });
        await fetchBatch();
        setActionLoading(false);
        setProcessingTotal(0);
        return;
      }

      // Process each item serially in the browser using the deployed
      // paystack-transfer edge function. Tab must stay open during processing.
      // Account-level error short-circuit: if Paystack rejects with an error
      // that affects the whole account (transfers not enabled, balance too
      // low, account restricted) every subsequent recipient will fail with
      // the same message. Abort the batch loop after the first such error
      // so the operator gets to fix the root cause instead of watching 100
      // identical failures stream in.
      const ACCOUNT_LEVEL_ERR = /cannot initiate third[\- ]?party payouts|third party payouts.*not.*allowed|payouts.*not.*enabled|balance is not enough|insufficient funds|account.*restricted|account.*suspended/i;
      let accountLevelHit = false;
      for (let i = 0; i < toProcess.length; i++) {
        const it = toProcess[i];
        setProcessingIdx(i + 1);
        setProcessingName(it.full_name);
        const result = await processOneItem(it, customNarration);
        if (!result.ok && result.reason && ACCOUNT_LEVEL_ERR.test(result.reason)) {
          accountLevelHit = true;
          toast({
            title: 'Batch halted — Paystack account issue',
            description: `${result.reason} — fix on dashboard.paystack.co before retrying any items.`,
            variant: 'destructive',
            duration: 12000,
          });
          break;
        }
      }
      if (accountLevelHit) {
        // Mark remaining unprocessed items as still pending — don't burn
        // their state. The operator retries after fixing Paystack.
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

      // Server-derived status: finalize_batch reads item statuses inside a
      // single SECURITY DEFINER transaction, no client-side rule duplication.
      let batchStatus = 'processing';
      try {
        const finalized = await finalizeBatch(id!);
        batchStatus = finalized?.status || batchStatus;
      } catch (finErr) {
        console.warn('[KDOps] finalize_batch failed, falling back to sync:', finErr);
        try {
          const synced = await syncBatchStatusFromItems(id!);
          batchStatus = synced?.status || batchStatus;
        } catch { /* best-effort */ }
      }
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

  /**
   * Standalone Paystack /bank/resolve diagnostic. Calls the resolve endpoint
   * with the same bank_code + sanitised account_number we'd send for a real
   * transfer and shows the verbatim Paystack response. Lets finance compare
   * against what dashboard.paystack.co returns for the same account so we
   * can tell whether the failure is on our side or Paystack's.
   */
  const diagnoseItem = async (item: any) => {
    setDiagnosingId(item.id);
    setDiagnosis(null);
    const bankCode = getBankCode(item.bank_name) || '(unknown)';
    const cleaned = String(item.account_number || '').replace(/\D/g, '');
    try {
      const r = await resolveAccount(cleaned, bankCode);
      setDiagnosis({
        itemId: item.id,
        ok: true,
        bankCode,
        account: cleaned,
        bank: item.bank_name,
        result: `Paystack resolved account name: "${r.account_name}" for account ${r.account_number}. The recipient/transfer call should work — if it does not, Paystack's wallet or recipient cache is the issue.`,
      });
    } catch (err: any) {
      setDiagnosis({
        itemId: item.id,
        ok: false,
        bankCode,
        account: cleaned,
        bank: item.bank_name,
        result: err?.message || 'Unknown error',
      });
    } finally {
      setDiagnosingId(null);
    }
  };

  const retryItem = async (item: any): Promise<{ ok: boolean; reason?: string } | undefined> => {
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
      // Re-derive batch status server-side; finalize_batch is idempotent and
      // handles all the (succeeded/failed/pending) permutations in one place.
      try {
        await finalizeBatch(id!);
      } catch {
        try { await syncBatchStatusFromItems(id!); } catch { /* best-effort */ }
      }
      toast({
        title: result.ok ? 'Retry initiated' : 'Retry failed',
        description: result.ok
          ? 'KDOps will poll Paystack for the final status.'
          : result.reason,
        variant: result.ok ? 'default' : 'destructive',
      });
      fetchBatch();
      return result;
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
    <div><div class="l">Transaction Date</div><div class="v">${escapeHtml(formatReceiptDateTime(batch.created_at))}</div></div>
    <div><div class="l">Period</div><div class="v">${escapeHtml(batch.period || '—')}</div></div>
    <div><div class="l">Beneficiaries</div><div class="v">${items.length}</div></div>
    <div><div class="l">Total Amount</div><div class="v">${amountDisplay}</div></div>
    ${batch.scheduled_date ? `<div><div class="l">Scheduled</div><div class="v">${escapeHtml(formatDateTime(batch.scheduled_date))}</div></div>` : ''}
    <div><div class="l">Generated</div><div class="v">${escapeHtml(formatReceiptDateTime(new Date()))}</div></div>
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
  // Only admin/super_admin/finance see salary amounts — all other roles see ₦ ——
  const canSeeAmounts = isAdmin || isFinance;
  const canExport = items.length > 0 && canSeeAmounts;
  const failedItems = items.filter((i) => i.status === 'failed');

  const filteredItems = items.filter((i) => {
    if (itemFilter === 'succeeded' && i.status !== 'succeeded') return false;
    if (itemFilter === 'failed' && i.status !== 'failed') return false;
    if (itemFilter === 'pending' && (i.status === 'succeeded' || i.status === 'failed')) return false;
    if (itemSearch) {
      const s = itemSearch.toLowerCase();
      return (
        (i.full_name || '').toLowerCase().includes(s) ||
        (i.bank_name || '').toLowerCase().includes(s) ||
        (i.account_number || '').includes(s) ||
        (i.paystack_reference || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
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
              { label: 'Total Amount', value: canSeeAmounts ? formatNaira(batch.total_amount || 0) : '₦ ——', bold: true },
              { label: 'Created', value: formatDate(batch.created_at) },
            ];
            // Show the cost breakdown as soon as anything has succeeded so the
            // operator sees fees immediately, not only after a webhook backfill.
            if (succeededCount > 0) {
              cells.push(
                { label: 'Disbursed (succeeded)', value: canSeeAmounts ? formatNaira(succeededAmount) : '₦ ——' },
                { label: 'Paystack Fees', value: canSeeAmounts ? formatNaira(totalFees) : '——' },
                { label: 'Total Cost', value: canSeeAmounts ? formatNaira(totalCost) : '₦ ——', bold: true },
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
                    try {
                      // Reset clears approval state and lets payload edits
                      // through again — the payload-lock trigger refuses to
                      // mutate batch_items while the batch is approved or
                      // pending_second_approval, so going via draft is the
                      // only correct path post-rejection.
                      await resetBatchToDraft(id!);
                      navigate(`/payments/${id}/edit`);
                    } catch (err: any) {
                      toast({
                        title: 'Could not reset to draft',
                        description: err?.message || 'Please try again.',
                        variant: 'destructive',
                      });
                    } finally {
                      setSavingResubmit(false);
                    }
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

      {batch.status === 'pending_second_approval' && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Awaiting second approval.</span>{' '}
            First approved
            {firstApproverName ? <> by <span className="font-semibold">{firstApproverName}</span></> : null}
            {batch.approved_at && (
              <> on {formatDateTime(batch.approved_at)}</>
            )}
            . {secondApprovers.length > 0
                ? <>{secondApprovers.length} eligible approver{secondApprovers.length === 1 ? '' : 's'} can confirm.</>
                : <>Waiting for an eligible second approver.</>}
          </AlertDescription>
        </Alert>
      )}

      {(batch.status === 'approved' || batch.status === 'funded'
        || batch.status === 'processing' || batch.status === 'partially_processed'
        || batch.status === 'processed') && (firstApproverName || secondApproverName) && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-3 pb-3 text-sm space-y-1">
            {firstApproverName && (
              <p>
                <span className="text-muted-foreground">First approved by</span>{' '}
                <span className="font-semibold">{firstApproverName}</span>
                {batch.approved_at && (
                  <span className="text-muted-foreground"> · {formatDateTime(batch.approved_at)}</span>
                )}
              </p>
            )}
            {batch.co_approval_required && secondApproverName && (
              <p>
                <span className="text-muted-foreground">Second approved by</span>{' '}
                <span className="font-semibold">{secondApproverName}</span>
                {batch.second_approved_at && (
                  <span className="text-muted-foreground"> · {formatDateTime(batch.second_approved_at)}</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
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
              {/* Submitter pre-flight: tell them if this will need dual approval. */}
              {coThreshold !== null && Number(batch.total_amount) > coThreshold && (
                <Alert className="border-amber-500/50 bg-amber-500/5 w-full">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    <span className="font-semibold">Heads up — dual approval will be required.</span>{' '}
                    Total {formatNaira(batch.total_amount)} exceeds the co-approval threshold of {formatNaira(coThreshold)}.
                    After the first approval the batch will wait for a second approver before funds can move.
                  </AlertDescription>
                </Alert>
              )}
              <Button variant="outline" onClick={() => navigate(`/payments/${id}/edit`)} disabled={actionLoading}>
                Edit Batch
              </Button>
              <Button onClick={submitForApproval} disabled={actionLoading}>
                Submit for Approval
              </Button>
            </>
          )}
          {/* Pre-flight: cap-blocked → red, co-approval needed → amber, ready → green. */}
          {(batch.status === 'pending_approval' || batch.status === 'pending_second_approval')
            && canApprove
            && (batch.created_by !== profile?.id
                || ['admin', 'super_admin'].includes(profile?.role ?? ''))
            && capPreview && !capPreview.allowed && (
            <Alert className="border-rose-500/50 bg-rose-500/5 w-full">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Cannot approve — cap exceeded.</span>{' '}
                {capPreview.reason || 'Your transfer cap blocks this amount.'}{' '}
                {capPreview.appliedKind && capPreview.appliedLimit != null && (
                  <span className="text-muted-foreground">
                    ({capPreview.appliedKind.replace(/_/g, ' ')}: {formatNaira(capPreview.appliedLimit)})
                  </span>
                )}
                {' '}Ask a Super Admin to raise your cap in Settings → Transfer Authorization.
              </AlertDescription>
            </Alert>
          )}
          {batch.status === 'pending_approval'
            && canApprove
            && (batch.created_by !== profile?.id
                || ['admin', 'super_admin'].includes(profile?.role ?? ''))
            && capPreview?.allowed
            && isCoApprovalRequired(coThreshold, Number(batch.total_amount) || 0) && (
            <Alert className="border-amber-500/50 bg-amber-500/5 w-full">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Two approvals needed.</span>{' '}
                Total {formatNaira(batch.total_amount)} exceeds your co-approval threshold of {formatNaira(coThreshold ?? 0)}.
                Approving moves the batch to <span className="font-semibold">awaiting second approval</span>;
                a different approver must confirm before funds can move.
              </AlertDescription>
            </Alert>
          )}
          {batch.status === 'pending_approval' && canApprove
            && (batch.created_by !== profile?.id
                || ['admin', 'super_admin'].includes(profile?.role ?? '')) && (
            <>
              <div className="w-full">
                <BatchRiskFlags batchId={id!} onAcknowledgedChange={setRiskFlagsAcknowledged} />
              </div>
              <Button
                onClick={approveBatch}
                disabled={actionLoading || (capPreview ? !capPreview.allowed : false) || !riskFlagsAcknowledged}
                size="lg"
              >
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve Batch
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {/* Non-admin submitters cannot approve their own batch. */}
          {batch.status === 'pending_approval' && canApprove
            && batch.created_by === profile?.id
            && !['admin', 'super_admin'].includes(profile?.role ?? '') && (
            <Alert className="border-amber-500/40 bg-amber-500/5 w-full">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                You submitted this batch — another approver must review it.
              </AlertDescription>
            </Alert>
          )}
          {batch.status === 'pending_second_approval' && canApprove
            && batch.created_by !== profile?.id
            && batch.approved_by !== profile?.id && (
            <>
              <div className="w-full">
                <BatchRiskFlags batchId={id!} onAcknowledgedChange={setRiskFlagsAcknowledged} />
              </div>
              <Button
                onClick={confirmSecondApproveBatch}
                disabled={actionLoading || (capPreview ? !capPreview.allowed : false) || !riskFlagsAcknowledged}
                size="lg"
              >
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve as Second
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {batch.status === 'approved' && (
            <Button onClick={() => markFunded()} disabled={actionLoading}>
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
                // 48-hour retry window — matches Paystack's transfer reversal
                // window and NIBSS instant-transfer settlement window. Anything
                // older is treated as archived; create a fresh batch instead.
                const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
                const now = Date.now();
                const toRetry = items.filter(i => {
                  if (!(i.status === 'failed' || (i.status === 'pending' && !i.paystack_reference))) return false;
                  const ageMs = now - new Date(i.updated_at || i.created_at).getTime();
                  return ageMs <= RETRY_WINDOW_MS;
                });
                // Same account-level short-circuit as Process — stop the loop
                // when Paystack rejects with something that will fail every
                // subsequent recipient identically.
                const ACCOUNT_LEVEL_ERR = /cannot initiate third[\- ]?party payouts|third party payouts.*not.*allowed|payouts.*not.*enabled|balance is not enough|insufficient funds|account.*restricted|account.*suspended/i;
                for (const it of toRetry) {
                  const r = await retryItem(it);
                  if (r && !r.ok && r.reason && ACCOUNT_LEVEL_ERR.test(r.reason)) {
                    toast({
                      title: 'Retry halted — Paystack account issue',
                      description: `${r.reason} — fix on dashboard.paystack.co before retrying.`,
                      variant: 'destructive',
                      duration: 12000,
                    });
                    break;
                  }
                }
                setRetryingAll(false);
                fetchBatch();
              }}
              disabled={!!retryingId || retryingAll || actionLoading}
            >
              <RotateCw className="mr-2 h-4 w-4" />
              {retryingAll ? 'Retrying…' : (() => {
                const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
                const now = Date.now();
                const eligible = items.filter(i => {
                  if (!(i.status === 'failed' || (i.status === 'pending' && !i.paystack_reference))) return false;
                  return (now - new Date(i.updated_at || i.created_at).getTime()) <= RETRY_WINDOW_MS;
                }).length;
                return `Retry unsent (${eligible})`;
              })()}
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
                      <p className="text-muted-foreground mb-1">{f.hint}</p>
                      {i.failure_reason && f.hint !== i.failure_reason && (
                        <p className="font-mono text-[10px] text-muted-foreground/80 bg-background/60 rounded px-1.5 py-1 mt-1 break-all">
                          <span className="opacity-60">Paystack said: </span>{i.failure_reason}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold">
              Beneficiaries
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredItems.length === items.length
                  ? `${items.length} ${items.length === 1 ? 'recipient' : 'recipients'}`
                  : `${filteredItems.length} of ${items.length}`}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter pills */}
              <div className="flex gap-1">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'succeeded', label: 'Completed' },
                  { key: 'failed', label: 'Failed' },
                  { key: 'pending', label: 'Pending' },
                ] as const).map(({ key, label }) => {
                  const count =
                    key === 'all' ? items.length :
                    key === 'succeeded' ? items.filter(i => i.status === 'succeeded').length :
                    key === 'failed' ? items.filter(i => i.status === 'failed').length :
                    items.filter(i => i.status !== 'succeeded' && i.status !== 'failed').length;
                  return (
                    <button
                      key={key}
                      onClick={() => setItemFilter(key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                        itemFilter === key
                          ? key === 'failed' ? 'bg-destructive text-destructive-foreground'
                            : key === 'succeeded' ? 'bg-emerald-600 text-white'
                            : 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      {label}
                      {count > 0 && <span className="opacity-70">{count}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-7 h-7 text-xs w-36"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
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
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      No recipients match this filter.
                    </TableCell>
                  </TableRow>
                )}
                {filteredItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.status === 'failed' ? 'border-l-4 border-l-destructive bg-destructive/5 kd-transition' : 'kd-transition'}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{item.full_name || 'Unknown Recipient'}</span>
                        {item.failure_reason && (() => {
                          const f = friendlyPaystackError(item.failure_reason);
                          const isOtp = /awaiting otp/i.test(item.failure_reason);
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="View failure reason"
                                  className={`shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full ${isOtp ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400' : 'text-destructive hover:bg-destructive/10'}`}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="right" className="w-72 text-xs">
                                <p className={`font-semibold mb-1 ${isOtp ? 'text-amber-700 dark:text-amber-400' : 'text-destructive'}`}>{f.title}</p>
                                <p className="text-muted-foreground mb-2">{f.hint}</p>
                                {f.hint !== item.failure_reason && (
                                  <p className="font-mono text-[10px] text-muted-foreground/80 bg-muted/50 rounded px-1.5 py-1 break-all">
                                    <span className="opacity-60">Paystack: </span>{item.failure_reason}
                                  </p>
                                )}
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>{item.bank_name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.account_number || '—'}</TableCell>
                    <TableCell className="text-right">
                      {canSeeAmounts
                        ? <span className="currency">{formatNaira(item.amount_ngn || 0)}</span>
                        : <span className="tabular-nums text-muted-foreground select-none">₦ ——</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {canSeeAmounts ? (() => {
                        const fee = getItemFee(item);
                        if (fee > 0) return <span className="currency">{formatNaira(fee)}</span>;
                        return item.status === 'succeeded'
                          ? <span title="Webhook not yet received">…</span>
                          : '—';
                      })() : '——'}
                    </TableCell>
                    <TableCell>{item.reference}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.paystack_reference || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {item.status === 'failed' && canApprove && (() => {
                          // Retry expires after 48 hours — matches Paystack's
                          // transfer reversal window and NIBSS instant-transfer
                          // settlement window. Beyond that the bank details,
                          // narration period and amount may all be stale and
                          // accidentally re-firing a days-old failed payment is
                          // a real money-loss risk. Operators create a fresh
                          // batch instead.
                          const failedAt = new Date(item.updated_at || item.created_at).getTime();
                          const ageHours = (Date.now() - failedAt) / (1000 * 60 * 60);
                          const RETRY_WINDOW_HOURS = 48;
                          if (ageHours > RETRY_WINDOW_HOURS) {
                            return (
                              <span
                                className="text-[10px] text-muted-foreground italic"
                                title={`Retry window closed (${Math.round(ageHours)}h old). Create a new batch with this recipient if payment is still owed.`}
                              >
                                Retry expired
                              </span>
                            );
                          }
                          return (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryingId === item.id}
                                onClick={() => retryItem(item)}
                                title={`Failed ${Math.round(ageHours)}h ago — retry expires after ${RETRY_WINDOW_HOURS} hours`}
                              >
                                {retryingId === item.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCw className="h-3.5 w-3.5 mr-1" />
                                )}
                                Retry
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={diagnosingId === item.id}
                                onClick={() => diagnoseItem(item)}
                                title="Call Paystack /bank/resolve directly with the same parameters and show the verbatim response."
                              >
                                {diagnosingId === item.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                Diagnose
                              </Button>
                            </>
                          );
                        })()}
                        {(item.paystack_reference || item.status === 'failed' || item.status === 'succeeded') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReceiptItem(item)}
                            title="View receipt"
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

      <Dialog open={!!diagnosis} onOpenChange={(v) => { if (!v) setDiagnosis(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paystack resolve diagnostic</DialogTitle>
            <DialogDescription>
              Verbatim response from Paystack's <code className="text-xs">/bank/resolve</code> endpoint
              for the exact bank code and account number we send. Compare this with what dashboard.paystack.co
              returns for the same details.
            </DialogDescription>
          </DialogHeader>
          {diagnosis && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <span className="text-muted-foreground">Bank:</span>
                <span className="font-mono">{diagnosis.bank}</span>
                <span className="text-muted-foreground">Bank code sent:</span>
                <span className="font-mono">{diagnosis.bankCode}</span>
                <span className="text-muted-foreground">Account sent:</span>
                <span className="font-mono">{diagnosis.account} <span className="text-muted-foreground">({diagnosis.account.length} digits)</span></span>
              </div>
              <div className={`rounded-md border p-3 ${diagnosis.ok ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20' : 'border-destructive/40 bg-destructive/5'}`}>
                <p className={`text-xs font-semibold mb-1 ${diagnosis.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                  {diagnosis.ok ? 'Paystack RESOLVED the account ✓' : 'Paystack REJECTED the request ✗'}
                </p>
                <p className="font-mono text-xs break-all">{diagnosis.result}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {diagnosis.ok
                  ? 'If resolve works but the actual transfer fails, the issue is downstream (recipient creation cache, wallet balance, or Paystack rate limits).'
                  : 'Try the same bank code + account on dashboard.paystack.co. If Paystack dashboard succeeds but this fails, the parameters we send differ — copy this raw error and share with engineering.'}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDiagnosis(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Batch</DialogTitle>
            <DialogDescription>
              Provide a clear reason — the submitter will see it in their notification.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectBatch(rejectReason.trim())} disabled={!isValidRejectionReason(rejectReason)}>
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecurring} onOpenChange={setShowRecurring}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make this batch recurring</DialogTitle>
            <DialogDescription>
              Schedule this batch to repeat automatically on the chosen cadence.
            </DialogDescription>
          </DialogHeader>
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

      <ReceiptModal
        open={!!receiptItem}
        onClose={() => setReceiptItem(null)}
        item={receiptItem}
        batch={batch}
        companyName={companyName}
        logoUrl={logoUrl}
      />

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
            <DialogDescription>
              The batch will be hidden from all lists. The audit history stays intact.
            </DialogDescription>
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
