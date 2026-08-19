import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Users,
  Send,
  AlertCircle,
  AlertTriangle,
  X,
  Info,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePermission } from '@/hooks/usePermission';
import { burst } from '@/components/Burst';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { logAudit } from '@/lib/audit';
import { notifyChannels } from '@/lib/notify';
import { notifyPayslipReady } from '@/lib/notify-events';
import { scanPayrollRunAnomaliesSafe } from '@/lib/anomalies';
import {
  fetchPayrollSegments,
  fetchSegmentRules,
  filterEmployeesForSegment,
  type PayrollSegment,
  type PayrollSegmentFilterRules,
} from '@/lib/payroll-segments';
import {
  formatDate,
  formatDateTime,
  formatNaira,
  formatNairaCompact,
} from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { buildPaymentInstructions, instructionsToCsv } from '@/lib/bank-payment';
import { renderPayslipHtml } from '@/lib/payslip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { confirm } from '@/hooks/use-confirm';
// Statutory rates and PAYE math live in @/lib/tax (Nigeria Tax Act 2025).
// Aliased to the names already used throughout this file to keep the diff small.
import {
  PENSION_EMPLOYEE_RATE as PENSION_RATE,
  PENSION_EMPLOYER_RATE as EMPLOYER_PENSION_RATE,
  NHF_RATE,
  NSITF_RATE,
  computePayslip,
} from '@/lib/tax';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  getBankCode,
  generateKdopsRef,
  buildNarration,
} from '@/lib/paystack';
import { fetchFlutterwaveBanks, getFlutterwaveBankCode } from '@/lib/flutterwave-banks';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { displayName } from '@/lib/name';
import { cn } from '@/lib/utils';
import { receiptTheme as R } from '@/lib/receipt-theme';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CalendarClock, CalendarDays, Columns3 } from 'lucide-react';
import { PayrollCalendar } from '@/components/payroll/PayrollCalendar';
import { PayrollRosterPreview } from '@/components/payroll/PayrollRosterPreview';
import { PayrollSchedules, NextPayrollBanner } from '@/components/PayrollSchedules';
import { PayrollBoard } from '@/components/payroll/PayrollBoard';

interface BonusLine {
  type: string;
  amount: number;
}

interface AllowancesSnapshot {
  housing_pct: number;
  transport_per_emp: number;
  meal_per_emp: number;
  total: number;
}

interface PayrollRun {
  id: string;
  period: string;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  employee_count?: number;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  employer_pension_ngn?: number | null;
  bonuses_json?: BonusLine[] | null;
  allowances_json?: AllowancesSnapshot | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  payroll_segment_id?: string | null;
}

const monthLabel = (period: string, periodType?: string): string => {
  if (!/^\d{4}-\d{1,2}$/.test(period)) return period;
  const [y, m] = period.split('-');
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  if (isNaN(year) || isNaN(month)) return period;
  if (periodType === 'annual') return `${year} Annual Payroll`;
  if (periodType === 'quarterly') {
    const q = Math.ceil(month / 3);
    return `Q${q} ${year} Payroll`;
  }
  const date = new Date(year, month - 1, 1);
  if (periodType === 'monthly') {
    return `${date.toLocaleString('en-GB', { month: 'long', year: 'numeric' })} Payroll`;
  }
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
};

const monthPeriod = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Advance repayment for one period: normally the monthly amount, but if a
// normal deduction would leave a residual smaller than one installment, take
// the whole remaining balance so it clears to exactly ₦0 — avoids a stranded
// ₦0.01 left behind by rounding deduction_per_month (e.g. ₦10,000 / 3).
const advanceDeductionFor = (deductionPerMonth: any, outstanding: any): number => {
  const ded = Number(deductionPerMonth || 0);
  const out = Number(outstanding || 0);
  if (out <= 0) return 0;
  return (out - ded) < ded ? out : ded;
};


const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BONUS_TYPES = [
  'Performance Bonus',
  '13th Month',
  'Christmas Bonus',
  'Ramadan Bonus',
  'Annual Leave Allowance',
  'KD Star Prize',
  'Other',
] as const;

const PAYROLL_CATEGORY_LABELS: Record<string, string> = {
  administrative: 'Administrative',
  executive: 'Executive / Director',
  domestic: 'Domestic staff',
  security: 'Security',
  contractor: 'Contractor',
};

const Payroll = () => {
  usePageTitle('Payroll');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  // Highlight + scroll to a specific run when arriving from PaymentSchedule.
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const runRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [dialog, setDialog] = useState(false);
  const [working, setWorking] = useState(false);
  const [salaryErrors, setSalaryErrors] = useState<string[]>([]);
  const [disburseTarget, setDisburseTarget] = useState<{ run: PayrollRun; payslips: any[] } | null>(null);
  const [disbursing, setDisbursing] = useState(false);
  const [disburseErrors, setDisburseErrors] = useState<string[]>([]);
  const [confirmPaidRun, setConfirmPaidRun] = useState<PayrollRun | null>(null);
  // Per-employee adjustments (bonus / overtime / allowance / one-off deduction)
  // for a run, entered before payslips are generated.
  const [adjustRun, setAdjustRun] = useState<PayrollRun | null>(null);
  const [adjustList, setAdjustList] = useState<any[]>([]);
  const [adjustEmployees, setAdjustEmployees] = useState<{ id: string; name: string }[]>([]);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustForm, setAdjustForm] = useState<{ employee_id: string; kind: string; description: string; amount: string; taxable: boolean }>({
    employee_id: '', kind: 'bonus', description: '', amount: '', taxable: true,
  });
  // Manager queue of salary-advance requests awaiting action.
  const [advanceQueue, setAdvanceQueue] = useState<any[]>([]);
  const [advanceBusy, setAdvanceBusy] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('kdops_payroll_banner_dismissed') === 'true',
  );
  const [form, setForm] = useState<{
    period: string;
    period_type: 'monthly' | 'quarterly' | 'annual';
    bonuses: BonusLine[];
    housing_allowance_pct: number;
    transport_per_emp: number;
    meal_per_emp: number;
    payroll_segment_id: string;
  }>({
    period: monthPeriod(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
    period_type: 'monthly',
    bonuses: [],
    housing_allowance_pct: 0,
    transport_per_emp: 0,
    meal_per_emp: 0,
    payroll_segment_id: '',
  });
  // Payroll segments — reusable named filters ("Staff excl. Directors", etc.)
  // that pick which employees are included in a draft. Empty selection means
  // no filter — the exact legacy behavior (every active, salaried, non-driver
  // employee).
  const [segments, setSegments] = useState<PayrollSegment[]>([]);
  const [segmentDialog, setSegmentDialog] = useState(false);
  const [segmentDepartments, setSegmentDepartments] = useState<{ id: string; name: string }[]>([]);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [segmentPayGroups, setSegmentPayGroups] = useState<{ id: string; name: string }[]>([]);
  const [segmentForm, setSegmentForm] = useState<{
    name: string;
    description: string;
    exclude_employee_categories: string[];
    exclude_department_ids: string[];
    include_pay_group_ids: string[];
  }>({ name: '', description: '', exclude_employee_categories: [], exclude_department_ids: [], include_pay_group_ids: [] });

  const canGeneratePayslipsPerm = usePermission('payroll.generate_payslips');

  const loadSegments = useCallback(() => {
    fetchPayrollSegments().then(setSegments).catch(() => setSegments([]));
  }, []);

  useEffect(() => {
    loadSegments();
    supabase.from('departments').select('id, name').order('name').then(({ data }) => {
      setSegmentDepartments((data as { id: string; name: string }[]) || []);
    }).catch(() => { /* departments are optional for the segment builder */ });
    supabase.from('pay_groups').select('id, name').order('name').then(({ data }) => {
      setSegmentPayGroups((data as { id: string; name: string }[]) || []);
    }).catch(() => { /* pay groups are optional for the segment builder */ });
  }, [loadSegments]);

  // Live filter preview for the segment builder — recomputed on every toggle
  // so "who does this actually match" is never a guess before saving.
  const segmentLiveRules = useMemo(() => {
    const rules: PayrollSegmentFilterRules = {};
    if (segmentForm.exclude_employee_categories.length > 0) rules.exclude_employee_categories = segmentForm.exclude_employee_categories;
    if (segmentForm.exclude_department_ids.length > 0) rules.exclude_department_ids = segmentForm.exclude_department_ids;
    if (segmentForm.include_pay_group_ids.length > 0) rules.include_pay_group_ids = segmentForm.include_pay_group_ids;
    return rules;
  }, [segmentForm.exclude_employee_categories, segmentForm.exclude_department_ids, segmentForm.include_pay_group_ids]);

  const toggleSegmentCategory = (cat: string) =>
    setSegmentForm((f) => ({
      ...f,
      exclude_employee_categories: f.exclude_employee_categories.includes(cat)
        ? f.exclude_employee_categories.filter((c) => c !== cat)
        : [...f.exclude_employee_categories, cat],
    }));

  const toggleSegmentDepartment = (deptId: string) =>
    setSegmentForm((f) => ({
      ...f,
      exclude_department_ids: f.exclude_department_ids.includes(deptId)
        ? f.exclude_department_ids.filter((d) => d !== deptId)
        : [...f.exclude_department_ids, deptId],
    }));

  const toggleSegmentPayGroup = (groupId: string) =>
    setSegmentForm((f) => ({
      ...f,
      include_pay_group_ids: f.include_pay_group_ids.includes(groupId)
        ? f.include_pay_group_ids.filter((g) => g !== groupId)
        : [...f.include_pay_group_ids, groupId],
    }));

  const saveSegment = async () => {
    if (!segmentForm.name.trim()) {
      toast({ title: 'Segment name is required', variant: 'destructive' });
      return;
    }
    setSegmentSaving(true);
    try {
      const filter_rules: Record<string, string[]> = {};
      if (segmentForm.exclude_employee_categories.length > 0) {
        filter_rules.exclude_employee_categories = segmentForm.exclude_employee_categories;
      }
      if (segmentForm.exclude_department_ids.length > 0) {
        filter_rules.exclude_department_ids = segmentForm.exclude_department_ids;
      }
      if (segmentForm.include_pay_group_ids.length > 0) {
        filter_rules.include_pay_group_ids = segmentForm.include_pay_group_ids;
      }
      const { error } = await (supabase as any).from('payroll_segments').insert({
        name: segmentForm.name.trim(),
        description: segmentForm.description.trim() || null,
        filter_rules,
        created_by: profile?.id || null,
      });
      if (error) throw error;
      toast({ title: 'Segment created' });
      setSegmentForm({ name: '', description: '', exclude_employee_categories: [], exclude_department_ids: [], include_pay_group_ids: [] });
      loadSegments();
    } catch (err: any) {
      toast({ title: 'Could not create segment', description: err?.message, variant: 'destructive' });
    } finally {
      setSegmentSaving(false);
    }
  };

  const deleteSegment = async (segmentId: string, name: string) => {
    // Soft-deactivate rather than hard delete — payroll_runs.payroll_segment_id
    // references this row, and past runs should keep showing which segment
    // they used even after it's retired from the picker.
    const { error } = await (supabase as any).from('payroll_segments').update({ is_active: false }).eq('id', segmentId);
    if (error) {
      toast({ title: 'Could not remove segment', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `"${name}" removed from segments` });
    if (form.payroll_segment_id === segmentId) setForm((f) => ({ ...f, payroll_segment_id: '' }));
    loadSegments();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .order('period', { ascending: false })
      .limit(200);
    setRuns((data as PayrollRun[]) || []);

    // Salary-advance requests awaiting action (pending) or approved-not-yet-paid.
    const { data: adv } = await (supabase as any).from('advance_requests')
      .select('id, employee_id, amount_ngn, repayment_months, reason, status, created_at, profiles:employee_id(full_name, first_name, last_name, email)')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true });
    setAdvanceQueue(((adv as any[]) || []).map((r) => ({
      ...r,
      name: displayName(r.profiles?.first_name, r.profiles?.last_name, r.profiles?.full_name || r.profiles?.email),
    })));
    setLoading(false);
  }, []);

  const actOnAdvance = async (id: string, action: 'approve' | 'reject' | 'paid') => {
    setAdvanceBusy(id);
    try {
      if (action === 'approve') {
        const { error } = await (supabase as any).rpc('approve_advance_request', { p_request_id: id });
        if (error) throw error;
        toast({ title: 'Advance approved', description: 'Pay it in the next batch, then mark it paid to start repayment.' });
      } else if (action === 'reject') {
        const reason = window.prompt('Reason for rejecting this advance request?') || '';
        if (!reason.trim()) { setAdvanceBusy(null); return; }
        const { error } = await (supabase as any).rpc('reject_advance_request', { p_request_id: id, p_reason: reason });
        if (error) throw error;
        toast({ title: 'Advance rejected' });
      } else {
        const { error } = await (supabase as any).rpc('mark_advance_request_paid', { p_request_id: id, p_start_period: null });
        if (error) throw error;
        toast({ title: 'Recorded as paid', description: 'Repayment will be deducted from upcoming payslips.' });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
    } finally {
      setAdvanceBusy(null);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  // After runs load, if the URL has ?run=<id>, scroll to + highlight that row.
  useEffect(() => {
    const target = searchParams.get('run');
    if (!target || runs.length === 0) return;
    if (!runs.some((r) => r.id === target)) return;
    setHighlightedRunId(target);
    requestAnimationFrame(() => {
      const el = runRefs.current.get(target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Auto-clear the highlight after 6 seconds so the visual doesn't linger.
    const t = window.setTimeout(() => setHighlightedRunId(null), 6_000);
    return () => window.clearTimeout(t);
  }, [searchParams, runs]);

  const addBonus = () =>
    setForm((f) => ({ ...f, bonuses: [...f.bonuses, { type: 'Performance Bonus', amount: 0 }] }));
  const removeBonus = (i: number) =>
    setForm((f) => ({ ...f, bonuses: f.bonuses.filter((_, idx) => idx !== i) }));
  const updateBonus = (i: number, field: 'type' | 'amount', val: any) =>
    setForm((f) => ({
      ...f,
      bonuses: f.bonuses.map((b, idx) => (idx === i ? { ...b, [field]: val } : b)),
    }));

  // Draft a payroll summary for a given yyyy-mm by pulling that month's
  // approved expenses, processed payment batches (contractor payouts), and
  // a simple employee cost model based on PAYE/Pension/NHF defaults.
  // NOTE: Features 1/2/3/6 store extended columns in payroll_runs. Run this
  // migration before using those features:
  //   ALTER TABLE payroll_runs
  //     ADD COLUMN IF NOT EXISTS employee_count integer,
  //     ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'monthly',
  //     ADD COLUMN IF NOT EXISTS bonuses_json jsonb,
  //     ADD COLUMN IF NOT EXISTS allowances_json jsonb;
  const draftRun = async () => {
    if (!form.period) return;
    const [y, m] = form.period.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    setWorking(true);
    try {
      const periodStart = start.toISOString().slice(0, 10);
      const [contractorRes, expensesRes, employeeRes, deductionsRes, advancesRes] = await Promise.all([
        supabase
          .from('payment_batches')
          .select('total_amount, payment_date, status')
          .eq('batch_type', 'contractor')
          .in('status', ['processed', 'funded'])
          .is('deleted_at', null)
          .gte('payment_date', start.toISOString())
          .lte('payment_date', end.toISOString()),
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved')
          .is('deleted_at', null)
          .gte('date', start.toISOString())
          .lte('date', end.toISOString()),
        supabase
          .from('profiles')
          .select('id, salary_ngn, pension_enabled, nhf_enabled, paye_enabled, use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn, voluntary_pension_pct, department_id, employee_category, employment_type, pay_group_id')
          .eq('status', 'active')
          .neq('role', 'driver'),
        supabase
          .from('employee_deductions')
          .select('id, entity_id, entity_type, amount_ngn, total_deductible_amount, amount_deducted_to_date')
          .eq('status', 'active')
          .lte('start_date', periodStart)
          .or(`end_date.is.null,end_date.gte.${periodStart}`),
        // Active advances whose repayment started on or before this period
        supabase
          .from('employee_advances')
          .select('id, employee_id, deduction_per_month, outstanding_ngn')
          .eq('status', 'active')
          .lte('start_period', form.period),
      ]);

      // Apply the selected payroll segment's filter (if any). An empty
      // selection (form.payroll_segment_id === '') matches legacy behavior
      // exactly — every active, salaried, non-driver employee, unfiltered.
      const selectedSegment = segments.find((s) => s.id === form.payroll_segment_id) || null;
      const filteredEmployees = filterEmployeesForSegment(
        (employeeRes.data || []) as any[],
        selectedSegment?.filter_rules,
      );

      const totalContractor =
        (contractorRes.data || []).reduce(
          (s, r: any) => s + Number(r.total_amount || 0),
          0,
        ) || 0;
      const totalExpenses =
        (expensesRes.data || []).reduce(
          (s, r: any) => s + Number(r.amount_ngn || 0),
          0,
        ) || 0;
      const totalEmployee =
        filteredEmployees.reduce(
          (s, r: any) => s + Number(r.salary_ngn || 0),
          0,
        ) || 0;
      const empCount = filteredEmployees.length;
      // PAYE, pension and NHF are statutory obligations on employment income only —
      // contractor payments are handled via WHT separately. PAYE is per-employee
      // and progressive, and chargeable income is gross MINUS pension/NHF, so we
      // sum each employee's computePayslip() figure — NOT band the aggregate
      // salary (which produced a wrong, non-reconciling total).
      // Sprint A: pension/NHF use statutory bases when components are configured.
      //   pension base = basic + housing + transport  (PRA 2014)
      //   NHF base     = basic only                   (NHF Act)
      // Otherwise (toggle OFF, default) fall back to gross — preserves
      // today's behavior for everyone whose row hasn't been migrated.
      const paye = filteredEmployees.reduce((s: number, r: any) => {
        if (r.paye_enabled === false) return s;
        const useComps = !!r.use_salary_components;
        const basic = Number(r.basic_ngn || 0);
        const housing = Number(r.housing_ngn || 0);
        const transport = Number(r.transport_ngn || 0);
        const other = Number(r.other_allowances_ngn || 0);
        const gross = useComps ? (basic + housing + transport + other) : Number(r.salary_ngn || 0);
        return s + computePayslip({
          grossMonthlyNgn: gross,
          pensionEnabled: r.pension_enabled !== false,
          nhfEnabled: r.nhf_enabled === true,
          voluntaryPensionPct: Number(r.voluntary_pension_pct || 0),
          useComponents: useComps,
          basicMonthlyNgn: basic,
          housingMonthlyNgn: housing,
          transportMonthlyNgn: transport,
          otherAllowancesMonthlyNgn: other,
        }).payeMonthlyNgn;
      }, 0);
      const pensionBaseFor = (r: any) => {
        const useComps = !!r.use_salary_components;
        return useComps
          ? Number(r.basic_ngn || 0) + Number(r.housing_ngn || 0) + Number(r.transport_ngn || 0)
          : Number(r.salary_ngn || 0);
      };
      const nhfBaseFor = (r: any) =>
        r.use_salary_components ? Number(r.basic_ngn || 0) : Number(r.salary_ngn || 0);
      const pension = filteredEmployees.reduce(
        (s: number, r: any) => s + (r.pension_enabled !== false ? pensionBaseFor(r) * PENSION_RATE : 0), 0);
      const nhf = filteredEmployees.reduce(
        (s: number, r: any) => s + (r.nhf_enabled === true ? nhfBaseFor(r) * NHF_RATE : 0), 0);
      const employerPension = filteredEmployees.reduce(
        (s: number, r: any) => s + (r.pension_enabled !== false ? pensionBaseFor(r) * EMPLOYER_PENSION_RATE : 0), 0);
      const bonusTotal = form.bonuses.reduce((s, b) => s + Number(b.amount || 0), 0);
      const housingAllowance = totalEmployee * (form.housing_allowance_pct / 100);
      const transportAllowance = empCount * form.transport_per_emp;
      const mealSubsidy = empCount * form.meal_per_emp;
      const totalAllowances = housingAllowance + transportAllowance + mealSubsidy;
      // Sum qualifying deductions (cap check: amount_deducted_to_date < total_deductible_amount)
      const qualifyingDeductions = (deductionsRes.data || []).filter((d: any) =>
        d.total_deductible_amount == null ||
        Number(d.amount_deducted_to_date || 0) < Number(d.total_deductible_amount),
      );
      const totalDeductions = qualifyingDeductions.reduce((s: number, d: any) => s + Number(d.amount_ngn || 0), 0);
      // Advance repayments reduce net payroll outflow this period
      const totalAdvanceRepayments = (advancesRes.data || []).reduce(
        (s: number, a: any) => s + advanceDeductionFor(a.deduction_per_month, a.outstanding_ngn),
        0,
      );
      // Sprint A: NSITF (1% of gross payroll, employer-borne) — added to burn
      // when the company toggle is on (default). Keeps payroll cost honest:
      // NSITF is legally required for firms with 5+ staff.
      const { data: complianceSettings } = await supabase
        .from('company_settings')
        .select('nsitf_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const includeNsitf = (complianceSettings as any)?.nsitf_enabled !== false;
      const nsitfCharge = includeNsitf ? totalEmployee * NSITF_RATE : 0;

      const burn =
        totalContractor + totalEmployee + totalExpenses +
        paye + pension + nhf + employerPension + nsitfCharge +
        bonusTotal + totalAllowances - totalDeductions - totalAdvanceRepayments;

      // Core upsert — uses partial unique indexes:
      //   payroll_runs_period_no_segment_uniq (period) WHERE segment IS NULL
      //   payroll_runs_period_segment_uniq (period, payroll_segment_id) WHERE NOT NULL
      // For un-segmented runs, onConflict targets the period-only index.
      // For segmented runs, we include payroll_segment_id in the payload.
      const segmentId = form.payroll_segment_id || null;
      const upsertPayload: Record<string, unknown> = {
        period: form.period,
        total_contractor_ngn: totalContractor,
        total_employee_ngn: totalEmployee,
        total_expenses_ngn: totalExpenses,
        paye_ngn: paye,
        pension_ngn: pension,
        nhf_ngn: nhf,
        employer_pension_ngn: employerPension,
        total_burn_ngn: burn,
        status: 'draft',
        created_by: profile?.id || null,
      };
      if (segmentId) upsertPayload.payroll_segment_id = segmentId;
      const { error } = await supabase.from('payroll_runs').upsert(
        upsertPayload,
        { onConflict: segmentId ? 'period,payroll_segment_id' : 'period' },
      );

      // Extended columns — best-effort; silently ignored if DB migration not run.
      let extUpdate = supabase.from('payroll_runs').update({
        period_type: form.period_type,
        employee_count: empCount,
        employer_pension_ngn: employerPension,
        bonuses_json: form.bonuses.length > 0 ? form.bonuses : null,
        allowances_json: totalAllowances > 0
          ? { housing_pct: form.housing_allowance_pct, transport_per_emp: form.transport_per_emp, meal_per_emp: form.meal_per_emp, total: totalAllowances }
          : null,
        payroll_segment_id: segmentId,
      } as any).eq('period', form.period);
      if (segmentId) extUpdate = extUpdate.eq('payroll_segment_id', segmentId);
      else extUpdate = extUpdate.is('payroll_segment_id', null);
      await extUpdate;
      if (error) throw error;
      await logAudit(
        'payroll_created',
        `Payroll draft for ${monthLabel(form.period)} (${formatNaira(burn)} total burn)`,
        profile,
      );
      toast({ title: 'Payroll drafted', description: monthLabel(form.period) });
      setDialog(false);
      load();
    } catch (err: any) {
      toast({
        title: 'Draft failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  // Recall a pending-approval run back to draft so the originator (or
  // an admin) can edit it. Approved + paid runs can't be recalled —
  // that would corrupt the audit trail. The frontend hides the button
  // for those statuses, but the RLS on payroll_runs is the actual gate.
  const recallToDraft = async (run: PayrollRun) => {
    if (run.status !== 'pending_approval') return;
    if (!(await confirm({
      title: 'Recall to draft?',
      description: `Recall "${run.period}" back to draft? You'll need to resubmit for approval after editing.`,
    }))) return;
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'draft' })
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Recall failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('payroll_run_recalled', `Payroll run ${run.period} recalled to draft`, profile);
    toast({ title: 'Run recalled to draft' });
    await load();
  };

  // Delete a draft payroll run. Restricted to `draft` because anything
  // submitted has been seen by an approver and deleting it silently
  // would erase that audit step. Use Recall first to send a pending
  // run back to draft, then Delete.
  const deleteDraft = async (run: PayrollRun) => {
    if (run.status !== 'draft') {
      toast({
        title: 'Only drafts can be deleted',
        description: 'Recall a pending run to draft first, or contact an admin to reject an approved run.',
        variant: 'destructive',
      });
      return;
    }
    if (!(await confirm({
      title: 'Delete draft?',
      description: `Delete the draft for "${run.period}"? This cannot be undone.`,
      variant: 'destructive',
    }))) return;
    const { error } = await supabase
      .from('payroll_runs')
      .delete()
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('payroll_run_deleted', `Payroll draft ${run.period} deleted`, profile);
    toast({ title: 'Draft deleted' });
    await load();
  };

  const submit = async (run: PayrollRun) => {
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'pending_approval' })
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'payroll_submitted',
      `Payroll ${monthLabel(run.period)} submitted for approval`,
      profile,
    );
    toast({ title: 'Payroll submitted for approval' });
    load();
  };

  // Mirrors the server-side rule in approve_payroll_run() so the button can
  // be disabled with an explanation instead of failing only after the click.
  const isSelfApprovalBlocked = (run: PayrollRun) =>
    run.created_by === profile?.id && !['admin', 'super_admin'].includes(profile?.role || '');

  const approve = async (run: PayrollRun) => {
    // Routed through the approve_payroll_run RPC (not a raw .update()) so the
    // self-approval block is enforced server-side and can't be bypassed —
    // the person who drafted this run cannot also approve it unless they're
    // admin/super_admin.
    const { error } = await supabase.rpc('approve_payroll_run', { p_run_id: run.id });
    if (error) {
      toast({ title: 'Approve failed', description: error.message, variant: 'destructive' });
      return;
    }

    // Compliance Autopilot: writes PAYE / pension / NHF / NSITF rows into
    // compliance_filings for this period with the actual amounts and a
    // per-PFA pension breakdown. Never blocks approval if it fails — the
    // operator can re-trigger from the Compliance page.
    const { data: autoSummary, error: autoErr } = await supabase.rpc(
      'auto_populate_filings_from_payroll',
      { p_payroll_run_id: run.id },
    );
    if (autoErr) {
      toast({
        title: 'Approved — compliance auto-fill failed',
        description: `${autoErr.message}. You can refresh the Compliance page to retry.`,
        variant: 'destructive',
      });
    }

    await logAudit(
      'payroll_approved',
      `Payroll ${monthLabel(run.period)} approved (${formatNaira(run.total_burn_ngn)})`,
      profile,
    );
    burst({ palette: 'success', count: 70 });

    // Anomaly scan — runs the 7 payroll-level rules. Fire-and-forget; the
    // safe wrapper swallows errors so a scan failure can't block approval.
    const anomalyCount = await scanPayrollRunAnomaliesSafe(run.id);
    toast({
      title: 'Payroll approved',
      description: autoSummary
        ? `Compliance filings auto-populated for ${run.period}.` +
          (anomalyCount > 0 ? ` ${anomalyCount} anomal${anomalyCount === 1 ? 'y' : 'ies'} flagged for review.` : '')
        : 'Payroll is now ready to disburse.' +
          (anomalyCount > 0 ? ` ${anomalyCount} anomal${anomalyCount === 1 ? 'y' : 'ies'} flagged for review.` : ''),
    });

    // Auto-generate payslips right after approval so they're ready without a
    // separate click. Idempotent (upsert on payroll_run_id+employee_id), so the
    // manual "Generate payslips" button stays available for re-runs. Skipped if
    // the approver lacks the payslip-generation permission.
    if (canGeneratePayslipsPerm) {
      await generatePayslips({ ...run, status: 'approved' });
    }
    load();
  };

  const openAdjustments = async (run: PayrollRun) => {
    setAdjustRun(run);
    setAdjustForm({ employee_id: '', kind: 'bonus', description: '', amount: '', taxable: true });
    setAdjustLoading(true);
    const [{ data: adj }, { data: emps }] = await Promise.all([
      (supabase as any).from('payslip_adjustments').select('*').eq('payroll_run_id', run.id).order('created_at', { ascending: true }),
      (supabase as any).from('profiles').select('id, full_name, first_name, last_name, email')
        .eq('status', 'active').neq('role', 'driver').gt('salary_ngn', 0).order('full_name'),
    ]);
    setAdjustList(adj || []);
    setAdjustEmployees(((emps || []) as any[]).map((e) => ({
      id: e.id, name: displayName(e.first_name, e.last_name, e.full_name || e.email),
    })));
    setAdjustLoading(false);
  };

  const addAdjustment = async () => {
    if (!adjustRun) return;
    const amt = Number(adjustForm.amount);
    if (!adjustForm.employee_id) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!adjustForm.description.trim()) { toast({ title: 'Description is required', variant: 'destructive' }); return; }
    if (!(amt > 0)) { toast({ title: 'Enter an amount greater than ₦0', variant: 'destructive' }); return; }
    setAdjustSaving(true);
    const { data, error } = await (supabase as any).from('payslip_adjustments').insert({
      payroll_run_id: adjustRun.id,
      employee_id: adjustForm.employee_id,
      kind: adjustForm.kind,
      description: adjustForm.description.trim(),
      amount_ngn: amt,
      taxable: adjustForm.kind === 'deduction' ? false : adjustForm.taxable,
      created_by: profile?.id || null,
    }).select().single();
    setAdjustSaving(false);
    if (error) { toast({ title: 'Could not add adjustment', description: error.message, variant: 'destructive' }); return; }
    setAdjustList((l) => [...l, data]);
    setAdjustForm({ employee_id: '', kind: 'bonus', description: '', amount: '', taxable: true });
    void logAudit(
      'payslip_adjustment_added' as never,
      `Payslip adjustment (${data.kind} ${formatNaira(Number(data.amount_ngn))}) added for ${adjustEmployees.find((e) => e.id === data.employee_id)?.name || data.employee_id} · ${monthLabel(adjustRun.period)}`,
      profile,
    );
    toast({ title: 'Adjustment added', description: 'Re-generate payslips for this run to apply it.' });
  };

  const removeAdjustment = async (id: string) => {
    const { error } = await (supabase as any).from('payslip_adjustments').delete().eq('id', id);
    if (error) { toast({ title: 'Could not remove', description: error.message, variant: 'destructive' }); return; }
    setAdjustList((l) => l.filter((a) => a.id !== id));
  };

  async function generatePayslips(run: PayrollRun) {
    setWorking(true);
    setSalaryErrors([]);
    try {
      const { data: employees, error: fetchErr } = await supabase
        .from('profiles')
        .select(`
          id, full_name, first_name, last_name, email, role, job_title, salary_ngn, phone,
          pension_enabled, nhf_enabled, nhis_enabled, paye_enabled,
          use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn,
          tax_id, pension_pin, nhf_number, employee_number,
          bank_name, bank_account_number, bank_account_name,
          department_id, employee_category, employment_type, pay_group_id,
          voluntary_pension_pct,
          department:departments!department_id(name)
        `)
        .eq('status', 'active')
        .neq('role', 'driver')
        .gt('salary_ngn', 0)
        .limit(500);
      if (fetchErr) throw fetchErr;

      // Apply the same payroll segment filter that was used when this run was
      // drafted, so payslip generation always matches the draft's headcount.
      // A run with no segment (payroll_segment_id null — the legacy case)
      // is unaffected: fetchSegmentRules(null) resolves to null, and
      // filterEmployeesForSegment treats null rules as "match everyone".
      const runSegmentRules = await fetchSegmentRules(run.payroll_segment_id);
      const list = filterEmployeesForSegment((employees || []) as any[], runSegmentRules);
      if (list.length === 0) {
        toast({
          title: 'No active employees with salaries configured',
          description: run.payroll_segment_id
            ? 'No employees match this run\'s pay group. Check the pay group filter or employee categories.'
            : 'Add salary amounts in employee profiles first.',
          variant: 'destructive',
        });
        return;
      }

      // Pull every field the new Nigerian-standard payslip needs in
      // one shot — RC + TIN + address + logo from company_settings.
      // Each field is optional on the payslip (header degrades
      // gracefully when a tenant hasn't filled in their RC), so an
      // empty company_settings row still produces a valid payslip.
      const { data: settings } = await supabase
        .from('company_settings')
        .select('company_name, rc_number, tin, address, logo_url, nsitf_enabled, itf_enabled, payroll_notifications_muted')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const companyName    = (settings as any)?.company_name || 'KD Squares Ltd';
      const companyRc      = (settings as any)?.rc_number    || null;
      const companyTin     = (settings as any)?.tin          || null;
      const companyAddress = (settings as any)?.address      || null;
      const companyLogo    = (settings as any)?.logo_url     || null;
      const nsitfEnabled   = (settings as any)?.nsitf_enabled !== false;
      const itfEnabled     = (settings as any)?.itf_enabled !== false;
      // Dry-run / correction escape hatch — payslips still generate and
      // save normally, only the employee-facing notification fan-out
      // (email/in-app/WhatsApp/SMS) is skipped. Flip back off afterward.
      const notificationsMuted = (settings as any)?.payroll_notifications_muted === true;

      // Fetch all active employee deductions, advances, AND outstanding EWA
      // requests that need to be settled this period in one batch.
      const [y2, m2] = run.period.split('-');
      const periodStartDate = `${y2}-${m2}-01`;
      const periodEndDate = new Date(Number(y2), Number(m2), 0).toISOString().slice(0, 10);

      // Approved unpaid leave overlapping this payroll period, per employee.
      // Best-effort: a query failure here must never block payroll generation,
      // so it's isolated from the Promise.all batch below and swallows errors.
      const unpaidLeaveDaysByEmployee = new Map<string, number>();
      try {
        const { data: unpaidLeaveRows, error: unpaidLeaveErr } = await supabase
          .from('leave_requests')
          .select('employee_id, days_requested, start_date, end_date')
          .eq('leave_type', 'unpaid')
          .eq('status', 'approved')
          .lte('start_date', periodEndDate)
          .gte('end_date', periodStartDate);
        if (unpaidLeaveErr) throw unpaidLeaveErr;
        const MS_PER_DAY = 86_400_000;
        for (const r of (unpaidLeaveRows || []) as any[]) {
          if (!r.employee_id || !r.start_date || !r.end_date) continue;
          // Clip leave interval to the payroll period so cross-month
          // requests are only charged for the days that fall within this
          // period (fixes double-deduction when leave spans a month boundary).
          const leaveStart = new Date(r.start_date + 'T00:00:00').getTime();
          const leaveEnd   = new Date(r.end_date   + 'T00:00:00').getTime();
          const pStart     = new Date(periodStartDate + 'T00:00:00').getTime();
          const pEnd       = new Date(periodEndDate   + 'T00:00:00').getTime();
          const overlapDays = Math.max(0,
            Math.floor((Math.min(leaveEnd, pEnd) - Math.max(leaveStart, pStart)) / MS_PER_DAY) + 1,
          );
          if (overlapDays <= 0) continue;
          const prev = unpaidLeaveDaysByEmployee.get(r.employee_id) || 0;
          unpaidLeaveDaysByEmployee.set(r.employee_id, prev + overlapDays);
        }
      } catch (leaveErr: any) {
        console.warn('[KDOps] unpaid leave lookup failed, proceeding with 0 unpaid days:', leaveErr?.message || leaveErr);
      }

      const [{ data: allDeductions }, { data: allAdvances }, { data: allEwa }, { data: allAdjustments }, { data: allEarnings }] = await Promise.all([
        supabase
          .from('employee_deductions')
          .select('id, entity_id, description, amount_ngn, total_deductible_amount, amount_deducted_to_date')
          .eq('entity_type', 'employee')
          .eq('status', 'active')
          .lte('start_date', periodStartDate)
          .or(`end_date.is.null,end_date.gte.${periodStartDate}`),
        supabase
          .from('employee_advances')
          .select('id, employee_id, deduction_per_month, outstanding_ngn')
          .eq('status', 'active')
          .lte('start_period', run.period),
        supabase
          .from('ewa_requests')
          .select('id, employee_id, amount_ngn, status')
          .eq('settlement_period', run.period)
          .eq('status', 'disbursed'),
        (supabase as any)
          .from('payslip_adjustments')
          .select('id, employee_id, kind, description, amount_ngn, taxable')
          .eq('payroll_run_id', run.id),
        supabase
          .from('employee_earnings')
          .select('id, entity_id, description, amount_ngn, earning_type, is_taxable')
          .eq('entity_type', 'employee')
          .eq('status', 'active')
          .lte('start_date', periodStartDate)
          .or(`end_date.is.null,end_date.gte.${periodStartDate}`),
      ]);

      // Group deductions by employee id, excluding capped ones
      const deductionsByEmployee = new Map<string, any[]>();
      for (const d of (allDeductions || [])) {
        if (d.total_deductible_amount != null && Number(d.amount_deducted_to_date || 0) >= Number(d.total_deductible_amount)) continue;
        if (!deductionsByEmployee.has(d.entity_id)) deductionsByEmployee.set(d.entity_id, []);
        deductionsByEmployee.get(d.entity_id)!.push(d);
      }

      // Group advances by employee id
      const advancesByEmployee = new Map<string, any[]>();
      for (const a of (allAdvances || [])) {
        if (Number(a.outstanding_ngn || 0) <= 0) continue;
        if (!advancesByEmployee.has(a.employee_id)) advancesByEmployee.set(a.employee_id, []);
        advancesByEmployee.get(a.employee_id)!.push(a);
      }

      // Group outstanding EWA by employee id — these are settled in full
      // against this payroll run by deducting the amount from net pay.
      const ewaByEmployee = new Map<string, any[]>();
      for (const w of (allEwa || [])) {
        if (!ewaByEmployee.has(w.employee_id)) ewaByEmployee.set(w.employee_id, []);
        ewaByEmployee.get(w.employee_id)!.push(w);
      }

      // Group per-employee one-off adjustments (bonus / overtime / allowance /
      // deduction) entered for THIS run.
      const adjustmentsByEmployee = new Map<string, any[]>();
      for (const adj of ((allAdjustments || []) as any[])) {
        if (!adjustmentsByEmployee.has(adj.employee_id)) adjustmentsByEmployee.set(adj.employee_id, []);
        adjustmentsByEmployee.get(adj.employee_id)!.push(adj);
      }

      // Group recurring earnings by employee id
      const earningsByEmployee = new Map<string, any[]>();
      for (const earn of ((allEarnings || []) as any[])) {
        if (!earningsByEmployee.has(earn.entity_id)) earningsByEmployee.set(earn.entity_id, []);
        earningsByEmployee.get(earn.entity_id)!.push(earn);
      }

      // ── YTD aggregation ─────────────────────────────────────────────
      // Pull every payslip already issued THIS calendar year so each
      // new payslip can render a "YTD gross / PAYE / pension / net"
      // summary box. One query for everyone — vastly cheaper than per
      // employee. Filter by period prefix (e.g. "2026-") rather than
      // created_at so a back-dated payslip still rolls into the right
      // year. Excludes the current run so we don't double-count.
      const yearPrefix = run.period.split('-')[0] + '-';
      const { data: ytdRows } = await supabase
        .from('payslips')
        .select('employee_id, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, nhis_ngn, avc_ngn, net_ngn, period, payroll_run_id')
        .like('period', `${yearPrefix}%`)
        .neq('payroll_run_id', run.id);
      const ytdByEmployee = new Map<string, { gross: number; paye: number; pension: number; nhf: number; nhis: number; avc: number; net: number }>();
      for (const r of (ytdRows || []) as any[]) {
        if (!r.employee_id) continue;
        const acc = ytdByEmployee.get(r.employee_id) ?? { gross: 0, paye: 0, pension: 0, nhf: 0, nhis: 0, avc: 0, net: 0 };
        acc.gross   += Number(r.gross_ngn   || 0);
        acc.paye    += Number(r.paye_ngn    || 0);
        acc.pension += Number(r.pension_ngn || 0);
        acc.nhf     += Number(r.nhf_ngn     || 0);
        acc.nhis    += Number(r.nhis_ngn    || 0);
        acc.avc     += Number(r.avc_ngn     || 0);
        acc.net     += Number(r.net_ngn     || 0);
        ytdByEmployee.set(r.employee_id, acc);
      }

      // Period start / end / pay date for the strip on the payslip.
      // The payroll_runs row already carries a pay_date (added in the
      // payroll_world_class migration); fall back to the last day of
      // the period if it's null on older runs.
      const [y2y, m2m] = run.period.split('-').map(Number);
      const periodStart = `${run.period}-01`;
      const periodEnd   = new Date(y2y, m2m, 0).toISOString().slice(0, 10);
      const payDate     = (run as any).pay_date || periodEnd;

      let succeeded = 0;
      let failed = 0;
      for (const e of list) {
        toast({
          title: `Generating payslip ${succeeded + failed + 1} of ${list.length}…`,
          description: displayName(e.first_name, e.last_name, e.full_name || e.email),
        });
        try {
          const empGross = Number(e.salary_ngn);

          // One-off adjustments for this run/employee: earnings add to pay,
          // deductions reduce it. Taxable earnings raise the PAYE base; pension
          // and NHF stay on base salary (one-off bonuses are not pensionable
          // under common Nigerian practice).
          const empAdjustments = adjustmentsByEmployee.get(e.id) || [];
          const adjEarnings   = empAdjustments.filter((a: any) => a.kind !== 'deduction');
          const adjDeductions = empAdjustments.filter((a: any) => a.kind === 'deduction');
          const taxableEarningsAdd = adjEarnings.reduce((s: number, a: any) => s + (a.taxable !== false ? Number(a.amount_ngn || 0) : 0), 0);
          const nonTaxEarningsAdd  = adjEarnings.reduce((s: number, a: any) => s + (a.taxable === false ? Number(a.amount_ngn || 0) : 0), 0);

          // Recurring earnings from employee_earnings table
          const empRecurringEarnings = earningsByEmployee.get(e.id) || [];
          const recurTaxable    = empRecurringEarnings.filter((r: any) => r.is_taxable !== false).reduce((s: number, r: any) => s + Number(r.amount_ngn || 0), 0);
          const recurNonTaxable = empRecurringEarnings.filter((r: any) => r.is_taxable === false).reduce((s: number, r: any) => s + Number(r.amount_ngn || 0), 0);

          const earningsAddTotal   = taxableEarningsAdd + nonTaxEarningsAdd + recurTaxable + recurNonTaxable;
          const adjDeductTotal     = adjDeductions.reduce((s: number, a: any) => s + Number(a.amount_ngn || 0), 0);
          const bonusSum    = adjEarnings.filter((a: any) => a.kind === 'bonus').reduce((s: number, a: any) => s + Number(a.amount_ngn || 0), 0);
          const overtimeSum = adjEarnings.filter((a: any) => a.kind === 'overtime').reduce((s: number, a: any) => s + Number(a.amount_ngn || 0), 0);
          const allowanceLines = [
            ...adjEarnings.filter((a: any) => a.kind === 'allowance').map((a: any) => ({ description: a.description, amount_ngn: Number(a.amount_ngn || 0) })),
            ...empRecurringEarnings.map((r: any) => ({ description: r.description, amount_ngn: Number(r.amount_ngn || 0) })),
          ];

          // Honour the per-employee statutory toggles. Defaults match
          // Nigerian regulatory baseline: PAYE + Pension on, NHF off.
          // Sprint A: pension uses (basic+housing+transport) and NHF uses
          // basic only when the employee has opted into salary components.
          const useComps      = !!e.use_salary_components;
          const compBasic     = Number(e.basic_ngn || 0);
          const compHousing   = Number(e.housing_ngn || 0);
          const compTransport = Number(e.transport_ngn || 0);
          const compOther     = Number(e.other_allowances_ngn || 0);
          const empUnpaidLeaveDays = unpaidLeaveDaysByEmployee.get(e.id) || 0;
          const payeBase   = empGross + taxableEarningsAdd + recurTaxable;
          const empBreak   = computePayslip({
            grossMonthlyNgn: payeBase,
            pensionEnabled: e.pension_enabled !== false,
            nhfEnabled: e.nhf_enabled === true,
            nhisEnabled: e.nhis_enabled === true,
            voluntaryPensionPct: Number(e.voluntary_pension_pct || 0),
            useComponents: useComps,
            basicMonthlyNgn: compBasic,
            housingMonthlyNgn: compHousing,
            transportMonthlyNgn: compTransport,
            otherAllowancesMonthlyNgn: compOther,
            unpaidLeaveDays: empUnpaidLeaveDays,
          });
          // Read the already-correct (and leave-prorated) statutory bases
          // from computePayslip instead of recomputing them inline — keeps
          // one source of truth and avoids the prior bug where the
          // components-plan path used the full unreduced sum.
          const pensionBaseM  = empBreak.pensionBaseMonthlyNgn;
          const nhfBaseM      = empBreak.nhfBaseMonthlyNgn;
          const empUnpaidLeaveDeduction = empBreak.unpaidLeaveDeductionMonthlyNgn;
          const empPaye    = e.paye_enabled    !== false ? empBreak.payeMonthlyNgn          : 0;
          const empPension = e.pension_enabled !== false ? pensionBaseM * PENSION_RATE      : 0;
          const empNhf     = e.nhf_enabled     === true  ? nhfBaseM     * NHF_RATE          : 0;
          const empNhis    = empBreak.nhisEmployeeMonthlyNgn;
          // Employer-side amounts surfaced on the payslip (informational).
          const empPensionEmployer = e.pension_enabled !== false ? pensionBaseM * EMPLOYER_PENSION_RATE : 0;
          const empNhisEmployer    = empBreak.nhisEmployerMonthlyNgn;
          const empNsitf           = nsitfEnabled ? empBreak.nsitfMonthlyNgn : 0;
          const empAvc             = empBreak.voluntaryPensionMonthlyNgn;
          const empDeductions = deductionsByEmployee.get(e.id) || [];
          const empDeductionsTotal = empDeductions.reduce((s: number, d: any) => s + Number(d.amount_ngn), 0);
          const empAdvances = advancesByEmployee.get(e.id) || [];
          // Deduct the smaller of deduction_per_month or outstanding_ngn to avoid over-deducting
          const empAdvancesTotal = empAdvances.reduce(
            (s: number, a: any) => s + advanceDeductionFor(a.deduction_per_month, a.outstanding_ngn),
            0,
          );
          const empEwa = ewaByEmployee.get(e.id) || [];
          const empEwaTotal = empEwa.reduce((s: number, w: any) => s + Number(w.amount_ngn || 0), 0);
          const empGrossTotal = empGross + earningsAddTotal;
          const empNet = Math.max(0, empGrossTotal - empUnpaidLeaveDeduction - empPaye - empPension - empAvc - empNhf - empNhis - empDeductionsTotal - empAdvancesTotal - empEwaTotal - adjDeductTotal);
          const empName = displayName(e.first_name, e.last_name, e.full_name || e.email);

          // Build combined extra_deductions list for payslip (deductions + advance repayments + EWA settlements + one-off deductions)
          const allEmpDeductionLines = [
            ...empDeductions.map((d: any) => ({ description: d.description, amount_ngn: Number(d.amount_ngn) })),
            ...empAdvances.map((a: any) => ({
              description: 'Salary Advance Repayment',
              amount_ngn: advanceDeductionFor(a.deduction_per_month, a.outstanding_ngn),
            })),
            ...empEwa.map((w: any) => ({
              description: 'Earned Wage Access (mid-month draw)',
              amount_ngn: Number(w.amount_ngn || 0),
            })),
            ...adjDeductions.map((a: any) => ({
              description: a.description,
              amount_ngn: Number(a.amount_ngn || 0),
            })),
          ];

          // Employer contributions — informational on the payslip.
          // empPensionEmployer + empNsitf are already computed above (using
          // the correct statutory bases when salary components are on).
          const ytd                = ytdByEmployee.get(e.id);

          const html = renderPayslipHtml({
            // Company
            company_name:    companyName,
            company_address: companyAddress,
            company_rc:      companyRc,
            company_tin:     companyTin,
            logo_url:        companyLogo,

            // Employee
            employee_name:         empName,
            employee_email:        e.email,
            employee_role:         e.job_title || e.role,
            employee_number:       e.employee_number ?? null,
            employee_department:   e.department?.name ?? null,
            employee_tax_id:       e.tax_id ?? null,
            employee_pension_pin:  e.pension_pin ?? null,
            employee_nhf_number:   e.nhf_number ?? null,

            // Period
            period:       run.period,
            period_start: periodStart,
            period_end:   periodEnd,
            pay_date:     payDate,

            // Earnings — Nigerian convention splits base salary into
            // basic 60% / housing 20% / transport 20%, then appends any
            // one-off allowances, bonus and overtime entered for this run.
            // Components: when this employee has been migrated to real salary
            // components, use the actual breakdown; otherwise fall back to
            // the 60/20/20 statutory-friendly split (legacy behavior).
            components: useComps
              ? {
                  basic_ngn:     compBasic,
                  housing_ngn:   compHousing,
                  transport_ngn: compTransport,
                  ...(compOther > 0 ? {
                    other_allowances: [
                      { description: 'Other Allowances', amount_ngn: compOther },
                      ...allowanceLines,
                    ],
                  } : (allowanceLines.length ? { other_allowances: allowanceLines } : {})),
                  ...(bonusSum    ? { bonus_ngn: bonusSum }       : {}),
                  ...(overtimeSum ? { overtime_ngn: overtimeSum } : {}),
                }
              : {
                  basic_ngn:     Math.round(empGross * 0.60),
                  housing_ngn:   Math.round(empGross * 0.20),
                  transport_ngn: Math.round(empGross * 0.20),
                  ...(allowanceLines.length ? { other_allowances: allowanceLines } : {}),
                  ...(bonusSum    ? { bonus_ngn: bonusSum }       : {}),
                  ...(overtimeSum ? { overtime_ngn: overtimeSum } : {}),
                },

            // Stats — gross includes one-off earnings so the payslip reconciles.
            gross_ngn:   empGrossTotal,
            paye_ngn:    empPaye,
            pension_ngn: empPension,
            avc_ngn:     empAvc,
            nhf_ngn:     empNhf,
            nhis_ngn:    empNhis,
            net_ngn:     empNet,
            unpaid_leave_deduction: empUnpaidLeaveDeduction,
            unpaid_leave_days:      empUnpaidLeaveDays,
            extra_deductions: allEmpDeductionLines,

            // Employer contributions (informational)
            employer_costs: {
              pension_employer_ngn: empPensionEmployer,
              nhis_employer_ngn:   empNhisEmployer,
              nsitf_ngn:            empNsitf,
              // ITF is annual + conditional (≥ 5 staff or ≥ ₦50M
              // turnover); leave it off the per-employee payslip
              // — it shows on the company-level payroll summary.
            },

            // Year-to-date — only set if the employee has prior
            // payslips this year, so brand-new hires don't see
            // an empty YTD box.
            ytd: ytd ? {
              gross_ngn:   ytd.gross   + empGrossTotal,
              paye_ngn:    ytd.paye    + empPaye,
              pension_ngn: ytd.pension + empPension,
              nhf_ngn:     ytd.nhf     + empNhf,
              nhis_ngn:    ytd.nhis    + empNhis,
              avc_ngn:     ytd.avc     + empAvc,
              net_ngn:     ytd.net     + empNet,
            } : undefined,

            // Bank
            bank_name:         e.bank_name         ?? null,
            bank_account:      e.bank_account_number ?? null,
            bank_account_name: e.bank_account_name ?? null,

            generated_by: profile?.full_name || profile?.email,
          }, { autoPrint: false });

          const path = `${e.id}/${run.period}.html`;
          const { error: uploadErr } = await supabase.storage
            .from('payslips')
            .upload(path, new Blob([html], { type: 'text/html' }), {
              upsert: true,
              contentType: 'text/html',
            });
          if (uploadErr) throw uploadErr;

          // The payslips bucket is private (RLS scoped per-employee) — a
          // getPublicUrl() link 404s. Send employees to the in-app payslips
          // tab instead, which pulls a fresh short-lived signed URL on open.
          const payslipViewUrl = `${window.location.origin}/profile?tab=payslips`;

          const { error: upsertErr } = await supabase.from('payslips').upsert(
            {
              payroll_run_id: run.id,
              employee_id: e.id,
              employee_name: empName,
              employee_email: e.email,
              period: run.period,
              gross_ngn: empGrossTotal,
              paye_ngn: empPaye,
              pension_ngn: empPension,
              nhf_ngn: empNhf,
              nhis_ngn: empNhis,
              avc_ngn: empAvc,
              net_ngn: empNet,
              deductions_ngn: empDeductionsTotal + empAdvancesTotal + empEwaTotal + adjDeductTotal + empUnpaidLeaveDeduction,
              deductions_json: (() => {
                const lines = [
                  ...(empUnpaidLeaveDeduction > 0 ? [{
                    description: `Unpaid Leave (${empUnpaidLeaveDays} day${empUnpaidLeaveDays === 1 ? '' : 's'})`,
                    amount_ngn: empUnpaidLeaveDeduction,
                  }] : []),
                  ...empDeductions.map((d: any) => ({ id: d.id, description: d.description, amount_ngn: Number(d.amount_ngn) })),
                  ...empAdvances.map((a: any) => ({
                    advance_id: a.id,
                    description: 'Salary Advance Repayment',
                    amount_ngn: advanceDeductionFor(a.deduction_per_month, a.outstanding_ngn),
                  })),
                  ...empEwa.map((w: any) => ({
                    ewa_request_id: w.id,
                    description: 'Earned Wage Access (mid-month draw)',
                    amount_ngn: Number(w.amount_ngn || 0),
                  })),
                  ...adjDeductions.map((a: any) => ({
                    adjustment_id: a.id,
                    description: a.description,
                    amount_ngn: Number(a.amount_ngn || 0),
                  })),
                ];
                return lines.length > 0 ? lines : null;
              })(),
              earnings_json: (() => {
                const lines = [
                  ...adjEarnings.map((a: any) => ({ adjustment_id: a.id, description: a.description, amount_ngn: Number(a.amount_ngn || 0), kind: a.kind })),
                  ...empRecurringEarnings.map((r: any) => ({ earning_id: r.id, description: r.description, amount_ngn: Number(r.amount_ngn || 0), type: r.earning_type })),
                ];
                return lines.length > 0 ? lines : null;
              })(),
              storage_path: path,
              generated_by: profile?.id || null,
            },
            { onConflict: 'payroll_run_id,employee_id' } as any,
          );
          if (upsertErr) throw upsertErr;

          succeeded++;
          if (!notificationsMuted) {
            // Multi-channel notification (in-app + WhatsApp + optional SMS).
            // Respects each user's notification_preferences.whatsapp_payslip /
            // sms_payslip toggles, validates the NG phone format, and dedups
            // re-runs via the per-(payroll, employee) idempotency key.
            notifyChannels({
              user: {
                id: e.id,
                full_name: empName,
                email: e.email,
                phone: e.phone,
              },
              category: 'payslip',
              kind: 'payslip_ready',
              payload: {
                name: empName,
                period: monthLabel(run.period),
                net_ngn: empNet,
                url: payslipViewUrl,
              },
              idempotencyKey: `payslip_ready:${run.id}:${e.id}`,
            });
            // Email dispatch — separate from notifyChannels because the
            // notify module explicitly excludes email today. Best-effort; the
            // helper swallows failures so a template outage never blocks
            // payslip generation or downstream payroll actions.
            notifyPayslipReady({
              employeeEmail: e.email,
              employeeName: empName,
              period: monthLabel(run.period),
              grossFormatted: formatNaira(empGrossTotal),
              deductionsFormatted: formatNaira(
                empPaye + empPension + empNhf + empUnpaidLeaveDeduction +
                empDeductionsTotal + empAdvancesTotal + empEwaTotal + adjDeductTotal,
              ),
              netFormatted: formatNaira(empNet),
              payslipUrl: payslipViewUrl,
            });
          }
        } catch (empErr: any) {
          console.warn('[KDOps] payslip generation failed for', e.email, empErr);
          failed++;
        }
      }

      await logAudit(
        'payslip_generated',
        `Generated ${succeeded} payslip(s) for ${monthLabel(run.period)}${failed ? ` (${failed} failed)` : ''}`,
        profile,
      );

      // Settle every approved/disbursed EWA request that was deducted above —
      // flips status to 'settled' so it doesn't get double-deducted next month.
      if ((allEwa || []).length > 0) {
        const { error: settleErr } = await supabase.rpc('settle_ewa_for_payroll', {
          p_payroll_run_id: run.id,
        });
        if (settleErr) {
          console.warn('[KDOps] EWA settlement RPC failed:', settleErr.message);
          toast({
            title: 'Payslips generated, but EWA settlement failed',
            description: `Some EWA requests are still marked unsettled: ${settleErr.message}`,
            variant: 'destructive',
          });
        }
      }

      if (failed > 0) {
        toast({
          title: `${succeeded} of ${list.length} payslips generated`,
          description: `${failed} failed — check employee data and try again.`,
          variant: 'destructive',
        });
      } else {
        burst({ palette: 'gold', count: 60 });
        toast({
          title: `${succeeded} payslip${succeeded === 1 ? '' : 's'} generated`,
          description: `All payslips for ${monthLabel(run.period)} saved successfully.`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Payslip generation failed',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  }

  const canDisburse = ['super_admin', 'admin', 'finance'].includes(profile?.role || '');
  const canApprovePerm = usePermission('payroll.approve');

  const openDisburse = async (run: PayrollRun) => {
    setWorking(true);
    try {
      const { data: slips, error } = await supabase
        .from('payslips')
        .select('id, employee_id, employee_name, net_ngn')
        .eq('payroll_run_id', run.id);
      if (error) throw error;
      if (!slips || slips.length === 0) {
        toast({
          title: 'No payslips found',
          description: 'Generate payslips for this run before disbursing.',
          variant: 'destructive',
        });
        return;
      }
      setDisburseErrors([]);
      setDisburseTarget({ run, payslips: slips });
    } catch (err: any) {
      toast({ title: 'Failed to load payslips', description: err?.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const doDisburse = async () => {
    if (!disburseTarget) return;
    const { run, payslips } = disburseTarget;
    setDisbursing(true);
    const errors: string[] = [];
    let succeeded = 0;
    let locked = false;

    try {
      // Server-side lock: row-locks the run and atomically flips
      // approved -> processing. If another admin (or another tab/click)
      // already claimed this run, this raises and we abort before creating
      // anything — closes the double-disbursement hole where two concurrent
      // callers both read status='approved' from stale client state.
      try {
        await supabase.rpc('lock_payroll_run_for_disbursement', { p_run_id: run.id });
        locked = true;
      } catch (lockErr: any) {
        toast({
          title: 'Cannot disburse',
          description: lockErr?.message || 'This payroll run is not ready for disbursement (it may already be paid or in progress).',
          variant: 'destructive',
        });
        setDisburseTarget(null);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const totalNet = payslips.reduce((s, p) => s + Number(p.net_ngn || 0), 0);

      // ROOT CAUSE FIX: this dispatch path was a THIRD independent
      // Paystack-only money-mover (alongside QuickPay and batch-worker),
      // completely bypassing the active_payment_provider toggle. Running
      // Payroll while Flutterwave was active would have silently disbursed
      // salaries through Paystack anyway. Read the active provider once,
      // stamp the batch with it, and branch every subsequent call.
      const { data: settingsRow } = await supabase
        .from('company_settings')
        .select('active_payment_provider')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const activeProvider: 'paystack' | 'flutterwave' =
        (settingsRow as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack';
      if (activeProvider === 'flutterwave') {
        await fetchFlutterwaveBanks();
      }

      // Crash-recovery: if a previous doDisburse attempt for this run already
      // created a batch and crashed/closed before finishing, reuse that SAME
      // batch instead of creating a new one — otherwise a retry would create
      // brand-new batch_items (brand-new deterministic provider references)
      // for employees who may have already been paid in the crashed attempt.
      // Created as status='processing' (not 'approved') so it's a first-class
      // citizen of the same processing/partially_processed status machine
      // batch-worker's orphan watchdog already scans every minute — if THIS
      // tab also crashes mid-loop, the watchdog finishes dispatching whatever
      // batch_items are left 'pending', the same recovery every other batch
      // type in this app already gets.
      const { data: existingBatch } = await supabase
        .from('payment_batches')
        .select('id')
        .eq('payroll_run_id', run.id)
        .in('status', ['processing', 'partially_processed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let batch: { id: string };
      let alreadyCoveredEmployeeIds = new Set<string>();
      if (existingBatch) {
        batch = existingBatch as any;
        const { data: existingItems } = await supabase
          .from('batch_items')
          .select('employee_id')
          .eq('batch_id', batch.id)
          .not('employee_id', 'is', null);
        alreadyCoveredEmployeeIds = new Set((existingItems || []).map((i: any) => i.employee_id));
      } else {
        const { data: newBatch, error: batchErr } = await supabase
          .from('payment_batches')
          .insert({
            name: `Salary ${monthLabel(run.period)}`,
            status: 'processing',
            payment_date: today,
            total_amount: totalNet,
            beneficiary_count: payslips.length,
            provider: activeProvider,
            payroll_run_id: run.id,
          })
          .select()
          .single();
        if (batchErr) throw batchErr;
        batch = newBatch as any;
      }

      for (const slip of payslips) {
        if (alreadyCoveredEmployeeIds.has(slip.employee_id)) continue;
        try {
          const { data: emp, error: empErr } = await supabase
            .from('profiles')
            .select('id, bank_name, bank_account_number, full_name, first_name, last_name, paystack_recipient_code')
            .eq('id', slip.employee_id)
            .single();
          if (empErr || !emp) {
            errors.push(`${slip.employee_name}: could not load profile`);
            continue;
          }
          const bankCode = activeProvider === 'flutterwave'
            ? getFlutterwaveBankCode((emp as any).bank_name)
            : getBankCode((emp as any).bank_name);
          if (!bankCode) {
            errors.push(`${slip.employee_name}: unknown bank "${(emp as any).bank_name}" on ${activeProvider}`);
            continue;
          }
          if (!(emp as any).bank_account_number) {
            errors.push(`${slip.employee_name}: no bank account number on file`);
            continue;
          }

          const empName = displayName(
            (emp as any).first_name,
            (emp as any).last_name,
            (emp as any).full_name || slip.employee_name,
          );

          const { data: item, error: itemErr } = await supabase
            .from('batch_items')
            .insert({
              batch_id: batch.id,
              employee_id: slip.employee_id,
              full_name: empName,
              bank_name: (emp as any).bank_name || '',
              account_number: (emp as any).bank_account_number,
              amount_ngn: Number(slip.net_ngn || 0),
              status: 'pending',
              provider: activeProvider,
            })
            .select()
            .single();
          if (itemErr || !item) {
            errors.push(`${empName}: failed to create payment record`);
            continue;
          }

          const narration = buildNarration({
            kind: 'salary',
            recipientName: empName,
            period: monthLabel(run.period),
          });

          if (activeProvider === 'flutterwave') {
            // Flutterwave path: no separate recipient step — /transfers
            // takes bank_code + account_number directly.
            const compactId = String((item as any).id).replace(/-/g, '').slice(0, 20);
            const ref = `kdopsfw_${compactId}`;
            const { data: fwRes, error: fwErr } = await supabase.functions.invoke('flutterwave-transfer', {
              body: {
                action: 'initiate_transfer',
                reference: ref,
                bank_code: bankCode,
                account_number: (emp as any).bank_account_number,
                amount_ngn: Number(slip.net_ngn || 0),
                reason: narration,
              },
            });
            if (fwErr) throw new Error((fwErr as any)?.message || 'Flutterwave transfer failed');
            const fwData = (fwRes as any)?.data;
            if (!fwData || (fwRes as any)?.ok === false) {
              throw new Error((fwRes as any)?.error || 'Flutterwave transfer rejected');
            }
            const fwStatus = String(fwData.status || '').toLowerCase();
            const itemStatus =
              fwStatus === 'succeeded' ? 'succeeded'
              : fwStatus === 'failed' || fwStatus === 'reversed' ? fwStatus
              : 'pending';

            const { error: fwUpdateErr } = await supabase
              .from('batch_items')
              .update({
                status: itemStatus,
                flutterwave_reference: ref,
                flutterwave_transfer_id: fwData.transfer_id || null,
                flutterwave_fee_ngn: Number(fwData.fee_ngn || 0) || 0,
                flutterwave_raw: fwData.raw ?? null,
                narration,
                failure_reason: itemStatus === 'failed' ? 'Flutterwave rejected the transfer' : null,
                processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
              } as any)
              .eq('id', (item as any).id);
            if (fwUpdateErr) {
              // The transfer itself already went out — this is a bookkeeping
              // write failure, not a payment failure. Surface it distinctly
              // (never silently drop it) rather than pretending the record
              // update succeeded; reconciliation will still catch the item
              // itself via its reference, but the operator needs to know the
              // local status may be stale.
              console.error(`[Payroll] batch_items update failed after Flutterwave transfer for ${empName} (ref ${ref}):`, fwUpdateErr.message);
              errors.push(`${empName}: transfer sent (ref ${ref}) but recording the result failed — verify manually: ${fwUpdateErr.message}`);
            }

            await logAudit(
              'flutterwave_transfer_initiated',
              `Salary transfer initiated for ${empName} (${formatNaira(Number(slip.net_ngn || 0))}) ref ${ref}`,
              profile,
            );
            succeeded++;
            continue;
          }

          // Paystack path — unchanged from pre-Flutterwave behaviour.
          // Reuse the cached Paystack recipient code from the employee
          // profile if we have one — saves a /transferrecipient API call
          // for every employee on every payroll run. The DB trigger clears
          // this column whenever bank details change, so a stale recipient
          // is impossible.
          let recipientCode: string | null = (emp as any).paystack_recipient_code || null;
          if (!recipientCode) {
            const recipient = await createTransferRecipient({
              name: empName,
              account_number: (emp as any).bank_account_number,
              bank_code: bankCode,
            });
            recipientCode = recipient.recipient_code;
            const { error: recipientCacheErr } = await supabase
              .from('profiles')
              .update({
                paystack_recipient_code: recipientCode,
                paystack_recipient_verified_at: new Date().toISOString(),
              })
              .eq('id', (emp as any).id);
            if (recipientCacheErr) {
              // Non-fatal — just means next payroll run re-creates the
              // recipient instead of reusing the cache — but log it so a
              // recurring failure here (e.g. an RLS regression) is visible
              // instead of silently costing an extra Paystack API call every run.
              console.error(`[Payroll] failed to cache paystack_recipient_code for ${empName}:`, recipientCacheErr.message);
            }
          }
          const ref = generateKdopsRef((item as any).id);
          const transfer = await initiateTransferIdempotent({
            recipient_code: recipientCode,
            amount_ngn: Number(slip.net_ngn || 0),
            reference: ref,
            reason: narration,
          });

          // Map recovered duplicate-ref into the right batch_item status. If
          // Paystack already says success, we save the row as succeeded so the
          // payroll dashboard reflects reality.
          const recoveredStatus = transfer.recovered
            ? (transfer.verified_status || transfer.status || '').toLowerCase()
            : null;
          const itemStatus =
            recoveredStatus === 'success' ? 'succeeded'
            : recoveredStatus === 'failed' || recoveredStatus === 'reversed' ? recoveredStatus
            : 'pending';

          const { error: psUpdateErr } = await supabase
            .from('batch_items')
            .update({
              status: itemStatus,
              paystack_recipient_code: recipientCode,
              paystack_transfer_code: transfer.transfer_code,
              paystack_reference: transfer.reference,
              narration,
              failure_reason: itemStatus === 'failed' ? 'Recovered: Paystack rejected the transfer' : null,
              processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
            } as any)
            .eq('id', (item as any).id);
          if (psUpdateErr) {
            // Same non-silent posture as the Flutterwave branch above — the
            // transfer already went out, this is a bookkeeping write failure.
            console.error(`[Payroll] batch_items update failed after Paystack transfer for ${empName} (ref ${transfer.reference}):`, psUpdateErr.message);
            errors.push(`${empName}: transfer sent (ref ${transfer.reference}) but recording the result failed — verify manually: ${psUpdateErr.message}`);
          }

          await logAudit(
            'paystack_transfer_initiated',
            `Salary transfer initiated for ${empName} (${formatNaira(Number(slip.net_ngn || 0))}) ref ${transfer.reference}`,
            profile,
          );
          succeeded++;
        } catch (empErr: any) {
          errors.push(`${slip.employee_name}: ${empErr?.message || 'transfer failed'}`);
        }
      }

      // Release the processing lock taken above. 'paid' if anything went
      // through, otherwise back to 'approved' so the run can be retried
      // instead of being stuck in 'processing'.
      await supabase.rpc('finalize_payroll_run_disbursement', {
        p_run_id: run.id,
        p_new_status: succeeded > 0 ? 'paid' : 'approved',
      });
      locked = false;

      if (succeeded > 0) {
        await logAudit(
          'salary_disbursed',
          `Salary disbursed for ${monthLabel(run.period)}: ${succeeded}/${payslips.length} transfers initiated${errors.length ? ` (${errors.length} failed)` : ''}`,
          profile,
        );
      }

      setDisburseErrors(errors);
      if (errors.length === 0) {
        toast({
          title: `${succeeded} salary transfer${succeeded === 1 ? '' : 's'} initiated`,
          description: `Payroll ${monthLabel(run.period)} sent via ${activeProvider === 'flutterwave' ? 'Flutterwave' : 'Paystack'}. Status updates arrive via webhook.`,
        });
        setDisburseTarget(null);
        load();
      } else {
        toast({
          title: `${succeeded} of ${payslips.length} transfers initiated`,
          description: `${errors.length} employee${errors.length === 1 ? '' : 's'} could not be processed — see dialog for details.`,
          variant: 'destructive',
        });
        if (succeeded > 0) load();
      }
    } catch (err: any) {
      // An unexpected error left the run locked in 'processing' before we
      // got to the normal finalize call above — release it back to
      // 'approved' rather than leaving it stuck for the 15-minute self-heal.
      if (locked) {
        try {
          await supabase.rpc('finalize_payroll_run_disbursement', {
            p_run_id: run.id,
            p_new_status: succeeded > 0 ? 'paid' : 'approved',
          });
        } catch {
          // Best-effort — the 15-minute self-heal in
          // lock_payroll_run_for_disbursement covers this if it also fails.
        }
      }
      toast({
        title: 'Disbursement failed',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setDisbursing(false);
    }
  };

  const markPaid = async () => {
    if (!confirmPaidRun) return;
    const run = confirmPaidRun;
    // Idempotency guard — never apply deductions twice
    if (run.status === 'paid') {
      setConfirmPaidRun(null);
      toast({ title: 'Already marked paid', variant: 'destructive' });
      return;
    }
    setConfirmPaidRun(null);
    const { error, data: updatedRows } = await supabase
      .from('payroll_runs')
      .update({ status: 'paid' })
      .eq('id', run.id)
      .eq('status', 'approved')
      .select('id');
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    if (!updatedRows || updatedRows.length === 0) {
      toast({ title: 'Already marked paid', description: 'Another user may have already processed this run.', variant: 'destructive' });
      load();
      return;
    }

    // Update amount_deducted_to_date for every deduction applied in this run
    const { data: payslips } = await supabase
      .from('payslips')
      .select('employee_id, deductions_json')
      .eq('payroll_run_id', run.id)
      .not('deductions_json', 'is', null);

    if (payslips && payslips.length > 0) {
      // Separate deduction IDs from advance IDs
      const appliedDeductionById = new Map<string, number>();
      const appliedAdvanceById = new Map<string, number>();

      for (const slip of payslips) {
        for (const d of (slip.deductions_json as { id?: string; advance_id?: string; amount_ngn: number }[])) {
          if (d.advance_id) {
            appliedAdvanceById.set(d.advance_id, (appliedAdvanceById.get(d.advance_id) ?? 0) + Number(d.amount_ngn));
          } else if (d.id) {
            appliedDeductionById.set(d.id, (appliedDeductionById.get(d.id) ?? 0) + Number(d.amount_ngn));
          }
        }
      }

      // Update employee_deductions tracking
      const deductionIds = Array.from(appliedDeductionById.keys());
      if (deductionIds.length > 0) {
        const { data: currentDeductions } = await supabase
          .from('employee_deductions')
          .select('id, amount_deducted_to_date, total_deductible_amount')
          .in('id', deductionIds);

        for (const cd of (currentDeductions || [])) {
          const applied = appliedDeductionById.get(cd.id) ?? 0;
          const newTotal = Number(cd.amount_deducted_to_date || 0) + applied;
          const isComplete =
            cd.total_deductible_amount != null &&
            newTotal >= Number(cd.total_deductible_amount);

          await supabase
            .from('employee_deductions')
            .update({
              amount_deducted_to_date: newTotal,
              ...(isComplete ? { status: 'completed' } : {}),
            })
            .eq('id', cd.id);
        }
      }

      // Reduce outstanding_ngn on advances that were repaid this period
      const advanceIds = Array.from(appliedAdvanceById.keys());
      if (advanceIds.length > 0) {
        const { data: currentAdvances } = await supabase
          .from('employee_advances')
          .select('id, outstanding_ngn')
          .in('id', advanceIds);

        for (const ca of (currentAdvances || [])) {
          const repaid = appliedAdvanceById.get(ca.id) ?? 0;
          const newOutstanding = Math.max(0, Number(ca.outstanding_ngn || 0) - repaid);
          const isSettled = newOutstanding === 0;

          await supabase
            .from('employee_advances')
            .update({
              outstanding_ngn: newOutstanding,
              ...(isSettled ? { status: 'settled' } : {}),
            })
            .eq('id', ca.id);
        }
      }
    }

    await logAudit(
      'payroll_paid',
      `Payroll ${monthLabel(run.period)} marked paid`,
      profile,
    );
    toast({ title: 'Payroll marked as paid' });
    load();
  };

  const exportRun = (run: PayrollRun) => {
    const header = ['metric', 'amount_ngn'];
    const bonusTotal = (run.bonuses_json || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const allowTotal = run.allowances_json?.total || 0;
    const rows: [string, number][] = [
      ['Contractor payments', run.total_contractor_ngn],
      ['Employee salaries', run.total_employee_ngn],
      ['Reimbursable expenses', run.total_expenses_ngn],
      ['PAYE (est.)', run.paye_ngn],
      ['Pension employee (est.)', run.pension_ngn],
      ['Pension employer (est.)', run.employer_pension_ngn ?? (run.total_employee_ngn * EMPLOYER_PENSION_RATE)],
      ['NHF (est.)', run.nhf_ngn],
    ];
    if (bonusTotal > 0) {
      rows.push(['Bonuses & Extras', bonusTotal]);
      (run.bonuses_json || []).forEach((b) => rows.push([`  — ${b.type}`, Number(b.amount || 0)]));
    }
    if (allowTotal > 0) rows.push(['Total allowances', allowTotal]);
    rows.push(['Total burn', run.total_burn_ngn]);
    downloadCsv(`kdops-payroll-${run.period}.csv`, toCsv(header, rows));
  };

  const exportBankFile = async (run: PayrollRun) => {
    const instructions = await buildPaymentInstructions(run.id);
    if (!instructions.length) {
      toast({ title: 'No bank payment data', description: 'No employees with bank details in this run.' });
      return;
    }
    downloadCsv(`kdops-bank-payment-${run.period}.csv`, instructionsToCsv(instructions));
  };

  // Printable PDF-ready HTML — user prints from browser.
  const printRun = (run: PayrollRun) => {
    const bonusTotal = (run.bonuses_json || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const allowTotal = run.allowances_json?.total || 0;
    const bonusRows = bonusTotal > 0
      ? `<tr><td>Bonuses &amp; Extras</td><td class="right">${formatNaira(bonusTotal)}</td></tr>` +
        (run.bonuses_json || []).map((b) =>
          `<tr style="font-size:12px"><td>&nbsp;&nbsp;— ${esc(String(b.type || ''))}</td><td class="right">${formatNaira(Number(b.amount || 0))}</td></tr>`,
        ).join('')
      : '';
    const allowRow = allowTotal > 0
      ? `<tr><td>Total allowances</td><td class="right">${formatNaira(allowTotal)}</td></tr>`
      : '';
    const empRow = run.employee_count != null
      ? `<tr><td>Active employees</td><td class="right">${run.employee_count}</td></tr>`
      : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payroll ${esc(run.period)}</title>
    <style>
      body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 32px; max-width: 820px; margin: 0 auto; color: ${R.bodyText}; }
      h1 { color: ${R.brand}; border-bottom: 3px solid ${R.brand}; padding-bottom: 8px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid ${R.border}; }
      th { background: ${R.panelBg}; color: ${R.muted}; font-size: 11px; text-transform: uppercase; }
      tr.total { background: ${R.panelBg}; font-weight: 700; }
      .right { text-align: right; }
      .badge { display: inline-block; padding: 3px 10px; background: ${R.gold}; color: ${R.badgeText}; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    </style></head><body>
    <h1>KDOps Payroll Report</h1>
    <p><strong>Period:</strong> ${esc(monthLabel(run.period, run.period_type))} · <span class="badge">${esc(run.status.replace('_', ' '))}</span></p>
    <p><strong>Generated:</strong> ${esc(formatDateTime(new Date()))}</p>
    <table>
      <thead><tr><th>Line item</th><th class="right">Amount (NGN)</th></tr></thead>
      <tbody>
        ${empRow}
        <tr><td>Contractor payments</td><td class="right">${formatNaira(run.total_contractor_ngn)}</td></tr>
        <tr><td>Employee salaries</td><td class="right">${formatNaira(run.total_employee_ngn)}</td></tr>
        <tr><td>Reimbursable expenses</td><td class="right">${formatNaira(run.total_expenses_ngn)}</td></tr>
        <tr><td>PAYE (est.)</td><td class="right">${formatNaira(run.paye_ngn)}</td></tr>
        <tr><td>Pension — employee (est.)</td><td class="right">${formatNaira(run.pension_ngn)}</td></tr>
        <tr><td>Pension — employer (est.)</td><td class="right">${formatNaira(run.employer_pension_ngn ?? (run.total_employee_ngn * EMPLOYER_PENSION_RATE))}</td></tr>
        <tr><td>NHF (est.)</td><td class="right">${formatNaira(run.nhf_ngn)}</td></tr>
        ${bonusRows}
        ${allowRow}
        <tr class="total"><td>Total burn</td><td class="right">${formatNaira(run.total_burn_ngn)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top: 32px; padding: 12px; border: 2px dashed ${R.gold}; color: ${R.stampText}; font-size: 12px; text-align: center;">
      Generated by KDOps · ${esc(profile?.full_name || profile?.email || 'unknown user')}
    </p>
    <script>setTimeout(() => window.print(), 300);</script>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const latest = runs[0];
  const trend = useMemo(
    () =>
      runs
        .slice(0, 6)
        .map((r) => ({ label: monthLabel(r.period), burn: r.total_burn_ngn }))
        .reverse(),
    [runs],
  );

  const annualSummary = useMemo(() => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yearRuns = runs.filter((r) => {
      const [y] = r.period.split('-');
      return parseInt(y) === summaryYear && r.status !== 'draft';
    });
    const byMonth = MONTHS.map((label, i) => {
      const m = String(i + 1).padStart(2, '0');
      const monthRuns = yearRuns.filter((r) => r.period.endsWith(`-${m}`) || r.period.endsWith(`-${i + 1}`));
      const gross = monthRuns.reduce((s, r) => s + (r.total_employee_ngn || 0), 0);
      const paye = monthRuns.reduce((s, r) => s + (r.paye_ngn || 0), 0);
      const pension = monthRuns.reduce((s, r) => s + (r.pension_ngn || 0), 0);
      const nhf = monthRuns.reduce((s, r) => s + (r.nhf_ngn || 0), 0);
      const contractors = monthRuns.reduce((s, r) => s + (r.total_contractor_ngn || 0), 0);
      const burn = monthRuns.reduce((s, r) => s + (r.total_burn_ngn || 0), 0);
      const headcount = monthRuns.reduce((s, r) => s + (r.employee_count || 0), 0);
      const status = monthRuns.length === 0 ? 'none' : monthRuns.every((r) => r.status === 'paid') ? 'paid' : 'pending';
      return { label, gross, paye, pension, nhf, contractors, burn, headcount, status };
    });
    const totals = byMonth.reduce(
      (acc, m) => ({
        gross: acc.gross + m.gross,
        paye: acc.paye + m.paye,
        pension: acc.pension + m.pension,
        nhf: acc.nhf + m.nhf,
        contractors: acc.contractors + m.contractors,
        burn: acc.burn + m.burn,
      }),
      { gross: 0, paye: 0, pension: 0, nhf: 0, contractors: 0, burn: 0 },
    );
    return { byMonth, totals };
  }, [runs, summaryYear]);

  const availableYears = useMemo(() => {
    const years = new Set(runs.map((r) => parseInt(r.period.split('-')[0])));
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [runs]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Payroll Intelligence</h1>
            <InfoHint>Process monthly payroll runs for all employees. Calculates gross pay, PAYE, employee &amp; employer pension, NHF, allowances and net pay. Supports bulk payslip export.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Monthly payroll summary across contractor payments, employees and statutory deductions.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Draft payroll
          </Button>
        </div>
      </div>

      <NextPayrollBanner />

      <Tabs defaultValue="runs">
        {/* Underline tabs — central-bank pattern: thin border-b
            row, no rounded pill background. Active tab gets a 2px
            underline and bold weight. Restraint over chrome. */}
        <TabsList className="h-9 bg-transparent border-b border-border/50 rounded-none w-full justify-start gap-0 p-0">
          <TabsTrigger
            value="runs"
            className="text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Payroll runs
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger
            value="schedules"
            className="text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            Pay schedules
          </TabsTrigger>
          <TabsTrigger
            value="board"
            className="text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Columns3 className="mr-1.5 h-3.5 w-3.5" />
            Board
          </TabsTrigger>
          <TabsTrigger
            value="annual"
            className="text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Annual summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-6 mt-6">

      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <p className="flex-1 leading-relaxed">
            Payroll runs calculate monthly people costs: gross salaries, PAYE tax, pension contributions, and NHF deductions. Approve a run to generate payslips. Note: KDOps records payroll figures — salary transfers must be initiated separately via the Payments module.
          </p>
          <button
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem('kdops_payroll_banner_dismissed', 'true');
            }}
            className="shrink-0 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Standing compliance note — NOT dismissible. Cross-checked against the
          Nigeria Tax Act 2025 (KPMG, Baker Tilly, SafeguardGlobal — Aug 2026)
          and matches the current law. Revisit only if FIRS guidance changes,
          or once Phase 4 lands an editable tax table so this isn't a
          hardcoded constant. */}
      {(
        <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <p className="flex-1 leading-relaxed">
            <span className="font-medium">PAYE regime confirmed:</span> the "NTA 2025" bands in <code className="text-xs">src/lib/tax.ts</code> (0% to ₦800k, then 15% / 18% / 21% / 23% / 25% in successive slices, with rent relief) match the Nigeria Tax Act 2025, in force since 1 Jan 2026 — cross-checked against KPMG, Baker Tilly, and SafeguardGlobal (Aug 2026). Worth a final sign-off from your accountant of record before high-stakes filings, but this is not a guess.
          </p>
        </div>
      )}

      {/* Summary strip — pure Mercury: hairline 4-cell, mono ₦
          values, ToD holographic hover. */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border/70 divide-y sm:divide-y-0 overflow-hidden">
        {[
          {
            label: 'Latest total burn',
            value: latest ? formatNaira(latest.total_burn_ngn) : '—',
            sub: latest ? monthLabel(latest.period, latest.period_type) : 'Draft your first run',
          },
          {
            label: 'PAYE (est.)',
            value: latest ? formatNaira(latest.paye_ngn) : '—',
            sub: 'Due 10th next month',
          },
          {
            label: 'Active employees',
            value: latest?.employee_count ?? '—',
            sub: latest ? `Pension ${formatNaira(latest.pension_ngn)}` : 'No runs yet',
          },
          {
            label: 'Approved runs',
            value: runs.filter((r) => r.status === 'approved' || r.status === 'paid').length,
            sub: 'This year',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="kd-holographic relative px-4 py-3.5 kd-transition">
            <div className="relative z-[2]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-[19px] font-semibold tabular-nums tracking-tight text-foreground leading-none font-mono truncate">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 tabular-nums truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Burn trend — last 6 months</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                <ChartTooltip
                  content={<GlassTooltip />}
                  formatter={(v: number) => formatNaira(v)}
                  cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="burn" fill="url(#kd-grad-primary)" name="Total burn" radius={[6, 6, 0, 0]} {...chartAnim} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {salaryErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Salary Configuration Required</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-2 space-y-0.5">
              {salaryErrors.map((err, i) => (
                <li key={i} className="text-sm">{err}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Configure salaries in <span className="font-medium">Employee Management</span> before generating payroll.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {advanceQueue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold tracking-tight">Salary advance requests</h2>
          <div className="rounded-lg border border-border/60 bg-card divide-y">
            {advanceQueue.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {a.name} · <span className="currency tabular-nums">{formatNaira(Number(a.amount_ngn))}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Over {a.repayment_months} month{a.repayment_months === 1 ? '' : 's'}
                    {a.reason ? ` · ${a.reason}` : ''} · {monthLabel(a.created_at.slice(0, 7))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'pending' ? (
                    <>
                      <Button size="sm" variant="outline" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'approve')}>
                        {advanceBusy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Approve'}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'reject')}>
                        Reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-info/10 text-info border-info/30">Approved · pending payout</Badge>
                      <Button size="sm" variant="outline" disabled={advanceBusy === a.id} onClick={() => actOnAdvance(a.id, 'paid')}>
                        {advanceBusy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark paid'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Payroll runs</h2>
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          {loading ? (
            <div className="p-3"><TableSkeleton rows={5} cols={7} /></div>
          ) : runs.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No payroll runs yet"
              description="Create a payroll run to calculate monthly salary costs and generate payslips."
              action={
                <Button onClick={() => setDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Create Payroll Run
                </Button>
              }
            />
          ) : (
            <>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Contractor</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">Pension (emp)</TableHead>
                  <TableHead className="text-right">Pension (er)</TableHead>
                  <TableHead className="text-right">Total burn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r, idx) => {
                  const prev = runs[idx + 1];
                  const momPct = prev && prev.total_burn_ngn > 0
                    ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
                    : null;
                  const isHighlighted = highlightedRunId === r.id;
                  return (
                  <TableRow
                    key={r.id}
                    ref={(el) => { if (el) runRefs.current.set(r.id, el); }}
                    className={cn(
                      'kd-transition',
                      isHighlighted && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
                    )}
                  >
                    <TableCell className="font-medium">{monthLabel(r.period, r.period_type)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.employee_count ?? '—'}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_contractor_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_expenses_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.paye_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.pension_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}
                    </TableCell>
                    <TableCell className="text-right currency font-semibold">
                      <div className="flex items-center justify-end gap-1">
                        {formatNaira(r.total_burn_ngn)}
                        {momPct !== null && (
                          <span className={`text-xs font-normal inline-flex items-center gap-0.5 ${momPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {momPct >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {r.status === 'draft' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => submit(r)}>
                              Submit
                            </Button>
                            {/* Delete is draft-only — once a run is in
                                pending_approval / approved / paid the
                                audit trail must stay intact. Operators
                                use Recall on a pending run to send it
                                back to draft, then delete. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteDraft(r)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete this draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {r.status === 'pending_approval' && canApprovePerm && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approve(r)}
                              disabled={isSelfApprovalBlocked(r)}
                              title={isSelfApprovalBlocked(r) ? 'You drafted this run — another approver must review it' : undefined}
                            >
                              Approve
                            </Button>
                            {/* Recall sends a pending run back to draft so
                                the originator (or an admin) can edit it
                                before re-submitting. Approved / paid runs
                                can't be recalled — that would corrupt
                                the audit trail. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => recallToDraft(r)}
                              title="Recall to draft for editing"
                            >
                              Recall
                            </Button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <>
                            {canGeneratePayslipsPerm && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generatePayslips(r)}
                                disabled={working}
                                title="Generate payslips for every active employee"
                              >
                                {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Generate payslips
                              </Button>
                            )}
                            {canDisburse && (
                              <Button
                                size="sm"
                                onClick={() => openDisburse(r)}
                                disabled={working}
                                title="Disburse net salaries via Paystack"
                              >
                                {working
                                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  : <Send className="mr-2 h-3.5 w-3.5" />}
                                Disburse salaries
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setConfirmPaidRun(r)}>
                              Record as Manually Paid
                            </Button>
                          </>
                        )}
                        {r.status !== 'paid' && canGeneratePayslipsPerm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAdjustments(r)}
                            title="Add per-employee bonus, overtime, allowance or one-off deduction"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> Adjust
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => exportRun(r)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {r.status === 'approved' && (
                          <Button size="sm" variant="ghost" onClick={() => exportBankFile(r)} title="Download bank payment file">
                            <Banknote className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => printRun(r)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile payroll runs — thumb-friendly card list */}
            <div className="md:hidden p-3 space-y-2">
              {runs.map((r, idx) => {
                const prev = runs[idx + 1];
                const momPct = prev && prev.total_burn_ngn > 0
                  ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
                  : null;
                const accent =
                  r.status === 'draft' ? 'bg-muted-foreground'
                  : r.status === 'pending_approval' ? 'bg-amber-500'
                  : r.status === 'approved' ? 'bg-emerald-500'
                  : r.status === 'paid' ? 'bg-blue-500'
                  : 'bg-muted-foreground';
                const isHighlighted = highlightedRunId === r.id;
                return (
                  <div
                    key={r.id}
                    ref={(el) => { if (el) runRefs.current.set(r.id, el); }}
                    className={cn(isHighlighted && 'rounded-lg ring-2 ring-primary/40')}
                  >
                  <MobileCard accentClassName={accent}>
                    <MobileCardHeader>
                      <div className="min-w-0 flex-1">
                        <MobileCardTitle>{monthLabel(r.period, r.period_type)}</MobileCardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {r.employee_count ?? 0} employee{r.employee_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold currency leading-tight">{formatNaira(r.total_burn_ngn)}</p>
                        {momPct !== null && (
                          <span className={`text-[10px] font-medium inline-flex items-center gap-0.5 ${momPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {momPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </MobileCardHeader>

                    <MobileCardRow label="Status">
                      <StatusBadge status={r.status} />
                    </MobileCardRow>
                    <MobileCardRow label="Contractor" className="currency">{formatNaira(r.total_contractor_ngn)}</MobileCardRow>
                    <MobileCardRow label="Expenses" className="currency">{formatNaira(r.total_expenses_ngn)}</MobileCardRow>
                    <MobileCardRow label="PAYE" className="currency">{formatNaira(r.paye_ngn)}</MobileCardRow>
                    <MobileCardRow label="Pension (emp)" className="currency">{formatNaira(r.pension_ngn)}</MobileCardRow>
                    <MobileCardRow label="Pension (er)" className="currency">{formatNaira(r.employer_pension_ngn ?? (r.total_employee_ngn * EMPLOYER_PENSION_RATE))}</MobileCardRow>

                    <MobileCardFooter className="flex-wrap">
                      {r.status === 'draft' && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => submit(r)}>
                          Submit
                        </Button>
                      )}
                      {r.status === 'pending_approval' && canApprovePerm && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 bg-success/10 text-success border-success/40 hover:bg-success/20"
                          onClick={() => approve(r)}
                          disabled={isSelfApprovalBlocked(r)}
                          title={isSelfApprovalBlocked(r) ? 'You drafted this run — another approver must review it' : undefined}
                        >
                          <Check className="h-4 w-4 mr-1.5" /> Approve
                        </Button>
                      )}
                      {r.status === 'approved' && canGeneratePayslipsPerm && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => generatePayslips(r)} disabled={working}>
                          {working && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          Payslips
                        </Button>
                      )}
                      {r.status === 'approved' && canDisburse && (
                        <Button size="sm" className="h-9" onClick={() => openDisburse(r)} disabled={working}>
                          {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                          Disburse
                        </Button>
                      )}
                      {r.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => setConfirmPaidRun(r)}>
                          Manually Paid
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-9 ml-auto" onClick={() => exportRun(r)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {r.status === 'approved' && (
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => exportBankFile(r)} title="Download bank payment file">
                          <Banknote className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-9" onClick={() => printRun(r)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </MobileCardFooter>
                  </MobileCard>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </div>

        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <PayrollCalendar />
        </TabsContent>

        <TabsContent value="schedules" className="mt-6">
          <PayrollSchedules />
        </TabsContent>

        <TabsContent value="board" className="mt-6">
          <PayrollBoard runs={runs} onSelect={(id) => {
            setHighlightedRunId(id);
            const el = runRefs.current.get(id);
            if (el) {
              const tabsEl = document.querySelector('[data-value="runs"]') as HTMLButtonElement | null;
              tabsEl?.click();
              setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
            }
          }} />
        </TabsContent>

        <TabsContent value="annual" className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Payroll Summary — {summaryYear}</h2>
            <div className="flex gap-2">
              {availableYears.map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant={y === summaryYear ? 'default' : 'outline'}
                  onClick={() => setSummaryYear(y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          </div>

          {annualSummary.totals.burn > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Month-by-month breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={annualSummary.byMonth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                    <ChartTooltip
                      content={<GlassTooltip />}
                      formatter={(v: number) => formatNaira(v)}
                      cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="gross" fill="url(#kd-grad-primary)" name="Gross salary" stackId="a" radius={[0, 0, 0, 0]} {...chartAnim} />
                    <Bar dataKey="contractors" fill={chartTheme.secondary} name="Contractors" stackId="a" radius={[4, 4, 0, 0]} {...chartAnim} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Headcount</TableHead>
                      <TableHead className="text-right">Gross salary</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">Pension</TableHead>
                      <TableHead className="text-right">NHF</TableHead>
                      <TableHead className="text-right">Contractors</TableHead>
                      <TableHead className="text-right">Total burn</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {annualSummary.byMonth.map((m) => (
                      <TableRow key={m.label} className={m.status === 'none' ? 'opacity-40' : ''}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.headcount || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.gross > 0 ? formatNaira(m.gross) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.paye > 0 ? formatNaira(m.paye) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.pension > 0 ? formatNaira(m.pension) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.nhf > 0 ? formatNaira(m.nhf) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.contractors > 0 ? formatNaira(m.contractors) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency font-semibold">{m.burn > 0 ? formatNaira(m.burn) : '—'}</TableCell>
                        <TableCell className="text-center">
                          {m.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Paid</Badge>}
                          {m.status === 'pending' && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2 bg-muted/30">
                      <TableCell>Total ({summaryYear})</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.paye)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.pension)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.nhf)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.contractors)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.burn)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ResponsiveDialog
        open={dialog}
        onOpenChange={setDialog}
        title="Draft payroll"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={draftRun} disabled={working}>
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Draft
            </Button>
          </>
        }
      >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Period</Label>
                <Input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Period type</Label>
                <Select
                  value={form.period_type}
                  onValueChange={(v) => setForm({ ...form, period_type: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  Payroll segment
                  <InfoHint>Run payroll for a subset of staff instead of everyone — e.g. exclude directors or domestic staff, or run for just one Pay Group. Leave as "All employees" for the default, unfiltered run. A segment can filter by payroll category, department, or Pay Group (set up in Payroll → Schedules → Pay Groups).</InfoHint>
                </Label>
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSegmentDialog(true)}>
                  Manage
                </Button>
              </div>
              <Select
                value={form.payroll_segment_id || '__all__'}
                onValueChange={(v) => setForm({ ...form, payroll_segment_id: v === '__all__' ? '' : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All employees (no filter)</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.payroll_segment_id && (
                <p className="text-xs text-muted-foreground">
                  {segments.find((s) => s.id === form.payroll_segment_id)?.description || 'Only employees matching this segment will be included.'}
                </p>
              )}
            </div>

            <PayrollRosterPreview payrollSegmentId={form.payroll_segment_id} />

            <div className="space-y-2">
              <Label>Bonuses &amp; Extras</Label>
              {form.bonuses.map((b, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={b.type} onValueChange={(v) => updateBonus(i, 'type', v)}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BONUS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-36"
                    min={0}
                    placeholder="₦ Amount"
                    value={b.amount || ''}
                    onChange={(e) => updateBonus(i, 'amount', Math.max(0, Number(e.target.value) || 0))}
                  />
                  <Button size="icon" variant="ghost" aria-label="Remove bonus" onClick={() => removeBonus(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addBonus}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add bonus
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Allowances</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Housing (% of basic)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={form.housing_allowance_pct || ''}
                    onChange={(e) => setForm({ ...form, housing_allowance_pct: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Transport / employee (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.transport_per_emp || ''}
                    onChange={(e) => setForm({ ...form, transport_per_emp: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Meal subsidy / employee (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.meal_per_emp || ''}
                    onChange={(e) => setForm({ ...form, meal_per_emp: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              KDOps will pull approved expenses and processed payment batches for
              this period and estimate PAYE / Pension / NHF. Bonuses and allowances
              are added on top and included in the total burn.
            </p>
          </div>
      </ResponsiveDialog>

      {/* Manage payroll segments — reusable run filters (by category, department, or Pay Group) */}
      <ResponsiveDialog
        open={segmentDialog}
        onOpenChange={setSegmentDialog}
        size="lg"
        title="Manage payroll segments"
        footer={<Button variant="outline" onClick={() => setSegmentDialog(false)}>Done</Button>}
      >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {segments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Existing segments</Label>
                {segments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                    </div>
                    {s.name !== 'All Staff' && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteSegment(s.id, s.name)} aria-label={`Remove ${s.name}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label className="text-xs text-muted-foreground">New segment</Label>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="e.g. Staff (excl. Directors)"
                  value={segmentForm.name}
                  onChange={(e) => setSegmentForm({ ...segmentForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  placeholder="Shown as a hint when this segment is selected"
                  value={segmentForm.description}
                  onChange={(e) => setSegmentForm({ ...segmentForm, description: e.target.value })}
                />
              </div>
              {segmentPayGroups.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Only include these Pay Groups</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {segmentPayGroups.map((g) => (
                      <Badge
                        key={g.id}
                        variant={segmentForm.include_pay_group_ids.includes(g.id) ? 'default' : 'outline'}
                        className="cursor-pointer kd-transition"
                        onClick={() => toggleSegmentPayGroup(g.id)}
                      >
                        {g.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to not filter by Pay Group. Pick one or more to run payroll for just those groups — assign employees to a Pay Group from Payroll → Schedules → Pay Groups.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Exclude payroll categories</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PAYROLL_CATEGORY_LABELS).map(([value, label]) => (
                    <Badge
                      key={value}
                      variant={segmentForm.exclude_employee_categories.includes(value) ? 'default' : 'outline'}
                      className="cursor-pointer kd-transition"
                      onClick={() => toggleSegmentCategory(value)}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Employees are tagged with a payroll category on their profile page. Uncategorized employees are never excluded by this filter.
                </p>
              </div>
              {segmentDepartments.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Exclude departments</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {segmentDepartments.map((d) => (
                      <Badge
                        key={d.id}
                        variant={segmentForm.exclude_department_ids.includes(d.id) ? 'default' : 'outline'}
                        className="cursor-pointer kd-transition"
                        onClick={() => toggleSegmentDepartment(d.id)}
                      >
                        {d.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Who this matches right now</Label>
                <PayrollRosterPreview rulesOverride={segmentLiveRules} defaultExpanded />
              </div>

              <Button size="sm" onClick={saveSegment} disabled={segmentSaving || !segmentForm.name.trim()}>
                {segmentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-1 h-3.5 w-3.5" /> Create segment
              </Button>
            </div>
          </div>
      </ResponsiveDialog>

      {/* Per-employee payslip adjustments for a run */}
      <ResponsiveDialog
        open={!!adjustRun}
        onOpenChange={(open) => { if (!open) setAdjustRun(null); }}
        size="2xl"
        title={`Payslip adjustments${adjustRun ? ` · ${monthLabel(adjustRun.period)}` : ''}`}
        footer={<Button variant="outline" onClick={() => setAdjustRun(null)}>Done</Button>}
      >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add a one-off bonus, overtime, allowance or deduction for a specific employee.
              Earnings increase pay (taxable ones also raise PAYE); deductions reduce it.
              <span className="font-medium text-foreground"> Re-generate payslips for this run after editing</span> to apply changes.
            </p>

            {/* Add form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Employee</Label>
                <Select value={adjustForm.employee_id || undefined} onValueChange={(v) => setAdjustForm((f) => ({ ...f, employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                  <SelectContent>
                    {adjustEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={adjustForm.kind} onValueChange={(v) => setAdjustForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="overtime">Overtime</SelectItem>
                    <SelectItem value="allowance">Allowance</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number" min="0" inputMode="numeric"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={adjustForm.description}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Performance bonus, Q2"
                />
              </div>
              {adjustForm.kind !== 'deduction' && (
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={adjustForm.taxable}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, taxable: e.target.checked }))}
                  />
                  Taxable (adds to PAYE base)
                </label>
              )}
              <div className="sm:col-span-2 flex justify-end">
                <Button size="sm" onClick={addAdjustment} disabled={adjustSaving}>
                  {adjustSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                  Add adjustment
                </Button>
              </div>
            </div>

            {/* Existing list */}
            {adjustLoading ? (
              <div className="py-6 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : adjustList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No adjustments for this run yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {adjustList.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {adjustEmployees.find((e) => e.id === a.employee_id)?.name || a.employee_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="capitalize">{a.kind}</span>
                        {a.kind !== 'deduction' && !a.taxable ? ' · non-taxable' : ''} · {a.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('tabular-nums font-semibold', a.kind === 'deduction' ? 'text-destructive' : 'text-success')}>
                        {a.kind === 'deduction' ? '−' : '+'}{formatNaira(Number(a.amount_ngn))}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAdjustment(a.id)} aria-label="Remove adjustment">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!disburseTarget}
        onOpenChange={(open) => { if (!open && !disbursing) { setDisburseTarget(null); setDisburseErrors([]); } }}
        title="Confirm salary disbursement"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => { setDisburseTarget(null); setDisburseErrors([]); }}
              disabled={disbursing}
            >
              Cancel
            </Button>
            <Button onClick={doDisburse} disabled={disbursing}>
              {disbursing
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              Disburse
            </Button>
          </>
        }
      >
          {disburseTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium">{monthLabel(disburseTarget.run.period)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employees</span>
                  <span className="font-medium">{disburseTarget.payslips.length}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total disbursement</span>
                  <span className="currency text-success">
                    {formatNaira(disburseTarget.payslips.reduce((s, p) => s + Number(p.net_ngn || 0), 0))}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                KDOps will create a Paystack transfer for each employee's net salary using the
                bank details on their profile. Status updates arrive via the Paystack webhook.
              </p>
              {disburseErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> {disburseErrors.length} employee{disburseErrors.length === 1 ? '' : 's'} could not be processed
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {disburseErrors.map((e, i) => (
                      <li key={i} className="text-xs text-destructive">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!confirmPaidRun}
        onOpenChange={(open) => { if (!open) setConfirmPaidRun(null); }}
        title="Confirm manual payment record"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmPaidRun(null)}>Cancel</Button>
            <Button onClick={markPaid}>Confirm — Record as Paid</Button>
          </>
        }
      >
          <p className="text-sm text-muted-foreground leading-relaxed">
            ⚠️ This records that salaries for {confirmPaidRun ? monthLabel(confirmPaidRun.period) : ''} were paid via your bank or another method. No automatic transfer will be made by KDOps. Only confirm if you have already transferred salaries manually.
          </p>
      </ResponsiveDialog>

      <p className="text-xs text-muted-foreground">
        Generated {formatDate(new Date())} · KDOps
      </p>
    </div>
  );
};

export default Payroll;
