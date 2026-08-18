import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { friendlyDbError } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles, notifyChannels } from '@/lib/notify';
import { notifyAnomalyToAdmins } from '@/lib/notify-events';
import { formatNaira, formatDate, formatTime } from '@/lib/format';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { FilePreviewTrigger } from '@/components/FilePreview';
import { SubPageHeader } from '@/components/SubPageHeader';
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
// Tabs import removed — fleet now uses horizontal tab strip
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
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { AuroraHero } from '@/components/AuroraHero';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { burst } from '@/components/Burst';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { Loader2, Check, X, Fuel, MapPin, Plus, Car, Pencil, Trash2, Info, CreditCard, Banknote, History, User, AlertTriangle, Wrench, FileText, Upload, RotateCcw, Timer, Navigation, LocateFixed, LocateOff, CheckCircle2, Radio, Map as MapIcon, Gauge, Zap, ParkingCircle, TrendingUp, BarChart2, Download, Ban, CalendarOff, CheckSquare, RefreshCw, Play, Pause, Shield, Circle, LayoutDashboard, Search, ClipboardCheck, UserCheck, MoreHorizontal, Receipt } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { LiveTrackingTab } from '@/components/fleet/LiveTrackingTab';
import { useJsApiLoader, GoogleMap, Polyline as GPolyline, OverlayView, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, MAP_OPTIONS, MAPS_LIBRARIES } from '@/lib/maps';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  getBankCode,
  createTransferRecipient,
  initiateTransferIdempotent,
  generateKdopsRef,
  buildNarration,
} from '@/lib/paystack';
import { approveExpense, rejectExpense, startBatchProcessing } from '@/lib/transfer-safety';
import { cn } from '@/lib/utils';
import { hashFile, watermarkImage, checkPumpPrice, checkReceiptRequestDivergence, checkOdometerRegression, checkRepairCostOutlier, checkStaleReceipt, blendBenchmark, median, checkMathMismatch, checkTankOverflow, checkFuelRequestFrequency, checkOcrManualMismatch, checkRouteEfficiency, scoreAnomalySeverity } from '@/lib/receipts';
import { hasJpegExif, generateElaHeatmap } from '@/lib/receiptForensics';
import { OcrReceiptScanner, type OcrResult } from '@/components/OcrReceiptScanner';
import { VehicleInspectionForm } from '@/components/fleet/VehicleInspectionForm';
import { DriverScorecard } from '@/components/fleet/DriverScorecard';
import { DriverLeaderboard } from '@/components/fleet/DriverLeaderboard';
import { ComplianceDashboard } from '@/components/fleet/ComplianceDashboard';
import { FuelStationComparison } from '@/components/fleet/FuelStationComparison';
import { FuelPriceIntelligence } from '@/components/fleet/FuelPriceIntelligence';
import { FleetBudgetForecaster } from '@/components/fleet/FleetBudgetForecaster';
import { DriverVerificationPanel } from '@/components/fleet/DriverVerificationPanel';
import { IncidentReportPanel } from '@/components/fleet/IncidentReportPanel';
import { MaintenanceHub } from '@/components/fleet/MaintenanceHub';
import { InspectionHistory } from '@/components/fleet/InspectionHistory';
import { VehicleLifecyclePanel } from '@/components/fleet/VehicleLifecyclePanel';
import { FleetInsightsPanel } from '@/components/fleet/FleetInsightsPanel';
import { FuelCostOptimizer } from '@/components/fleet/FuelCostOptimizer';
import FleetAnalyticsDashboard, { KpiCard, SERVICE_TYPES } from '@/components/fleet/FleetAnalyticsDashboard';
import TripMapModal, { LocationCell, isCoordString, geocodeResultCache } from '@/components/fleet/TripMapModal';
import GeofencesTab from '@/components/fleet/GeofencesTab';
import VehiclesTab from '@/components/fleet/VehiclesTab';
import {
  type FieldStaff,
  type VehicleSummary,
  type FuelRequest,
  type TripLog,
  type BreadcrumbRow,
  type TripEvent,
  type GeoCoords,
  type GeoState,
  type ReceiptDebt,
  type Vehicle,
  type MaintenanceRecord,
  isGeoError,
  GEO_ERROR_MSG,
  getGeolocation,
  paystackFeeForAmount,
  getFuelFee,
  formatCoords,
  formatDuration,
  detectAnomalies,
  daysSinceIso,
  getReceiptDebt,
  exportCsv,
  haversineKm,
  reverseGeocode,
  computeIdleMinutes,
  RECEIPT_DEBT_HARD_BLOCK_DAYS,
} from '@/lib/fleet-utils';

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

function ServiceAlert({ v, todayStr, in30Str }: { v: VehicleSummary; todayStr: string; in30Str: string }) {
  const msgs: string[] = [];
  if (v.insurance_expiry && v.insurance_expiry <= in30Str)
    msgs.push(`insurance expires ${formatDate(v.insurance_expiry)}${v.insurance_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
  if (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str)
    msgs.push(`roadworthy expires ${formatDate(v.road_worthiness_expiry)}${v.road_worthiness_expiry <= todayStr ? ' (EXPIRED)' : ''}`);
  if ((v as any).next_service_date && (v as any).next_service_date <= in30Str)
    msgs.push(`service due ${formatDate((v as any).next_service_date)}`);
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span><strong>{v.name}</strong> ({(v as any).plate_number}): {msgs.join(' · ')}</span>
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

function TripVehicleFuel({
  vehicleId, vehicles, kmDriven, litresAdded,
}: {
  vehicleId: string;
  vehicles: VehicleSummary[];
  kmDriven?: number | null;
  litresAdded?: number | null;
}) {
  if (!vehicleId) return null;
  const veh = vehicles.find((v) => v.id === vehicleId);
  if (!veh) return null;

  const cap = veh.tank_capacity_litres || 60;
  const startFuel = Math.min(veh.current_fuel_litres || 0, cap);
  const eff = veh.avg_km_per_litre > 0 ? veh.avg_km_per_litre : null;

  const consumed = kmDriven != null && kmDriven > 0 && eff ? kmDriven / eff : null;
  const added = litresAdded && litresAdded > 0 ? litresAdded : null;
  const hasCalc = consumed != null || added != null;

  const endFuel = hasCalc
    ? Math.min(cap, Math.max(0, startFuel - (consumed ?? 0) + (added ?? 0)))
    : null;

  const toPct = (v: number) => cap > 0 ? Math.round((v / cap) * 100) : 0;
  const barColor = (pct: number) => pct >= 50 ? 'bg-green-500' : pct >= 20 ? 'bg-amber-500' : 'bg-red-500';
  const txtColor = (pct: number) => pct >= 50 ? 'text-green-700' : pct >= 20 ? 'text-amber-700' : 'text-red-700';

  const startPct = toPct(startFuel);
  const endPct = endFuel != null ? toPct(endFuel) : null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 mt-1 text-xs">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground font-medium">Fuel at start</span>
          <span className={`font-semibold ${txtColor(startPct)}`}>
            {startFuel.toFixed(0)}L / {cap}L ({startPct}%)
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor(startPct)}`} style={{ width: `${startPct}%` }} />
        </div>
      </div>

      {consumed != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Est. consumed ({kmDriven?.toLocaleString()} km ÷ {eff} km/L)</span>
          <span className="text-red-600 font-medium">−{consumed.toFixed(1)}L</span>
        </div>
      )}
      {added != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Fuel purchased this trip</span>
          <span className="text-green-600 font-medium">+{added.toFixed(1)}L</span>
        </div>
      )}

      {endFuel != null && endPct != null && (
        <div className="pt-1 border-t space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Fuel at end</span>
            <span className={`font-semibold ${txtColor(endPct)}`}>
              {endFuel.toFixed(0)}L / {cap}L ({endPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor(endPct)}`} style={{ width: `${endPct}%` }} />
          </div>
          {endPct < 20 && (
            <p className="flex items-center gap-1 text-red-600 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> Low fuel after this trip
            </p>
          )}
        </div>
      )}

      {startPct < 20 && !hasCalc && (
        <p className="flex items-center gap-1 text-red-600">
          <AlertTriangle className="h-3 w-3" /> Low fuel — consider refuelling before this trip
        </p>
      )}
    </div>
  );
}

// ── Sidebar nav helpers ──────────────────────────────────────────────────────

function FleetNavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 first:pt-0">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FleetNavItem({
  icon: Icon,
  label,
  value,
  active,
  onClick,
  badge,
  badgeTone = 'danger',
  live,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  active: string;
  onClick: (v: any) => void;
  badge?: string;
  badgeTone?: 'danger' | 'warning';
  live?: boolean;
}) {
  const isActive = active === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/15'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {live && (
        <span className="relative flex h-2 w-2 -ml-1">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      )}
      <span className="truncate">{label}</span>
      {badge && (
        <span className={cn(
          'ml-auto inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1',
          badgeTone === 'danger' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white',
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

const Fleet = () => {
  usePageTitle('Fleet');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'operations';

  const [tab, setTab] = useState<'dashboard' | 'fuel' | 'trips' | 'vehicles' | 'my_requests' | 'activity' | 'anomalies' | 'geofences' | 'live' | 'compliance' | 'drivers' | 'incidents' | 'maintenance' | 'inspections' | 'lifecycle'>(
    isAdmin ? 'dashboard' : 'my_requests',
  );
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  const [staff, setStaff] = useState<FieldStaff[]>([]);
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [fuelStatusFilter, setFuelStatusFilter] = useState<string>('all');
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  // Fuel request form
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
  // Which provider BankAccountField should verify against — previously
  // hardcoded to Paystack regardless of the active provider. Fetched once
  // on mount; these fields feed expense reimbursement (dispatched later
  // through the Expenses/BatchDetail pipeline, which resolves the real
  // provider fresh at actual disbursement time).
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

  // Tamper-analysis (ELA) — an on-demand, admin-triggered visual aid.
  // Never runs automatically and never sets a flag on its own; see
  // receiptForensics.ts for why an automated pass/fail threshold here
  // would be unreliable.
  const [elaTarget, setElaTarget] = useState<{ id: string; url: string } | null>(null);
  const [elaResult, setElaResult] = useState<{ heatmapDataUrl: string; avgBrightness: number } | null>(null);
  const [elaLoading, setElaLoading] = useState(false);
  const [elaError, setElaError] = useState('');

  // Phase 1 — vehicle & weekly budget state
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [fuelVehicleId, setFuelVehicleId] = useState('');
  const [weekBudget, setWeekBudget] = useState<{
    spent: number; total: number; carryForward: number; remaining: number;
  } | null>(null);

  // Anomaly detection
  const [showDuplicateFuelWarning, setShowDuplicateFuelWarning] = useState(false);
  const [pendingFuelAsException, setPendingFuelAsException] = useState(false);
  const [reviewingAnomaly, setReviewingAnomaly] = useState<{ type: 'trip' | 'fuel'; id: string; label: string } | null>(null);
  const [anomalyReviewDecision, setAnomalyReviewDecision] = useState<'valid' | 'fraudulent' | ''>('');
  const [anomalyReviewNote, setAnomalyReviewNote] = useState('');
  const [submittingAnomalyReview, setSubmittingAnomalyReview] = useState(false);

  // Phase 4 — repair request form
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
  // Pending vehicle_maintenance items for the vehicle selected on the repair
  // form — lets the driver pick which scheduled service item this closes.
  const [repairMatchingItems, setRepairMatchingItems] = useState<MaintenanceRecord[]>([]);
  const [repairMaintenanceItemId, setRepairMaintenanceItemId] = useState('');

  // Receipt accountability — outstanding fuel/repair receipts block new
  // requests once they age past RECEIPT_DEBT_HARD_BLOCK_DAYS.
  const [myReceiptDebt, setMyReceiptDebt] = useState<ReceiptDebt | null>(null);
  const [myOpenRepairs, setMyOpenRepairs] = useState<Array<{
    id: string; description: string | null; amount_ngn: number; created_at: string;
    vehicle_id: string | null; service_type: string | null;
    maintenance_item_id: string | null; repair_odometer_km: number | null;
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

  // Post-payment receipt upload for repairs (mirrors the fuel receipt flow).
  const [uploadingRepairReceiptFor, setUploadingRepairReceiptFor] = useState<{
    id: string; description: string | null; amount_ngn: number; vehicle_id: string | null;
    service_type: string | null; maintenance_item_id: string | null; repair_odometer_km: number | null;
    vendor_name: string | null; date: string | null;
  } | null>(null);
  const [repairReceiptUploadFile, setRepairReceiptUploadFile] = useState<File | null>(null);
  const [submittingRepairReceipt, setSubmittingRepairReceipt] = useState(false);
  // Editable vendor/date for repairs that were submitted without them
  // (submission is optional there) — confirmable/correctable here, same as
  // the initial submission dialog, so nothing captured on receipt attach is
  // worse than what capturing it upfront would have gotten.
  const [repairReceiptUploadVendor, setRepairReceiptUploadVendor] = useState('');
  const [repairReceiptUploadDate, setRepairReceiptUploadDate] = useState('');
  // Raw OCR-extracted amount, kept separate from the (possibly hand-typed
  // or corrected) form field so submit time can compare what the receipt
  // actually says against what the user entered.
  const [repairReceiptOcrAmount, setRepairReceiptOcrAmount] = useState<string>('');
  const [repairReceiptUploadOcrAmount, setRepairReceiptUploadOcrAmount] = useState<string>('');

  // Pump-price benchmark for the anomaly cross-check (Phase 5).
  const [fuelPriceBenchmark, setFuelPriceBenchmark] = useState<number | null>(null);
  const [fuelIsReimbursement, setFuelIsReimbursement] = useState(true);

  // Log External Purchase — admin-only. Records a fuel/repair purchase that
  // was already paid for outside the platform (e.g. a receipt forwarded over
  // WhatsApp), instead of an admin impersonating the employee's own request.
  // Distinct from the New Fuel Request / Repair Request flows: nothing here
  // is ever forward-looking or payable — see the migration comment on
  // log_external_repair_purchase for why.
  const [showLogExternalForm, setShowLogExternalForm] = useState(false);
  const [logExternalType, setLogExternalType] = useState<'fuel' | 'repair'>('fuel');
  const EMPTY_LOG_EXTERNAL_FORM = {
    employee_id: '', vehicle_id: '', amount_ngn: '', station_or_vendor: '',
    purchase_date: new Date().toISOString().slice(0, 10), notes: '',
  };
  const [logExternalForm, setLogExternalForm] = useState(EMPTY_LOG_EXTERNAL_FORM);
  const [submittingLogExternal, setSubmittingLogExternal] = useState(false);

  // Trip log form
  const [showTripForm, setShowTripForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [tripForm, setTripForm] = useState({
    employee_id: profile?.id || '',
    vehicle_id: '',
    date: today,
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  // Real-time trip clock-in
  const [activeTrip, setActiveTrip] = useState<TripLog | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Start Trip dialog
  const [showStartTrip, setShowStartTrip] = useState(false);
  const [startGeoState, setStartGeoState] = useState<GeoState>('idle');
  const [startCoords, setStartCoords] = useState<GeoCoords | null>(null);
  const [startTripForm, setStartTripForm] = useState({ vehicle_id: '', odometer_start: '' });
  const [lastVehicleOdometer, setLastVehicleOdometer] = useState<number | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);

  // Vehicle Inspection (DVIR)
  const [showInspection, setShowInspection] = useState(false);
  const [inspectionVehicleId, setInspectionVehicleId] = useState('');
  const [inspectionVehicleName, setInspectionVehicleName] = useState('');

  // End Trip dialog
  const [showEndTrip, setShowEndTrip] = useState(false);
  const [endGeoState, setEndGeoState] = useState<GeoState>('idle');
  const [endCoords, setEndCoords] = useState<GeoCoords | null>(null);
  const [endTripForm, setEndTripForm] = useState({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '' });
  const [endingTrip, setEndingTrip] = useState(false);

  // Post-trip summary
  const [tripSummary, setTripSummary] = useState<{
    distanceKm: number | null; durationMin: number; isAnomaly: boolean; anomalyReason: string | null;
    startLocation: string; endLocation: string;
  } | null>(null);

  // Cancel in-progress trip confirmation
  const [confirmCancelTrip, setConfirmCancelTrip] = useState(false);

  // Live breadcrumb tracking (watchPosition)
  const watchIdRef = useRef<number | null>(null);
  const prevSpeedRef = useRef<number | null>(null);
  const lastBreadcrumbPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastBreadcrumbTimeRef = useRef<number>(0);
  const [liveSpeed, setLiveSpeed] = useState<number | null>(null);
  const [lastBreadcrumbAt, setLastBreadcrumbAt] = useState<Date | null>(null);
  const [breadcrumbCount, setBreadcrumbCount] = useState(0);

  // Map view state
  const [viewingTripMap, setViewingTripMap] = useState<TripLog | null>(null);
  const [mapBreadcrumbs, setMapBreadcrumbs] = useState<BreadcrumbRow[]>([]);
  const [mapEvents, setMapEvents] = useState<TripEvent[]>([]);
  const [loadingMapData, setLoadingMapData] = useState(false);

  // Reverse-geocoded human addresses for start/end GPS fixes
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [endAddress, setEndAddress] = useState<string | null>(null);

  // Google Maps API — loaded once for the Start Trip dialog map
  const { isLoaded: mapsLoaded } = useJsApiLoader({ id: 'kd-gmaps', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: MAPS_LIBRARIES });
  // Draggable pin position in the Start Trip map — starts at GPS fix, can be adjusted
  const [startPinnedCoords, setStartPinnedCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Sync GPS fix → pin whenever a fresh fix arrives
  useEffect(() => {
    if (startCoords) setStartPinnedCoords({ lat: startCoords.lat, lng: startCoords.lng });
  }, [startCoords]);

  useEffect(() => {
    // keep form employee_id in sync with the logged-in user
    setFuelForm((f) => ({ ...f, employee_id: profile?.id || '' }));
    setTripForm((f) => ({ ...f, employee_id: profile?.id || '' }));
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchData);

  // Recover any in-progress trip for this employee when their profile loads.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase
        .from('trip_logs').select('id, driver_id, trip_start_time, vehicle_id, odometer_start, start_location, start_lat, start_lng, status')
        .eq('driver_id', profile.id)
        .eq('status', 'in_progress')
        .limit(1).maybeSingle();
      if (data) {
        setActiveTrip({
          ...data,
          employee_id: data.driver_id,
          employee_name: profile.full_name || '',
        } as TripLog);
      } else {
        setActiveTrip(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Elapsed-time counter — computed from wall clock so tab throttling can't cause drift.
  useEffect(() => {
    if (!activeTrip?.trip_start_time) { setElapsedSeconds(0); return; }
    const startMs = Date.parse(activeTrip.trip_start_time);
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    const onVisibility = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
  }, [activeTrip?.trip_start_time]);

  // Live breadcrumb tracking — runs for the lifetime of an active trip.
  // Inserts GPS pings to trip_breadcrumbs and driving events to trip_events.
  useEffect(() => {
    const tripId = activeTrip?.id ?? null;

    if (!tripId) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      prevSpeedRef.current = null;
      lastBreadcrumbPosRef.current = null;
      lastBreadcrumbTimeRef.current = 0;
      setLiveSpeed(null);
      setLastBreadcrumbAt(null);
      setBreadcrumbCount(0);
      return;
    }

    if (!navigator.geolocation) return;

    const MIN_DIST_KM = 0.030;    // 30 m — minimum genuine movement before saving
    const MAX_ACCURACY_M = 50;    // discard fixes worse than 50 m — pure GPS noise
    const MIN_INTERVAL_MS = 20_000; // 20 s — max periodic save rate when moving slowly
    const STOP_THRESHOLD_MS = 5 * 60_000; // 5 min — flag as extended stop
    const SPEED_THRESHOLD_KMH = 100;
    const HARD_BRAKE_DROP_KMH = 40;

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;

      // Drop fixes where the GPS circle is larger than our movement threshold —
      // any "movement" within that circle is indistinguishable from sensor noise.
      if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

      const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
      setLiveSpeed(speedKmh != null ? Math.round(speedKmh) : null);

      const now = Date.now();
      const prevPos = lastBreadcrumbPosRef.current;
      const distMoved = prevPos ? haversineKm(prevPos.lat, prevPos.lng, lat, lng) : Infinity;
      const msSinceLast = now - lastBreadcrumbTimeRef.current;

      const hasMovedEnough = distMoved >= MIN_DIST_KM;
      // Periodic save only fires when actually moving — prevents stationary jitter pings.
      const isActuallyMoving = speedKmh == null || speedKmh > 3;
      const timeThresholdMet = msSinceLast >= MIN_INTERVAL_MS && isActuallyMoving;
      const isExtendedStop = !hasMovedEnough && msSinceLast >= STOP_THRESHOLD_MS;

      if (!hasMovedEnough && !timeThresholdMet) return;

      lastBreadcrumbPosRef.current = { lat, lng };
      lastBreadcrumbTimeRef.current = now;
      setLastBreadcrumbAt(new Date());
      setBreadcrumbCount((n) => n + 1);

      const isSpeeding = speedKmh != null && speedKmh > SPEED_THRESHOLD_KMH;
      const isHardBraking =
        speedKmh != null &&
        prevSpeedRef.current != null &&
        prevSpeedRef.current - speedKmh >= HARD_BRAKE_DROP_KMH;

      prevSpeedRef.current = speedKmh;

      // Insert breadcrumb (fire-and-forget — errors are non-critical)
      supabase.from('trip_breadcrumbs').insert({
        trip_id: tripId, lat, lng,
        accuracy: accuracy ?? null,
        speed_kmh: speedKmh,
        heading: heading ?? null,
        is_speeding: isSpeeding,
      }).then(() => {}).catch(() => {});

      // Collect events to batch-insert
      const evts: Array<{ event_type: string; speed_kmh: number | null; details: string }> = [];
      if (isSpeeding) evts.push({
        event_type: 'speeding',
        speed_kmh: speedKmh,
        details: `${Math.round(speedKmh!)} km/h — exceeds ${SPEED_THRESHOLD_KMH} km/h threshold`,
      });
      if (isHardBraking) evts.push({
        event_type: 'hard_braking',
        speed_kmh: speedKmh,
        details: `Speed dropped from ${Math.round(prevSpeedRef.current ?? 0)} to ${Math.round(speedKmh!)} km/h`,
      });
      if (isExtendedStop) evts.push({
        event_type: 'extended_stop',
        speed_kmh: speedKmh,
        details: `Vehicle stationary for ${Math.round(msSinceLast / 60_000)} minutes`,
      });

      if (evts.length > 0) {
        supabase.from('trip_events').insert(
          evts.map((ev) => ({ ...ev, trip_id: tripId, lat, lng })),
        ).then(() => {}).catch(() => {});
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      () => { /* silent — live tracking is best-effort */ },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
   
  }, [activeTrip?.id]);

  const enrich = (rows: any[], staffList: FieldStaff[]) => {
    const byId = new Map(staffList.map((s) => [s.id, s]));
    return rows.map((r) => ({
      ...r,
      employee_id: r.driver_id,
      employee_name: byId.get(r.driver_id)?.full_name || r.driver_id,
    }));
  };

  // Defined as a function declaration (not const arrow) so it's hoisted to
  // the top of this component's scope. Required because useAutoRefresh(fetchData)
  // at the top level of the component body would otherwise hit a TDZ —
  // `const` arrow functions are not hoisted; function declarations are.
  // (Same crash pattern that took down the Payments page in 4/2026.)
  async function fetchData() {
    if (!hasFetchedRef.current) setLoading(true);
    try {
      // Managers (admin/finance/super_admin/operations) see all records.
      // Field staff and drivers only pull their own records from the DB.
      const canSeeAll = ['admin', 'finance', 'super_admin', 'operations'].includes(profile?.role || '');
      const uid = profile?.id || '';

      // Embed the linked batch_item so the Paystack fee shows on each fuel
      // request without a second round-trip. Each approved fuel-reimbursement
      // creates a single-item batch; we read the fee off that item.
      const fuelBase = supabase
        .from('fuel_requests')
        .select('*, batch:payment_batches(batch_items(paystack_fee_ngn, paystack_raw, status))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      const tripBase = supabase.from('trip_logs').select('id, driver_id, date, trip_start_time, trip_end_time, duration_minutes, start_location, end_location, start_lat, start_lng, end_lat, end_lng, odometer_start, odometer_end, km_driven, fuel_amount_ngn, litres, vehicle_id, status, is_anomaly, is_out_of_area, anomaly_reason, anomaly_reviewed_at, anomaly_review_note, issues, created_at').order('created_at', { ascending: false }).limit(100);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

      const [staffRes, profilesRes, fuelRes, tripRes, activityRes, vehicleRes, settingsRes, fleetPricesRes] = await Promise.all([
        supabase
          .from('profiles_directory')
          .select('id, full_name, email')
          .eq('role', 'field_staff')
          .eq('status', 'active')
          .order('full_name'),
        supabase.from('profiles_directory').select('id, full_name, email').limit(2000),
        canSeeAll ? fuelBase : fuelBase.eq('driver_id', uid),
        canSeeAll ? tripBase : tripBase.eq('driver_id', uid),
        supabase
          .from('audit_logs')
          .select('id, action_type, description, performed_by_name, performed_by, created_at')
          .or('action_type.ilike.%fuel%,action_type.ilike.%trip%,action_type.ilike.%fleet%,action_type.ilike.%vehicle%')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('vehicles')
          .select('id, name, plate_number, weekly_budget_ngn, carry_forward_ngn, assigned_driver_id, insurance_expiry, road_worthiness_expiry, next_service_date, tank_capacity_litres, current_fuel_litres, last_refuel_at, avg_km_per_litre, fuel_consumption_rate_lkm, home_base_lat, home_base_lng, out_of_service_until, status, total_mileage_km')
          .eq('status', 'active')
          .order('name'),
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

      const fieldStaff = (staffRes.data as FieldStaff[]) || [];
      setStaff(fieldStaff);

      const lookup = ((profilesRes.data as FieldStaff[]) || []).concat(fieldStaff);
      // Flatten the embedded batch_item.paystack_fee_ngn / paystack_raw onto
      // each fuel request so getFuelFee() can read it directly.
      const fuelWithFee = (fuelRes.data || []).map((row: any) => {
        const item = row?.batch?.batch_items?.[0];
        return {
          ...row,
          paystack_fee_ngn: item?.paystack_fee_ngn ?? null,
          paystack_raw:     item?.paystack_raw     ?? null,
        };
      });
      setFuelRequests(enrich(fuelWithFee, lookup));
      setTripLogs(enrich(tripRes.data || [], lookup));
      setActivityLogs(activityRes.data || []);
      setVehicles((vehicleRes.data as VehicleSummary[]) || []);
      const externalPrice: number | null = (settingsRes.data as any)?.fuel_price_ngn_per_litre ?? null;
      const impliedPrices = ((fleetPricesRes.data as any[]) || [])
        .map((r: any) => r.amount_ngn / r.litres_filled)
        .filter((p: number) => p > 100 && p < 5000);
      const fleetMedian = impliedPrices.length >= 3 ? median(impliedPrices) : null;
      setFuelPriceBenchmark(blendBenchmark(fleetMedian, externalPrice));
      void refreshMyReceiptDebt();
    } catch (err) {
      console.error('[Fleet] fetchData failed:', err);
    } finally {
      hasFetchedRef.current = true;
      setLoading(false);
    }
  }

  // Fetch current-week spend for a vehicle, accounting for carry-forward.
  // Counts only approved/post-approval statuses — pending requests do not
  // reduce the available budget until the admin approves them.
  const fetchWeekBudget = async (vehicleId: string) => {
    if (!vehicleId) { setWeekBudget(null); return; }
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || !v.weekly_budget_ngn) { setWeekBudget(null); return; }

    // Week window: Monday 00:00:00 → Sunday 23:59:59 (local time)
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

  // Phase 4 — pre-fill odometer_start from the employee's last trip end reading
  const prefillOdometer = async (employeeId: string) => {
    if (!employeeId) return;
    const { data } = await supabase
      .from('trip_logs')
      .select('odometer_end')
      .eq('driver_id', employeeId)
      .not('odometer_end', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]?.odometer_end) {
      setTripForm((f) => ({ ...f, odometer_start: String(data[0].odometer_end) }));
    }
  };

  // Phase 4 — submit repair reimbursement (creates expense with category='repair')
  // Marks a matching vehicle_maintenance item done from a repair receipt —
  // shared by both the inline (>₦10k, receipt-at-submission) and the
  // post-hoc (attach-later) repair receipt paths. Fetches the item fresh
  // rather than reading component state, since callers may run right after
  // a setState whose value isn't visible yet in this render's closure.
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
    await supabase.from('vehicle_maintenance').update({
      status: isRecurring ? 'pending' : 'done',
      last_done_date: today,
      last_done_mileage_km: odometerKm ?? item?.last_done_mileage_km ?? null,
      due_date: isRecurring ? nextDueDate : item?.due_date,
      due_mileage_km: isRecurring ? nextDueMileage : item?.due_mileage_km,
      expense_id: expenseId,
      receipt_url: receiptUrl,
    }).eq('id', itemId);
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
    // Receipt accountability — block a new repair request if this driver
    // has an older repair still missing its receipt.
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

      // Cost-outlier check vs. the fleet's own history for this service
      // type — doesn't need a receipt, so it runs independent of whether
      // one was attached. Requires 3+ prior repairs of the same type before
      // it trusts the median enough to flag anything off it.
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
        // Hash + EXIF check happen on the ORIGINAL file, before the
        // watermark burns in a timestamp — same reasoning as fuel receipts:
        // a post-watermark hash would make identical source photos hash
        // differently every time and defeat duplicate detection entirely.
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

        // Cross-check what the receipt itself says against what was typed
        // into the amount field — catches a driver reading ₦5,000 off the
        // receipt and typing ₦50,000, or the reverse.
        if (repairReceiptOcrAmount) {
          const ocrAmount = parseFloat(repairReceiptOcrAmount);
          if (ocrAmount && checkReceiptRequestDivergence(ocrAmount, amount).flagged) {
            const deviationPct = Math.round((Math.abs(amount - ocrAmount) / amount) * 100);
            const direction = amount > ocrAmount ? 'more' : 'less';
            flags.push({
              type: 'amount_mismatch',
              reason: `Entered amount ₦${amount.toLocaleString()} is ${deviationPct}% ${direction} than the ₦${ocrAmount.toLocaleString()} the receipt appears to show`,
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
        // Surface — silent failure here means the repair was never logged
        // as an expense and finance never sees it.
        toast({
          title: 'Repair submission failed',
          description: friendlyDbError(repairExpErr),
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
      // Receipt was already attached at submission (>₦10k path or driver
      // chose to) — close the matching maintenance item right away.
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
      setRepairForm({ employee_id: profile?.id || '', description: '', amount_ngn: '', notes: '', vehicle_id: '', service_type: '', odometer: '', vendor_name: '', repair_date: new Date().toISOString().slice(0, 10) });
      setRepairBank(EMPTY_REPAIR_BANK);
      setRepairReceipt(null);
      setRepairReceiptOcrAmount('');
      setRepairMatchingItems([]);
      setRepairMaintenanceItemId('');
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Loads pending vehicle_maintenance items for the vehicle selected on the
  // repair form, so the driver can flag which scheduled service this closes.
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

  // Attach a receipt to a repair that was submitted without one — mirrors
  // submitFuelReceipt. Closes the matching maintenance item if one is set.
  const submitRepairReceiptUpload = async () => {
    if (!uploadingRepairReceiptFor || !repairReceiptUploadFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingRepairReceipt(true);
    try {
      // Hash + EXIF check on the ORIGINAL file, before the watermark burns
      // in a timestamp — a post-watermark hash would make identical source
      // photos hash differently every time and defeat duplicate detection.
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
            reason: `Submitted amount ₦${claimedAmount.toLocaleString()} is ${deviationPct}% ${direction} than the ₦${ocrAmount.toLocaleString()} this receipt appears to show`,
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
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message ?? String(err), variant: 'destructive' });
    }
    setSubmittingRepairReceipt(false);
  };

  // ---- Trip clock-in helpers ----

  const fetchLastOdometer = async (employeeId: string): Promise<string> => {
    const { data } = await supabase
      .from('trip_logs').select('odometer_end')
      .eq('driver_id', employeeId)
      .not('odometer_end', 'is', null)
      .neq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1);
    return data?.[0]?.odometer_end != null ? String(data[0].odometer_end) : '';
  };

  const acquireGeo = (
    setState: (s: GeoState) => void,
    setCoords: (c: GeoCoords | null) => void,
    onAddress?: (addr: string) => void,
  ) => {
    setState('acquiring');
    setCoords(null);
    getGeolocation()
      .then((c) => {
        setCoords(c);
        setState('ok');
        if (onAddress) {
          reverseGeocode(c.lat, c.lng).then((a) => { if (a) onAddress(a); }).catch(() => {});
        }
      })
      .catch((code) => { setState(code as GeoState); });
  };

  const openStartTrip = () => {
    setShowStartTrip(true);
    setStartCoords(null);
    setStartAddress(null);
    setStartPinnedCoords(null);
    setStartTripForm({ vehicle_id: '', odometer_start: '' });
    setLastVehicleOdometer(null);
    setStartGeoState('idle');
    acquireGeo(setStartGeoState, setStartCoords, (addr) => {
      setStartAddress(addr);
    });
    if (profile?.id) {
      fetchLastOdometer(profile.id).then((v) =>
        setStartTripForm((f) => ({ ...f, odometer_start: v })),
      );
    }
  };

  const handleStartTrip = async () => {
    if (!startTripForm.vehicle_id) {
      toast({ title: 'Vehicle is required', description: 'Please select a vehicle before starting a trip.', variant: 'destructive' });
      return;
    }
    const odoStart = parseFloat(startTripForm.odometer_start);
    if (!Number.isFinite(odoStart) || odoStart < 0) {
      toast({ title: 'Start odometer reading is required', variant: 'destructive' });
      return;
    }
    const pinCoords = startPinnedCoords ?? startCoords;
    setStartingTrip(true);
    // If geocoding hasn't resolved yet, wait up to 5 s before falling back to coordinates.
    let resolvedStartAddr = startAddress;
    if (!resolvedStartAddr && pinCoords) {
      try {
        resolvedStartAddr = await Promise.race<string | null>([
          reverseGeocode(pinCoords.lat, pinCoords.lng).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
        ]);
      } catch { resolvedStartAddr = null; }
    }
    const locationStr = pinCoords ? (resolvedStartAddr || formatCoords(pinCoords.lat, pinCoords.lng)) : '';
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('trip_logs')
      .insert({
        driver_id: profile?.id,
        vehicle_id: startTripForm.vehicle_id || null,
        date: now.slice(0, 10),
        trip_start_time: now,
        start_location: locationStr,
        start_lat: pinCoords?.lat ?? null,
        start_lng: pinCoords?.lng ?? null,
        odometer_start: odoStart,
        status: 'in_progress',
        end_location: '',
      })
      .select('id, driver_id, trip_start_time, vehicle_id, odometer_start, start_location, start_lat, start_lng, status').single();
    setStartingTrip(false);
    if (error) {
      toast({ title: 'Failed to start trip', description: error.message, variant: 'destructive' });
      return;
    }
    setActiveTrip({ ...data, employee_id: data.driver_id, employee_name: profile?.full_name || '' } as TripLog);
    setShowStartTrip(false);
    await logAudit('trip_started', `Trip started at ${locationStr || 'unknown location'} (odometer: ${odoStart.toLocaleString()} km)`, profile);
    const startVeh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
    await notifyRoles({
      roles: ['super_admin', 'admin', 'operations'],
      type: 'trip_started',
      module: 'fleet',
      title: `${profile?.full_name || 'An employee'} started a trip`,
      body: `${startVeh ? startVeh.plate_number + ' · ' : ''}From: ${locationStr || 'unknown location'} · Odometer: ${odoStart.toLocaleString()} km`,
    });
    toast({ title: 'Trip started', description: 'Tap "End Trip" when you arrive at your destination.' });
    fetchData();
  };

  const openEndTrip = () => {
    setShowEndTrip(true);
    setEndCoords(null);
    setEndAddress(null);
    setEndTripForm({ odometer_end: '', fuel_amount_ngn: '', litres: '', issues: '' });
    setEndGeoState('idle');
    acquireGeo(setEndGeoState, setEndCoords, (addr) => {
      setEndAddress(addr);
    });
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    const odoEnd = parseFloat(endTripForm.odometer_end);
    if (!Number.isFinite(odoEnd) || odoEnd < 0) {
      toast({ title: 'End odometer reading is required', variant: 'destructive' });
      return;
    }
    setEndingTrip(true);
    // If geocoding hasn't resolved yet, wait up to 5 s before falling back to coordinates.
    let resolvedEndAddr = endAddress;
    if (!resolvedEndAddr && endCoords) {
      try {
        resolvedEndAddr = await Promise.race<string | null>([
          reverseGeocode(endCoords.lat, endCoords.lng).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
        ]);
      } catch { resolvedEndAddr = null; }
    }
    const endLocationStr = endCoords ? (resolvedEndAddr || formatCoords(endCoords.lat, endCoords.lng)) : '';
    const now = new Date();
    const startMs = activeTrip.trip_start_time ? Date.parse(activeTrip.trip_start_time) : Date.now();
    const durationMin = Math.max(0, Math.round((now.getTime() - startMs) / 60_000));
    const distanceKm = activeTrip.odometer_start != null ? odoEnd - activeTrip.odometer_start : null;
    const { isAnomaly, reason: anomalyReason } = detectAnomalies(distanceKm, durationMin);

    // RULE 4: out-of-area detection
    const tripVeh = activeTrip.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null;
    let isOutOfArea = false;
    if (endCoords && tripVeh?.home_base_lat != null && tripVeh?.home_base_lng != null) {
      const distFromBase = haversineKm(endCoords.lat, endCoords.lng, tripVeh.home_base_lat, tripVeh.home_base_lng);
      if (distFromBase > 100) isOutOfArea = true;
    }

    const { error } = await supabase
      .from('trip_logs')
      .update({
        trip_end_time: now.toISOString(),
        duration_minutes: durationMin,
        end_location: endLocationStr,
        end_lat: endCoords?.lat ?? null,
        end_lng: endCoords?.lng ?? null,
        odometer_end: odoEnd,
        km_driven: distanceKm,
        fuel_amount_ngn: parseFloat(endTripForm.fuel_amount_ngn) || null,
        litres: parseFloat(endTripForm.litres) || null,
        issues: endTripForm.issues || null,
        status: 'completed',
        is_anomaly: isAnomaly,
        anomaly_reason: anomalyReason,
        is_out_of_area: isOutOfArea,
      })
      .eq('id', activeTrip.id);
    setEndingTrip(false);
    if (error) {
      toast({ title: 'Failed to end trip', description: error.message, variant: 'destructive' });
      return;
    }

    // RULE 1: notify admins on trip anomaly with severity-based escalation
    if (isAnomaly && anomalyReason) {
      const tripFlagTypes = anomalyReason.split('; ').map((r) => {
        if (r.includes('backwards')) return 'odometer_regression';
        if (r.includes('500 km')) return 'excessive_distance';
        if (r.includes('12 hours')) return 'excessive_duration';
        if (r.includes('Implausibly')) return 'implausible_trip';
        if (r.includes('No distance')) return 'stationary_trip';
        if (r.includes('150 km/h')) return 'excessive_speed';
        return 'trip_anomaly';
      });
      const tripSeverity = scoreAnomalySeverity(tripFlagTypes);
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_anomaly',
        module: 'fleet',
        priority: tripSeverity === 'critical' || tripSeverity === 'high' ? 'high' : 'normal',
        title: `Trip anomaly (${tripSeverity})`,
        body: anomalyReason,
      });
      if (tripSeverity === 'high' || tripSeverity === 'critical') {
        void notifyAnomalyToAdmins({
          title: `Fleet anomaly: ${tripSeverity} severity on trip`,
          summary: `${profile?.full_name || 'Employee'}: ${anomalyReason}`,
          severity: tripSeverity,
          link: `${window.location.origin}/fleet`,
        });
      }
    }

    // RULE 4: notify admins when vehicle ends trip far from home base
    if (isOutOfArea && tripVeh) {
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_out_of_area',
        module: 'fleet',
        title: `${tripVeh.plate_number} out-of-area trip end`,
        body: `${tripVeh.plate_number} ended a trip more than 100 km from its home base.`,
      });
    }

    // Routine trip completion notification — always sent so admins see every trip close
    {
      const completionVeh = tripVeh || (activeTrip.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null);
      const distStr = distanceKm != null ? `${distanceKm.toFixed(0)} km` : null;
      const durStr = `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'trip_completed',
        module: 'fleet',
        title: `${profile?.full_name || 'Employee'} completed a trip${isAnomaly ? ' ⚠' : ''}`,
        body: [
          completionVeh?.plate_number,
          distStr,
          durStr,
          endLocationStr ? `→ ${endLocationStr}` : null,
        ].filter(Boolean).join(' · '),
      });
    }

    // Update vehicle fuel balance — CHANGE 1
    if (activeTrip.vehicle_id) {
      const veh = vehicles.find((v) => v.id === activeTrip.vehicle_id);
      if (veh) {
        const litresPurchased = parseFloat(endTripForm.litres) || 0;
        // Prefer fuel_consumption_rate_lkm (L/km); fall back to 1/avg_km_per_litre
        const rate = veh.fuel_consumption_rate_lkm > 0
          ? veh.fuel_consumption_rate_lkm
          : (veh.avg_km_per_litre > 0 ? 1 / veh.avg_km_per_litre : null);
        const consumed = distanceKm && distanceKm > 0 && rate ? distanceKm * rate : 0;
        const cap = veh.tank_capacity_litres || 60;
        const startLevel = veh.current_fuel_litres || 0;
        const afterConsume = startLevel - consumed;
        const floored = afterConsume < 0;
        const levelAfterConsume = Math.max(0, afterConsume);
        const newBalance = Math.min(cap, levelAfterConsume + litresPurchased);
        const vPayload: Record<string, unknown> = { current_fuel_litres: newBalance };
        if (litresPurchased > 0) vPayload.last_refuel_at = now.toISOString();
        await supabase.from('vehicles').update(vPayload).eq('id', veh.id);
        if (consumed > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'trip_consumed',
            amount_litres: consumed,
            resulting_level_litres: levelAfterConsume,
            reference_id: activeTrip.id,
          });
        }
        if (litresPurchased > 0) {
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: veh.id,
            event_type: 'fuel_added',
            amount_litres: litresPurchased,
            resulting_level_litres: newBalance,
            reference_id: activeTrip.id,
          });
        }
        if (floored) {
          await notifyRoles({
            roles: ['super_admin', 'admin', 'operations'],
            type: 'fuel_level_critical',
            module: 'fleet',
            title: `${veh.plate_number} fuel may be empty`,
            body: `${veh.plate_number} fuel level may be empty — last trip consumed more than estimated remaining fuel.`,
          });
        }
      }
    }
    await logAudit(
      'trip_ended',
      `Trip ended at ${endLocationStr || 'unknown location'} — ${distanceKm?.toLocaleString() ?? '—'} km in ${durationMin} min${isAnomaly ? ' ⚠ ANOMALY' : ''}`,
      profile,
    );
    setTripSummary({ distanceKm, durationMin, isAnomaly, anomalyReason, startLocation: activeTrip.start_location || '—', endLocation: endLocationStr || '—' });
    setActiveTrip(null);
    setShowEndTrip(false);
    // Fire smart-alerts (best-effort — no await so UI closes instantly)
    if (activeTrip.vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'trip_ended', vehicle_id: activeTrip.vehicle_id },
      }).catch(() => {/* best-effort */});
    }

    // Maintenance proximity alerts — check after every trip
    if (activeTrip.vehicle_id) {
      const { data: mainItems } = await supabase
        .from('vehicle_maintenance')
        .select('due_date, service_type, due_mileage_km')
        .eq('vehicle_id', activeTrip.vehicle_id)
        .neq('status', 'done');
      const maintVeh = vehicles.find((v) => v.id === activeTrip.vehicle_id);
      const plate = maintVeh?.plate_number ?? 'Vehicle';
      const todayMs = Date.now();
      for (const item of mainItems || []) {
        if (item.due_date) {
          const daysUntil = Math.ceil((new Date(item.due_date).getTime() - todayMs) / 86_400_000);
          if (daysUntil >= 0 && daysUntil <= 7) {
            await notifyRoles({
              roles: ['super_admin', 'admin', 'operations'],
              type: 'maintenance_due_soon',
              module: 'fleet',
              priority: 'high',
              title: `⚠️ ${plate}: ${item.service_type} due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
              body: `${plate}: ${item.service_type} is due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (due ${formatDate(item.due_date)}).`,
            });
          }
        }
        if (item.due_mileage_km != null && Number.isFinite(odoEnd)) {
          const kmRemaining = item.due_mileage_km - odoEnd;
          if (kmRemaining >= 0 && kmRemaining <= 500) {
            await notifyRoles({
              roles: ['super_admin', 'admin', 'operations'],
              type: 'maintenance_due_km',
              module: 'fleet',
              priority: 'high',
              title: `⚠️ ${plate}: ${item.service_type} due in ~${Math.round(kmRemaining)} km`,
              body: `${plate}: ${item.service_type} due in ~${Math.round(kmRemaining)} km (current: ${Math.round(odoEnd).toLocaleString()} km, due at: ${item.due_mileage_km.toLocaleString()} km).`,
            });
          }
        }
      }
    }

    fetchData();
  };

  const handleCancelActiveTrip = async () => {
    if (!activeTrip) return;
    const { error } = await supabase.from('trip_logs').delete().eq('id', activeTrip.id);
    if (error) { toast({ title: 'Failed to cancel trip', description: error.message, variant: 'destructive' }); return; }
    await logAudit('trip_cancelled', 'In-progress trip cancelled and removed', profile);
    setActiveTrip(null);
    setConfirmCancelTrip(false);
    toast({ title: 'Trip cancelled' });
  };

  const openTripMap = async (t: TripLog) => {
    setViewingTripMap(t);
    setLoadingMapData(true);
    setMapBreadcrumbs([]);
    setMapEvents([]);
    const [bcRes, evRes] = await Promise.all([
      supabase.from('trip_breadcrumbs').select('lat, lng, speed_kmh, recorded_at').eq('trip_id', t.id).order('recorded_at'),
      supabase.from('trip_events').select('id, lat, lng, event_type, details, recorded_at').eq('trip_id', t.id).order('recorded_at'),
    ]);
    setMapBreadcrumbs((bcRes.data as BreadcrumbRow[]) || []);
    setMapEvents((evRes.data as TripEvent[]) || []);
    setLoadingMapData(false);
  };

  // ---- End trip clock-in helpers ----

  const submitFuelRequest = async (asException = false, skipDuplicateCheck = false) => {
    if (submitting) return;
    if (!fuelForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    // Validate amount: must be positive and within Paystack single-transfer
    // ceiling. Catches typos that would otherwise hit RLS / trigger errors
    // deep in the flow.
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

    // Strict compliance enforcement — block fuel for vehicles with expired documents
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

    // Lock the button BEFORE any async checks to prevent double-submission
    setSubmitting(true);

    try {
    // Receipt accountability — block a new fuel request if this driver has
    // a fuel payment sent RECEIPT_DEBT_HARD_BLOCK_DAYS+ ago with no receipt.
    // Re-checked live (not from cached state) so it also covers admins
    // submitting on behalf of a different employee.
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

    // RULE 3: same-day duplicate check (only when a vehicle is selected)
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

    // Append duplicate marker to note if employee confirmed a same-day re-submit
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
      // Mirror the fuel request into Expenses immediately as a pending row,
      // linked by fuel_request_id. This makes the cost visible to finance
      // (and reports) from the moment of submission, not just after
      // approval. The same row is updated when the request is approved or
      // rejected — no duplicates.
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

      // RULE 2: notify admins if efficiency anomaly was detected
      if (fuelIsAnomaly && inserted?.id) {
        await notifyRoles({
          roles: ['super_admin', 'admin', 'operations'],
          type: 'fuel_efficiency_anomaly',
          module: 'fleet',
          title: 'Fuel efficiency anomaly',
          body: `A fuel request was flagged: estimated efficiency outside normal range (2–30 km/L). Please review.`,
        });
      }
      // Upload supporting document (optional) and patch the URL back onto the row.
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
            await supabase
              .from('fuel_requests')
              .update({ request_doc_url: urlData.publicUrl })
              .eq('id', inserted.id);
          }
        } catch (docErr: any) {
          // Don't fail the whole submission — the request is already logged.
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
      fetchData();
    }
    } finally {
      setSubmitting(false);
    }
  };

  // Logs a fuel or repair purchase already paid for outside the platform.
  // Creates the row (never payable — see log_external_repair_purchase's
  // comment) then hands off into the SAME receipt-upload dialogs the normal
  // fuel/repair flows use, so OCR, anomaly checks, and the vehicle fuel-level
  // sync all run through their one already-vetted path. Cancelling that
  // follow-up dialog is a valid outcome, not an error: it leaves the row
  // receipt-less, which the existing getReceiptDebt() block already covers.
  const submitLogExternalPurchase = async () => {
    if (!logExternalForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(logExternalForm.amount_ngn) || 0;
    if (amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    setSubmittingLogExternal(true);
    try {
      const employeeName = staff.find((s) => s.id === logExternalForm.employee_id)?.full_name
        || (logExternalForm.employee_id === profile?.id ? profile?.full_name : null)
        || 'employee';
      const paidAt = new Date(`${logExternalForm.purchase_date}T12:00:00`).toISOString();

      if (logExternalType === 'fuel') {
        const { data: inserted, error } = await supabase.from('fuel_requests').insert({
          driver_id: logExternalForm.employee_id,
          vehicle_id: logExternalForm.vehicle_id || null,
          station_name: logExternalForm.station_or_vendor || 'Unknown station',
          amount_ngn: amount,
          reason: `Logged externally — paid outside the platform.${logExternalForm.notes ? ` ${logExternalForm.notes}` : ''}`,
          status: 'payment_sent',
          payment_sent_at: paidAt,
          logged_externally: true,
        }).select('*').single();
        if (error) throw error;
        await logAudit('fuel_logged_externally', `Fuel purchase logged as paid outside the platform for ${employeeName} (${formatNaira(amount)})`, profile);
        setShowLogExternalForm(false);
        setLogExternalForm(EMPTY_LOG_EXTERNAL_FORM);
        if (inserted) setUploadingReceiptFor(enrich([inserted], staff)[0] as FuelRequest);
      } else {
        const description = logExternalForm.notes || 'Repair — paid outside the platform';
        const { data: newId, error } = await supabase.rpc('log_external_repair_purchase', {
          p_employee_id: logExternalForm.employee_id,
          p_amount_ngn: amount,
          p_purchase_date: logExternalForm.purchase_date,
          p_description: description,
          p_vendor_name: logExternalForm.station_or_vendor || null,
          p_vehicle_id: logExternalForm.vehicle_id || null,
        });
        if (error) throw error;
        await logAudit('repair_logged_externally', `Repair purchase logged as paid outside the platform for ${employeeName} (${formatNaira(amount)})`, profile);
        setShowLogExternalForm(false);
        setLogExternalForm(EMPTY_LOG_EXTERNAL_FORM);
        if (newId) {
          setUploadingRepairReceiptFor({
            id: newId as string,
            description,
            amount_ngn: amount,
            vehicle_id: logExternalForm.vehicle_id || null,
            service_type: null,
            maintenance_item_id: null,
            repair_odometer_km: null,
            vendor_name: logExternalForm.station_or_vendor || null,
            date: logExternalForm.purchase_date,
          });
          setRepairReceiptUploadVendor(logExternalForm.station_or_vendor || '');
          setRepairReceiptUploadDate(logExternalForm.purchase_date);
        }
      }
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Could not log purchase', description: friendlyDbError(err) || err?.message, variant: 'destructive' });
    } finally {
      setSubmittingLogExternal(false);
    }
  };

  const submitTripLog = async () => {
    if (!tripForm.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    // Block future-dated trip logs — common typo and breaks reporting.
    if (tripForm.date) {
      const today = new Date().toISOString().slice(0, 10);
      if (tripForm.date > today) {
        toast({ title: 'Trip date cannot be in the future', variant: 'destructive' });
        return;
      }
    }
    const start = parseFloat(tripForm.odometer_start);
    const end = parseFloat(tripForm.odometer_end);
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      toast({ title: 'Invalid odometer', description: 'End reading must be ≥ start reading.', variant: 'destructive' });
      return;
    }
    const km = Number.isFinite(end - start) && tripForm.odometer_start && tripForm.odometer_end ? end - start : null;
    setSubmitting(true);
    const { error } = await supabase.from('trip_logs').insert({
      driver_id: tripForm.employee_id,
      vehicle_id: tripForm.vehicle_id || null,
      date: tripForm.date,
      start_location: tripForm.start_location,
      end_location: tripForm.end_location,
      odometer_start: Number.isFinite(start) ? start : null,
      odometer_end: Number.isFinite(end) ? end : null,
      km_driven: km,
      fuel_amount_ngn: parseFloat(tripForm.fuel_amount_ngn) || null,
      litres: parseFloat(tripForm.litres) || null,
      issues: tripForm.issues || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Update vehicle fuel balance: deduct estimated consumption, add any litres purchased
      if (tripForm.vehicle_id) {
        const veh = vehicles.find((v) => v.id === tripForm.vehicle_id);
        if (veh) {
          const eff = veh.avg_km_per_litre > 0 ? veh.avg_km_per_litre : null;
          const consumed = km && km > 0 && eff ? km / eff : 0;
          const litresPurchased = parseFloat(tripForm.litres) || 0;
          const cap = veh.tank_capacity_litres || 60;
          const newBalance = Math.min(cap, Math.max(0, (veh.current_fuel_litres || 0) - consumed + litresPurchased));
          const updatePayload: Record<string, unknown> = { current_fuel_litres: newBalance };
          if (litresPurchased > 0) updatePayload.last_refuel_at = new Date().toISOString();
          await supabase.from('vehicles').update(updatePayload).eq('id', veh.id);
        }
      }
      await logAudit(
        'trip_log_submitted',
        `Trip log ${tripForm.start_location} → ${tripForm.end_location} (${km ?? '—'} km)`,
        profile,
      );
      toast({ title: 'Trip log submitted' });
      setShowTripForm(false);
      setTripForm({
        employee_id: profile?.id || '',
        vehicle_id: '',
        date: today,
        start_location: '',
        end_location: '',
        odometer_start: '',
        odometer_end: '',
        fuel_amount_ngn: '',
        litres: '',
        issues: '',
      });
      fetchData();
    }
    setSubmitting(false);
  };

  const [rejectingFuel, setRejectingFuel] = useState<FuelRequest | null>(null);
  const [fuelRejectReason, setFuelRejectReason] = useState('');
  const [reRequestTarget, setReRequestTarget] = useState<FuelRequest | null>(null);
  const [reRequestNote, setReRequestNote] = useState('');
  const [confirmDeleteFuel, setConfirmDeleteFuel] = useState<FuelRequest | null>(null);
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState<TripLog | null>(null);

  // Trip log detail / edit
  const canEditTrip = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [selectedTrip, setSelectedTrip] = useState<TripLog | null>(null);
  const [tripEditMode, setTripEditMode] = useState(false);
  const [savingTripEdit, setSavingTripEdit] = useState(false);
  const [tripEditForm, setTripEditForm] = useState({
    date: '',
    start_location: '',
    end_location: '',
    odometer_start: '',
    odometer_end: '',
    fuel_amount_ngn: '',
    litres: '',
    issues: '',
  });

  const openTripDetail = (t: TripLog) => {
    setSelectedTrip(t);
    setTripEditMode(false);
    setTripEditForm({
      date: t.date,
      start_location: t.start_location,
      end_location: t.end_location,
      odometer_start: t.odometer_start != null ? String(t.odometer_start) : '',
      odometer_end: t.odometer_end != null ? String(t.odometer_end) : '',
      fuel_amount_ngn: t.fuel_amount_ngn != null ? String(t.fuel_amount_ngn) : '',
      litres: t.litres != null ? String(t.litres) : '',
      issues: t.issues || '',
    });
  };

  const saveTripEdit = async () => {
    if (!selectedTrip) return;
    const start = parseFloat(tripEditForm.odometer_start);
    const end = parseFloat(tripEditForm.odometer_end);
    const hasOdo = Number.isFinite(start) && Number.isFinite(end) && tripEditForm.odometer_start && tripEditForm.odometer_end;
    const km = hasOdo ? end - start : selectedTrip.km_driven;
    const newLitres = parseFloat(tripEditForm.litres) || null;

    // Re-run anomaly detection whenever odometer values change
    const { isAnomaly: editIsAnomaly, reason: editAnomalyReason } = (hasOdo && km != null)
      ? detectAnomalies(km, selectedTrip.duration_minutes || 0)
      : { isAnomaly: selectedTrip.is_anomaly, reason: selectedTrip.anomaly_reason };

    setSavingTripEdit(true);
    const { error } = await supabase
      .from('trip_logs')
      .update({
        date: tripEditForm.date,
        start_location: tripEditForm.start_location,
        end_location: tripEditForm.end_location,
        odometer_start: Number.isFinite(start) ? start : null,
        odometer_end: Number.isFinite(end) ? end : null,
        km_driven: km,
        fuel_amount_ngn: parseFloat(tripEditForm.fuel_amount_ngn) || null,
        litres: newLitres,
        issues: tripEditForm.issues || null,
        is_anomaly: editIsAnomaly,
        anomaly_reason: editAnomalyReason,
      })
      .eq('id', selectedTrip.id);
    setSavingTripEdit(false);
    if (error) {
      toast({ title: 'Could not save', description: friendlyDbError(error), variant: 'destructive' });
    } else {
      // Recalculate vehicle fuel balance when litres or distance changed
      const kmChanged = km !== selectedTrip.km_driven;
      const litresChanged = newLitres !== selectedTrip.litres;
      if (selectedTrip.vehicle_id && (kmChanged || litresChanged)) {
        const veh = vehicles.find((v) => v.id === selectedTrip.vehicle_id);
        if (veh) {
          const rate = veh.fuel_consumption_rate_lkm > 0
            ? veh.fuel_consumption_rate_lkm
            : veh.avg_km_per_litre > 0 ? 1 / veh.avg_km_per_litre : null;
          const origConsumed = selectedTrip.km_driven && selectedTrip.km_driven > 0 && rate ? selectedTrip.km_driven * rate : 0;
          const newConsumed  = km && km > 0 && rate ? km * rate : 0;
          const origBought   = selectedTrip.litres || 0;
          const newBought    = newLitres || 0;
          const delta = (-newConsumed + newBought) - (-origConsumed + origBought);
          if (Math.abs(delta) > 0.01) {
            const cap = veh.tank_capacity_litres || 60;
            const newBalance = Math.min(cap, Math.max(0, (veh.current_fuel_litres || 0) + delta));
            await supabase.from('vehicles').update({ current_fuel_litres: newBalance }).eq('id', veh.id);
            await logAudit(
              'trip_fuel_adjusted',
              `Trip edit adjusted ${veh.plate_number} fuel balance by ${delta > 0 ? '+' : ''}${delta.toFixed(1)} L (now ${newBalance.toFixed(1)} L)`,
              profile,
            );
          }
        }
      }
      toast({ title: 'Trip log updated' });
      setSelectedTrip(null);
      setTripEditMode(false);
      await fetchData();
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
    // Concurrency guard: only flip to 'approved' if still 'pending'. Two
    // admins racing on the same request both pass the client check, but
    // only one wins the transition — the other gets a stale-state toast
    // instead of triggering a second Paystack auto-pay block below.
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
      await fetchData();
      return;
    }
    // Mirror approval onto the paired expense row (created when the fuel
    // request was submitted). The status flip routes through approve_expense
    // RPC so cap/audit/co-approval rules apply. Insert a fresh pending row
    // first if the legacy fuel request pre-dates the fuel_request_id link.
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
    if (expenseIdForApproval && (existingExp as any)?.status !== 'approved') {
      try { await approveExpense(expenseIdForApproval); }
      catch (err: any) { expErr = { message: err?.message || 'approve_expense failed' }; }
    }
    if (expErr) {
      toast({
        title: 'Approved, but expense entry failed',
        description: expErr.message,
        variant: 'destructive',
      });
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

    // Update vehicle fuel balance when a vehicle was specified on the request
    if ((request as any).vehicle_id && request.litres_est && request.litres_est > 0) {
      const veh = vehicles.find((v) => v.id === (request as any).vehicle_id);
      if (veh) {
        const newBalance = Math.min(veh.current_fuel_litres + request.litres_est, veh.tank_capacity_litres);
        await supabase
          .from('vehicles')
          .update({ current_fuel_litres: newBalance, last_refuel_at: now })
          .eq('id', veh.id);
      }
    }

    // Phase 2 — fuel-reimbursement batch lands in pending_approval and waits
    // for an explicit approver action in BatchDetail. Auto-funding here used
    // to insert the batch in 'approved' (B-2 / B-6 path: cap RPC bypassed +
    // single-actor approval). The new flow creates the batch + line item +
    // fuel→batch link and stops, surfacing it on the approver's queue.
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
          await supabase.from('fuel_requests').update({ batch_id: batch.id }).eq('id', request.id);
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
    // Fire smart-alerts for budget thresholds (best-effort)
    if ((request as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (request as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    fetchData();
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
    // Update the linked expense (created at submission) instead of
    // inserting a new one. Falls back to insert for legacy fuel rows
    // pre-dating fuel_request_id.
    const { data: expExisting } = await supabase
      .from('expenses')
      .select('id')
      .eq('fuel_request_id', r.id)
      .maybeSingle();
    let exceptionExpenseId: string | undefined = (expExisting as any)?.id;
    if (exceptionExpenseId) {
      await supabase.from('expenses').update({
        description: `Fuel — ${r.station_name || 'Station'} — ${r.reason || 'Fuel request'} [Budget Exception]`,
      }).eq('id', exceptionExpenseId);
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
    // Fire smart-alerts for budget thresholds (best-effort)
    if ((r as any).vehicle_id) {
      supabase.functions.invoke('fleet-alerts', {
        body: { event: 'fuel_approved', vehicle_id: (r as any).vehicle_id },
      }).catch(() => {/* best-effort */});
    }
    fetchData();
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
      await fetchData();
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
    fetchData();
  };

  const openElaAnalysis = async (id: string, url: string) => {
    setElaTarget({ id, url });
    setElaResult(null);
    setElaError('');
    setElaLoading(true);
    try {
      const result = await generateElaHeatmap(url);
      setElaResult({ heatmapDataUrl: result.heatmapDataUrl, avgBrightness: result.avgBrightness });
    } catch (err: any) {
      setElaError(err?.message || "Couldn't generate analysis for this image.");
    } finally {
      setElaLoading(false);
    }
  };

  const submitFuelReceipt = async () => {
    if (!uploadingReceiptFor || !receiptFile) {
      toast({ title: 'Please select a receipt file', variant: 'destructive' });
      return;
    }
    setSubmittingReceipt(true);
    try {
      // Hash the RAW file before watermarking — the watermark burns in the
      // current timestamp, so two uploads of the identical source photo
      // would otherwise hash differently every time and duplicate
      // detection would never fire. This hash is used only for duplicate
      // detection; receiptSha256 (below, post-watermark) stays the
      // tamper-evidence hash matched against what's actually in storage.
      const originalSha256 = await hashFile(receiptFile);
      // Informational only — see receiptForensics.ts for why this must
      // never drive is_anomaly on its own. Also read on the raw file:
      // watermarking/compression re-encodes via canvas, which strips
      // EXIF from every image regardless of origin.
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

      // Free anomaly cross-checks — all client-computable, no paid API:
      //   1. Pump-price divergence — implied ₦/L vs the fleet benchmark.
      //   2. Amount mismatch — receipt total vs what was requested.
      //   3. Duplicate receipt — this exact image already used elsewhere.
      //   4. OCR low-confidence — scan ran but found nothing decision-critical
      //      (e.g. the wrong kind of document was photographed).
      // Every trip both (a) sets is_anomaly/anomaly_type so it surfaces in
      // the same Anomalies view as request-time flags, and (b) notifies
      // admin/finance immediately — this used to only land in a free-text
      // admin_note nobody was pinged about.
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

      // Math cross-validation: Amount ≈ Litres × BenchmarkPrice
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

      // Fuel request frequency — same driver requesting too often
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

      // Route efficiency: expected vs actual fuel consumption
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

      // Odometer regression — detect if this vehicle's recent trips show
      // suspicious odometer patterns (e.g. regression or implausible jumps).
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

      // Severity scoring across all flags
      const severity = scoreAnomalySeverity(flags.map((f) => f.type));

      // EXIF absence is too common on legitimate photos (WhatsApp/Telegram
      // strip it) to justify a flag on its own — it only ever rides along
      // as extra context on a receipt something else has already flagged.
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

        // In-app + push for ALL flagged receipts
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'fuel_receipt_anomaly',
          module: 'fleet',
          priority: severity === 'critical' || severity === 'high' ? 'high' : 'normal',
          title: `Fuel receipt flagged (${severity})`,
          body: `${driverName}'s receipt at ${stationName}: ${flagSummary}`,
        });

        // Email escalation for high + critical severity
        if (severity === 'high' || severity === 'critical') {
          void notifyAnomalyToAdmins({
            title: `Fleet anomaly: ${severity} severity on fuel receipt`,
            summary: `${driverName}'s receipt at ${stationName} — ${flags.length} flag${flags.length > 1 ? 's' : ''}: ${flagSummary}`,
            severity,
            link: `${window.location.origin}/fleet`,
          });
        }

        // WhatsApp/SMS escalation for critical severity — reaches admins
        // even when they're not looking at the app.
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
      // Propagate receipt_url to the linked expense row so finance can see
      // it on the Expenses page without switching to Fleet.
      await supabase
        .from('expenses')
        .update({ receipt_url: urlData.publicUrl, receipt_sha256: receiptSha256 })
        .eq('fuel_request_id', uploadingReceiptFor.id);
      // CHANGE 2 — bump vehicle fuel level from actual litres filled
      const litresFilledNum = parseFloat(receiptForm.litres_filled) || 0;
      const receiptVehicleId = (uploadingReceiptFor as any).vehicle_id as string | null;
      if (receiptVehicleId && litresFilledNum > 0) {
        const veh = vehicles.find((v) => v.id === receiptVehicleId);
        if (veh) {
          const cap = veh.tank_capacity_litres || 60;
          const newLevel = Math.min(cap, (veh.current_fuel_litres || 0) + litresFilledNum);
          await supabase.from('vehicles').update({
            current_fuel_litres: newLevel,
            last_refuel_at: new Date().toISOString(),
          }).eq('id', receiptVehicleId);
          await supabase.from('fuel_level_logs').insert({
            vehicle_id: receiptVehicleId,
            event_type: 'fuel_added',
            amount_litres: litresFilledNum,
            resulting_level_litres: newLevel,
            reference_id: uploadingReceiptFor.id,
          });
        }
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
      fetchData();
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
      await fetchData();
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
    fetchData();
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
    fetchData();
  };

  const confirmFuelReject = async () => {
    if (!rejectingFuel) return;
    if (!isValidRejectionReason(fuelRejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const r = rejectingFuel;
    const { error } = await supabase
      .from('fuel_requests')
      .update({
        status: 'rejected',
        rejection_reason: fuelRejectReason.trim(),
        admin_note: fuelRejectReason.trim(),
      })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    // Mirror the rejection onto the linked expense row so finance no
    // longer sees it as actionable in Expenses. Routes through reject_expense
    // RPC because direct status flips from authenticated are now blocked by
    // enforce_expense_approval_state_writes.
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
    fetchData();
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
    fetchData();
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
    fetchData();
  };

  const deleteFuelRequest = async (r: FuelRequest) => {
    // Remove uploaded receipt + supporting doc from storage so we don't
    // leak orphan files. Best-effort: ignore errors here, the row delete
    // is what the user actually asked for.
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
    await logAudit('fuel_request_deleted', `Fuel request for ${r.employee_name} deleted (${formatNaira(r.amount_ngn || 0)})`, profile);
    toast({ title: 'Fuel request deleted' });
    setConfirmDeleteFuel(null);
    fetchData();
  };

  const deleteTripLog = async (t: TripLog) => {
    const { error } = await supabase.from('trip_logs').delete().eq('id', t.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('trip_log_deleted', `Trip log deleted: ${t.start_location} → ${t.end_location}`, profile);
    toast({ title: 'Trip log deleted' });
    setConfirmDeleteTrip(null);
    fetchData();
  };

  const handleAnomalyReview = async () => {
    if (!reviewingAnomaly || !anomalyReviewDecision || !anomalyReviewNote.trim()) return;
    setSubmittingAnomalyReview(true);
    const reviewedAt = new Date().toISOString();
    const reviewPayload = {
      anomaly_reviewed_by: profile?.id,
      anomaly_reviewed_at: reviewedAt,
      anomaly_review_note: `${anomalyReviewDecision === 'valid' ? 'Reviewed — Valid' : 'Fraudulent / Error'}: ${anomalyReviewNote.trim()}`,
    };
    const table = reviewingAnomaly.type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update(reviewPayload).eq('id', reviewingAnomaly.id);
    setSubmittingAnomalyReview(false);
    if (error) {
      toast({ title: 'Review failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'anomaly_reviewed',
      `Anomaly on ${reviewingAnomaly.type} "${reviewingAnomaly.label}" marked as ${anomalyReviewDecision === 'valid' ? 'Valid' : 'Fraudulent/Error'}: ${anomalyReviewNote.trim()}`,
      profile,
    );
    toast({ title: 'Anomaly review saved' });
    setReviewingAnomaly(null);
    setAnomalyReviewDecision('');
    setAnomalyReviewNote('');
    fetchData();
  };

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
    fetchData();
  };

  const deleteAnomalyRecord = async (type: 'trip' | 'fuel', id: string, label: string) => {
    const table = type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('anomaly_record_deleted', `${type} "${label}" deleted from anomalies`, profile);
    toast({ title: 'Record deleted' });
    fetchData();
  };

  const myFuelRequests = useMemo(() => fuelRequests.filter((r) => r.employee_id === profile?.id), [fuelRequests, profile?.id]);
  const myTripLogs = useMemo(() => tripLogs.filter((r) => r.employee_id === profile?.id), [tripLogs, profile?.id]);
  const visibleFuel = useMemo(() => {
    const base = isAdmin ? fuelRequests : myFuelRequests;
    if (fuelStatusFilter === 'all') return base;
    return base.filter((r) => r.status === fuelStatusFilter);
  }, [isAdmin, fuelRequests, myFuelRequests, fuelStatusFilter]);

  if (loading) return <TableSkeleton rows={5} />;

  // Phase 4 — service alerts (vehicles with expiries within 30 days)
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30Str = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const serviceAlerts = isAdmin
    ? vehicles.filter(
        (v) =>
          (v.insurance_expiry && v.insurance_expiry <= in30Str) ||
          (v.road_worthiness_expiry && v.road_worthiness_expiry <= in30Str) ||
          (v.next_service_date && v.next_service_date <= in30Str),
      )
    : [];

  const visibleTrips = isAdmin ? tripLogs : myTripLogs;

  const anomalousTrips = tripLogs.filter((t) => t.is_anomaly || t.is_out_of_area);
  const anomalousFuelReqs = fuelRequests.filter((r) => r.is_anomaly);
  const totalAnomalies = anomalousTrips.length + anomalousFuelReqs.length;

  const fleetAvgEfficiency = (() => {
    let totalKm = 0;
    let totalLitres = 0;
    for (const t of visibleTrips) {
      if (t.km_driven && t.litres && t.km_driven > 0 && t.litres > 0) {
        totalKm += t.km_driven;
        totalLitres += t.litres;
      }
    }
    return totalLitres > 0 ? (totalKm / totalLitres).toFixed(1) : null;
  })();

  const pendingFuelCount = fuelRequests.filter((r) => r.status === 'pending').length;
  const activeVehicleCount = vehicles.filter((v) => (v as any).status !== 'retired').length;

  return (
    <div className="space-y-6">
      {/* Mission control hero */}
      <AuroraHero className="p-5 sm:p-6" scanLine={totalAnomalies > 0} pattern="route">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fleet</span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {totalAnomalies > 0 ? `${totalAnomalies} anomal${totalAnomalies === 1 ? 'y' : 'ies'} flagged` : 'Fleet running smoothly'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {isAdmin
                ? 'Review fuel requests, trip logs, and keep the fleet on the road.'
                : 'Submit fuel requests and daily trip logs.'}
            </p>
          </div>
          {/* Live status pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
              <Car className="h-3 w-3" /> {activeVehicleCount} active vehicle{activeVehicleCount === 1 ? '' : 's'}
            </span>
            {isAdmin && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
                <Fuel className="h-3 w-3" />
                <span className={`h-1.5 w-1.5 rounded-full ${pendingFuelCount > 0 ? 'bg-amber-300 kd-status-live-warning' : 'bg-emerald-400 kd-status-live-success'}`} />
                {pendingFuelCount} pending fuel
              </span>
            )}
            {totalAnomalies > 0 && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-300/30 text-xs font-medium">
                <AlertTriangle className="h-3 w-3 text-red-200" />
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 kd-status-live-danger" />
                {totalAnomalies} anomal{totalAnomalies === 1 ? 'y' : 'ies'}
              </span>
            )}
            <button
              type="button"
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium hover:bg-muted/80 transition-colors"
              title="Refresh fleet data"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
          </div>
        </div>
      </AuroraHero>

      {/* Service alerts shown as a compact banner outside of tabs for quick visibility */}
      {serviceAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {serviceAlerts.map((v) => (
            <ServiceAlert key={v.id} v={v} todayStr={todayStr} in30Str={in30Str} />
          ))}
        </div>
      )}

      {/* ─── Horizontal tab strip (both mobile & desktop) ─── */}
      <div className="-mx-4 md:-mx-5 lg:-mx-6 px-4 md:px-5 lg:px-6 sticky top-14 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 -mt-1 pt-1 pb-1.5">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-0.5 min-w-max">
            {/* Group separators use a subtle dot on desktop */}
            {[
              { group: 'overview', items: [
                ...(isAdmin ? [{ icon: LayoutDashboard, label: 'Dashboard', value: 'dashboard' as const }] : []),
                { icon: User, label: 'My Requests', value: 'my_requests' as const },
              ]},
              { group: 'operations', items: [
                ...(isAdmin ? [{ icon: Fuel, label: 'Fuel', value: 'fuel' as const, badge: pendingFuelCount > 0 ? String(pendingFuelCount) : undefined }] : []),
                { icon: MapPin, label: 'Trips', value: 'trips' as const },
                ...(isAdmin ? [
                  { icon: Radio, label: 'Live', value: 'live' as const, live: true },
                  { icon: History, label: 'Activity', value: 'activity' as const },
                ] : []),
              ]},
              { group: 'fleet', items: [
                { icon: Car, label: 'Vehicles', value: 'vehicles' as const },
                ...(isAdmin ? [
                  { icon: Wrench, label: 'Maintenance', value: 'maintenance' as const },
                  { icon: TrendingUp, label: 'Lifecycle', value: 'lifecycle' as const },
                ] : []),
                { icon: ClipboardCheck, label: 'Inspections', value: 'inspections' as const },
                { icon: ClipboardCheck, label: 'Compliance', value: 'compliance' as const },
              ]},
              { group: 'safety', items: [
                ...(isAdmin ? [
                  { icon: AlertTriangle, label: 'Anomalies', value: 'anomalies' as const, badge: totalAnomalies > 0 ? (totalAnomalies > 9 ? '9+' : String(totalAnomalies)) : undefined },
                ] : []),
                { icon: AlertTriangle, label: 'Incidents', value: 'incidents' as const },
                ...(isAdmin ? [
                  { icon: Shield, label: 'Geofences', value: 'geofences' as const },
                  { icon: UserCheck, label: 'Drivers', value: 'drivers' as const },
                ] : []),
              ]},
            ].filter(g => g.items.length > 0).map((group, gi) => (
              <div key={group.group} className="contents">
                {gi > 0 && <span className="w-px h-4 bg-border/60 mx-1 shrink-0" />}
                {group.items.map((item) => {
                  const isActive = tab === item.value;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTab(item.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {(item as any).live && (
                        <span className="relative flex h-1.5 w-1.5 -ml-0.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                        </span>
                      )}
                      <span>{item.label}</span>
                      {(item as any).badge && (
                        <span className="inline-flex items-center justify-center rounded-full text-[9px] font-bold min-w-[16px] h-4 px-1 bg-amber-500 text-white">
                          {(item as any).badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Sub-page back arrow ─── */}
      {tab !== 'dashboard' && tab !== 'my_requests' && (
        <SubPageHeader
          parentTitle="Fleet"
          currentTitle={{
            fuel: 'Fuel Requests', trips: 'Trip Logs', vehicles: 'Vehicles',
            activity: 'Activity', anomalies: 'Anomalies', geofences: 'Geofences',
            live: 'Live Tracking', compliance: 'Compliance', drivers: 'Drivers',
            incidents: 'Incidents', maintenance: 'Maintenance', inspections: 'Inspections',
            lifecycle: 'Lifecycle',
          }[tab] ?? tab}
          onBack={() => setTab(isAdmin ? 'dashboard' : 'my_requests')}
        />
      )}

      {/* ─── Content ─── */}
      <div>
        <main className="flex-1 min-w-0">

        {/* DASHBOARD */}
        {isAdmin && tab === 'dashboard' && (
          <div className="space-y-4">
            <FleetInsightsPanel vehicles={vehicles as any} onNavigate={(t) => setTab(t as any)} />
            <FleetAnalyticsDashboard vehicles={vehicles} staff={staff} onNavigateToVehicles={() => setTab('vehicles')} />
            <FuelCostOptimizer vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, plate_number: v.plate_number }))} />
            <FleetBudgetForecaster />
            <FuelPriceIntelligence />
            <FuelStationComparison />
            <DriverLeaderboard />
            <DriverScorecard />
            {serviceAlerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> Document Expiry Alerts
                </h2>
                <div className="flex flex-col gap-2">
                  {serviceAlerts.map((v) => (
                    <ServiceAlert key={v.id} v={v} todayStr={todayStr} in30Str={in30Str} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* FUEL */}
        {tab === 'fuel' && (
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
            <Button variant="outline" onClick={() => { setLogExternalType('fuel'); setLogExternalForm(EMPTY_LOG_EXTERNAL_FORM); setShowLogExternalForm(true); }}>
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
                                    <DropdownMenuItem onClick={() => openElaAnalysis(r.id, r.receipt_url!)}>
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
                                <DropdownMenuItem onClick={() => openElaAnalysis(r.id, r.receipt_url!)}>
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

              {/* Mobile fuel requests — thumb-friendly card list */}
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

                      {/* Admin actions, condensed for mobile */}
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
        )}

        {/* TRIPS */}
        {tab === 'trips' && (
          <div className="space-y-4">
          <div className="flex justify-end gap-2 flex-wrap">
            {isAdmin && visibleTrips.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportCsv(
                visibleTrips.map((t) => ({
                  date: t.date,
                  employee: t.employee_name,
                  vehicle: vehicles.find((v) => v.id === t.vehicle_id)?.plate_number ?? '',
                  start_time: t.trip_start_time ?? '',
                  end_time: t.trip_end_time ?? '',
                  duration_min: t.duration_minutes ?? '',
                  start_location: t.start_location,
                  end_location: t.end_location,
                  km_driven: t.km_driven ?? '',
                  fuel_ngn: t.fuel_amount_ngn ?? '',
                  litres: t.litres ?? '',
                  status: t.status,
                  is_anomaly: t.is_anomaly ? 'yes' : '',
                  is_out_of_area: t.is_out_of_area ? 'yes' : '',
                  anomaly_reason: t.anomaly_reason ?? '',
                })),
                `trip-logs-${new Date().toISOString().slice(0, 10)}.csv`,
              )}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
            {!activeTrip && (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={openStartTrip}
              >
                <Navigation className="h-4 w-4 mr-2" /> Start Trip
              </Button>
            )}
            <Button variant="outline" onClick={() => { setShowTripForm(true); prefillOdometer(profile?.id || ''); }}>
              <Plus className="mr-2 h-4 w-4" /> Log Trip Manually
            </Button>
          </div>

          {/* Active trip card — live clock-in panel */}
          {activeTrip && (
            <div className="rounded-lg border-2 border-green-500 bg-green-50 dark:border-green-700 dark:bg-green-950/20 p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-green-600 animate-pulse shrink-0" />
                  <span className="font-semibold text-green-800 dark:text-green-300 text-sm">Trip In Progress</span>
                </div>
                <div className="flex items-center gap-4">
                  {liveSpeed != null && (
                    <div className="flex items-center gap-1 text-sm">
                      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={`font-mono font-bold tabular-nums ${
                        liveSpeed > 100 ? 'text-red-600' : liveSpeed > 80 ? 'text-amber-600' : 'text-green-700 dark:text-green-400'
                      }`}>
                        {liveSpeed} km/h
                      </span>
                    </div>
                  )}
                  <span className="text-2xl font-mono font-bold text-green-700 dark:text-green-400 tabular-nums">
                    {formatDuration(elapsedSeconds)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Started</p>
                  <p className="font-medium">{activeTrip.trip_start_time ? formatDate(activeTrip.trip_start_time) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vehicle</p>
                  <p className="font-medium">{vehicles.find((v) => v.id === activeTrip.vehicle_id)?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Location</p>
                  <div className="text-xs">
                    <LocationCell location={activeTrip.start_location || ''} lat={activeTrip.start_lat} lng={activeTrip.start_lng} showCoords />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Odometer</p>
                  <p className="font-medium">{activeTrip.odometer_start != null ? `${activeTrip.odometer_start.toLocaleString()} km` : '—'}</p>
                </div>
                {(() => {
                  const av = vehicles.find((v) => v.id === activeTrip.vehicle_id);
                  if (!av || !av.tank_capacity_litres) return null;
                  const pct = Math.round(Math.min(100, (av.current_fuel_litres / av.tank_capacity_litres) * 100));
                  const col = pct < 25 ? 'text-red-600' : pct < 50 ? 'text-amber-600' : 'text-green-700 dark:text-green-400';
                  return (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Fuel Level</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-medium tabular-nums shrink-0 ${col}`}>
                          {pct}% · {av.current_fuel_litres.toFixed(1)} L
                          {pct < 25 && ' ⚠'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Live GPS tracking status */}
              {lastBreadcrumbAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-green-200 dark:border-green-800 pt-2">
                  <Radio className="h-3 w-3 text-green-500 animate-pulse shrink-0" />
                  <span>
                    GPS tracking active · Last ping {formatTime(lastBreadcrumbAt)} · {breadcrumbCount} pings recorded
                  </span>
                </div>
              )}
              <div className="flex gap-2 pt-1 border-t border-green-200 dark:border-green-800">
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={openEndTrip}>
                  <Navigation className="h-4 w-4 mr-2 rotate-180" /> End Trip
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmCancelTrip(true)}>
                  Cancel Trip
                </Button>
              </div>
            </div>
          )}

          {/* Admin: Live trips overview */}
          {isAdmin && (() => {
            const liveTrips = tripLogs.filter((t) => t.status === 'in_progress');
            if (!liveTrips.length) return null;
            return (
              <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-green-600 animate-pulse shrink-0" />
                  <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {liveTrips.length} Live Trip{liveTrips.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {liveTrips.map((t) => {
                    const lv = vehicles.find((v) => v.id === t.vehicle_id);
                    const elSec = t.trip_start_time ? Math.floor((Date.now() - Date.parse(t.trip_start_time)) / 1000) : null;
                    return (
                      <div key={t.id} className="bg-white dark:bg-green-950/40 rounded border border-green-200 dark:border-green-800 px-3 py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{t.employee_name}</span>
                          {elSec != null && (
                            <span className="text-xs font-mono text-green-700 dark:text-green-400 shrink-0">{formatDuration(elSec)}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{lv ? `${lv.plate_number} — ${lv.name}` : '—'}</p>
                        <div className="text-xs text-muted-foreground">From: <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Today's trip stats */}
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayDone = visibleTrips.filter((t) => t.date === todayStr && t.status === 'completed');
            if (!todayDone.length) return null;
            const todayKm = todayDone.reduce((s, t) => s + (t.km_driven || 0), 0);
            const todayL  = todayDone.reduce((s, t) => s + (t.litres   || 0), 0);
            return (
              <div className="flex items-center gap-3 text-sm px-1 flex-wrap">
                <span className="font-semibold text-foreground">Today</span>
                <span className="text-muted-foreground">{todayDone.length} trip{todayDone.length > 1 ? 's' : ''} completed</span>
                <span className="text-muted-foreground">{todayKm.toLocaleString()} km</span>
                {todayL > 0 && <span className="text-muted-foreground">{todayL.toFixed(1)} L used</span>}
              </div>
            );
          })()}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmin ? 'All Trip Logs' : 'My Trip Logs'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Start Location</TableHead>
                    <TableHead>End Location</TableHead>
                    <TableHead className="text-right">Distance (km)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Anomaly</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTrips.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin ? 11 : 10}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No trip logs yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleTrips.map((t) => (
                    <TableRow
                      key={t.id}
                      className={`cursor-pointer hover:bg-muted/50 ${t.is_anomaly ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                      onClick={() => openTripDetail(t)}
                    >
                      <TableCell className="font-medium">{t.employee_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.date)}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.trip_start_time ? formatTime(t.trip_start_time) : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.trip_end_time
                          ? formatTime(t.trip_end_time)
                          : t.status === 'in_progress' ? <span className="text-green-600 font-medium">Live</span> : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.duration_minutes != null
                          ? `${Math.floor(t.duration_minutes / 60)}h ${t.duration_minutes % 60}m`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px]">
                        <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords />
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px]">
                        {t.end_location
                          ? <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                          : t.status === 'in_progress' ? <span className="text-green-600 italic">In progress…</span> : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.km_driven != null ? t.km_driven.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            t.status === 'in_progress'
                              ? 'border-green-400 text-green-700 bg-green-50'
                              : t.status === 'completed'
                              ? 'border-blue-300 text-blue-700 bg-blue-50'
                              : ''
                          }
                        >
                          {t.status === 'in_progress' ? 'In Progress' : t.status === 'completed' ? 'Completed' : t.status || 'Completed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.is_anomaly ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium cursor-help">
                                <AlertTriangle className="h-3.5 w-3.5" /> Flag
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">{t.anomaly_reason}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {(t.start_lat != null || t.end_lat != null) && (
                              <Button size="sm" variant="ghost" onClick={() => openTripMap(t)} title="View map">
                                <MapIcon className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteTrip(t)} title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile card list — same data, thumb-friendly */}
              <div className="md:hidden p-3 space-y-2">
                {visibleTrips.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">No trip logs yet.</p>
                ) : visibleTrips.map((t) => {
                  const isLive = t.status === 'in_progress';
                  const accent =
                    isLive ? 'bg-green-500'
                    : t.is_anomaly ? 'bg-red-500'
                    : t.status === 'completed' ? 'bg-blue-500'
                    : 'bg-muted-foreground';
                  return (
                    <MobileCard
                      key={t.id}
                      onClick={() => openTripDetail(t)}
                      accentClassName={accent}
                      className={t.is_anomaly ? 'bg-red-50/40 dark:bg-red-950/10' : ''}
                    >
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <MobileCardTitle>{t.employee_name}</MobileCardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDate(t.date)}
                            {t.trip_start_time && ` · ${formatTime(t.trip_start_time)}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {t.km_driven != null && (
                            <p className="text-base font-bold tabular-nums">{t.km_driven.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">km</span></p>
                          )}
                          {isLive ? (
                            <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50 mt-0.5">Live</Badge>
                          ) : t.duration_minutes != null && (
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              {Math.floor(t.duration_minutes / 60)}h {t.duration_minutes % 60}m
                            </p>
                          )}
                        </div>
                      </MobileCardHeader>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-10 shrink-0">From</span>
                          <span className="text-[11px] flex-1 min-w-0"><LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords /></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-10 shrink-0">To</span>
                          <span className="text-[11px] flex-1 min-w-0">
                            {t.end_location
                              ? <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                              : isLive ? <span className="text-green-600 italic">In progress…</span> : '—'}
                          </span>
                        </div>
                      </div>

                      {t.is_anomaly && t.anomaly_reason && (
                        <div className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-950/20 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="leading-snug">{t.anomaly_reason}</span>
                        </div>
                      )}

                      {isAdmin && (t.start_lat != null || t.end_lat != null) && (
                        <MobileCardFooter>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={(e) => { e.stopPropagation(); openTripMap(t); }}
                          >
                            <MapIcon className="h-4 w-4 mr-1.5 text-blue-600" /> View map
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 px-3 text-destructive"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteTrip(t); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  );
                })}
              </div>
              {fleetAvgEfficiency && visibleTrips.length > 0 && (
                <div className="px-4 py-2 border-t text-sm text-muted-foreground flex justify-end gap-2">
                  <span>Fleet average fuel efficiency:</span>
                  <span className="font-semibold text-foreground">{fleetAvgEfficiency} km/L</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {/* MY REQUESTS */}
        {tab === 'my_requests' && (
          <div className="space-y-4">
          {(() => {
            const fuelBlocked = (myReceiptDebt?.fuelOldestDays ?? -1) >= RECEIPT_DEBT_HARD_BLOCK_DAYS;
            const repairBlocked = (myReceiptDebt?.repairOldestDays ?? -1) >= RECEIPT_DEBT_HARD_BLOCK_DAYS;
            return (
              <div className="flex justify-end gap-2">
                {isAdmin && (
                  <Button variant="outline" onClick={() => { setLogExternalType('fuel'); setLogExternalForm(EMPTY_LOG_EXTERNAL_FORM); setShowLogExternalForm(true); }}>
                    <Receipt className="mr-2 h-4 w-4" /> Log External Purchase
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={repairBlocked ? 'cursor-not-allowed' : undefined}>
                      <Button variant="outline" disabled={repairBlocked} onClick={() => setShowRepairForm(true)}>
                        <Wrench className="mr-2 h-4 w-4" /> Repair Request
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {repairBlocked && <TooltipContent>Attach the receipt for your outstanding repair before requesting another.</TooltipContent>}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={fuelBlocked ? 'cursor-not-allowed' : undefined}>
                      <Button disabled={fuelBlocked} onClick={() => setShowFuelForm(true)}>
                        <Plus className="mr-2 h-4 w-4" /> New Fuel Request
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {fuelBlocked && <TooltipContent>Upload the receipt for your outstanding fuel payment before requesting again.</TooltipContent>}
                </Tooltip>
              </div>
            );
          })()}

          {/* Yellow action banners for payment_sent fuel requests */}
          {myFuelRequests.filter((r) => r.status === 'payment_sent').map((r) => {
            const days = daysSinceIso(r.payment_sent_at);
            const blocked = (days ?? -1) >= RECEIPT_DEBT_HARD_BLOCK_DAYS;
            return (
              <div
                key={r.id}
                className={cn(
                  'flex items-start gap-3 rounded-md border px-4 py-3',
                  blocked
                    ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
                )}
              >
                <AlertTriangle className={cn('h-5 w-5 mt-0.5 shrink-0', blocked ? 'text-red-600' : 'text-amber-600')} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Payment sent for {r.station_name} — {formatNaira(r.amount_ngn || 0)}</p>
                  <p className="text-xs mt-0.5">
                    {r.payment_sent_at ? `Sent on ${formatDate(r.payment_sent_at)}. ` : ''}
                    {blocked
                      ? `${days} days overdue — you cannot submit new fuel requests until this is resolved.`
                      : 'Please upload your fuel receipt to complete this request.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  className={cn('shrink-0 text-white', blocked ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}
                  onClick={() => {
                    setUploadingReceiptFor(r);
                    setReceiptFile(null);
                    setReceiptScanWarning('');
                    setReceiptForm({ fuel_station_name: r.station_name || '', amount_ngn: r.amount_ngn ? String(r.amount_ngn) : '', litres_filled: '', receipt_date: '', notes: '' });
                  }}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Receipt
                </Button>
              </div>
            );
          })}

          {/* Banners for repairs still missing a receipt */}
          {myOpenRepairs.map((r) => {
            const days = daysSinceIso(r.created_at);
            const blocked = (days ?? -1) >= RECEIPT_DEBT_HARD_BLOCK_DAYS;
            return (
              <div
                key={r.id}
                className={cn(
                  'flex items-start gap-3 rounded-md border px-4 py-3',
                  blocked
                    ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
                )}
              >
                <Wrench className={cn('h-5 w-5 mt-0.5 shrink-0', blocked ? 'text-red-600' : 'text-amber-600')} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Repair receipt needed — {r.description || 'Repair'} — {formatNaira(r.amount_ngn || 0)}</p>
                  <p className="text-xs mt-0.5">
                    {blocked
                      ? `${days} days overdue — you cannot submit new repair requests until this is resolved.`
                      : `Submitted ${formatDate(r.created_at)}. Attach the receipt when you have it.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  className={cn('shrink-0 text-white', blocked ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}
                  onClick={() => {
                    setUploadingRepairReceiptFor(r);
                    setRepairReceiptUploadFile(null);
                    setRepairReceiptUploadVendor(r.vendor_name || '');
                    setRepairReceiptUploadDate(r.date || new Date().toISOString().slice(0, 10));
                  }}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Attach Receipt
                </Button>
              </div>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Fuel Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myFuelRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                        You have no fuel requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {myFuelRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.station_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(r.amount_ngn || 0)}</TableCell>
                      <TableCell className="text-right">{r.litres_est ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.reason || '—'}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        {r.status === 'payment_sent' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              setUploadingReceiptFor(r);
                              setReceiptFile(null);
                              setReceiptScanWarning('');
                              setReceiptForm({ fuel_station_name: r.station_name || '', amount_ngn: r.amount_ngn ? String(r.amount_ngn) : '', litres_filled: '', receipt_date: '', notes: '' });
                            }}
                          >
                            <Upload className="h-3 w-3 mr-1" /> Upload Receipt
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* ACTIVITY — admin only */}
        {isAdmin && tab === 'activity' && (
          <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fleet Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No fleet activity recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {activityLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium capitalize">
                        {(log.action_type || '').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                        {log.description || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.performed_by_name || log.performed_by?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.created_at ? formatDate(log.created_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* VEHICLES */}
        {tab === 'vehicles' && (
          <VehiclesTab staff={staff} />
        )}

        {/* ANOMALIES */}
        {isAdmin && tab === 'anomalies' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Flagged Trip Logs
                <span className="text-xs text-muted-foreground font-normal">({anomalousTrips.length})</span>
              </h2>
              {anomalousTrips.length === 0 ? (
                <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous trips" description="All trip logs look normal. Anything unusual will surface here." /></CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Flags</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reviewed</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalousTrips.map((t) => (
                          <TableRow key={t.id} className="bg-red-50/40 dark:bg-red-950/10">
                            <TableCell className="font-medium text-sm">{t.employee_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(t.date)}</TableCell>
                            <TableCell className="text-xs max-w-[200px]">
                              <div className="space-y-0.5">
                                <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords />
                                <span className="text-muted-foreground/60">↓</span>
                                <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-col gap-0.5">
                                {t.is_anomaly && (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> {t.anomaly_reason}
                                  </span>
                                )}
                                {t.is_out_of_area && (
                                  <span className="text-orange-600 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> Out-of-area end location
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {t.anomaly_reviewed_at ? (
                                <span className="text-xs text-muted-foreground">{t.anomaly_review_note?.split(':')[0]}</span>
                              ) : (
                                <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {t.anomaly_reviewed_at ? formatDate(t.anomaly_reviewed_at.slice(0, 10)) : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {!t.anomaly_reviewed_at ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7"
                                    onClick={() => setReviewingAnomaly({ type: 'trip', id: t.id, label: `${t.start_location} → ${t.end_location}` })}>
                                    Review
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    onClick={() => revertAnomalyReview('trip', t.id, `${t.start_location} → ${t.end_location}`)}>
                                    <RotateCcw className="h-3 w-3 mr-1" /> Revert
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => deleteAnomalyRecord('trip', t.id, `${t.start_location} → ${t.end_location}`)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Fuel className="h-4 w-4 text-red-500" /> Flagged Fuel Requests
                <span className="text-xs text-muted-foreground font-normal">({anomalousFuelReqs.length})</span>
              </h2>
              {anomalousFuelReqs.length === 0 ? (
                <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous fuel requests" description="All fuel requests look normal." /></CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Station</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reviewed</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalousFuelReqs.map((r) => (
                          <TableRow key={r.id} className="bg-red-50/40 dark:bg-red-950/10">
                            <TableCell className="font-medium text-sm">{r.employee_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                            <TableCell className="text-sm">{r.station_name || '—'}</TableCell>
                            <TableCell className="text-sm tabular-nums">{formatNaira(r.amount_ngn || 0)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-orange-300 text-orange-700 text-xs">
                                {r.anomaly_type === 'efficiency_anomaly' ? 'Efficiency' : r.anomaly_type || 'Anomaly'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {r.anomaly_reviewed_at ? (
                                <span className="text-xs text-muted-foreground">{r.anomaly_review_note?.split(':')[0]}</span>
                              ) : (
                                <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.anomaly_reviewed_at ? formatDate(r.anomaly_reviewed_at.slice(0, 10)) : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {!r.anomaly_reviewed_at ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7"
                                    onClick={() => setReviewingAnomaly({ type: 'fuel', id: r.id, label: `${r.station_name} — ${r.employee_name}` })}>
                                    Review
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    onClick={() => revertAnomalyReview('fuel', r.id, `${r.station_name} — ${r.employee_name}`)}>
                                    <RotateCcw className="h-3 w-3 mr-1" /> Revert
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => deleteAnomalyRecord('fuel', r.id, `${r.station_name} — ${r.employee_name}`)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* GEOFENCES */}
        {isAdmin && tab === 'geofences' && (
          <GeofencesTab />
        )}

        {/* LIVE TRACKING */}
        {isAdmin && tab === 'live' && (
          <LiveTrackingTab />
        )}

        {tab === 'compliance' && (
          <ComplianceDashboard vehicles={vehicles as any} onUpdated={fetchData} />
        )}

        {isAdmin && tab === 'drivers' && (
          <DriverVerificationPanel />
        )}

        {isAdmin && tab === 'maintenance' && (
          <MaintenanceHub vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, plate_number: v.plate_number, total_mileage_km: (v as any).total_mileage_km }))} onRefresh={fetchData} />
        )}

        {tab === 'inspections' && (
          <InspectionHistory vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, plate_number: v.plate_number }))} />
        )}

        {tab === 'incidents' && (
          <IncidentReportPanel vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, plate_number: v.plate_number }))} staff={staff.map((s) => ({ id: s.id, full_name: s.full_name }))} />
        )}

        {isAdmin && tab === 'lifecycle' && (
          <VehicleLifecyclePanel onRefresh={fetchData} />
        )}

        </main>
      </div>

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

      {/* START TRIP DIALOG */}
      {(() => {
        const odoOk = !!startTripForm.odometer_start && Number.isFinite(parseFloat(startTripForm.odometer_start));
        return (
          <Dialog open={showStartTrip} onOpenChange={(v) => { if (!v) setShowStartTrip(false); }}>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

              {/* ── Header ─────────────────────────────────────────── */}
              <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                    <Navigation className="h-4 w-4 text-green-600" />
                  </div>
                  Start Trip
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Pin your exact location on the map, then enter your odometer reading.
                </DialogDescription>
              </DialogHeader>

              {/* ── Live map — drag pin to adjust ──────────────────── */}
              <div className="shrink-0 relative h-52 bg-muted/40">
                {mapsLoaded && startPinnedCoords ? (
                  <>
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={startPinnedCoords}
                      zoom={17}
                      options={{ ...MAP_OPTIONS, disableDefaultUI: true, gestureHandling: 'greedy', zoomControl: false, clickableIcons: false }}
                    >
                      <Marker
                        position={startPinnedCoords}
                        draggable
                        onDragEnd={(e) => {
                          const lat = e.latLng?.lat();
                          const lng = e.latLng?.lng();
                          if (lat != null && lng != null) {
                            setStartPinnedCoords({ lat, lng });
                            setStartAddress(null);
                            googleReverseGeocode(lat, lng).then((a) => a && setStartAddress(a));
                          }
                        }}
                      />
                    </GoogleMap>
                    <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-200 shadow-sm">
                      Drag pin to adjust location
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    {isGeoError(startGeoState)
                      ? <LocateOff className="h-7 w-7 text-amber-400" />
                      : <Loader2 className="h-7 w-7 animate-spin text-blue-400" />}
                    <p className="text-xs text-muted-foreground">
                      {isGeoError(startGeoState) ? 'Location unavailable' : 'Getting your location…'}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Location name strip ─────────────────────────────── */}
              <div className="shrink-0 border-y px-5 py-3 bg-background">
                {startGeoState === 'ok' && startPinnedCoords ? (
                  <div className="flex items-center gap-2.5">
                    <LocateFixed className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug truncate">
                        {startAddress || formatCoords(startPinnedCoords.lat, startPinnedCoords.lng)}
                      </p>
                      {startAddress && (
                        <p className="text-[10px] font-mono text-muted-foreground/60 leading-tight mt-0.5">
                          {formatCoords(startPinnedCoords.lat, startPinnedCoords.lng)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ±{Math.round(startCoords?.accuracy ?? 0)} m
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-green-600 hover:text-green-700 underline underline-offset-2 shrink-0"
                      onClick={() => {
                        setStartPinnedCoords(null);
                        acquireGeo(setStartGeoState, setStartCoords, (addr) => setStartAddress(addr));
                      }}
                    >
                      Re-acquire
                    </button>
                  </div>
                ) : isGeoError(startGeoState) ? (
                  <div className="flex items-center gap-2.5">
                    <LocateOff className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="flex-1 text-sm text-amber-700 dark:text-amber-400 font-medium truncate">
                      {GEO_ERROR_MSG[startGeoState as Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>].split('—')[0].trim()}
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-amber-600 underline underline-offset-2 shrink-0"
                      onClick={() => acquireGeo(setStartGeoState, setStartCoords, (addr) => setStartAddress(addr))}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <p className="text-sm">Detecting your location…</p>
                  </div>
                )}
              </div>

              {/* ── Form fields ─────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

                {/* Vehicle selector — required */}
                {vehicles.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Vehicle <span className="text-destructive">*</span></Label>
                    <Select
                      value={startTripForm.vehicle_id || ''}
                      onValueChange={(v) => {
                        setStartTripForm((f) => ({ ...f, vehicle_id: v }));
                        if (v) {
                          supabase.from('trip_logs').select('odometer_end').eq('vehicle_id', v)
                            .not('odometer_end', 'is', null).neq('status', 'in_progress')
                            .order('trip_end_time', { ascending: false }).limit(1).maybeSingle()
                            .then(({ data }) => setLastVehicleOdometer(data?.odometer_end ?? null));
                        } else {
                          setLastVehicleOdometer(null);
                        }
                      }}
                    >
                      <SelectTrigger className={!startTripForm.vehicle_id ? 'border-amber-400 focus:ring-amber-400' : ''}>
                        <SelectValue placeholder="Select vehicle (required)" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} — {(v as any).plate_number}
                            {v.current_fuel_litres != null && v.tank_capacity_litres > 0 && (
                              <span className={`ml-2 text-xs ${(v.current_fuel_litres / v.tank_capacity_litres) < 0.2 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                ({Math.round((v.current_fuel_litres / v.tank_capacity_litres) * 100)}% fuel)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {startTripForm.vehicle_id && (() => {
                      const veh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
                      if (!veh || !veh.tank_capacity_litres) return null;
                      const pct = Math.round((veh.current_fuel_litres / veh.tank_capacity_litres) * 100);
                      if (pct >= 20) return null;
                      return (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Low fuel: {pct}% — consider refuelling before departing.
                        </p>
                      );
                    })()}
                  </div>
                )}

                {/* Odometer input */}
                <div className="space-y-2">
                  <Label>Odometer Reading (km) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={startTripForm.odometer_start}
                    onChange={(e) => setStartTripForm((f) => ({ ...f, odometer_start: e.target.value }))}
                    placeholder="e.g. 42500"
                  />

                  {startTripForm.odometer_start && Number.isFinite(parseFloat(startTripForm.odometer_start)) && (
                    <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Odometer</p>
                        <p className="text-xl font-mono font-bold text-white tracking-wider">
                          {parseFloat(startTripForm.odometer_start).toLocaleString()}
                          <span className="text-sm font-normal text-slate-400 ml-1">km</span>
                        </p>
                      </div>
                      <Gauge className="h-7 w-7 text-slate-500" />
                    </div>
                  )}

                  {lastVehicleOdometer != null && startTripForm.odometer_start && (
                    parseFloat(startTripForm.odometer_start) < lastVehicleOdometer ? (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Odometer went backwards — last recorded was {lastVehicleOdometer.toLocaleString()} km. Please check.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        +{(parseFloat(startTripForm.odometer_start) - lastVehicleOdometer).toLocaleString()} km since last trip
                      </p>
                    )
                  )}
                </div>

                {/* Pre-trip inspection */}
                {startTripForm.vehicle_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={() => {
                      const veh = vehicles.find((v) => v.id === startTripForm.vehicle_id);
                      setInspectionVehicleId(startTripForm.vehicle_id);
                      setInspectionVehicleName(veh ? `${veh.name} (${(veh as any).plate_number})` : 'Vehicle');
                      setShowInspection(true);
                    }}
                  >
                    <ClipboardCheck className="h-4 w-4" /> Pre-Trip Vehicle Inspection
                  </Button>
                )}

                {/* Privacy notice */}
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-900 dark:text-blue-200">
                  <Radio className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Live tracking active during this trip</p>
                    <p className="opacity-85 mt-0.5">Your GPS position is sent every few seconds and stops the moment you tap End Trip.</p>
                  </div>
                </div>
              </div>

              {/* ── Footer ──────────────────────────────────────────── */}
              <DialogFooter className="shrink-0 px-5 pb-5 pt-3 border-t bg-background">
                <Button variant="outline" onClick={() => setShowStartTrip(false)}>Cancel</Button>
                <Button
                  className={`transition-all duration-300 text-white ${
                    odoOk && !startingTrip
                      ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-400 ring-offset-2'
                      : 'bg-muted-foreground/60 cursor-not-allowed'
                  }`}
                  onClick={handleStartTrip}
                  disabled={startingTrip || !startTripForm.odometer_start}
                >
                  {startingTrip
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
                    : <><Timer className="mr-2 h-4 w-4" /> Start Trip</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* END TRIP DIALOG */}
      <Dialog open={showEndTrip} onOpenChange={(v) => { if (!v) setShowEndTrip(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                <Navigation className="h-4 w-4 text-red-600 rotate-180" />
              </div>
              End Trip
            </DialogTitle>
            <DialogDescription>
              Confirm your odometer reading to complete the trip. GPS end location is captured automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {/* Trip-in-progress summary */}
            {activeTrip && (
              <div className="rounded-xl bg-muted/40 border px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Trip in progress</p>
                <p className="text-sm font-semibold">{formatDuration(elapsedSeconds)} elapsed</p>
                <div className="text-xs text-muted-foreground">
                  {activeTrip.start_location
                    ? <LocationCell location={activeTrip.start_location} lat={activeTrip.start_lat} lng={activeTrip.start_lng} showCoords />
                    : 'Start location not recorded'}
                </div>
              </div>
            )}

            {/* End Location — GPS auto-acquired, no manual input */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> End Location
              </Label>

              {(endGeoState === 'idle' || endGeoState === 'acquiring') && (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Detecting your location…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Using GPS and network signals</p>
                  </div>
                </div>
              )}

              {endGeoState === 'ok' && endCoords && (
                <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3.5">
                  <LocateFixed className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 break-words leading-snug">
                      {endAddress || formatCoords(endCoords.lat, endCoords.lng)}
                    </p>
                    {endAddress && (
                      <p className="text-[10px] font-mono text-green-600/70 dark:text-green-400/70 leading-tight mt-0.5">
                        {formatCoords(endCoords.lat, endCoords.lng)}
                      </p>
                    )}
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      GPS · ±{Math.round(endCoords.accuracy)} m accuracy
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-green-600 underline shrink-0 mt-0.5"
                    onClick={() => acquireGeo(setEndGeoState, setEndCoords, (addr) => setEndAddress(addr))}
                  >
                    Re-acquire
                  </button>
                </div>
              )}

              {isGeoError(endGeoState) && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3.5">
                  <LocateOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">GPS unavailable</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      {GEO_ERROR_MSG[endGeoState as Exclude<GeoState, 'idle' | 'acquiring' | 'ok'>]} Location won't be recorded — you can still end your trip.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-amber-600 underline shrink-0 mt-0.5"
                    onClick={() => acquireGeo(setEndGeoState, setEndCoords, (addr) => setEndAddress(addr))}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* End odometer */}
            <div className="space-y-1">
              <Label>End Odometer Reading (km) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={endTripForm.odometer_end}
                onChange={(e) => setEndTripForm((f) => ({ ...f, odometer_end: e.target.value }))}
                placeholder="e.g. 42650"
              />
              {endTripForm.odometer_end && activeTrip?.odometer_start != null && (
                <p className="text-xs text-muted-foreground">
                  Distance: <strong>{Math.max(0, parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start).toLocaleString()} km</strong>
                  {parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start > 500 && (
                    <span className="text-amber-600 ml-2 flex items-center gap-0.5 inline-flex">
                      <AlertTriangle className="h-3 w-3" /> Distance &gt; 500 km — will be flagged for review
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Optional: fuel this trip */}
            {(() => {
              const km = activeTrip?.odometer_start != null && endTripForm.odometer_end
                ? Math.max(0, parseFloat(endTripForm.odometer_end) - activeTrip.odometer_start) : null;
              const tripVehForFuel = activeTrip?.vehicle_id ? vehicles.find((v) => v.id === activeTrip.vehicle_id) : null;
              const estL = km != null && km > 0 && tripVehForFuel?.fuel_consumption_rate_lkm
                ? Math.round(km * tripVehForFuel.fuel_consumption_rate_lkm * 10) / 10 : null;
              return (
                <div className="space-y-2">
                  {estL != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                      <Fuel className="h-3.5 w-3.5 shrink-0" />
                      <span>Vehicle spec estimates <strong>{estL} L</strong> consumed this trip ({tripVehForFuel?.fuel_consumption_rate_lkm} L/km × {km?.toLocaleString()} km)</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Fuel Purchased (₦) <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <Input
                        type="number"
                        value={endTripForm.fuel_amount_ngn}
                        onChange={(e) => setEndTripForm((f) => ({ ...f, fuel_amount_ngn: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Litres Purchased <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                      <Input
                        type="number"
                        value={endTripForm.litres}
                        onChange={(e) => setEndTripForm((f) => ({ ...f, litres: e.target.value }))}
                        placeholder={estL != null ? `Est. ${estL} L consumed` : 'Optional'}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>Issues to Report <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Textarea
                value={endTripForm.issues}
                onChange={(e) => setEndTripForm((f) => ({ ...f, issues: e.target.value }))}
                rows={2}
                placeholder="Vehicle or route issues, incidents…"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 px-6 pb-6 pt-3 border-t bg-background">
            <Button variant="outline" onClick={() => setShowEndTrip(false)}>Cancel</Button>
            {(() => {
              const endReady = !!endTripForm.odometer_end;
              return (
                <Button
                  className={endReady && !endingTrip ? '' : 'bg-muted-foreground/60 hover:bg-muted-foreground/60 cursor-not-allowed'}
                  onClick={handleEndTrip}
                  disabled={endingTrip || !endTripForm.odometer_end}
                >
                  {endingTrip && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Complete Trip
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP SUMMARY DIALOG */}
      <Dialog open={!!tripSummary} onOpenChange={(v) => { if (!v) setTripSummary(null); }}>
        <DialogContent className="max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Trip Completed
            </DialogTitle>
          </DialogHeader>
          {tripSummary && (
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted/50 px-3 py-2 text-center min-w-0">
                  <p className="text-2xl font-bold tabular-nums">
                    {tripSummary.distanceKm != null ? tripSummary.distanceKm.toLocaleString() : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Kilometres driven</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-center min-w-0">
                  <p className="text-2xl font-bold tabular-nums">
                    {Math.floor(tripSummary.durationMin / 60)}h {tripSummary.durationMin % 60}m
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Duration</p>
                </div>
              </div>
              <div className="space-y-2 text-sm min-w-0">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="text-xs break-words">{tripSummary.startLocation}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="text-xs break-words">{tripSummary.endLocation}</p>
                </div>
              </div>
              {tripSummary.isAnomaly && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Anomaly flagged for admin review</p>
                    <p className="text-xs mt-0.5">{tripSummary.anomalyReason}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTripSummary(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL ACTIVE TRIP CONFIRMATION */}
      <Dialog open={confirmCancelTrip} onOpenChange={(v) => { if (!v) setConfirmCancelTrip(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel in-progress trip?</DialogTitle>
            <DialogDescription>
              This will permanently delete the trip record. Any distance and time already recorded will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancelTrip(false)}>Keep Trip</Button>
            <Button variant="destructive" onClick={handleCancelActiveTrip}>Cancel Trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRIP LOG DIALOG */}
      <Dialog open={showTripForm} onOpenChange={setShowTripForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily Trip Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={tripForm.employee_id}
                onValueChange={(v) => setTripForm({ ...tripForm, employee_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                  {profile && !staff.find((s) => s.id === profile.id) && (
                    <SelectItem value={profile.id}>
                      {profile.full_name || profile.email} (me)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vehicle <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select
                value={tripForm.vehicle_id || '__none__'}
                onValueChange={(v) => setTripForm({ ...tripForm, vehicle_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No vehicle</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={tripForm.date}
                onChange={(e) => setTripForm({ ...tripForm, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Location</Label>
                <Input
                  value={tripForm.start_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, start_location: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>End Location</Label>
                <Input
                  value={tripForm.end_location}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, end_location: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Odometer Start</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_start}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Odometer End</Label>
                <Input
                  type="number"
                  value={tripForm.odometer_end}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, odometer_end: e.target.value })
                  }
                />
                {tripForm.odometer_start && tripForm.odometer_end && (
                  <p className="text-xs text-muted-foreground">
                    {Math.max(
                      0,
                      parseFloat(tripForm.odometer_end) -
                        parseFloat(tripForm.odometer_start),
                    ).toLocaleString()}{' '}
                    km
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fuel Purchased (₦)</Label>
                <Input
                  type="number"
                  value={tripForm.fuel_amount_ngn}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, fuel_amount_ngn: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Litres</Label>
                <Input
                  type="number"
                  value={tripForm.litres}
                  onChange={(e) => setTripForm({ ...tripForm, litres: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <TripVehicleFuel
              vehicleId={tripForm.vehicle_id}
              vehicles={vehicles}
              kmDriven={
                tripForm.odometer_start && tripForm.odometer_end
                  ? Math.max(0, parseFloat(tripForm.odometer_end) - parseFloat(tripForm.odometer_start))
                  : null
              }
              litresAdded={parseFloat(tripForm.litres) || null}
            />
            <div className="space-y-1">
              <Label>Issues to Report</Label>
              <Textarea
                value={tripForm.issues}
                onChange={(e) => setTripForm({ ...tripForm, issues: e.target.value })}
                placeholder="Optional — vehicle or route issues..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTripForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitTripLog}
              disabled={
                submitting ||
                !tripForm.employee_id ||
                !tripForm.date ||
                !tripForm.start_location ||
                !tripForm.end_location
              }
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-request receipt dialog — admin explains why they need a new upload */}
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

      <Dialog open={!!confirmDeleteTrip} onOpenChange={(v) => { if (!v) setConfirmDeleteTrip(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trip log</DialogTitle>
            <DialogDescription>
              Delete this trip log ({confirmDeleteTrip?.start_location} → {confirmDeleteTrip?.end_location})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteTrip(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteTrip && deleteTripLog(confirmDeleteTrip)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip log detail / edit dialog */}
      <Dialog
        open={!!selectedTrip}
        onOpenChange={(v) => {
          if (!v) { setSelectedTrip(null); setTripEditMode(false); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Trip Log — {selectedTrip && formatDate(selectedTrip.date)}
            </DialogTitle>
            <DialogDescription>{selectedTrip?.employee_name}</DialogDescription>
          </DialogHeader>

          {selectedTrip && !tripEditMode && (
            <div className="space-y-3 text-sm">
              {selectedTrip.vehicle_id && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vehicle</p>
                  <p className="font-medium">
                    {vehicles.find((v) => v.id === selectedTrip.vehicle_id)?.name || 'Unknown vehicle'}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">From</p>
                  <p className="font-medium"><LocationCell location={selectedTrip.start_location} lat={selectedTrip.start_lat} lng={selectedTrip.start_lng} showCoords /></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">To</p>
                  <p className="font-medium"><LocationCell location={selectedTrip.end_location} lat={selectedTrip.end_lat} lng={selectedTrip.end_lng} showCoords /></p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 border rounded-lg p-3 bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer Start</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_start != null ? selectedTrip.odometer_start.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Odometer End</p>
                  <p className="font-semibold tabular-nums">{selectedTrip.odometer_end != null ? selectedTrip.odometer_end.toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Distance (km)</p>
                  <p className="font-semibold tabular-nums text-primary">{selectedTrip.km_driven != null ? selectedTrip.km_driven.toLocaleString() : '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Fuel (₦)</p>
                  <p className="font-medium currency">{selectedTrip.fuel_amount_ngn ? formatNaira(selectedTrip.fuel_amount_ngn) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Litres</p>
                  <p className="font-medium">{selectedTrip.litres ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">km/L</p>
                  <p className="font-medium">
                    {selectedTrip.km_driven && selectedTrip.litres && selectedTrip.km_driven > 0 && selectedTrip.litres > 0
                      ? (selectedTrip.km_driven / selectedTrip.litres).toFixed(1)
                      : '—'}
                  </p>
                </div>
              </div>
              {selectedTrip.issues && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Issues Reported</p>
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{selectedTrip.issues}</p>
                </div>
              )}
            </div>
          )}

          {selectedTrip && tripEditMode && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={tripEditForm.date} onChange={(e) => setTripEditForm({ ...tripEditForm, date: e.target.value })} />
                </div>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input value={tripEditForm.start_location} onChange={(e) => setTripEditForm({ ...tripEditForm, start_location: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input value={tripEditForm.end_location} onChange={(e) => setTripEditForm({ ...tripEditForm, end_location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Odometer Start</Label>
                  <Input type="number" value={tripEditForm.odometer_start} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_start: e.target.value })} placeholder="e.g. 42500" />
                </div>
                <div className="space-y-1">
                  <Label>Odometer End</Label>
                  <Input type="number" value={tripEditForm.odometer_end} onChange={(e) => setTripEditForm({ ...tripEditForm, odometer_end: e.target.value })} placeholder="e.g. 42750" />
                </div>
              </div>
              {tripEditForm.odometer_start && tripEditForm.odometer_end && (
                <p className="text-xs text-muted-foreground">
                  Distance: <strong>{(parseFloat(tripEditForm.odometer_end) - parseFloat(tripEditForm.odometer_start)).toLocaleString()} km</strong>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fuel Purchased (₦)</Label>
                  <Input type="number" value={tripEditForm.fuel_amount_ngn} onChange={(e) => setTripEditForm({ ...tripEditForm, fuel_amount_ngn: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label>Litres</Label>
                  <Input type="number" value={tripEditForm.litres} onChange={(e) => setTripEditForm({ ...tripEditForm, litres: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Issues to Report</Label>
                <Textarea value={tripEditForm.issues} onChange={(e) => setTripEditForm({ ...tripEditForm, issues: e.target.value })} rows={2} placeholder="Optional" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setSelectedTrip(null)}>Close</Button>
                {canEditTrip && (
                  <Button variant="outline" onClick={() => setTripEditMode(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </>
            )}
            {tripEditMode && (
              <>
                <Button variant="outline" onClick={() => setTripEditMode(false)}>Cancel</Button>
                <Button onClick={saveTripEdit} disabled={savingTripEdit}>
                  {savingTripEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOG EXTERNAL PURCHASE DIALOG — admin-only. Records a fuel/repair
          purchase already paid for outside the platform. Submitting hands
          off into the fuel/repair receipt-upload dialogs below so a receipt
          can be attached immediately if the admin already has it; cancelling
          that follow-up is fine and leaves the entry to the normal
          receipt-debt block until a receipt is added. */}
      <Dialog
        open={showLogExternalForm}
        onOpenChange={(v) => { setShowLogExternalForm(v); if (!v) setLogExternalForm(EMPTY_LOG_EXTERNAL_FORM); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log External Purchase</DialogTitle>
            <DialogDescription>
              For a fuel or repair purchase that was already paid for outside KDOps — e.g. a receipt sent over
              WhatsApp — instead of a live request going through approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['fuel', 'repair'] as const).map((t) => (
                  <button key={t} type="button"
                    className={cn('flex items-center justify-center gap-2 rounded-xl border p-2.5 text-sm kd-transition', logExternalType === t ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-primary/30 hover:text-foreground')}
                    onClick={() => setLogExternalType(t)}
                  >
                    {t === 'fuel' ? <Fuel className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    {t === 'fuel' ? 'Fuel' : 'Repair'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select
                value={logExternalForm.employee_id || undefined}
                onValueChange={(v) => {
                  const suggestedVehicle = vehicles.find((vh) => vh.assigned_driver_id === v)?.id || '';
                  setLogExternalForm((f) => ({ ...f, employee_id: v, vehicle_id: f.vehicle_id || suggestedVehicle }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Vehicle <span className="text-muted-foreground font-normal text-xs">(optional, auto-suggested from assignment)</span></Label>
              <Select value={logExternalForm.vehicle_id || '__none__'} onValueChange={(v) => setLogExternalForm((f) => ({ ...f, vehicle_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {vehicles.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦) <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" value={logExternalForm.amount_ngn} onChange={(e) => setLogExternalForm((f) => ({ ...f, amount_ngn: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Date paid</Label>
                <Input type="date" max={new Date().toISOString().slice(0, 10)} value={logExternalForm.purchase_date} onChange={(e) => setLogExternalForm((f) => ({ ...f, purchase_date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{logExternalType === 'fuel' ? 'Fuel station' : 'Vendor / Garage'} <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                value={logExternalForm.station_or_vendor}
                onChange={(e) => setLogExternalForm((f) => ({ ...f, station_or_vendor: e.target.value }))}
                placeholder={logExternalType === 'fuel' ? 'e.g. NNPC Station' : 'e.g. Mekunwen Auto Parts'}
              />
            </div>

            <div className="space-y-1">
              <Label>{logExternalType === 'repair' ? 'What was done' : 'Notes'} <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Textarea
                value={logExternalForm.notes}
                onChange={(e) => setLogExternalForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={logExternalType === 'repair' ? 'e.g. Brake pad replacement' : 'Any additional context…'}
                rows={2}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              After saving, you'll be able to attach the receipt right away if you have it. If you don't yet,
              you can close that step — {staff.find((s) => s.id === logExternalForm.employee_id)?.full_name || 'this employee'} won't
              be able to submit another {logExternalType} request until a receipt is uploaded for this one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogExternalForm(false)}>Cancel</Button>
            <Button
              onClick={submitLogExternalPurchase}
              disabled={submittingLogExternal || !logExternalForm.employee_id || !logExternalForm.amount_ngn}
            >
              {submittingLogExternal && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Tamper-analysis (ELA) preview — on-demand visual aid, not a verdict. */}
      <Dialog open={!!elaTarget} onOpenChange={(v) => { if (!v) { setElaTarget(null); setElaResult(null); setElaError(''); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tamper Analysis</DialogTitle>
            <DialogDescription>
              Compares the receipt image against its own re-compressed version to detect edits. This is a visual aid, not proof of tampering.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {elaLoading && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating analysis…
              </div>
            )}
            {elaError && (
              <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{elaError}</span>
              </div>
            )}
            {elaResult && elaTarget && (() => {
              const avg = elaResult.avgBrightness;
              const verdict = avg < 15
                ? { label: 'No signs of tampering', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '✓' }
                : avg < 40
                ? { label: 'Low concern — likely normal compression artifacts', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: '~' }
                : { label: 'Review recommended — possible editing detected', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: '!' };
              return (
                <>
                  {/* Verdict banner */}
                  <div className={`flex items-center gap-2 rounded-md border px-3 py-2.5 ${verdict.bg}`}>
                    <span className={`text-lg font-bold ${verdict.color}`}>{verdict.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${verdict.color}`}>{verdict.label}</p>
                      <p className="text-[11px] text-muted-foreground">Confidence score: {Math.round(avg)}/255 (higher = more variation detected)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Original Receipt</p>
                      <img src={elaTarget.url} alt="Original receipt" className="w-full rounded-md border" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Error Level Analysis</p>
                      <img src={elaResult.heatmapDataUrl} alt="Error-level analysis heatmap" className="w-full rounded-md border" />
                    </div>
                  </div>

                  {/* Color legend */}
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">What the colors mean:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: '#111' }} />
                        <div>
                          <p className="font-medium text-foreground">Dark / black</p>
                          <p>Consistent compression — this area hasn't been altered.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: 'rgb(220, 120, 50)' }} />
                        <div>
                          <p className="font-medium text-foreground">Bright / colored</p>
                          <p>Different compression history — could be an edit, or WhatsApp forwarding.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: 'rgb(180, 180, 200)' }} />
                        <div>
                          <p className="font-medium text-foreground">Bright edges</p>
                          <p>Normal on sharp text or lines — not suspicious by itself.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <p className="text-[11px] text-muted-foreground italic">
                    This is an automated visual aid, not definitive proof. WhatsApp-forwarded images, screenshots, and re-saved photos can produce bright areas without any tampering. Always verify with the original source before taking action.
                  </p>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Phase 4 — Repair request dialog */}
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

            {/* Vehicle & service — links this repair to a car and (optionally)
                closes a scheduled service item so maintenance history stays accurate. */}
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

      {/* REPAIR RECEIPT UPLOAD DIALOG — attach a receipt to a repair submitted without one */}
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

      {/* TRIP MAP MODAL */}
      {viewingTripMap && (
        <TripMapModal
          trip={viewingTripMap}
          breadcrumbs={mapBreadcrumbs}
          events={mapEvents}
          loading={loadingMapData}
          onClose={() => setViewingTripMap(null)}
        />
      )}

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
      <Dialog open={!!reviewingAnomaly} onOpenChange={(v) => { if (!v) { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review anomaly</DialogTitle>
            <DialogDescription className="text-xs break-words">
              {reviewingAnomaly?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Decision <span className="text-destructive">*</span></Label>
              <Select value={anomalyReviewDecision || undefined} onValueChange={(v) => setAnomalyReviewDecision(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select outcome…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Reviewed — Valid</SelectItem>
                  <SelectItem value="fraudulent">Fraudulent / Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason / notes <span className="text-destructive">*</span></Label>
              <Textarea
                value={anomalyReviewNote}
                onChange={(e) => setAnomalyReviewNote(e.target.value)}
                placeholder="Explain why this anomaly is valid or fraudulent…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAnomalyReview}
              disabled={submittingAnomalyReview || !anomalyReviewDecision || !anomalyReviewNote.trim()}
            >
              {submittingAnomalyReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VEHICLE INSPECTION (DVIR) */}
      <VehicleInspectionForm
        vehicleId={inspectionVehicleId}
        vehicleName={inspectionVehicleName}
        open={showInspection}
        onOpenChange={setShowInspection}
      />
    </div>
  );
};

export default Fleet;
