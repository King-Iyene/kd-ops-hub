import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { friendlyDbError } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles, notifyChannels } from '@/lib/notify';
import { notifyAnomalyToAdmins } from '@/lib/notify-events';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { FilePreviewTrigger } from '@/components/FilePreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { burst } from '@/components/Burst';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import {
  Loader2,
  Check,
  X,
  Fuel,
  Plus,
  Trash2,
  AlertTriangle,
  Wrench,
  FileText,
  Upload,
  RotateCcw,
  CreditCard,
  Banknote,
  CheckCircle2,
  Search,
  MoreHorizontal,
  Receipt,
  Download,
  Ban,
} from 'lucide-react';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { approveExpense, rejectExpense } from '@/lib/transfer-safety';
import { cn } from '@/lib/utils';
import {
  hashFile,
  watermarkImage,
  checkPumpPrice,
  checkReceiptRequestDivergence,
  checkOdometerRegression,
  checkRepairCostOutlier,
  checkStaleReceipt,
  blendBenchmark,
  median,
  checkMathMismatch,
  checkTankOverflow,
  checkFuelRequestFrequency,
  checkOcrManualMismatch,
  checkRouteEfficiency,
  scoreAnomalySeverity,
} from '@/lib/receipts';
import { hasJpegExif } from '@/lib/receiptForensics';
import { ElaTamperAnalysisDialog } from '@/components/fleet/ElaTamperAnalysisDialog';
import { AnomalyReviewDialog } from '@/components/fleet/AnomalyReviewDialog';
import { addMonths } from '@/components/fleet/fleet-utils';
import { LogExternalPurchaseDialog } from '@/components/fleet/LogExternalPurchaseDialog';
import { OcrReceiptScanner, type OcrResult } from '@/components/OcrReceiptScanner';
import { SERVICE_TYPES } from '@/components/fleet/FleetAnalyticsDashboard';
import {
  type FieldStaff,
  type VehicleSummary,
  type FuelRequest,
  type ReceiptDebt,
  type MaintenanceRecord,
  getFuelFee,
  getReceiptDebt,
  exportCsv,
  daysSinceIso,
  RECEIPT_DEBT_HARD_BLOCK_DAYS,
} from '@/lib/fleet-utils';

// ---------------------------------------------------------------------------
// Helper components (fuel-only, inlined)
// ---------------------------------------------------------------------------

function WeeklyBudgetBar({
  spent, total, carryForward, remaining,
}: {
  spent: number; total: number; carryForward: number; remaining: number;
}) {
  const pctRemaining = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0;
  const isOver   = remaining <= 0;
  const isRed    = !isOver && pctRemaining < 25;
  const isAmber  = !isOver && !isRed && pctRemaining < 50;

  const barColour = total <= 0
    ? ''
    : isOver  ? '[&>div]:bg-destructive'
    : isRed   ? '[&>div]:bg-red-500'
    : isAmber ? '[&>div]:bg-amber-500'
    :           '[&>div]:bg-green-500';

  const remainColour = isOver ? 'text-destructive' : isRed ? 'text-red-600' : isAmber ? 'text-amber-600' : 'text-green-700';

  return (
    <div className="rounded-md border px-3 py-2.5 space-y-2 bg-muted/30 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground">Weekly Budget</span>
        <span className={`font-semibold currency ${remainColour}`}>
          {formatNaira(remaining)} remaining
        </span>
      </div>
      <Progress
        value={total > 0 ? pctRemaining : 0}
        className={`h-2 bg-muted/60 ${barColour}`}
      />
      <div className="grid grid-cols-3 text-muted-foreground gap-1">
        <div>
          <p>Used</p>
          <p className="font-semibold text-foreground tabular-nums">{formatNaira(spent)}</p>
        </div>
        <div className="text-center">
          <p>Remaining</p>
          <p className={`font-semibold tabular-nums ${remainColour}`}>{formatNaira(remaining)}</p>
        </div>
        <div className="text-right">
          <p>Total</p>
          <p className="font-semibold text-foreground tabular-nums">{formatNaira(total)}</p>
        </div>
      </div>
      {carryForward > 0 && (
        <p className="text-blue-600">
          Includes {formatNaira(carryForward)} carry-forward from last week.
        </p>
      )}
      {isOver  && <p className="text-destructive font-medium">Weekly budget exhausted.</p>}
      {isRed   && <p className="text-red-600">Less than 25% of budget remaining.</p>}
      {isAmber && <p className="text-amber-600">Less than 50% of budget remaining.</p>}
    </div>
  );
}

function FuelRequestFuelLevel({ vehicleId, vehicles }: { vehicleId: string | null | undefined; vehicles: VehicleSummary[] }) {
  if (!vehicleId) return <span className="text-muted-foreground">—</span>;
  const veh = vehicles.find((v) => v.id === vehicleId);
  if (!veh) return <span className="text-muted-foreground">—</span>;
  const cap = veh.tank_capacity_litres || 60;
  const cur = Math.min(veh.current_fuel_litres || 0, cap);
  const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
  return (
    <span className={`font-medium ${pct < 20 ? 'text-red-600' : pct < 50 ? 'text-amber-600' : 'text-green-600'}`}>
      {cur.toFixed(0)}L ({pct}%)
      {pct < 20 && <AlertTriangle className="inline h-3 w-3 ml-0.5 -mt-0.5" />}
    </span>
  );
}


// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FuelTabProps {
  staff: FieldStaff[];
  vehicles: VehicleSummary[];
  fuelRequests: FuelRequest[];
  isAdmin: boolean;
  profile: { id: string; full_name?: string; role?: string; email?: string } | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FuelTab({ staff, vehicles, fuelRequests, isAdmin, profile, onRefresh }: FuelTabProps) {
  const { toast } = useToast();

  // ── Submitting guard ───────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  // ── Fuel status filter ─────────────────────────────────────────────────
  const [fuelStatusFilter, setFuelStatusFilter] = useState<string>('all');

  // ── Fuel request form ──────────────────────────────────────────────────
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({
    employee_id: profile?.id || '',
    station_name: '',
    amount_ngn: '',
    litres_est: '',
    odometer: '',
    reason: '',
  });

  const EMPTY_FUEL_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [fuelBankDetails, setFuelBankDetails] = useState<BankAccountValue>(EMPTY_FUEL_BANK);
  const [showFuelBankSection, setShowFuelBankSection] = useState(false);
  const [fuelDoc, setFuelDoc] = useState<File | null>(null);

  // Which provider BankAccountField should verify against
  const [activeProvider, setActiveProvider] = useState<'paystack' | 'flutterwave'>('paystack');
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('active_payment_provider')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      setActiveProvider((data as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack');
    })();
  }, []);

  // Post-payment receipt upload
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<FuelRequest | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptForm, setReceiptForm] = useState({ fuel_station_name: '', amount_ngn: '', litres_filled: '', receipt_date: '', notes: '' });
  const [receiptScanWarning, setReceiptScanWarning] = useState('');
  const [ocrReadValues, setOcrReadValues] = useState<{ amount: number | null; litres: number | null }>({ amount: null, litres: null });
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Tamper-analysis (ELA)
  const [elaTarget, setElaTarget] = useState<{ id: string; url: string } | null>(null);

  // Vehicle & weekly budget state
  const [fuelVehicleId, setFuelVehicleId] = useState('');
  const [weekBudget, setWeekBudget] = useState<{
    spent: number; total: number; carryForward: number; remaining: number;
  } | null>(null);

  // Anomaly detection
  const [showDuplicateFuelWarning, setShowDuplicateFuelWarning] = useState(false);
  const [pendingFuelAsException, setPendingFuelAsException] = useState(false);

  // Anomaly review
  const [reviewingAnomaly, setReviewingAnomaly] = useState<{ type: 'trip' | 'fuel'; id: string; label: string } | null>(null);

  // Repair request form
  const EMPTY_REPAIR_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [repairForm, setRepairForm] = useState({
    employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '',
    vehicle_id: '', service_type: '', odometer: '',
    vendor_name: '', repair_date: new Date().toISOString().slice(0, 10),
    priority: 'routine' as 'emergency' | 'urgent' | 'routine',
    parts_replaced: '', labour_hours: '',
  });
  const [repairBank, setRepairBank] = useState<BankAccountValue>(EMPTY_REPAIR_BANK);
  const [repairReceipt, setRepairReceipt] = useState<File | null>(null);
  const [repairIsReimbursement, setRepairIsReimbursement] = useState(true);
  const [repairMatchingItems, setRepairMatchingItems] = useState<MaintenanceRecord[]>([]);
  const [repairMaintenanceItemId, setRepairMaintenanceItemId] = useState('');

  // Receipt accountability
  const [myReceiptDebt, setMyReceiptDebt] = useState<ReceiptDebt | null>(null);
  const [myOpenRepairs, setMyOpenRepairs] = useState<Array<{
    id: string; description: string | null; amount_ngn: number; created_at: string;
    vehicle_id: string | null; service_type: string | null;
    maintenance_item_id: string | null; repair_odometer_km: number | null;
    vendor_name: string | null; date: string | null;
  }>>([]);
  const refreshMyReceiptDebt = useCallback(async () => {
    if (!profile?.id) return;
    const [debt, { data: openRepairs }] = await Promise.all([
      getReceiptDebt(profile.id),
      supabase
        .from('expenses')
        .select('id, description, amount_ngn, created_at, vehicle_id, service_type, maintenance_item_id, repair_odometer_km, vendor_name, date')
        .eq('submitted_by', profile.id)
        .eq('category', 'repair')
        .is('receipt_url', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);
    setMyReceiptDebt(debt);
    setMyOpenRepairs((openRepairs as any) || []);
  }, [profile?.id]);

  // Post-payment receipt upload for repairs
  const [uploadingRepairReceiptFor, setUploadingRepairReceiptFor] = useState<{
    id: string; description: string | null; amount_ngn: number; vehicle_id: string | null;
    service_type: string | null; maintenance_item_id: string | null; repair_odometer_km: number | null;
    vendor_name: string | null; date: string | null;
  } | null>(null);
  const [repairReceiptUploadFile, setRepairReceiptUploadFile] = useState<File | null>(null);
  const [submittingRepairReceipt, setSubmittingRepairReceipt] = useState(false);
  const [repairReceiptUploadVendor, setRepairReceiptUploadVendor] = useState('');
  const [repairReceiptUploadDate, setRepairReceiptUploadDate] = useState('');
  const [repairReceiptOcrAmount, setRepairReceiptOcrAmount] = useState<string>('');
  const [repairReceiptUploadOcrAmount, setRepairReceiptUploadOcrAmount] = useState<string>('');

  // Pump-price benchmark for anomaly cross-check
  const [fuelPriceBenchmark, setFuelPriceBenchmark] = useState<number | null>(null);
  const [fuelIsReimbursement, setFuelIsReimbursement] = useState(true);

  // Log External Purchase
  const [showLogExternalForm, setShowLogExternalForm] = useState(false);

  // Reject / re-request / delete confirmation
  const [rejectingFuel, setRejectingFuel] = useState<FuelRequest | null>(null);
  const [fuelRejectReason, setFuelRejectReason] = useState('');
  const [reRequestTarget, setReRequestTarget] = useState<FuelRequest | null>(null);
  const [reRequestNote, setReRequestNote] = useState('');
  const [confirmDeleteFuel, setConfirmDeleteFuel] = useState<FuelRequest | null>(null);

  // ── Fetch fuel price benchmark on mount ────────────────────────────────
  useEffect(() => {
    void (async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [settingsRes, fleetPricesRes] = await Promise.all([
        supabase
          .from('company_settings')
          .select('fuel_price_ngn_per_litre')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
        supabase
          .from('fuel_requests')
          .select('amount_ngn, litres_filled')
          .not('litres_filled', 'is', null)
          .gt('litres_filled', 0)
          .gte('created_at', thirtyDaysAgo)
          .is('deleted_at', null),
      ]);
      const externalPrice: number | null = (settingsRes.data as any)?.fuel_price_ngn_per_litre ?? null;
      const impliedPrices = ((fleetPricesRes.data as any[]) || [])
        .map((r: any) => r.amount_ngn / r.litres_filled)
        .filter((p: number) => p > 100 && p < 5000);
      const fleetMedian = impliedPrices.length >= 3 ? median(impliedPrices) : null;
      setFuelPriceBenchmark(blendBenchmark(fleetMedian, externalPrice));
    })();
    void refreshMyReceiptDebt();
  }, [refreshMyReceiptDebt]);

  // ── Derived data ───────────────────────────────────────────────────────
  const myFuelRequests = useMemo(() => fuelRequests.filter((r) => r.employee_id === profile?.id), [fuelRequests, profile?.id]);
  const visibleFuel = useMemo(() => {
    const base = isAdmin ? fuelRequests : myFuelRequests;
    if (fuelStatusFilter === 'all') return base;
    return base.filter((r) => r.status === fuelStatusFilter);
  }, [isAdmin, fuelRequests, myFuelRequests, fuelStatusFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const fetchWeekBudget = async (vehicleId: string) => {
    if (!vehicleId) { setWeekBudget(null); return; }
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || !v.weekly_budget_ngn) { setWeekBudget(null); return; }

    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('fuel_requests')
      .select('amount_ngn')
      .eq('vehicle_id', vehicleId)
      .in('status', ['approved', 'payment_sent', 'receipt_uploaded', 'completed'])
      .gte('created_at', monday.toISOString())
      .lte('created_at', sunday.toISOString());

    const spent = (data || []).reduce((s: number, r: any) => s + (r.amount_ngn || 0), 0);
    const carryForward = v.carry_forward_ngn ?? 0;
    const total = v.weekly_budget_ngn + carryForward;
    setWeekBudget({ spent, total, carryForward, remaining: Math.max(0, total - spent) });
  };

  // Marks a matching vehicle_maintenance item done from a repair receipt
  const closeMaintenanceItemFromRepair = async (
    itemId: string, expenseId: string, receiptUrl: string | null, odometerKm: number | null,
  ) => {
    const { data: item } = await supabase
      .from('vehicle_maintenance')
      .select('recurrence, due_date, due_mileage_km, last_done_mileage_km')
      .eq('id', itemId)
      .maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    const isRecurring = item && item.recurrence !== 'one_time' && item.recurrence !== 'custom';
    let nextDueDate: string | null = null;
    let nextDueMileage: number | null = null;
    if (item?.recurrence === 'every_3_months') nextDueDate = addMonths(today, 3);
    if (item?.recurrence === 'every_6_months') nextDueDate = addMonths(today, 6);
    if (item?.recurrence === 'every_10000_km') nextDueMileage = (odometerKm ?? item.last_done_mileage_km ?? 0) + 10_000;
    const { error: maintErr } = await supabase.from('vehicle_maintenance').update({
      status: isRecurring ? 'pending' : 'done',
      last_done_date: today,
      last_done_mileage_km: odometerKm ?? item?.last_done_mileage_km ?? null,
      due_date: isRecurring ? nextDueDate : item?.due_date,
      due_mileage_km: isRecurring ? nextDueMileage : item?.due_mileage_km,
      expense_id: expenseId,
      receipt_url: receiptUrl,
    }).eq('id', itemId);
    if (maintErr) {
      toast({ title: 'Maintenance item update failed', description: friendlyDbError(maintErr), variant: 'destructive' });
    }
  };

  const submitRepairRequest = async () => {
    if (submitting) return;
    if (!repairForm.employee_id || !repairForm.description || !repairForm.amount_ngn) {
      toast({ title: 'Employee, description and amount are required', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(repairForm.amount_ngn) || 0;
    if (amount > 10000 && !repairReceipt) {
      toast({ title: 'A receipt is required for repairs over ₦10,000', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
    // Receipt accountability
    const debt = await getReceiptDebt(repairForm.employee_id);
    if (debt.repairOldestDays !== null && debt.repairOldestDays >= RECEIPT_DEBT_HARD_BLOCK_DAYS) {
      toast({
        title: 'Receipt required first',
        description: `This driver has a repair from ${debt.repairOldestDays} day${debt.repairOldestDays === 1 ? '' : 's'} ago with no receipt uploaded. Upload it before requesting again.`,
        variant: 'destructive',
      });
      return;
    }
      let receiptUrl: string | null = null;
      let receiptSha256: string | null = null;
      let originalSha256: string | null = null;
      let hasExif: boolean | null = null;
      const flags: { type: string; reason: string }[] = [];

      // Cost-outlier check
      if (repairForm.service_type) {
        const { data: priorRepairs } = await supabase
          .from('expenses')
          .select('amount_ngn')
          .eq('category', 'repair')
          .eq('service_type', repairForm.service_type)
          .is('deleted_at', null)
          .neq('status', 'rejected')
          .limit(200);
        const priorAmounts = (priorRepairs || [])
          .map((r: any) => r.amount_ngn)
          .filter((n: number) => n > 0);
        const costCheck = checkRepairCostOutlier(amount, median(priorAmounts), priorAmounts.length);
        if (costCheck.flagged && costCheck.reason) {
          flags.push({ type: 'cost_outlier', reason: costCheck.reason });
        }
      }

      if (repairForm.repair_date) {
        const staleReason = checkStaleReceipt(repairForm.repair_date, new Date().toISOString().slice(0, 10));
        if (staleReason) flags.push({ type: 'stale_receipt', reason: staleReason.replace('Receipt', 'Repair') });
      }

      if (repairReceipt) {
        originalSha256 = await hashFile(repairReceipt);
        hasExif = await hasJpegExif(repairReceipt);

        const { data: dupRows } = await supabase
          .from('expenses')
          .select('id')
          .eq('receipt_original_sha256', originalSha256)
          .limit(1);
        if (dupRows && dupRows.length > 0) {
          flags.push({ type: 'duplicate_receipt', reason: 'This receipt image matches one already uploaded on another expense claim' });
        }

        if (repairReceiptOcrAmount) {
          const ocrAmount = parseFloat(repairReceiptOcrAmount);
          if (ocrAmount && checkReceiptRequestDivergence(ocrAmount, amount).flagged) {
            const deviationPct = Math.round((Math.abs(amount - ocrAmount) / amount) * 100);
            const direction = amount > ocrAmount ? 'more' : 'less';
            flags.push({
              type: 'amount_mismatch',
              reason: `Entered amount ${formatNairaCompact(amount)} is ${deviationPct}% ${direction} than the ${formatNairaCompact(ocrAmount)} the receipt appears to show`,
            });
          }
        }

        const watermarked = await watermarkImage(repairReceipt, { driverName: profile?.full_name || 'Employee' });
        receiptSha256 = await hashFile(watermarked);
        const compressed = await compressImage(watermarked);
        const ext = compressed.name.split('.').pop();
        const path = `repairs/${profile?.id}/${Date.now()}.${ext}`;
        const { data: upData } = await supabase.storage
          .from('receipts')
          .upload(path, compressed, { upsert: true });
        if (upData) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
          receiptUrl = urlData.publicUrl;
        }
      }

      const noteParts = [
        repairForm.notes.trim(),
        ...flags.map((f) => `⚠ ${f.reason}`),
        ...(flags.length > 0 && hasExif === false ? ['ℹ No camera metadata found on this photo'] : []),
      ].filter(Boolean);

      const odometerNum = parseFloat(repairForm.odometer) || null;
      const { data: insertedExpense, error: repairExpErr } = await supabase.from('expenses').insert({
        submitted_by: repairForm.employee_id,
        category: 'repair',
        budget_category: 'repair',
        amount_ngn: amount,
        date: repairForm.repair_date || new Date().toISOString().slice(0, 10),
        description: repairForm.description,
        vendor_name: repairForm.vendor_name.trim() || null,
        status: 'pending',
        receipt_url: receiptUrl,
        receipt_sha256: receiptSha256,
        receipt_original_sha256: originalSha256,
        receipt_has_exif: hasExif,
        is_anomaly: flags.length > 0,
        anomaly_type: flags.length > 0 ? flags.map((f) => f.type).join(',') : null,
        admin_note: noteParts.join(' — ') || null,
        is_reimbursement: repairIsReimbursement,
        vehicle_id: repairForm.vehicle_id || null,
        service_type: repairForm.service_type || null,
        repair_odometer_km: odometerNum,
        maintenance_item_id: repairMaintenanceItemId || null,
        priority: repairForm.priority,
        parts_replaced: repairForm.parts_replaced.trim() || null,
        labour_hours: parseFloat(repairForm.labour_hours) || null,
        ...(repairBank.verified ? {
          bank_name: repairBank.bank_name,
          account_number: repairBank.account_number,
          account_name: repairBank.account_name,
        } : {}),
      }).select('id').single();
      if (repairExpErr) {
        toast({
          title: 'Repair submission failed',
          description: friendlyDbError(repairExpErr),
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
      if (receiptUrl && repairMaintenanceItemId && insertedExpense?.id) {
        await closeMaintenanceItemFromRepair(repairMaintenanceItemId, insertedExpense.id, receiptUrl, odometerNum);
      }
      await logAudit('repair_request_submitted', `Repair (${repairIsReimbursement ? 'reimbursement' : 'company charge'}): ${repairForm.description} (${formatNaira(amount)})`, profile);
      if (flags.length > 0) {
        const repairSeverity = scoreAnomalySeverity(flags.map((f) => f.type));
        const repairFlagSummary = flags.map((f) => f.reason).join('; ');
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'repair_receipt_anomaly',
          module: 'fleet',
          priority: repairSeverity === 'critical' || repairSeverity === 'high' ? 'high' : 'normal',
          title: `Repair flagged (${repairSeverity})`,
          body: `${profile?.full_name || 'Employee'}'s repair (${formatNaira(amount)}): ${repairFlagSummary}`,
        });
        if (repairSeverity === 'high' || repairSeverity === 'critical') {
          void notifyAnomalyToAdmins({
            title: `Fleet anomaly: ${repairSeverity} severity on repair`,
            summary: `${profile?.full_name || 'Employee'}'s repair (${formatNaira(amount)}): ${repairFlagSummary}`,
            severity: repairSeverity,
            link: `${window.location.origin}/fleet`,
          });
        }
        if (repairSeverity === 'critical') {
          const { data: adminProfiles } = await supabase
            .from('profiles_directory')
            .select('id, full_name, email, phone')
            .in('role', ['super_admin', 'admin'])
            .eq('status', 'active');
          if (adminProfiles && adminProfiles.length > 0) {
            await Promise.allSettled(
              adminProfiles.map((admin: any) =>
                notifyChannels({
                  user: { id: admin.id, full_name: admin.full_name, email: admin.email, phone: admin.phone },
                  category: 'fleet',
                  kind: 'fleet_anomaly_critical',
                  payload: {
                    driver_name: profile?.full_name || 'Employee',
                    description: repairForm.description,
                    severity: repairSeverity,
                    flags: flags.map((f) => f.reason).slice(0, 3).join('; '),
                  },
                  forceChannels: { in_app: false, whatsapp: true, sms: true },
                  idempotencyKey: `repair-anomaly-${Date.now()}`,
                }),
              ),
            );
          }
        }
      } else {
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'repair_request_submitted',
          module: 'fleet',
          title: repairIsReimbursement ? 'Repair reimbursement submitted' : 'Repair request submitted (company charge)',
          body: `${formatNaira(amount)}: ${repairForm.description}`,
        });
      }
      toast({ title: 'Repair request submitted' });
      setShowRepairForm(false);
      setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '', vehicle_id: '', service_type: '', odometer: '', vendor_name: '', repair_date: new Date().toISOString().slice(0, 10), priority: 'routine' as const, parts_replaced: '', labour_hours: '' });
      setRepairBank(EMPTY_REPAIR_BANK);
      setRepairReceipt(null);
      setRepairReceiptOcrAmount('');
      setRepairMatchingItems([]);
      setRepairMaintenanceItemId('');
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Loads pending vehicle_maintenance items for the vehicle on the repair form
  const loadRepairMatchingItems = async (vehicleId: string) => {
    setRepairMaintenanceItemId('');
    if (!vehicleId) { setRepairMatchingItems([]); return; }
    const { data } = await supabase
      .from('vehicle_maintenance')
      .select('id, service_type, due_date, status')
      .eq('vehicle_id', vehicleId)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false });
    setRepairMatchingItems((data as MaintenanceRecord[]) || []);
  };

  // Attach a receipt to a repair submitted without one
  const submitRepairReceiptUpload = async () => {
    if (!uploadingRepairReceiptFor || !repairReceiptUploadFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingRepairReceipt(true);
    try {
      const originalSha256 = await hashFile(repairReceiptUploadFile);
      const hasExif = await hasJpegExif(repairReceiptUploadFile);

      const { data: dupRows } = await supabase
        .from('expenses')
        .select('id')
        .eq('receipt_original_sha256', originalSha256)
        .neq('id', uploadingRepairReceiptFor.id)
        .limit(1);

      const flags: { type: string; reason: string }[] = [];
      if (dupRows && dupRows.length > 0) {
        flags.push({ type: 'duplicate_receipt', reason: 'This receipt image matches one already uploaded on another expense claim' });
      }

      const claimedAmount = uploadingRepairReceiptFor.amount_ngn || 0;
      if (repairReceiptUploadOcrAmount) {
        const ocrAmount = parseFloat(repairReceiptUploadOcrAmount);
        if (ocrAmount && claimedAmount && checkReceiptRequestDivergence(ocrAmount, claimedAmount).flagged) {
          const deviationPct = Math.round((Math.abs(claimedAmount - ocrAmount) / claimedAmount) * 100);
          const direction = claimedAmount > ocrAmount ? 'more' : 'less';
          flags.push({
            type: 'amount_mismatch',
            reason: `Submitted amount ${formatNairaCompact(claimedAmount)} is ${deviationPct}% ${direction} than the ${formatNairaCompact(ocrAmount)} this receipt appears to show`,
          });
        }
      }

      if (repairReceiptUploadDate) {
        const staleReason = checkStaleReceipt(repairReceiptUploadDate, new Date().toISOString().slice(0, 10));
        if (staleReason) flags.push({ type: 'stale_receipt', reason: staleReason.replace('Receipt', 'Repair') });
      }

      const watermarked = await watermarkImage(repairReceiptUploadFile, { driverName: profile?.full_name || 'Employee' });
      const receiptSha256 = await hashFile(watermarked);
      const compressed = await compressImage(watermarked);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `repairs/${profile?.id}/${uploadingRepairReceiptFor.id}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
      const receiptUrl = urlData.publicUrl;

      const noteParts = [
        ...flags.map((f) => `⚠ ${f.reason}`),
        ...(flags.length > 0 && hasExif === false ? ['ℹ No camera metadata found on this photo'] : []),
      ].filter(Boolean);

      const { error } = await supabase
        .from('expenses')
        .update({
          receipt_url: receiptUrl,
          receipt_sha256: receiptSha256,
          receipt_original_sha256: originalSha256,
          receipt_has_exif: hasExif,
          is_anomaly: flags.length > 0,
          anomaly_type: flags.length > 0 ? flags.map((f) => f.type).join(',') : null,
          admin_note: noteParts.join(' — ') || null,
          vendor_name: repairReceiptUploadVendor.trim() || null,
          ...(repairReceiptUploadDate ? { date: repairReceiptUploadDate } : {}),
        })
        .eq('id', uploadingRepairReceiptFor.id);
      if (error) throw error;
      if (uploadingRepairReceiptFor.maintenance_item_id) {
        await closeMaintenanceItemFromRepair(
          uploadingRepairReceiptFor.maintenance_item_id,
          uploadingRepairReceiptFor.id,
          receiptUrl,
          uploadingRepairReceiptFor.repair_odometer_km,
        );
      }
      await logAudit(
        'repair_receipt_uploaded',
        `Receipt uploaded for repair (${formatNaira(uploadingRepairReceiptFor.amount_ngn || 0)})`,
        profile,
      );
      if (flags.length > 0) {
        const repairUpSeverity = scoreAnomalySeverity(flags.map((f) => f.type));
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'repair_receipt_anomaly',
          module: 'fleet',
          priority: repairUpSeverity === 'critical' || repairUpSeverity === 'high' ? 'high' : 'normal',
          title: `Repair receipt flagged (${repairUpSeverity})`,
          body: `${profile?.full_name || 'Employee'}'s receipt for ${formatNaira(uploadingRepairReceiptFor.amount_ngn || 0)}: ${flags.map((f) => f.reason).join('; ')}`,
        });
        if (repairUpSeverity === 'high' || repairUpSeverity === 'critical') {
          void notifyAnomalyToAdmins({
            title: `Fleet anomaly: ${repairUpSeverity} severity on repair receipt`,
            summary: `${profile?.full_name || 'Employee'}'s receipt (${formatNaira(uploadingRepairReceiptFor.amount_ngn || 0)}): ${flags.map((f) => f.reason).join('; ')}`,
            severity: repairUpSeverity,
            link: `${window.location.origin}/fleet`,
          });
        }
      } else {
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'repair_receipt_uploaded',
          module: 'fleet',
          title: 'Repair receipt uploaded',
          body: `${profile?.full_name || 'Employee'} uploaded a receipt for ${formatNaira(uploadingRepairReceiptFor.amount_ngn || 0)}`,
        });
      }
      toast({ title: 'Receipt submitted' });
      setUploadingRepairReceiptFor(null);
      setRepairReceiptUploadFile(null);
      setRepairReceiptUploadOcrAmount('');
      setRepairReceiptUploadVendor('');
      setRepairReceiptUploadDate('');
      await refreshMyReceiptDebt();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message ?? String(err), variant: 'destructive' });
    }
    setSubmittingRepairReceipt(false);
  };

  const submitFuelRequest = async (asException = false, skipDuplicateCheck = false) => {
    if (submitting) return;
    if (!fuelForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    const amountVal = parseFloat(fuelForm.amount_ngn);
    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      toast({ title: 'Enter a valid amount', description: 'Amount must be greater than ₦0.', variant: 'destructive' });
      return;
    }
    if (amountVal > 5_000_000) {
      toast({ title: 'Amount too high', description: 'Single fuel request cannot exceed ₦5,000,000.', variant: 'destructive' });
      return;
    }

    // Block fuel requests for vehicles currently out of service
    if (fuelVehicleId) {
      const fuelVeh = vehicles.find((v) => v.id === fuelVehicleId);
      if (fuelVeh?.out_of_service_until) {
        const today = new Date().toISOString().slice(0, 10);
        if (fuelVeh.out_of_service_until >= today) {
          toast({ title: 'Vehicle out of service', description: `This vehicle is out of service until ${formatDate(fuelVeh.out_of_service_until)}. Fuel requests are blocked.`, variant: 'destructive' });
          return;
        }
      }
    }

    // Strict compliance enforcement
    if (fuelVehicleId) {
      const fuelVeh = vehicles.find((v) => v.id === fuelVehicleId);
      if (fuelVeh) {
        const todayIso = new Date().toISOString().slice(0, 10);
        const expired: string[] = [];
        if (fuelVeh.insurance_expiry && fuelVeh.insurance_expiry < todayIso) expired.push('Insurance');
        if (fuelVeh.road_worthiness_expiry && fuelVeh.road_worthiness_expiry < todayIso) expired.push('Road Worthiness');
        if ((fuelVeh as any).hackney_permit_expiry && (fuelVeh as any).hackney_permit_expiry < todayIso) expired.push('Hackney Permit');
        if ((fuelVeh as any).vehicle_license_expiry && (fuelVeh as any).vehicle_license_expiry < todayIso) expired.push('Vehicle License');
        if (expired.length > 0) {
          toast({
            title: 'Vehicle compliance expired',
            description: `${expired.join(', ')} expired. Update vehicle documents before requesting fuel.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    setSubmitting(true);

    try {
    // Receipt accountability
    {
      const debt = await getReceiptDebt(fuelForm.employee_id);
      if (debt.fuelOldestDays !== null && debt.fuelOldestDays >= RECEIPT_DEBT_HARD_BLOCK_DAYS) {
        toast({
          title: 'Receipt required first',
          description: `This driver has a fuel payment from ${debt.fuelOldestDays} day${debt.fuelOldestDays === 1 ? '' : 's'} ago with no receipt uploaded. Upload it before requesting again.`,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
    }

    // Block fuel for vehicles with overdue maintenance
    if (fuelVehicleId) {
      const { data: overdueMaint } = await supabase
        .from('vehicle_maintenance')
        .select('service_type, due_date')
        .eq('vehicle_id', fuelVehicleId)
        .eq('status', 'pending')
        .lt('due_date', new Date().toISOString().slice(0, 10))
        .limit(3);
      if (overdueMaint && overdueMaint.length > 0) {
        const items = overdueMaint.map((m: any) => m.service_type).join(', ');
        toast({
          title: 'Overdue maintenance',
          description: `This vehicle has overdue maintenance: ${items}. Complete maintenance before fueling.`,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
    }

    // RULE 3: same-day duplicate check
    if (!skipDuplicateCheck && fuelVehicleId) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(); dayEnd.setHours(23, 59, 59, 999);
      const { data: dupes } = await supabase
        .from('fuel_requests')
        .select('id')
        .eq('vehicle_id', fuelVehicleId)
        .is('deleted_at', null)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .limit(1);
      if (dupes?.length) {
        setPendingFuelAsException(asException);
        setShowDuplicateFuelWarning(true);
        setSubmitting(false);
        return;
      }
    }

    // RULE 2: fuel efficiency anomaly check
    let fuelIsAnomaly = false;
    let fuelAnomalyType: string | null = null;
    const litresEst = parseFloat(fuelForm.litres_est);
    const odometerNow = parseFloat(fuelForm.odometer);
    if (fuelVehicleId && litresEst > 0 && Number.isFinite(odometerNow) && odometerNow > 0) {
      const { data: lastTrip } = await supabase
        .from('trip_logs')
        .select('odometer_end')
        .eq('vehicle_id', fuelVehicleId)
        .not('odometer_end', 'is', null)
        .order('trip_end_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastTrip?.odometer_end) {
        const distKm = odometerNow - (lastTrip.odometer_end as number);
        if (distKm > 0) {
          const effKmL = distKm / litresEst;
          if (effKmL < 2 || effKmL > 30) {
            fuelIsAnomaly = true;
            fuelAnomalyType = 'efficiency_anomaly';
          }
        }
      }
    }

    // Append duplicate marker
    let noteStr = fuelForm.reason;
    if (skipDuplicateCheck) {
      noteStr = noteStr ? `${noteStr} [duplicate_same_day]` : 'duplicate_same_day';
    }

    const { data: inserted, error } = await supabase.from('fuel_requests').insert({
      driver_id: fuelForm.employee_id,
      station_name: fuelForm.station_name,
      amount_ngn: parseFloat(fuelForm.amount_ngn) || 0,
      litres_est: parseFloat(fuelForm.litres_est) || null,
      odometer: parseFloat(fuelForm.odometer) || null,
      reason: noteStr || null,
      status: asException ? 'budget_blocked' : 'pending',
      vehicle_id: fuelVehicleId || null,
      is_anomaly: fuelIsAnomaly,
      anomaly_type: fuelAnomalyType,
      ...(fuelBankDetails.verified ? {
        bank_name: fuelBankDetails.bank_name,
        account_number: fuelBankDetails.account_number,
        account_name: fuelBankDetails.account_name,
      } : {}),
    }).select('id').single();
    if (error) {
      toast({ title: 'Could not submit fuel request', description: friendlyDbError(error), variant: 'destructive' });
    } else {
      // Mirror fuel request into Expenses immediately
      if (inserted?.id) {
        const amount = parseFloat(fuelForm.amount_ngn) || 0;
        await supabase.from('expenses').insert({
          fuel_request_id: inserted.id,
          category: 'fuel',
          budget_category: 'fuel',
          amount_ngn: amount,
          date: new Date().toISOString().slice(0, 10),
          description: `Fuel — ${fuelForm.station_name || 'Station'}${noteStr ? ` — ${noteStr}` : ''}`,
          submitted_by: fuelForm.employee_id,
          status: 'pending',
          is_reimbursement: fuelIsReimbursement,
          ...(fuelBankDetails.verified ? {
            bank_name: fuelBankDetails.bank_name,
            account_number: fuelBankDetails.account_number,
            account_name: fuelBankDetails.account_name,
          } : {}),
        });
      }

      // RULE 2: notify admins if efficiency anomaly
      if (fuelIsAnomaly && inserted?.id) {
        await notifyRoles({
          roles: ['super_admin', 'admin', 'operations'],
          type: 'fuel_efficiency_anomaly',
          module: 'fleet',
          title: 'Fuel efficiency anomaly',
          body: `A fuel request was flagged: estimated efficiency outside normal range (2–30 km/L). Please review.`,
        });
      }
      // Upload supporting document
      if (fuelDoc && inserted?.id) {
        try {
          const compressed = await compressImage(fuelDoc);
          const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `fuel-request-docs/${inserted.id}-${safeName}`;
          const { data: upData, error: upErr } = await supabase.storage
            .from('receipts')
            .upload(path, compressed, { upsert: true });
          if (upErr) throw upErr;
          if (upData) {
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);
            const { error: docUrlErr } = await supabase
              .from('fuel_requests')
              .update({ request_doc_url: urlData.publicUrl })
              .eq('id', inserted.id);
            if (docUrlErr) {
              toast({ title: 'Document link failed to save', description: docUrlErr.message, variant: 'destructive' });
            }
          }
        } catch (docErr: any) {
          toast({
            title: 'Request submitted, but document upload failed',
            description: docErr?.message || 'Please edit the request to re-attach.',
            variant: 'destructive',
          });
        }
      }

      await logAudit(
        asException ? 'fuel_budget_exception_requested' : 'fuel_request_submitted',
        `Fuel request ${asException ? 'submitted as budget exception' : 'submitted'} (${formatNaira(
          parseFloat(fuelForm.amount_ngn) || 0,
        )} at ${fuelForm.station_name})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_request_submitted',
        module: 'fleet',
        title: asException ? 'Fuel budget exception requested' : 'Fuel request submitted',
        body: `${formatNaira(parseFloat(fuelForm.amount_ngn) || 0)} at ${fuelForm.station_name}${asException ? ' — OVER BUDGET' : ''}`,
      });
      toast({ title: 'Fuel request submitted' });
      setShowFuelForm(false);
      setFuelForm({
        employee_id: profile?.id || '',
        station_name: '',
        amount_ngn: '',
        litres_est: '',
        odometer: '',
        reason: '',
      });
      setShowFuelBankSection(false);
      setFuelBankDetails(EMPTY_FUEL_BANK);
      setFuelVehicleId('');
      setWeekBudget(null);
      setFuelDoc(null);
      onRefresh();
    }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFuelAction = async (
    request: FuelRequest,
    status: 'approved' | 'rejected',
  ) => {
    if (!isAdmin) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject fuel requests.',
        variant: 'destructive',
      });
      return;
    }
    if (status === 'rejected') {
      setRejectingFuel(request);
      setFuelRejectReason('');
      return;
    }
    const now = new Date().toISOString();
    // Concurrency guard
    const { data: claimed, error } = await supabase
      .from('fuel_requests')
      .update({ status: 'approved' })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!claimed || claimed.length === 0) {
      toast({
        title: 'Request already actioned',
        description: 'Someone else may have just approved or rejected this. Refreshing…',
        variant: 'destructive',
      });
      await onRefresh();
      return;
    }
    // Mirror approval onto the paired expense row
    const { data: existingExp } = await supabase
      .from('expenses')
      .select('id, status')
      .eq('fuel_request_id', request.id)
      .maybeSingle();
    let expErr: { message: string } | null = null;
    let expenseIdForApproval: string | undefined = (existingExp as any)?.id;
    if (!expenseIdForApproval) {
      const { data: inserted, error } = await supabase.from('expenses').insert({
        fuel_request_id: request.id,
        category: 'fuel',
        budget_category: 'fuel',
        amount_ngn: request.amount_ngn,
        date: now.slice(0, 10),
        description: `Fuel — ${request.station_name || 'Station'} — ${request.reason || 'Fuel request'}`,
        submitted_by: (request as any).driver_id || request.employee_id,
        status: 'pending',
        ...(request.bank_name ? {
          bank_name: request.bank_name,
          account_number: request.account_number,
          account_name: request.account_name,
        } : {}),
      }).select('id').single();
      expErr = error;
      expenseIdForApproval = (inserted as any)?.id;
    }
    let expenseResult: { status: string } | null = null;
    if (expenseIdForApproval && (existingExp as any)?.status !== 'approved') {
      try { expenseResult = await approveExpense(expenseIdForApproval); }
      catch (err: any) { expErr = { message: err?.message || 'approve_expense failed' }; }
    }
    // If expense needs second approval, revert fuel request
    if (expenseResult && expenseResult.status !== 'approved') {
      const { error: revertErr } = await supabase
        .from('fuel_requests')
        .update({ status: 'pending' })
        .eq('id', request.id);
      if (revertErr) {
        toast({ title: 'Fuel request revert failed', description: revertErr.message, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Awaiting second approval',
        description: 'This expense requires a second approver before the fuel request can be fully approved.',
      });
      await onRefresh();
      return;
    }
    if (expErr) {
      const { error: rollbackErr } = await supabase
        .from('fuel_requests')
        .update({ status: 'pending' })
        .eq('id', request.id);
      toast({
        title: rollbackErr ? 'Approval failed and rollback failed' : 'Approval rolled back — expense entry failed',
        description: rollbackErr ? `${expErr.message}; rollback error: ${rollbackErr.message}` : expErr.message,
        variant: 'destructive',
      });
      await onRefresh();
      return;
    }
    burst({ palette: 'success', count: 50 });
    await logAudit(
      'fuel_request_approved',
      `Fuel request for ${request.employee_name} approved (${formatNaira(request.amount_ngn || 0)})`,
      profile,
    );
    if ((request as any).driver_id || request.employee_id) {
      await notifyUser({
        userId: (request as any).driver_id || request.employee_id,
        type: 'fuel_request_approved',
        module: 'fleet',
        title: 'Your fuel request was approved',
        body: `${formatNaira(request.amount_ngn || 0)} at ${request.station_name}`,
      });
    }

    // Phase 2 — fuel-reimbursement batch
    if (request.bank_name && request.account_number && request.account_name) {
      try {
        const { data: batch } = await supabase.from('payment_batches').insert({
          name: `Fuel Reimbursement — ${request.account_name}`,
          payment_date: now.slice(0, 10),
          total_amount: request.amount_ngn,
          beneficiary_count: 1,
          status: 'pending_approval',
          is_quick_pay: true,
          payment_category: 'fuel_reimbursement',
          batch_type: 'contractor',
          created_by: (request as any).driver_id || request.employee_id || profile?.id,
        }).select('id').single();
        if (batch) {
          await supabase.from('batch_items').insert({
            batch_id: batch.id,
            full_name: request.account_name,
            bank_name: request.bank_name,
            account_number: request.account_number,
            amount_ngn: request.amount_ngn,
            item_type: 'adhoc',
            status: 'pending',
          });
          const { error: batchLinkErr } = await supabase.from('fuel_requests').update({ batch_id: batch.id }).eq('id', request.id);
          if (batchLinkErr) {
            toast({ title: 'Batch link failed', description: batchLinkErr.message, variant: 'destructive' });
          }
          await notifyRoles({
            roles: ['super_admin', 'admin', 'finance'],
            type: 'batch_submitted',
            module: 'payments',
            priority: 'normal',
            title: 'Fuel reimbursement awaiting approval',
            body: `${formatNaira(request.amount_ngn || 0)} → ${request.account_name}`,
          });
          toast({
            title: 'Approved — payment queued',
            description: 'A fuel-reimbursement batch was created and is awaiting approver dispatch.',
          });
        }
      } catch (autoPayErr) {
        console.warn('[Fleet] auto-pay batch creation failed:', autoPayErr);
        toast({ title: 'Approved. Could not queue auto-payment — handle from Expenses.' });
      }
    } else {
      toast({ title: 'Fuel request approved' });
    }
    // Fire smart-alerts for budget thresholds
    if ((request as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (request as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    onRefresh();
  };

  const handleBudgetException = async (r: FuelRequest) => {
    if (profile?.role !== 'super_admin' && profile?.role !== 'admin') {
      toast({ title: 'Only super_admin or admin may approve budget exceptions', variant: 'destructive' });
      return;
    }
    const now = new Date().toISOString();
    const note = `Approved as budget exception by ${profile.full_name || 'Admin'} on ${new Date().toLocaleDateString('en-GB')}.`;
    const { error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'approved',
        budget_exception: true,
        budget_exception_by: profile.id,
        budget_exception_at: now,
        admin_note: r.admin_note ? `${r.admin_note}\n${note}` : note,
      })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    // Update linked expense
    const { data: expExisting } = await supabase
      .from('expenses')
      .select('id')
      .eq('fuel_request_id', r.id)
      .maybeSingle();
    let exceptionExpenseId: string | undefined = (expExisting as any)?.id;
    if (exceptionExpenseId) {
      const { error: expUpdErr } = await supabase.from('expenses').update({
        description: `Fuel — ${r.station_name || 'Station'} — ${r.reason || 'Fuel request'} [Budget Exception]`,
      }).eq('id', exceptionExpenseId);
      if (expUpdErr) {
        toast({ title: 'Expense sync failed', description: expUpdErr.message, variant: 'destructive' });
      }
    } else {
      const { data: inserted } = await supabase.from('expenses').insert({
        fuel_request_id: r.id,
        category: 'fuel',
        budget_category: 'fuel',
        amount_ngn: r.amount_ngn,
        date: now.slice(0, 10),
        description: `Fuel — ${r.station_name || 'Station'} — ${r.reason || 'Fuel request'} [Budget Exception]`,
        submitted_by: (r as any).driver_id || r.employee_id,
        status: 'pending',
        ...(r.bank_name ? {
          bank_name: r.bank_name,
          account_number: r.account_number,
          account_name: r.account_name,
        } : {}),
      }).select('id').single();
      exceptionExpenseId = (inserted as any)?.id;
    }
    if (exceptionExpenseId) {
      try { await approveExpense(exceptionExpenseId); }
      catch (err: any) { console.warn('[Fleet] budget-exception approve_expense failed:', err?.message); }
    }
    await logAudit(
      'fuel_budget_exception_approved',
      `Budget exception approved for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)}) by ${profile.full_name}`,
      profile,
    );
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_request_approved',
        module: 'fleet',
        title: 'Your fuel request was approved as a budget exception',
        body: `${formatNaira(r.amount_ngn || 0)} at ${r.station_name}`,
      });
    }
    toast({ title: 'Budget exception approved' });
    if ((r as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (r as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    onRefresh();
  };

  const handleMarkPaymentSent = async (r: FuelRequest) => {
    if (!isAdmin) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    const { data: claimed, error } = await supabase
      .from('fuel_requests')
      .update({ status: 'payment_sent', payment_sent_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('status', 'approved')
      .select('id');
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!claimed || claimed.length === 0) {
      toast({ title: 'Request is no longer in approved state', variant: 'destructive' });
      await onRefresh();
      return;
    }
    await logAudit(
      'fuel_payment_sent',
      `Payment marked as sent for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)})`,
      profile,
    );
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_payment_sent',
        module: 'fleet',
        title: 'Fuel payment sent',
        body: `${formatNaira(r.amount_ngn || 0)} has been sent. Please upload your receipt.`,
      });
    }
    toast({ title: 'Payment marked as sent. Employee will be prompted to upload receipt.' });
    onRefresh();
  };


  const submitFuelReceipt = async () => {
    if (!uploadingReceiptFor || !receiptFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingReceipt(true);
    try {
      const originalSha256 = await hashFile(receiptFile);
      const hasExif = await hasJpegExif(receiptFile);
      const watermarked = await watermarkImage(receiptFile, { driverName: profile?.full_name || 'Employee' });
      const receiptSha256 = await hashFile(watermarked);
      const compressed = await compressImage(watermarked);
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `fuel-receipts/${uploadingReceiptFor.id}-${safeName}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(upData.path);

      // Anomaly cross-checks
      const litresNum = parseFloat(receiptForm.litres_filled) || 0;
      const amountNum = parseFloat(receiptForm.amount_ngn) || 0;
      const priceCheck = fuelPriceBenchmark
        ? checkPumpPrice(amountNum, litresNum, fuelPriceBenchmark)
        : { flagged: false, reason: null };
      const divergenceCheck = checkReceiptRequestDivergence(amountNum, uploadingReceiptFor.amount_ngn || 0);

      const { data: dupRows } = await supabase
        .from('fuel_requests')
        .select('id')
        .eq('receipt_original_sha256', originalSha256)
        .neq('id', uploadingReceiptFor.id)
        .limit(1);
      const isDuplicateReceipt = !!(dupRows && dupRows.length > 0);

      const flags: { type: string; reason: string }[] = [];
      if (isDuplicateReceipt) flags.push({ type: 'duplicate_receipt', reason: 'This receipt image matches one already uploaded on another fuel request' });
      if (priceCheck.flagged && priceCheck.reason) flags.push({ type: 'price_divergence', reason: priceCheck.reason });
      if (divergenceCheck.flagged && divergenceCheck.reason) flags.push({ type: 'amount_mismatch', reason: divergenceCheck.reason });
      if (receiptScanWarning) flags.push({ type: 'ocr_low_confidence', reason: 'Automatic scan could not read an amount or litres off this receipt' });
      if (receiptForm.receipt_date) {
        const staleReason = checkStaleReceipt(receiptForm.receipt_date, new Date().toISOString().slice(0, 10));
        if (staleReason) flags.push({ type: 'stale_receipt', reason: staleReason });
      }

      // Math cross-validation
      if (fuelPriceBenchmark && litresNum > 0 && amountNum > 0) {
        const mathCheck = checkMathMismatch(amountNum, litresNum, fuelPriceBenchmark);
        if (mathCheck.flagged && mathCheck.reason) {
          flags.push({ type: 'math_mismatch', reason: mathCheck.reason });
        }
      }

      // Tank capacity overflow
      const receiptVehicleForCheck = (uploadingReceiptFor as any).vehicle_id as string | null;
      if (receiptVehicleForCheck && litresNum > 0) {
        const veh = vehicles.find((v) => v.id === receiptVehicleForCheck);
        if (veh) {
          const tankCheck = checkTankOverflow(litresNum, veh.tank_capacity_litres || null, veh.current_fuel_litres || null);
          if (tankCheck.flagged && tankCheck.reason) {
            flags.push({ type: 'tank_overflow', reason: tankCheck.reason });
          }
        }
      }

      // Fuel request frequency
      const driverId = uploadingReceiptFor.driver_id || (uploadingReceiptFor as any).user_id;
      if (driverId) {
        const { data: recentReqs } = await supabase
          .from('fuel_requests')
          .select('created_at')
          .eq('driver_id', driverId)
          .neq('id', uploadingReceiptFor.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(20);
        if (recentReqs && recentReqs.length > 0) {
          const freqCheck = checkFuelRequestFrequency(
            recentReqs.map((r: any) => r.created_at),
            new Date(),
          );
          if (freqCheck.flagged && freqCheck.reason) {
            flags.push({ type: 'fuel_frequency', reason: freqCheck.reason });
          }
        }
      }

      // OCR vs manually-entered amount mismatch
      if (ocrReadValues.amount && amountNum) {
        const ocrCheck = checkOcrManualMismatch(ocrReadValues.amount, amountNum);
        if (ocrCheck.flagged && ocrCheck.reason) {
          flags.push({ type: 'ocr_manual_mismatch', reason: ocrCheck.reason });
        }
      }

      // Route efficiency
      if (receiptVehicleForCheck && litresNum > 0) {
        const veh = vehicles.find((v) => v.id === receiptVehicleForCheck);
        if (veh && veh.last_refuel_at) {
          const { data: kmData } = await supabase
            .from('trip_logs')
            .select('km_driven')
            .eq('vehicle_id', receiptVehicleForCheck)
            .gte('created_at', veh.last_refuel_at)
            .not('km_driven', 'is', null);
          const kmSinceRefuel = (kmData || []).reduce((sum: number, r: any) => sum + (r.km_driven || 0), 0);
          const rate = veh.fuel_consumption_rate_lkm > 0
            ? veh.fuel_consumption_rate_lkm
            : (veh.avg_km_per_litre > 0 ? 1 / veh.avg_km_per_litre : 0);
          if (kmSinceRefuel > 0 && rate > 0) {
            const routeCheck = checkRouteEfficiency(litresNum, kmSinceRefuel, rate);
            if (routeCheck.flagged && routeCheck.reason) {
              flags.push({ type: 'route_efficiency', reason: routeCheck.reason });
            }
          }
        }
      }

      // Odometer regression
      if (receiptVehicleForCheck) {
        const { data: recentOdos } = await supabase
          .from('trip_logs')
          .select('odometer_start, odometer_end')
          .eq('vehicle_id', receiptVehicleForCheck)
          .not('odometer_end', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2);
        if (recentOdos && recentOdos.length >= 2) {
          const latest = recentOdos[0].odometer_end;
          const previous = recentOdos[1].odometer_end;
          if (latest != null && previous != null) {
            const odoReason = checkOdometerRegression(latest, previous);
            if (odoReason) {
              flags.push({ type: 'odometer_regression', reason: odoReason });
            }
          }
        }
      }

      // Severity scoring
      const severity = scoreAnomalySeverity(flags.map((f) => f.type));

      const noteParts = [
        receiptForm.notes.trim(),
        ...flags.map((f) => `⚠ ${f.reason}`),
        ...(flags.length > 0 && hasExif === false ? ['ℹ No camera metadata found on this photo'] : []),
      ].filter(Boolean);
      const existingAnomalyType = uploadingReceiptFor.anomaly_type;
      const newAnomalyTypes = Array.from(new Set([
        ...(existingAnomalyType ? existingAnomalyType.split(',') : []),
        ...flags.map((f) => f.type),
      ]));

      const { error } = await supabase
        .from('fuel_requests')
        .update({
          status: 'receipt_uploaded',
          receipt_url: urlData.publicUrl,
          receipt_sha256: receiptSha256,
          receipt_original_sha256: originalSha256,
          receipt_has_exif: hasExif,
          receipt_amount_ngn: amountNum || null,
          receipt_date: receiptForm.receipt_date || null,
          fuel_station_name: receiptForm.fuel_station_name.trim() || null,
          litres_filled: parseFloat(receiptForm.litres_filled) || null,
          admin_note: noteParts.join(' — ') || null,
          is_anomaly: uploadingReceiptFor.is_anomaly || flags.length > 0,
          anomaly_type: newAnomalyTypes.length > 0 ? newAnomalyTypes.join(',') : null,
        })
        .eq('id', uploadingReceiptFor.id);
      if (error) throw error;

      if (flags.length > 0) {
        const driverName = profile?.full_name || 'Employee';
        const stationName = uploadingReceiptFor.station_name || receiptForm.fuel_station_name || 'Unknown station';
        const flagSummary = flags.map((f) => f.reason).join('; ');

        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'fuel_receipt_anomaly',
          module: 'fleet',
          priority: severity === 'critical' || severity === 'high' ? 'high' : 'normal',
          title: `Fuel receipt flagged (${severity})`,
          body: `${driverName}'s receipt at ${stationName}: ${flagSummary}`,
        });

        if (severity === 'high' || severity === 'critical') {
          void notifyAnomalyToAdmins({
            title: `Fleet anomaly: ${severity} severity on fuel receipt`,
            summary: `${driverName}'s receipt at ${stationName} — ${flags.length} flag${flags.length > 1 ? 's' : ''}: ${flagSummary}`,
            severity,
            link: `${window.location.origin}/fleet`,
          });
        }

        if (severity === 'critical') {
          const { data: adminProfiles } = await supabase
            .from('profiles_directory')
            .select('id, full_name, email, phone')
            .in('role', ['super_admin', 'admin'])
            .eq('status', 'active');
          if (adminProfiles && adminProfiles.length > 0) {
            await Promise.allSettled(
              adminProfiles.map((admin: any) =>
                notifyChannels({
                  user: { id: admin.id, full_name: admin.full_name, email: admin.email, phone: admin.phone },
                  category: 'fleet',
                  kind: 'fleet_anomaly_critical',
                  payload: {
                    driver_name: driverName,
                    station: stationName,
                    severity,
                    flags: flags.map((f) => f.reason).slice(0, 3).join('; '),
                  },
                  forceChannels: { in_app: false, whatsapp: true, sms: true },
                  idempotencyKey: `fleet-anomaly-${uploadingReceiptFor.id}`,
                }),
              ),
            );
          }
        }
      }
      // Propagate receipt_url to the linked expense row
      const { error: expSyncErr } = await supabase
        .from('expenses')
        .update({ receipt_url: urlData.publicUrl, receipt_sha256: receiptSha256 })
        .eq('fuel_request_id', uploadingReceiptFor.id);
      if (expSyncErr) {
        toast({ title: 'Expense receipt sync failed', description: expSyncErr.message, variant: 'destructive' });
      }
      // Bump vehicle fuel level from actual litres filled
      const litresFilledNum = parseFloat(receiptForm.litres_filled) || 0;
      const receiptVehicleId = (uploadingReceiptFor as any).vehicle_id as string | null;
      if (receiptVehicleId && litresFilledNum > 0) {
        const { data: newLevel, error: rcptFuelErr } = await supabase.rpc('adjust_vehicle_fuel_level', {
          p_vehicle_id: receiptVehicleId,
          p_delta_litres: litresFilledNum,
          p_last_refuel_at: new Date().toISOString(),
        });
        if (rcptFuelErr) {
          toast({ title: 'Fuel level sync failed', description: rcptFuelErr.message, variant: 'destructive' });
        }
        await supabase.from('fuel_level_logs').insert({
          vehicle_id: receiptVehicleId,
          event_type: 'fuel_added',
          amount_litres: litresFilledNum,
          resulting_level_litres: newLevel,
          reference_id: uploadingReceiptFor.id,
        });
      }
      await logAudit(
        'fuel_receipt_uploaded',
        `Receipt uploaded for fuel request (${formatNaira(uploadingReceiptFor.amount_ngn || 0)})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'fuel_receipt_uploaded',
        module: 'fleet',
        title: 'Fuel receipt uploaded',
        body: `${profile?.full_name || 'Employee'} uploaded a receipt for ${formatNaira(uploadingReceiptFor.amount_ngn || 0)}`,
      });
      toast({ title: 'Receipt submitted. Admin will review.' });
      setUploadingReceiptFor(null);
      setReceiptFile(null);
      setReceiptScanWarning('');
      setReceiptForm({ fuel_station_name: '', amount_ngn: '', litres_filled: '', receipt_date: '', notes: '' });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error uploading receipt', description: err.message, variant: 'destructive' });
    }
    setSubmittingReceipt(false);
  };

  const handleMarkComplete = async (r: FuelRequest) => {
    if (!isAdmin) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    const { data: claimed, error } = await supabase
      .from('fuel_requests')
      .update({ status: 'completed', anomaly_reviewed_at: r.is_anomaly ? new Date().toISOString() : undefined })
      .eq('id', r.id)
      .in('status', ['receipt_uploaded', 'payment_sent'])
      .select('id');
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!claimed || claimed.length === 0) {
      toast({ title: 'Request is not ready to complete', variant: 'destructive' });
      await onRefresh();
      return;
    }
    await logAudit('fuel_request_completed', `Fuel request completed for ${r.employee_name} (${formatNaira(r.amount_ngn || 0)})`, profile);
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_request_completed',
        module: 'fleet',
        title: 'Fuel request completed',
        body: `Your fuel request for ${formatNaira(r.amount_ngn || 0)} has been marked complete.`,
      });
    }
    toast({ title: 'Marked as complete' });
    onRefresh();
  };

  const handleRequestReceiptResubmission = async (r: FuelRequest, note: string) => {
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'payment_sent', receipt_url: null, admin_note: note.trim() || null })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_receipt_resubmission_requested', `Receipt resubmission requested for ${r.employee_name}${note.trim() ? `: ${note.trim()}` : ''}`, profile);
    const employeeId = (r as any).driver_id || r.employee_id;
    if (employeeId) {
      await notifyUser({
        userId: employeeId,
        type: 'fuel_receipt_resubmission',
        module: 'fleet',
        title: 'Receipt resubmission required',
        body: note.trim()
          ? `Admin note: ${note.trim()}`
          : 'Admin has requested a new receipt for your fuel payment. Please re-upload.',
      });
    }
    toast({ title: 'Resubmission requested. Employee notified.' });
    setReRequestTarget(null);
    setReRequestNote('');
    onRefresh();
  };

  const confirmFuelReject = async () => {
    if (!rejectingFuel) return;
    if (!isValidRejectionReason(fuelRejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const r = rejectingFuel;
    const { data: claimed, error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'rejected',
        rejection_reason: fuelRejectReason.trim(),
        admin_note: fuelRejectReason.trim(),
      })
      .eq('id', r.id)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!claimed || claimed.length === 0) {
      toast({
        title: 'Request already actioned',
        description: 'Someone else may have already approved or rejected this. Refreshing…',
        variant: 'destructive',
      });
      await onRefresh();
      return;
    }
    // Mirror rejection onto linked expense
    const { data: pairedExp } = await supabase
      .from('expenses')
      .select('id, status')
      .eq('fuel_request_id', r.id)
      .maybeSingle();
    if (pairedExp?.id && (pairedExp as any).status !== 'rejected') {
      try { await rejectExpense((pairedExp as any).id, fuelRejectReason.trim()); }
      catch (err) { console.warn('[Fleet] reject_expense for paired expense failed:', err); }
    }
    await writeRejectionNotification({
      entity: 'fuel',
      entityLabel: 'fuel request',
      amount: r.amount_ngn,
      reason: fuelRejectReason.trim(),
      submitterId: (r as any).driver_id || r.employee_id || null,
      actor: profile,
      auditType: 'fuel_request_rejected',
      auditDescription: `Fuel request for ${r.employee_name} rejected (${formatNaira(r.amount_ngn || 0)}): ${fuelRejectReason.trim()}`,
    });
    toast({ title: 'Fuel request rejected' });
    setRejectingFuel(null);
    setFuelRejectReason('');
    onRefresh();
  };

  const unrejectFuel = async (r: FuelRequest) => {
    const { error } = await supabase
      .from('fuel_requests')
      .update({ status: 'pending', rejection_reason: null })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('fuel_request_unrejected', `Fuel request for ${r.employee_name} moved back to pending (${formatNaira(r.amount_ngn || 0)})`, profile);
    toast({ title: 'Fuel request moved back to Pending' });
    onRefresh();
  };

  const resubmitFuel = async (r: FuelRequest) => {
    const { error } = await supabase.from('fuel_requests').insert({
      driver_id: profile?.id,
      station_name: r.station_name,
      amount_ngn: r.amount_ngn,
      litres_est: r.litres_est,
      odometer: r.odometer,
      reason: r.reason,
      status: 'pending',
      resubmitted_from_id: r.id,
    } as any);
    if (error) {
      toast({ title: 'Resubmit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'resubmission_created',
      `Fuel request re-edited and resubmitted (${formatNaira(r.amount_ngn || 0)})`,
      profile,
    );
    toast({ title: 'Resubmitted for approval' });
    onRefresh();
  };

  const deleteFuelRequest = async (r: FuelRequest) => {
    const pathsToRemove: string[] = [];
    const extractStoragePath = (url: string | null | undefined, bucket: string): string | null => {
      if (!url) return null;
      const m = url.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+?)(?:\\?|$)`));
      return m ? decodeURIComponent(m[1]) : null;
    };
    const receiptPath = extractStoragePath((r as any).receipt_url, 'receipts');
    const docPath = extractStoragePath((r as any).request_doc_url, 'receipts');
    if (receiptPath) pathsToRemove.push(receiptPath);
    if (docPath) pathsToRemove.push(docPath);
    if (pathsToRemove.length > 0) {
      await supabase.storage.from('receipts').remove(pathsToRemove);
    }

    const { error } = await supabase
      .from('fuel_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }

    // Also soft-delete the paired expense row
    const { data: pairedExp } = await supabase
      .from('expenses')
      .select('id, status')
      .eq('fuel_request_id', r.id)
      .maybeSingle();
    if (pairedExp?.id) {
      const { error: expError } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', pairedExp.id);
      if (expError) {
        console.warn('[Fleet] soft-delete paired expense failed:', expError);
      }
    }

    await logAudit('fuel_request_deleted', `Fuel request for ${r.employee_name} deleted (${formatNaira(r.amount_ngn || 0)})`, profile);
    toast({ title: 'Fuel request deleted' });
    setConfirmDeleteFuel(null);
    onRefresh();
  };

  // ── Anomaly review handlers ────────────────────────────────────────────

  const revertAnomalyReview = async (type: 'trip' | 'fuel', id: string, label: string) => {
    const table = type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update({
      anomaly_reviewed_by: null,
      anomaly_reviewed_at: null,
      anomaly_review_note: null,
    }).eq('id', id);
    if (error) { toast({ title: 'Revert failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('anomaly_review_reverted', `Anomaly review reverted for ${type} "${label}"`, profile);
    toast({ title: 'Review reverted — item marked unreviewed again' });
    onRefresh();
  };

  const deleteAnomalyRecord = async (type: 'trip' | 'fuel', id: string, label: string) => {
    const table = type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('anomaly_record_deleted', `${type} "${label}" deleted from anomalies`, profile);
    toast({ title: 'Record deleted' });
    onRefresh();
  };

  // ── JSX ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-4">

      <div className="flex justify-end gap-2 flex-wrap">
        {isAdmin && visibleFuel.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCsv(
            visibleFuel.map((r) => ({
              date: r.created_at.slice(0, 10),
              employee: r.employee_name,
              station: r.station_name,
              amount_ngn: r.amount_ngn,
              litres_est: r.litres_est ?? '',
              litres_filled: r.litres_filled ?? '',
              odometer: r.odometer ?? '',
              status: r.status,
              is_anomaly: r.is_anomaly ? 'yes' : '',
              anomaly_type: r.anomaly_type ?? '',
            })),
            `fuel-requests-${new Date().toISOString().slice(0, 10)}.csv`,
          )}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowLogExternalForm(true)}>
          <Receipt className="mr-2 h-4 w-4" /> Log External Purchase
        </Button>
        <Button variant="outline" onClick={() => setShowRepairForm(true)}>
          <Wrench className="mr-2 h-4 w-4" /> Repair Request
        </Button>
        <Button onClick={() => setShowFuelForm(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Fuel Request
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base">
              {isAdmin ? 'All Fuel Requests' : 'My Fuel Requests'}
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'payment_sent', label: 'Paid' },
                { value: 'receipt_uploaded', label: 'Receipt' },
                { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ].map((f) => {
                const base = isAdmin ? fuelRequests : myFuelRequests;
                const count = f.value === 'all' ? base.length : base.filter((r) => r.status === f.value).length;
                if (f.value !== 'all' && count === 0) return null;
                return (
                  <Button
                    key={f.value}
                    variant={fuelStatusFilter === f.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setFuelStatusFilter(f.value)}
                  >
                    {f.label} <span className="ml-1 opacity-70">{count}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Station</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paystack Fee</TableHead>
                <TableHead className="text-right">Litres</TableHead>
                <TableHead>Vehicle Fuel</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFuel.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 10 : 9}
                    className="text-center text-muted-foreground text-sm py-8"
                  >
                    No fuel requests yet.
                  </TableCell>
                </TableRow>
              )}
              {visibleFuel.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell>
                    {r.fuel_station_name || r.station_name}
                    {r.fuel_station_name && r.fuel_station_name !== r.station_name && (
                      <p className="text-xs text-muted-foreground">requested: {r.station_name}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right currency">
                    {formatNaira(r.receipt_amount_ngn ?? r.amount_ngn ?? 0)}
                    {r.receipt_amount_ngn != null && r.receipt_amount_ngn !== r.amount_ngn && (
                      <p className="text-xs text-muted-foreground font-normal">requested: {formatNaira(r.amount_ngn || 0)}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {(() => {
                      const fee = getFuelFee(r);
                      if (fee > 0) return <span className="currency">{formatNaira(fee)}</span>;
                      if (r.status === 'pending' || r.status === 'rejected') return '—';
                      return <span title="Awaiting Paystack webhook">…</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.litres_filled ?? r.litres_est ?? '—'}
                    {r.litres_filled != null && r.litres_est != null && r.litres_filled !== r.litres_est && (
                      <p className="text-xs text-muted-foreground">est: {r.litres_est}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <FuelRequestFuelLevel vehicleId={(r as any).vehicle_id} vehicles={vehicles} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    <p className="truncate">{r.reason || '—'}</p>
                    {r.request_doc_url && (
                      <div className="mt-1">
                        <FilePreviewTrigger
                          url={r.request_doc_url}
                          label="View Document"
                          fileName={`fuel-request-${r.id.slice(0, 8)}`}
                          variant="link"
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        {r.status === 'budget_blocked'
                          ? <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 dark:bg-red-950/20 dark:text-red-400">Over Budget</Badge>
                          : <StatusBadge status={r.status} />}
                      </div>
                      {r.status === 'rejected' && r.rejection_reason && (
                        <p className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={r.rejection_reason}>
                          Reason: {r.rejection_reason}
                        </p>
                      )}
                    </div>
                    {r.is_anomaly && !r.anomaly_reviewed_at && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={cn(
                              'ml-1.5 gap-1 cursor-default',
                              r.anomaly_type?.includes('duplicate_receipt')
                                ? 'border-red-400 text-red-700 bg-red-50 dark:bg-red-950/20'
                                : 'border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20',
                            )}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {r.anomaly_type?.includes('duplicate_receipt') ? 'High Risk' : 'Review'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {r.admin_note || r.anomaly_type || 'Flagged for review'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.created_at)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {r.status === 'budget_blocked' ? (
                        <div className="flex justify-end gap-1 flex-wrap">
                          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                              onClick={() => handleBudgetException(r)}
                            >
                              <Check className="h-3 w-3 mr-1" /> Approve as Budget Exception
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteFuel(r)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : r.status === 'pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFuelAction(r, 'approved')}
                          >
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFuelAction(r, 'rejected')}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteFuel(r)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : r.status === 'approved' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => handleMarkPaymentSent(r)}
                        >
                          <CreditCard className="h-3 w-3 mr-1" /> Mark Payment Sent
                        </Button>
                      ) : r.status === 'receipt_uploaded' ? (
                        <div className="flex justify-end items-center gap-1">
                          <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => handleMarkComplete(r)}>
                            <Check className="h-3 w-3 mr-1" /> Complete
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.receipt_url && (
                                <DropdownMenuItem onClick={() => window.open(r.receipt_url!, '_blank')}>
                                  <FileText className="h-4 w-4 mr-2" /> View Receipt
                                </DropdownMenuItem>
                              )}
                              {r.receipt_url && (
                                <DropdownMenuItem onClick={() => setElaTarget({ id: r.id, url: r.receipt_url! })}>
                                  <Search className="h-4 w-4 mr-2" /> Tamper Analysis
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setReRequestTarget(r); setReRequestNote(''); }}>
                                <RotateCcw className="h-4 w-4 mr-2" /> Re-request
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : r.status === 'completed' && r.receipt_url ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.open(r.receipt_url!, '_blank')}>
                              <FileText className="h-4 w-4 mr-2" /> View Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setElaTarget({ id: r.id, url: r.receipt_url! })}>
                              <Search className="h-4 w-4 mr-2" /> Tamper Analysis
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : r.status === 'rejected' ? (
                        <div className="flex justify-end gap-1">
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => unrejectFuel(r)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Unreject
                            </Button>
                          )}
                          {r.employee_id === profile?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resubmitFuel(r)}
                            >
                              Re-edit & Resubmit
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {/* Mobile fuel requests */}
          <div className="md:hidden p-3 space-y-2">
            {visibleFuel.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No fuel requests yet.</p>
            ) : visibleFuel.map((r) => {
              const accent =
                r.status === 'pending' ? 'bg-amber-500'
                : r.status === 'approved' ? 'bg-emerald-500'
                : r.status === 'rejected' ? 'bg-red-500'
                : r.status === 'budget_blocked' ? 'bg-red-500'
                : r.status === 'receipt_uploaded' ? 'bg-blue-500'
                : 'bg-muted-foreground';
              return (
                <MobileCard key={r.id} accentClassName={accent}>
                  <MobileCardHeader>
                    <div className="min-w-0 flex-1">
                      <MobileCardTitle>{r.employee_name}</MobileCardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {r.station_name}
                      </p>
                    </div>
                    <MobileCardMeta className="currency text-base">
                      {formatNaira(r.amount_ngn || 0)}
                    </MobileCardMeta>
                  </MobileCardHeader>

                  <div className="flex items-center gap-3 text-xs">
                    {r.status === 'budget_blocked'
                      ? <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Over Budget</Badge>
                      : <StatusBadge status={r.status} />}
                    <span className="text-muted-foreground tabular-nums ml-auto">
                      {r.litres_est ? `${r.litres_est} L` : ''}
                    </span>
                    <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>

                  {r.status === 'rejected' && r.rejection_reason && (
                    <p className="text-xs text-red-600 dark:text-red-400">Rejected: {r.rejection_reason}</p>
                  )}

                  {r.reason && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                  )}

                  {r.request_doc_url && (
                    <FilePreviewTrigger
                      url={r.request_doc_url}
                      label="View Document"
                      fileName={`fuel-request-${r.id.slice(0, 8)}`}
                      variant="link"
                    />
                  )}

                  {isAdmin && r.status === 'pending' && (
                    <MobileCardFooter>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                        onClick={() => handleFuelAction(r, 'rejected')}
                      >
                        <X className="h-4 w-4 mr-1.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                        onClick={() => handleFuelAction(r, 'approved')}
                      >
                        <Check className="h-4 w-4 mr-1.5" /> Approve
                      </Button>
                    </MobileCardFooter>
                  )}
                  {isAdmin && r.status === 'budget_blocked' && (profile?.role === 'super_admin' || profile?.role === 'admin') && (
                    <MobileCardFooter>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => handleBudgetException(r)}
                      >
                        <Check className="h-4 w-4 mr-1.5" /> Approve as Exception
                      </Button>
                    </MobileCardFooter>
                  )}
                  {isAdmin && r.status === 'approved' && (
                    <MobileCardFooter>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9"
                        onClick={() => handleMarkPaymentSent(r)}
                      >
                        <CreditCard className="h-4 w-4 mr-1.5" /> Mark Payment Sent
                      </Button>
                    </MobileCardFooter>
                  )}
                  {isAdmin && r.status === 'receipt_uploaded' && (
                    <MobileCardFooter>
                      {r.receipt_url && (
                        <FilePreviewTrigger
                          url={r.receipt_url}
                          label="View Receipt"
                          fileName={`fuel-receipt-${r.id.slice(0, 8)}`}
                          className="flex-1 h-9"
                        />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => handleMarkComplete(r)}
                      >
                        <Check className="h-4 w-4 mr-1.5" /> Complete
                      </Button>
                    </MobileCardFooter>
                  )}
                  {r.status === 'completed' && r.receipt_url && (
                    <MobileCardFooter>
                      <FilePreviewTrigger
                        url={r.receipt_url}
                        label="View Receipt"
                        fileName={`fuel-receipt-${r.id.slice(0, 8)}`}
                        className="flex-1 h-9"
                      />
                    </MobileCardFooter>
                  )}
                  {r.status === 'rejected' && (isAdmin || r.employee_id === profile?.id) && (
                    <MobileCardFooter>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9"
                          onClick={() => unrejectFuel(r)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Unreject
                        </Button>
                      )}
                      {r.employee_id === profile?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9"
                          onClick={() => resubmitFuel(r)}
                        >
                          Re-edit & Resubmit
                        </Button>
                      )}
                    </MobileCardFooter>
                  )}
                </MobileCard>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>

    {/* ── Dialogs ──────────────────────────────────────────────────────── */}

    {/* FUEL FORM DIALOG */}
    {(() => {
      const requested = parseFloat(fuelForm.amount_ngn) || 0;
      const isOverBudget = !!(weekBudget && weekBudget.total > 0 && requested > weekBudget.remaining);
      return (
        <Dialog open={showFuelForm} onOpenChange={(v) => { setShowFuelForm(v); if (!v) { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); setFuelVehicleId(''); setWeekBudget(null); setFuelDoc(null); setFuelIsReimbursement(true); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">

            {/* Pinned header */}
            <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                  <Fuel className="h-4 w-4 text-orange-600" />
                </div>
                New Fuel Request
              </DialogTitle>
              <DialogDescription>Submit a fuel reimbursement request for approval.</DialogDescription>
            </DialogHeader>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">

              {/* Driver & Vehicle */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Driver & Vehicle</p>
                <div className="space-y-1">
                  <Label>Employee</Label>
                  <Select value={fuelForm.employee_id} onValueChange={(v) => setFuelForm({ ...fuelForm, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                      ))}
                      {profile && !staff.find((s) => s.id === profile.id) && (
                        <SelectItem value={profile.id}>{profile.full_name || profile.email} (me)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {vehicles.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Vehicle <span className="text-destructive">*</span></Label>
                    <Select value={fuelVehicleId || undefined} onValueChange={(v) => { setFuelVehicleId(v); fetchWeekBudget(v); }}>
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} — {(v as any).plate_number}
                            {(() => {
                              const today = new Date().toISOString().slice(0, 10);
                              return (v as any).out_of_service_until >= today ? ' (Out of service)' : '';
                            })()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const fv = vehicles.find((v) => v.id === fuelVehicleId);
                      const today = new Date().toISOString().slice(0, 10);
                      if (fv?.out_of_service_until && fv.out_of_service_until >= today) {
                        return (
                          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            <Ban className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Out of service until {formatDate(fv.out_of_service_until)}. Fuel requests are blocked.</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {weekBudget && weekBudget.total > 0 && (
                      <WeeklyBudgetBar spent={weekBudget.spent} total={weekBudget.total} carryForward={weekBudget.carryForward} remaining={weekBudget.remaining} />
                    )}
                  </div>
                )}
              </div>

              {/* Fuel Details */}
              <div className="space-y-3 pt-4 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Fuel Details</p>
                <div className="space-y-1">
                  <Label>Fuel Station</Label>
                  <Input value={fuelForm.station_name} onChange={(e) => setFuelForm({ ...fuelForm, station_name: e.target.value })} placeholder="e.g. NNPC, Total, MRS" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount Requested (₦)</Label>
                    <Input type="number" value={fuelForm.amount_ngn} onChange={(e) => setFuelForm({ ...fuelForm, amount_ngn: e.target.value })} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label>Litres (estimated)</Label>
                    <Input type="number" value={fuelForm.litres_est} onChange={(e) => setFuelForm({ ...fuelForm, litres_est: e.target.value })} placeholder="0" />
                  </div>
                </div>

                {/* Live amount display */}
                {requested > 0 && (
                  <div className={`rounded-xl border px-4 py-3 text-center transition-all duration-300 ${isOverBudget ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-2xl font-bold tracking-tight currency ${isOverBudget ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatNaira(requested)}
                    </p>
                    {weekBudget && weekBudget.total > 0 && (
                      <p className={`text-xs mt-0.5 currency ${isOverBudget ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isOverBudget
                          ? `${formatNaira(requested - weekBudget.remaining)} over budget`
                          : `${formatNaira(weekBudget.remaining - requested)} remaining after this`}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Current Odometer Reading <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input type="number" value={fuelForm.odometer} onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })} placeholder="km" />
                </div>
              </div>

              {/* Purpose & Documents */}
              <div className="space-y-3 pt-4 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Purpose & Documents</p>
                <div className="space-y-1">
                  <Label>Purpose / Reason</Label>
                  <Textarea value={fuelForm.reason} onChange={(e) => setFuelForm({ ...fuelForm, reason: e.target.value })} placeholder="Brief description of trip purpose…" className="resize-none" rows={2} />
                </div>
                <div className="space-y-1">
                  <Label>Supporting Document <span className="text-muted-foreground font-normal text-xs">(Optional)</span></Label>
                  <label className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${fuelDoc ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/40'}`}>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!validateFile(f, toast)) {
                        e.target.value = '';
                        return;
                      }
                      setFuelDoc(f);
                    }} />
                    {fuelDoc ? (
                      <>
                        <FileText className="h-5 w-5 text-primary" />
                        <p className="text-xs font-medium text-foreground">{fuelDoc.name}</p>
                        <p className="text-xs text-muted-foreground">{(fuelDoc.size / 1024).toFixed(1)} KB — click to change</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground text-center">Click to attach receipt, quote, or supporting evidence</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Payment type */}
              <div className="pt-4 border-t space-y-2">
                <Label>Payment type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={cn('flex flex-col items-start rounded-lg border p-3 text-sm kd-transition', fuelIsReimbursement ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground')}
                    onClick={() => { setFuelIsReimbursement(true); }}
                  >
                    <span className="font-medium">Reimbursement</span>
                    <span className="text-xs mt-0.5 opacity-80">I paid from my own pocket</span>
                  </button>
                  <button
                    type="button"
                    className={cn('flex flex-col items-start rounded-lg border p-3 text-sm kd-transition', !fuelIsReimbursement ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground')}
                    onClick={() => setFuelIsReimbursement(false)}
                  >
                    <span className="font-medium">Company charge</span>
                    <span className="text-xs mt-0.5 opacity-80">Direct payment from company</span>
                  </button>
                </div>
              </div>

              {/* Bank (optional) */}
              <div className="pt-2 border-t">
                {!showFuelBankSection ? (
                  <button type="button" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors" onClick={() => setShowFuelBankSection(true)}>
                    <CreditCard className="h-3.5 w-3.5" />
                    Add bank account (optional)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Bank account <span className="text-muted-foreground font-normal">(optional)</span></span>
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive transition-colors" onClick={() => { setShowFuelBankSection(false); setFuelBankDetails(EMPTY_FUEL_BANK); }}>Remove</button>
                    </div>
                    <BankAccountField value={fuelBankDetails} onChange={setFuelBankDetails} provider={activeProvider} />
                  </div>
                )}
              </div>
            </div>

            {/* Pinned footer */}
            <div className="shrink-0 px-6 pb-6 pt-4 border-t bg-background space-y-3">
              {isOverBudget && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p><strong>{formatNaira(requested)}</strong> exceeds your remaining weekly budget of <strong>{formatNaira(weekBudget!.remaining)}</strong>. Submit as a budget exception or contact your manager.</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowFuelForm(false)}>Cancel</Button>
                {isOverBudget ? (
                  <Button variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => submitFuelRequest(true)} disabled={submitting || !fuelForm.employee_id || !fuelForm.station_name || !fuelForm.amount_ngn || !fuelVehicleId}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Request Budget Exception
                  </Button>
                ) : (
                  <Button onClick={() => submitFuelRequest()} disabled={submitting || !fuelForm.employee_id || !fuelForm.station_name || !fuelForm.amount_ngn || !fuelVehicleId}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Request
                  </Button>
                )}
              </div>
            </div>

          </DialogContent>
        </Dialog>
      );
    })()}

    {/* RE-REQUEST RECEIPT DIALOG */}
    <Dialog
      open={!!reRequestTarget}
      onOpenChange={(v) => { if (!v) { setReRequestTarget(null); setReRequestNote(''); } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-request receipt</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The uploaded receipt will be cleared and the employee will be prompted to
          re-upload. Add a note so they know what to fix (optional but recommended).
        </p>
        <Textarea
          value={reRequestNote}
          onChange={(e) => setReRequestNote(e.target.value)}
          placeholder="e.g. Receipt is blurry — please upload a clearer photo."
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setReRequestTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => reRequestTarget && handleRequestReceiptResubmission(reRequestTarget, reRequestNote)}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Re-request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* FUEL REJECT DIALOG */}
    <Dialog
      open={!!rejectingFuel}
      onOpenChange={(v) => {
        if (!v) {
          setRejectingFuel(null);
          setFuelRejectReason('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject fuel request</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Reason is required. The employee is notified with this note.
        </p>
        <Textarea
          value={fuelRejectReason}
          onChange={(e) => setFuelRejectReason(e.target.value)}
          placeholder="e.g. Exceeds weekly fuel budget — split across two weeks."
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectingFuel(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmFuelReject}
            disabled={!isValidRejectionReason(fuelRejectReason)}
          >
            Reject with reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* CONFIRM DELETE FUEL DIALOG */}
    <Dialog open={!!confirmDeleteFuel} onOpenChange={(v) => { if (!v) setConfirmDeleteFuel(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete fuel request</DialogTitle>
          <DialogDescription>
            Delete this fuel request from {confirmDeleteFuel?.employee_name}? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDeleteFuel(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => confirmDeleteFuel && deleteFuelRequest(confirmDeleteFuel)}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* LOG EXTERNAL PURCHASE DIALOG */}
    <LogExternalPurchaseDialog
      open={showLogExternalForm}
      onClose={() => setShowLogExternalForm(false)}
      staff={staff}
      vehicles={vehicles}
      profile={profile}
      onSuccess={onRefresh}
    />

    {/* FUEL RECEIPT UPLOAD DIALOG */}
    <Dialog
      open={!!uploadingReceiptFor}
      onOpenChange={(v) => {
        if (!v) { setUploadingReceiptFor(null); setReceiptFile(null); setReceiptScanWarning(''); setReceiptForm({ fuel_station_name: '', amount_ngn: '', litres_filled: '', receipt_date: '', notes: '' }); }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Fuel Receipt</DialogTitle>
          <DialogDescription>
            Confirm the station details and attach a photo or PDF of your receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
            <p className="text-muted-foreground text-xs">Fuel request</p>
            <p className="font-medium">{uploadingReceiptFor?.station_name} — {formatNaira(uploadingReceiptFor?.amount_ngn || 0)}</p>
          </div>

          <div className="space-y-1">
            <Label>Receipt <span className="text-destructive">*</span></Label>
            <OcrReceiptScanner
              extractLitres
              onExtracted={(result: OcrResult, file: File) => {
                setReceiptFile(file);
                let warning = '';
                if (result.lowConfidence) {
                  const conf = result.confidence?.overall;
                  warning = conf != null && conf > 0
                    ? `Scan confidence is low (${Math.round(conf * 100)}%) — verify the fields below.`
                    : "Scan couldn't read amount or litres — fill them in manually below.";
                } else if (result.receiptType && result.receiptType !== 'fuel' && result.receiptType !== 'general') {
                  warning = `This looks like a ${result.receiptType} receipt, not a fuel receipt — double-check you're uploading the right one.`;
                }
                setReceiptScanWarning(warning);
                setOcrReadValues({
                  amount: result.amount_ngn ? parseFloat(result.amount_ngn) || null : null,
                  litres: result.litres ? parseFloat(result.litres) || null : null,
                });
                setReceiptForm((f) => ({
                  ...f,
                  fuel_station_name: result.description || f.fuel_station_name,
                  amount_ngn: result.amount_ngn || f.amount_ngn,
                  litres_filled: result.litres || f.litres_filled,
                  receipt_date: result.date || f.receipt_date,
                }));
              }}
            />
            {receiptFile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground truncate">{receiptFile.name}</span>
                <span className="shrink-0">— {(receiptFile.size / 1024).toFixed(1)} KB</span>
                <button type="button" className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" onClick={() => { setReceiptFile(null); setReceiptScanWarning(''); }}>
                  Change
                </button>
              </div>
            )}
            {receiptScanWarning && (
              <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{receiptScanWarning}</span>
              </div>
            )}
            {(!receiptFile || receiptScanWarning) && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                  <span className="flex-1 border-t" /><span>or attach manually</span><span className="flex-1 border-t" />
                </div>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!validateFile(f, toast)) {
                      (e.target as HTMLInputElement).value = '';
                      return;
                    }
                    setReceiptFile(f);
                    setReceiptScanWarning('');
                  }}
                />
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>Station Name <span className="text-muted-foreground font-normal text-xs">(confirm or correct)</span></Label>
            <Input
              value={receiptForm.fuel_station_name}
              onChange={(e) => setReceiptForm({ ...receiptForm, fuel_station_name: e.target.value })}
              placeholder="e.g. Total Energies, Lekki"
            />
          </div>
          <div className="space-y-1">
            <Label>Amount Paid <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal text-xs">(confirm or correct)</span></Label>
            <Input
              type="number"
              value={receiptForm.amount_ngn}
              onChange={(e) => {
                const v = e.target.value;
                setReceiptForm({ ...receiptForm, amount_ngn: v });
                if (v && receiptForm.litres_filled) setReceiptScanWarning('');
              }}
              placeholder="e.g. 50000"
            />
            {isAdmin && (() => {
              const amountNum = parseFloat(receiptForm.amount_ngn);
              if (!amountNum) return null;
              const check = checkReceiptRequestDivergence(amountNum, uploadingReceiptFor?.amount_ngn || 0);
              if (!check.flagged) return null;
              return (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {check.reason}
                </p>
              );
            })()}
          </div>
          <div className="space-y-1">
            <Label>Litres Filled <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              value={receiptForm.litres_filled}
              onChange={(e) => {
                const v = e.target.value;
                setReceiptForm({ ...receiptForm, litres_filled: v });
                if (v && receiptForm.amount_ngn) setReceiptScanWarning('');
              }}
              placeholder="e.g. 25.5"
            />
            {(() => {
              if (!fuelPriceBenchmark) return null;
              const litresNum = parseFloat(receiptForm.litres_filled);
              const amountNum = parseFloat(receiptForm.amount_ngn);
              if (!litresNum || !amountNum) return null;
              const check = checkPumpPrice(amountNum, litresNum, fuelPriceBenchmark);
              if (!check.flagged) return null;
              return (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {check.reason}
                </p>
              );
            })()}
          </div>
          <div className="space-y-1">
            <Label>Receipt Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={receiptForm.receipt_date}
              onChange={(e) => setReceiptForm({ ...receiptForm, receipt_date: e.target.value })}
              max={new Date().toISOString().slice(0, 10)}
            />
            {(() => {
              if (!receiptForm.receipt_date) return null;
              const staleReason = checkStaleReceipt(receiptForm.receipt_date, new Date().toISOString().slice(0, 10));
              if (!staleReason) return null;
              return (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {staleReason}
                </p>
              );
            })()}
          </div>
          <div className="space-y-1">
            <Label>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Textarea
              value={receiptForm.notes}
              onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
              placeholder="Any additional notes for admin…"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUploadingReceiptFor(null)}>Cancel</Button>
          <Button
            onClick={submitFuelReceipt}
            disabled={submittingReceipt || !receiptFile || !receiptForm.amount_ngn || !receiptForm.litres_filled || !receiptForm.receipt_date}
          >
            {submittingReceipt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Upload className="mr-2 h-4 w-4" /> Submit Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ElaTamperAnalysisDialog target={elaTarget} onClose={() => setElaTarget(null)} />

    {/* REPAIR REQUEST DIALOG */}
    <Dialog open={showRepairForm} onOpenChange={(v) => {
      setShowRepairForm(v);
      if (!v) {
        setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '', vehicle_id: '', service_type: '', odometer: '', vendor_name: '', repair_date: new Date().toISOString().slice(0, 10), priority: 'routine', parts_replaced: '', labour_hours: '' });
        setRepairBank(EMPTY_REPAIR_BANK);
        setRepairReceipt(null);
        setRepairReceiptOcrAmount('');
        setRepairIsReimbursement(true);
        setRepairMatchingItems([]);
        setRepairMaintenanceItemId('');
      }
    }}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] flex flex-col gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold kd-display leading-none">Vehicle Repair / Maintenance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Submit a repair or maintenance cost for reimbursement or direct payment.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {/* Who */}
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who</Label>
              <Select value={repairForm.employee_id} onValueChange={(v) => setRepairForm({ ...repairForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>{profile.full_name || profile.email} (me)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment type</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: true, title: 'Reimbursement', sub: 'I paid from my own pocket', icon: <CreditCard className="h-4 w-4" /> },
                { val: false, title: 'Company charge', sub: 'Direct payment from company', icon: <Banknote className="h-4 w-4" /> },
              ].map(({ val, title, sub, icon }) => (
                <button key={String(val)} type="button"
                  className={cn('flex items-start gap-2.5 rounded-xl border p-3.5 text-sm kd-transition text-left', repairIsReimbursement === val ? 'border-primary bg-primary/5' : 'border-input text-muted-foreground hover:border-primary/30 hover:text-foreground')}
                  onClick={() => setRepairIsReimbursement(val)}
                >
                  <span className={cn('mt-0.5 shrink-0', repairIsReimbursement === val ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
                  <span>
                    <span className={cn('block font-medium', repairIsReimbursement === val ? 'text-primary' : '')}>{title}</span>
                    <span className="block text-xs mt-0.5 opacity-70">{sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Vehicle & service */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vehicle & service</Label>
            <div className="space-y-1.5">
              <Label>Vehicle <span className="text-destructive">*</span></Label>
              <Select
                value={repairForm.vehicle_id || '__none__'}
                onValueChange={(v) => {
                  const vid = v === '__none__' ? '' : v;
                  setRepairForm((f) => ({ ...f, vehicle_id: vid }));
                  loadRepairMatchingItems(vid);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {repairForm.vehicle_id && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Service type <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Select value={repairForm.service_type || '__none__'} onValueChange={(v) => setRepairForm((f) => ({ ...f, service_type: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {SERVICE_TYPES.filter((t) => t !== 'Custom').map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Odometer (km) <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Input type="number" value={repairForm.odometer} onChange={(e) => setRepairForm((f) => ({ ...f, odometer: e.target.value }))} placeholder="e.g. 42500" />
                  </div>
                </div>
                {repairMatchingItems.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>This closes a scheduled item <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Select value={repairMaintenanceItemId || '__none__'} onValueChange={(v) => setRepairMaintenanceItemId(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Not linked to a service item" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not linked to a service item</SelectItem>
                        {repairMatchingItems.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.service_type}{m.due_date ? ` — due ${formatDate(m.due_date)}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Marks this service item done and updates the vehicle's maintenance schedule once the receipt is attached.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Repair details</Label>
            <div className="space-y-1.5">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea
                value={repairForm.description}
                onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
                placeholder="e.g. Replaced front tyre — Toyota Camry ABC-123-XY"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vendor / Garage <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input
                  value={repairForm.vendor_name}
                  onChange={(e) => setRepairForm({ ...repairForm, vendor_name: e.target.value })}
                  placeholder="e.g. Mekunwen Auto Parts"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Repair Date</Label>
                <Input
                  type="date"
                  value={repairForm.repair_date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRepairForm({ ...repairForm, repair_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₦) <span className="text-destructive">*</span></Label>
              <Input type="number" value={repairForm.amount_ngn}
                onChange={(e) => setRepairForm({ ...repairForm, amount_ngn: e.target.value })}
                placeholder="0.00"
              />
              {parseFloat(repairForm.amount_ngn) > 10000 && !repairReceipt && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Receipt required for amounts over ₦10,000
                </p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { val: 'routine' as const, label: 'Routine', desc: 'Scheduled / planned', color: 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20' },
                  { val: 'urgent' as const, label: 'Urgent', desc: 'Needs attention soon', color: 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20' },
                  { val: 'emergency' as const, label: 'Emergency', desc: 'Vehicle unsafe', color: 'text-red-600 border-red-300 bg-red-50 dark:bg-red-950/20' },
                ]).map(({ val, label, desc, color }) => (
                  <button key={val} type="button"
                    className={cn('rounded-xl border p-2.5 text-center text-xs kd-transition',
                      repairForm.priority === val ? color : 'border-input text-muted-foreground hover:border-primary/30')}
                    onClick={() => setRepairForm((f) => ({ ...f, priority: val }))}
                  >
                    <span className="block font-medium">{label}</span>
                    <span className="block mt-0.5 opacity-70 text-[10px]">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Parts & Labour */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Parts replaced <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input
                  value={repairForm.parts_replaced}
                  onChange={(e) => setRepairForm({ ...repairForm, parts_replaced: e.target.value })}
                  placeholder="e.g. Brake pads, Oil filter"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Labour hours <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input type="number" step="0.5" min="0"
                  value={repairForm.labour_hours}
                  onChange={(e) => setRepairForm({ ...repairForm, labour_hours: e.target.value })}
                  placeholder="e.g. 2.5"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Receipt <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <OcrReceiptScanner
                onExtracted={(result: OcrResult, file: File) => {
                  setRepairReceipt(file);
                  setRepairReceiptOcrAmount(result.amount_ngn || '');
                  if (result.receiptType === 'fuel') {
                    toast({ title: 'Receipt type mismatch', description: 'This looks like a fuel receipt — make sure you\'re attaching the right one.', variant: 'default' });
                  }
                  const partsFromLineItems = result.lineItems
                    ?.map((li) => li.description).join(', ') || '';
                  setRepairForm((f) => ({
                    ...f,
                    amount_ngn: result.amount_ngn || f.amount_ngn,
                    vendor_name: f.vendor_name || result.description || f.vendor_name,
                    repair_date: result.date || f.repair_date,
                    parts_replaced: f.parts_replaced || partsFromLineItems,
                  }));
                }}
              />
              {repairReceipt ? (
                <div className="flex items-center gap-3 rounded-xl border-2 border-green-400 bg-green-50 dark:bg-green-950/20 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-green-700 dark:text-green-400 truncate flex-1">{repairReceipt.name}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive shrink-0" onClick={() => { setRepairReceipt(null); setRepairReceiptOcrAmount(''); }}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                    <span className="flex-1 border-t" /><span>or attach manually</span><span className="flex-1 border-t" />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 px-4 py-3 cursor-pointer kd-transition">
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setRepairReceipt(e.target.files?.[0] || null)} />
                    <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">Upload receipt (photo or PDF)</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Bank (reimbursement only) */}
          {repairIsReimbursement && (
            <div className="space-y-1.5 border-t pt-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank account for reimbursement <span className="font-normal normal-case">(optional)</span></Label>
              <BankAccountField value={repairBank} onChange={setRepairBank} provider={activeProvider} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-6 pt-3 border-t bg-background flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowRepairForm(false)}>Cancel</Button>
          <Button
            onClick={submitRepairRequest}
            disabled={submitting || !repairForm.employee_id || !repairForm.description || !repairForm.amount_ngn || !repairForm.vehicle_id}
            className="min-w-[130px]"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
            Submit Repair
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* REPAIR RECEIPT UPLOAD DIALOG */}
    <Dialog
      open={!!uploadingRepairReceiptFor}
      onOpenChange={(v) => {
        if (!v) {
          setUploadingRepairReceiptFor(null);
          setRepairReceiptUploadFile(null);
          setRepairReceiptUploadOcrAmount('');
          setRepairReceiptUploadVendor('');
          setRepairReceiptUploadDate('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach Repair Receipt</DialogTitle>
          <DialogDescription>
            Upload a photo or PDF of the receipt for this repair.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
            <p className="text-muted-foreground text-xs">Repair</p>
            <p className="font-medium">{uploadingRepairReceiptFor?.description} — {formatNaira(uploadingRepairReceiptFor?.amount_ngn || 0)}</p>
          </div>
          <div className="space-y-1">
            <Label>Receipt <span className="text-destructive">*</span></Label>
            <OcrReceiptScanner
              onExtracted={(result: OcrResult, file: File) => {
                setRepairReceiptUploadFile(file);
                setRepairReceiptUploadOcrAmount(result.amount_ngn || '');
                setRepairReceiptUploadVendor((v) => v || result.description || v);
                setRepairReceiptUploadDate((d) => d || result.date || d);
                if (result.receiptType === 'fuel') {
                  toast({ title: 'Receipt type mismatch', description: 'This looks like a fuel receipt — make sure you\'re attaching the right one.', variant: 'default' });
                }
              }}
            />
            {repairReceiptUploadFile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground truncate">{repairReceiptUploadFile.name}</span>
                <span className="shrink-0">— {(repairReceiptUploadFile.size / 1024).toFixed(1)} KB</span>
                <button type="button" className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" onClick={() => { setRepairReceiptUploadFile(null); setRepairReceiptUploadOcrAmount(''); }}>
                  Change
                </button>
              </div>
            )}
            {!repairReceiptUploadFile && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                  <span className="flex-1 border-t" /><span>or attach manually</span><span className="flex-1 border-t" />
                </div>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!validateFile(f, toast)) {
                      (e.target as HTMLInputElement).value = '';
                      return;
                    }
                    setRepairReceiptUploadFile(f);
                    setRepairReceiptUploadOcrAmount('');
                  }}
                />
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Vendor / Garage <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                value={repairReceiptUploadVendor}
                onChange={(e) => setRepairReceiptUploadVendor(e.target.value)}
                placeholder="e.g. Mekunwen Auto Parts"
              />
            </div>
            <div className="space-y-1">
              <Label>Repair Date</Label>
              <Input
                type="date"
                value={repairReceiptUploadDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRepairReceiptUploadDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUploadingRepairReceiptFor(null)}>Cancel</Button>
          <Button onClick={submitRepairReceiptUpload} disabled={submittingRepairReceipt || !repairReceiptUploadFile}>
            {submittingRepairReceipt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Upload className="mr-2 h-4 w-4" /> Submit Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* DUPLICATE FUEL WARNING */}
    <Dialog open={showDuplicateFuelWarning} onOpenChange={(v) => { if (!v) setShowDuplicateFuelWarning(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Duplicate fuel request today
          </DialogTitle>
          <DialogDescription>
            A fuel request for this vehicle has already been submitted today. Are you sure you want to submit another?
            If you proceed, the note <strong>"duplicate_same_day"</strong> will be appended to this request.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDuplicateFuelWarning(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              setShowDuplicateFuelWarning(false);
              submitFuelRequest(pendingFuelAsException, true);
            }}
          >
            Yes, submit anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ANOMALY REVIEW DIALOG */}
    <AnomalyReviewDialog
      target={reviewingAnomaly}
      onClose={() => setReviewingAnomaly(null)}
      profile={profile}
      onSuccess={onRefresh}
    />
    </>
  );
}
