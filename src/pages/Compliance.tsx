import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Loader2,
  FileCheck2,
  Download,
  Pencil,
  Trash2,
  Info,
  Sparkles,
  ChevronDown,
  FileDown,
  Package,
  Landmark,
  Receipt,
  UploadCloud,
  BadgeCheck,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { loadStatutoryRunData, StatutoryExportFile } from '@/lib/statutory';
import { buildLirsPayeSchedule } from '@/lib/statutory/lirs';
import { buildFirsPayeSchedule } from '@/lib/statutory/firs';
import { buildPenComPsspSchedule, generatePenComSchedule } from '@/lib/statutory/pencom';
import { buildNhfSchedule } from '@/lib/statutory/nhf';
import { buildNsitfSchedule } from '@/lib/statutory/nsitf';
import { buildItfAnnualSchedule } from '@/lib/statutory/itf';
import { generateP9Cards, p9CardsToCsv } from '@/lib/statutory/p9';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { AuroraHero } from '@/components/AuroraHero';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatNaira, toIsoDate, daysUntil } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { ErrorState } from '@/components/ui-kit/ErrorState';
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
import { cn } from '@/lib/utils';

type Kind = 'paye' | 'pension' | 'vat' | 'wht' | 'tcc' | 'cac' | 'itf' | 'nsitf' | 'nhf';

interface PensionPfaSlice {
  pfa: string;
  rsa_count: number;
  employee_amount_ngn: number;
  employer_amount_ngn: number;
  total_amount_ngn: number;
}

interface ComplianceFiling {
  id: string;
  kind: Kind;
  period: string;
  due_date: string;
  filed_at: string | null;
  filed_by: string | null;
  amount_ngn: number | null;
  reference: string | null;
  notes: string | null;
  status: 'upcoming' | 'due' | 'overdue' | 'filed';
  payroll_run_id: string | null;
  auto_calculated_at: string | null;
  breakdown_json: PensionPfaSlice[] | any[] | null;
}

const KIND_LABELS: Record<Kind, string> = {
  paye: 'PAYE',
  pension: 'Pension',
  nhf: 'NHF',
  vat: 'VAT',
  wht: 'WHT',
  tcc: 'Tax Clearance Certificate',
  cac: 'CAC Annual Return',
  itf: 'ITF Levy',
  nsitf: 'NSITF',
};

// Compliance certificate tracker — labels for documents.certificate_type.
type CertType =
  | 'group_life' | 'pencom_compliance' | 'nsitf_registration'
  | 'itf_registration' | 'firs_tcc' | 'lirs_tcc' | 'cac_registration'
  | 'employer_ndpr';
const CERT_LABELS: Record<CertType, string> = {
  group_life: 'Group Life Insurance',
  pencom_compliance: 'PenCom Compliance Certificate',
  nsitf_registration: 'NSITF Registration',
  itf_registration: 'ITF Registration',
  firs_tcc: 'FIRS Tax Clearance',
  lirs_tcc: 'LIRS Tax Clearance',
  cac_registration: 'CAC Registration',
  employer_ndpr: 'NDPR Compliance',
};
interface CertDoc {
  id: string;
  title: string;
  certificate_type: CertType;
  expires_at: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
}

const KIND_NOTES: Record<Kind, string> = {
  paye: 'File PAYE return for previous month by the 10th',
  pension: 'Remit pension contributions by the 7th',
  nhf: 'Remit NHF (2.5%) to Federal Mortgage Bank',
  vat: 'File monthly VAT return by the 21st',
  wht: 'Quarterly withholding tax remittance',
  tcc: 'Renew annual Tax Clearance Certificate',
  cac: 'File annual return with CAC',
  itf: 'ITF levy annual contribution',
  nsitf: 'NSITF monthly contribution (1% of payroll)',
};

// Compute the default due date for a kind + period (yyyy-mm or yyyy).
const dueDateFor = (kind: Kind, period: string): string => {
  if (kind === 'cac' || kind === 'tcc' || kind === 'itf') {
    // Annual — assume end of Jan in the following year
    const y = parseInt(period.slice(0, 4), 10);
    return toIsoDate(new Date(y + 1, 0, 31));
  }
  // Monthly — period is yyyy-mm; due date depends on kind.
  const [ys, ms] = period.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10); // 1-indexed
  // Obligations are filed in the *following* month for the reporting month.
  const next = new Date(y, m, 1);
  if (kind === 'paye') return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 10));
  if (kind === 'pension') return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 7));
  if (kind === 'vat') return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 21));
  if (kind === 'wht') {
    // Quarterly: 21st of the month after the quarter ends
    const qEndMonth = Math.ceil(m / 3) * 3; // 3,6,9,12
    return toIsoDate(new Date(y, qEndMonth, 21));
  }
  if (kind === 'nsitf') return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 15));
  if (kind === 'nhf') return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 14));
  return toIsoDate(next);
};

const statusFor = (f: ComplianceFiling): ComplianceFiling['status'] => {
  if (f.filed_at) return 'filed';
  const d = daysUntil(f.due_date);
  if (d === null) return 'upcoming';
  if (d < 0) return 'overdue';
  if (d <= 3) return 'due';
  return 'upcoming';
};

// Small helper component so the filing-pack dropdown can be reused in the
// desktop table and the mobile card. Presents different default entries
// depending on the row's kind (PAYE rows suggest LIRS/FIRS first, etc.).
function FilingPackMenu(props: {
  period: string;
  kind: Kind;
  busy: boolean;
  onPick: (w: 'lirs' | 'firs' | 'pssp' | 'nhf' | 'nsitf' | 'itf' | 'all') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={props.busy} title="Download filing pack">
          {props.busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-1.5 h-4 w-4" />
          )}
          Filing pack
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
          Period {props.period}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => props.onPick('all')}>
          <Package className="mr-2 h-4 w-4" /> All 6 schedules
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => props.onPick('lirs')}>
          LIRS eTax (Lagos PAYE)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onPick('firs')}>
          FIRS / SIRS (non-Lagos PAYE)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onPick('pssp')}>
          PenCom PSSP (pension per PFA)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onPick('nhf')}>
          FMBN NHF (2.5%)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onPick('nsitf')}>
          NSITF ECS (1% employer)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onPick('itf')}>
          ITF annual (1%)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STATUS_CLASS: Record<ComplianceFiling['status'], string> = {
  filed: 'bg-success/10 text-success',
  overdue: 'bg-destructive/10 text-destructive',
  due: 'bg-warning/10 text-warning',
  upcoming: 'bg-muted text-muted-foreground',
};

// ─── Payroll tax remittance tracking ────────────────────────────────────
//
// compliance_filings tracks the *filing* deadline (submitting the return).
// tax_remittances tracks the separate step of actually *paying* the
// withheld amounts to the authority — a step the app previously had no
// record of at all.

type RemittanceType = 'paye' | 'pension' | 'nhf' | 'nsitf' | 'itf' | 'nhis';
type RemittanceStatus = 'pending' | 'remitted' | 'confirmed' | 'late';

interface TaxRemittance {
  id: string;
  remittance_type: RemittanceType;
  period_month: string; // yyyy-mm-01
  amount_ngn: number;
  due_date: string | null;
  remitted_at: string | null;
  status: RemittanceStatus;
  receipt_url: string | null;
  provider_reference: string | null;
  payroll_run_id: string | null;
  notes: string | null;
  remitted_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

interface PayrollRunTotals {
  id: string;
  period: string; // yyyy-mm
  status: string;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
}

const REMIT_LABELS: Record<RemittanceType, string> = {
  paye: 'PAYE',
  pension: 'Pension',
  nhf: 'NHF',
  nsitf: 'NSITF',
  itf: 'ITF',
  nhis: 'NHIS',
};

// PAYE is due by the 10th of the following month; pension and NHF (and, by
// the same statutory convention, NSITF/ITF/NHIS) are due by the last day of
// the following month.
const remittanceDueDate = (type: RemittanceType, periodMonth: string): string => {
  const [y, m] = periodMonth.split('-').map((v) => parseInt(v, 10));
  const next = new Date(y, m, 1); // periodMonth's month is 1-indexed, so this lands on the following month
  if (type === 'paye') {
    return toIsoDate(new Date(next.getFullYear(), next.getMonth(), 10));
  }
  return toIsoDate(new Date(next.getFullYear(), next.getMonth() + 1, 0)); // last day of following month
};

const remittanceStatus = (r: TaxRemittance): RemittanceStatus => {
  if (r.confirmed_at) return 'confirmed';
  if (r.remitted_at) return 'remitted';
  const d = r.due_date ? daysUntil(r.due_date) : null;
  if (d !== null && d < 0) return 'late';
  return 'pending';
};

const monthLabel = (periodMonth: string): string => {
  const [y, m] = periodMonth.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const Compliance = () => {
  usePageTitle('Compliance');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ComplianceFiling[]>([]);
  const [certs, setCerts] = useState<CertDoc[]>([]);

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<{
    kind: Kind;
    period: string;
    due_date: string;
    amount_ngn: string;
  }>({
    kind: 'paye',
    period: new Date().toISOString().slice(0, 7),
    due_date: '',
    amount_ngn: '',
  });

  const [markingId, setMarkingId] = useState<string | null>(null);
  const [editingFiling, setEditingFiling] = useState<ComplianceFiling | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceFiling | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingPack, setDownloadingPack] = useState<string | null>(null);

  // ─── PenCom pension schedule export ────────────────────────────────────
  const [payrollRuns, setPayrollRuns] = useState<Array<{ id: string; period: string; status: string }>>([]);
  const [penComRunId, setPenComRunId] = useState<string>('');
  const [generatingPenCom, setGeneratingPenCom] = useState(false);
  const [penComSummary, setPenComSummary] = useState<{ employees: number; pfas: number; total: number } | null>(null);

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';
  const canManageRemittances =
    profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'finance';

  // ─── Remittances state ────────────────────────────────────────────────
  const [remittances, setRemittances] = useState<TaxRemittance[]>([]);
  const [remittancesLoading, setRemittancesLoading] = useState(true);
  const [remittancesError, setRemittancesError] = useState<string | null>(null);
  const [remitDialogTarget, setRemitDialogTarget] = useState<TaxRemittance | null>(null);
  const [remitForm, setRemitForm] = useState({ provider_reference: '', notes: '' });
  const [remitFile, setRemitFile] = useState<File | null>(null);
  const [savingRemit, setSavingRemit] = useState(false);
  const [confirmingRemitId, setConfirmingRemitId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('compliance_filings')
      .select('id, kind, period, due_date, filed_at, amount_ngn, notes, payroll_run_id, auto_calculated_at, breakdown_json')
      .order('due_date', { ascending: true })
      .limit(200);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const next = ((data as ComplianceFiling[]) || []).map((f) => ({
      ...f,
      status: statusFor(f),
    }));
    setRows(next);

    // Compliance certificates (group life, PenCom, NSITF/ITF/FIRS TCC, …).
    // Best-effort — a stale schema cache should never break the calendar.
    try {
      const { data: certData } = await supabase
        .from('documents')
        .select('id, title, certificate_type, expires_at, file_url, storage_path, created_at')
        .not('certificate_type', 'is', null)
        .order('expires_at', { ascending: true, nullsFirst: false })
        .limit(30);
      setCerts((certData as CertDoc[]) || []);
    } catch {
      // Silent fail — the compliance page must remain usable even if the
      // column doesn't exist yet on some environments.
    }
    setLoading(false);
  }, []);

  // Seed the next 3 months of statutory deadlines if the table is empty
  // so Kings's dashboard is immediately useful.
  useEffect(() => {
    if (loading) return;
    if (rows.length > 0) return;
    const seed = async () => {
      const now = new Date();
      const monthOf = (m: number) => {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      const batch: Array<{ kind: Kind; period: string; due_date: string }> = [];
      for (let i = 1; i <= 3; i++) {
        const period = monthOf(i);
        for (const k of ['paye', 'pension', 'vat', 'nsitf', 'nhf'] as Kind[]) {
          batch.push({ kind: k, period, due_date: dueDateFor(k, period) });
        }
      }
      // Annual CAC / TCC / ITF for current year.
      for (const k of ['cac', 'tcc', 'itf'] as Kind[]) {
        batch.push({
          kind: k,
          period: String(now.getFullYear()),
          due_date: dueDateFor(k, String(now.getFullYear())),
        });
      }
      await supabase.from('compliance_filings').upsert(batch, {
        onConflict: 'kind,period',
        ignoreDuplicates: true,
      });
      load();
    };
    seed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length]);

  useEffect(() => {
    load();
  }, [load]);

  // Payroll runs for the PenCom schedule picker — most recent first.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('payroll_runs')
        .select('id, period, status')
        .in('status', ['approved', 'paid'])
        .order('period', { ascending: false })
        .limit(24);
      const runs = (data as Array<{ id: string; period: string; status: string }>) || [];
      setPayrollRuns(runs);
      setPenComRunId((prev) => prev || runs[0]?.id || '');
    })();
  }, []);

  // ─── Remittances: load + auto-generate ─────────────────────────────────
  const loadRemittances = useCallback(async () => {
    setRemittancesLoading(true);
    setRemittancesError(null);
    try {
      const { data, error } = await supabase
        .from('tax_remittances')
        .select('id, remittance_type, period_month, amount_ngn, due_date, remitted_at, receipt_url, provider_reference, notes, confirmed_at')
        .order('period_month', { ascending: false })
        .limit(300);
      if (error) throw error;
      const existing = (data as TaxRemittance[]) || [];

      // Auto-generate pending rows for completed payroll runs that don't
      // have them yet — PAYE, pension (employee + employer), NHF.
      const { data: runsData, error: runsError } = await supabase
        .from('payroll_runs')
        .select('id, period, status, paye_ngn, pension_ngn, nhf_ngn')
        .in('status', ['approved', 'paid'])
        .order('period', { ascending: false })
        .limit(60);
      if (runsError) throw runsError;
      const runs = (runsData as PayrollRunTotals[]) || [];

      const existingKey = new Set(existing.map((r) => `${r.remittance_type}:${r.period_month}`));
      const toInsert: Array<Record<string, unknown>> = [];
      for (const run of runs) {
        const periodMonth = `${run.period}-01`;
        const candidates: Array<{ type: RemittanceType; amount: number }> = [
          { type: 'paye', amount: run.paye_ngn || 0 },
          { type: 'pension', amount: (run.pension_ngn || 0) * 2.25 }, // employee 8% + employer 10%
          { type: 'nhf', amount: run.nhf_ngn || 0 },
        ];
        for (const c of candidates) {
          if (c.amount <= 0) continue;
          const key = `${c.type}:${periodMonth}`;
          if (existingKey.has(key)) continue;
          existingKey.add(key); // guard against dupes within this same batch
          toInsert.push({
            remittance_type: c.type,
            period_month: periodMonth,
            amount_ngn: c.amount,
            due_date: remittanceDueDate(c.type, periodMonth),
            status: 'pending',
            payroll_run_id: run.id,
            created_by: profile?.id || null,
          });
        }
      }

      if (toInsert.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('tax_remittances')
          .insert(toInsert)
          .select('id, remittance_type, period_month, amount_ngn, due_date, remitted_at, receipt_url, provider_reference, notes, confirmed_at');
        if (insertError) {
          // Best-effort — a race with another tab/session shouldn't break the page.
          console.warn('[KDOps] remittance auto-generation failed:', insertError.message);
        } else if (inserted && inserted.length > 0) {
          await logAudit(
            'remittance_auto_generated',
            `${inserted.length} remittance row(s) auto-generated from payroll`,
            profile,
          );
          setRemittances(
            [...existing, ...(inserted as TaxRemittance[])].sort((a, b) =>
              b.period_month.localeCompare(a.period_month),
            ),
          );
          setRemittancesLoading(false);
          return;
        }
      }

      setRemittances(existing);
    } catch (err: any) {
      setRemittancesError(err?.message || 'Could not load remittances');
    } finally {
      setRemittancesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRemittances();
  }, [loadRemittances]);

  const openRemitDialog = (r: TaxRemittance) => {
    setRemitForm({ provider_reference: r.provider_reference || '', notes: r.notes || '' });
    setRemitFile(null);
    setRemitDialogTarget(r);
  };

  const submitRemitted = async () => {
    if (!remitDialogTarget) return;
    setSavingRemit(true);
    try {
      let receiptUrl = remitDialogTarget.receipt_url;
      if (remitFile) {
        const safeName = remitFile.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const path = `remittances/${remitDialogTarget.id}/${Date.now()}-${safeName}`;
        const up = await supabase.storage.from('documents').upload(path, remitFile, {
          upsert: false,
          contentType: remitFile.type || undefined,
        });
        if (up.error) throw up.error;
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('tax_remittances')
        .update({
          remitted_at: new Date().toISOString(),
          remitted_by: profile?.id || null,
          provider_reference: remitForm.provider_reference || null,
          notes: remitForm.notes || null,
          receipt_url: receiptUrl,
          status: 'remitted',
        })
        .eq('id', remitDialogTarget.id);
      if (error) throw error;

      await logAudit(
        'remittance_marked_remitted',
        `${REMIT_LABELS[remitDialogTarget.remittance_type]} remittance for ${monthLabel(remitDialogTarget.period_month)} marked remitted`,
        profile,
      );
      toast({ title: 'Marked as remitted' });
      setRemitDialogTarget(null);
      loadRemittances();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingRemit(false);
    }
  };

  const confirmRemittance = async (r: TaxRemittance) => {
    setConfirmingRemitId(r.id);
    try {
      const { error } = await supabase
        .from('tax_remittances')
        .update({
          confirmed_at: new Date().toISOString(),
          confirmed_by: profile?.id || null,
          status: 'confirmed',
        })
        .eq('id', r.id);
      if (error) throw error;
      await logAudit(
        'remittance_confirmed',
        `${REMIT_LABELS[r.remittance_type]} remittance for ${monthLabel(r.period_month)} confirmed`,
        profile,
      );
      toast({ title: 'Remittance confirmed' });
      loadRemittances();
    } catch (err: any) {
      toast({ title: 'Could not confirm', description: err?.message, variant: 'destructive' });
    } finally {
      setConfirmingRemitId(null);
    }
  };

  const exportRemittances = () => {
    const header = [
      'period', 'type', 'amount_ngn', 'due_date', 'status',
      'remitted_at', 'confirmed_at', 'provider_reference', 'notes',
    ];
    const data = remittances.map((r) => [
      r.period_month.slice(0, 7),
      REMIT_LABELS[r.remittance_type],
      r.amount_ngn,
      r.due_date || '',
      remittanceStatus(r),
      r.remitted_at || '',
      r.confirmed_at || '',
      r.provider_reference || '',
      r.notes || '',
    ]);
    downloadCsv(`kdops-remittances-${toIsoDate(new Date())}.csv`, toCsv(header, data));
    logAudit('remittance_csv_exported', `${remittances.length} remittance row(s) exported`, profile);
  };

  const remittanceStats = useMemo(() => {
    const withStatus = remittances.map((r) => ({ r, status: remittanceStatus(r) }));
    const totalPending = withStatus
      .filter((x) => x.status === 'pending' || x.status === 'late')
      .reduce((sum, x) => sum + (x.r.amount_ngn || 0), 0);
    const overdueCount = withStatus.filter((x) => x.status === 'late').length;
    const remittedDates = remittances.map((r) => r.remitted_at).filter(Boolean) as string[];
    const lastRemittanceDate = remittedDates.length
      ? remittedDates.reduce((a, b) => (a > b ? a : b))
      : null;
    const currentYear = new Date().getFullYear();
    const ytdRemitted = remittances
      .filter((r) => r.remitted_at && new Date(r.remitted_at).getFullYear() === currentYear)
      .reduce((sum, r) => sum + (r.amount_ngn || 0), 0);
    return { totalPending, overdueCount, lastRemittanceDate, ytdRemitted };
  }, [remittances]);

  const remittancesByMonth = useMemo(() => {
    const groups = new Map<string, TaxRemittance[]>();
    for (const r of remittances) {
      const arr = groups.get(r.period_month) || [];
      arr.push(r);
      groups.set(r.period_month, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [remittances]);

  const addFiling = async () => {
    if (!form.kind || !form.period) {
      toast({ title: 'Kind and period are required', variant: 'destructive' });
      return;
    }
    const due = form.due_date || dueDateFor(form.kind, form.period);
    if (editingFiling) {
      // Update existing filing.
      const { error } = await supabase
        .from('compliance_filings')
        .update({
          due_date: due,
          amount_ngn: parseFloat(form.amount_ngn) || null,
        })
        .eq('id', editingFiling.id);
      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Filing updated' });
    } else {
      const { error } = await supabase.from('compliance_filings').upsert(
        {
          kind: form.kind,
          period: form.period,
          due_date: due,
          amount_ngn: parseFloat(form.amount_ngn) || null,
        },
        { onConflict: 'kind,period' },
      );
      if (error) {
        toast({ title: 'Could not add', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Filing added' });
    }
    setDialog(false);
    setEditingFiling(null);
    setForm({
      kind: 'paye',
      period: new Date().toISOString().slice(0, 7),
      due_date: '',
      amount_ngn: '',
    });
    load();
  };

  const markFiled = async (row: ComplianceFiling) => {
    setMarkingId(row.id);
    try {
      const { error } = await supabase
        .from('compliance_filings')
        .update({
          filed_at: new Date().toISOString(),
          filed_by: profile?.id || null,
          status: 'filed',
        })
        .eq('id', row.id);
      if (error) throw error;
      await logAudit(
        'compliance_filed',
        `${KIND_LABELS[row.kind]} (${row.period}) marked filed`,
        profile,
      );
      toast({ title: `${KIND_LABELS[row.kind]} marked as filed` });
      load();
    } catch (err: any) {
      toast({
        title: 'Could not update',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setMarkingId(null);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('compliance_filings')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      await logAudit(
        'compliance_deleted',
        `${KIND_LABELS[deleteTarget.kind]} (${deleteTarget.period}) deleted`,
        profile,
      );
      toast({ title: 'Filing deleted' });
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Statutory export pack ─────────────────────────────────────────────
  // Builds the full filing snapshot from the row's payroll_run_id (or
  // period, falling back to a period lookup) and produces a CSV per kind.
  //
  // This is read-only. It doesn't mark anything as filed and it doesn't
  // touch payments/payroll_run tables — only fetches them.
  type PackKind = 'lirs' | 'firs' | 'pssp' | 'nhf' | 'nsitf' | 'itf' | 'all';
  const downloadFilingPack = async (period: string, which: PackKind) => {
    const key = `${period}:${which}`;
    setDownloadingPack(key);
    try {
      const data = await loadStatutoryRunData(period);
      if (!data) {
        toast({
          title: 'No approved payroll for this period',
          description: `Run and approve payroll for ${period} first — the filing pack is generated from it.`,
          variant: 'destructive',
        });
        return;
      }
      const files: StatutoryExportFile[] = [];
      if (which === 'lirs' || which === 'all') files.push(buildLirsPayeSchedule(data));
      if (which === 'firs' || which === 'all') files.push(buildFirsPayeSchedule(data));
      if (which === 'pssp' || which === 'all') files.push(buildPenComPsspSchedule(data));
      if (which === 'nhf'  || which === 'all') files.push(buildNhfSchedule(data));
      if (which === 'nsitf'|| which === 'all') files.push(buildNsitfSchedule(data));
      if (which === 'itf'  || which === 'all') files.push(buildItfAnnualSchedule(data));
      for (const f of files) {
        // Ensure a tiny gap between downloads so browsers don't collapse them.
        downloadCsv(f.filename, f.csv);
        await new Promise((r) => setTimeout(r, 120));
      }
      await logAudit(
        'compliance_pack_downloaded',
        `Filing pack (${which}) downloaded for ${period} — ${files.length} file(s)`,
        profile,
      );
      toast({
        title: `${files.length} file${files.length === 1 ? '' : 's'} downloaded`,
        description: files.map((f) => f.summary).join(' · '),
      });
    } catch (err: any) {
      toast({
        title: 'Could not build filing pack',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDownloadingPack(null);
    }
  };

  const generatePenComPfaFiles = async () => {
    if (!penComRunId) {
      toast({ title: 'Pick a payroll run first', variant: 'destructive' });
      return;
    }
    setGeneratingPenCom(true);
    setPenComSummary(null);
    try {
      const schedules = await generatePenComSchedule(penComRunId);
      if (!schedules.length) {
        toast({
          title: 'No pension contributions found',
          description: 'This payroll run has no employees with a pension deduction.',
          variant: 'destructive',
        });
        return;
      }
      for (const s of schedules) {
        const safePfa = s.pfaName.replace(/[^a-zA-Z0-9]+/g, '-');
        downloadCsv(`PenCom-${safePfa}-${penComRunId.slice(0, 8)}.csv`, s.csvContent);
        await new Promise((r) => setTimeout(r, 120));
      }
      const employees = schedules.reduce((s, x) => s + x.employeeCount, 0);
      const total = schedules.reduce((s, x) => s + x.totalAmount, 0);
      setPenComSummary({ employees, pfas: schedules.length, total });
      await logAudit(
        'pencom_schedule_downloaded',
        `PenCom schedule downloaded — ${employees} employees across ${schedules.length} PFA(s)`,
        profile,
      );
      toast({
        title: `${schedules.length} PFA schedule${schedules.length === 1 ? '' : 's'} downloaded`,
        description: `${employees} employees · ₦${total.toLocaleString('en-NG')} total`,
      });
    } catch (err: any) {
      toast({ title: 'Could not generate PenCom schedule', description: err?.message, variant: 'destructive' });
    } finally {
      setGeneratingPenCom(false);
    }
  };

  const exportCalendar = () => {
    const header = [
      'kind',
      'period',
      'due_date',
      'status',
      'filed_at',
      'amount_ngn',
      'notes',
    ];
    const data = rows.map((r) => [
      KIND_LABELS[r.kind],
      r.period,
      r.due_date,
      r.status,
      r.filed_at || '',
      r.amount_ngn ?? '',
      r.notes || '',
    ]);
    downloadCsv(
      `kdops-compliance-${toIsoDate(new Date())}.csv`,
      toCsv(header, data),
    );
  };

  const [downloadingP9, setDownloadingP9] = useState(false);
  const exportP9 = async () => {
    setDownloadingP9(true);
    try {
      const year = new Date().getFullYear();
      const cards = await generateP9Cards(year);
      if (!cards.length) {
        toast({ title: 'No payslip data found', description: `No payslips exist for ${year} yet.`, variant: 'destructive' });
        return;
      }
      const csv = p9CardsToCsv(cards);
      downloadCsv(`kdops-p9-tax-cards-${year}.csv`, csv);
      await logAudit('p9_cards_downloaded', `P9 annual tax cards downloaded for ${year} — ${cards.length} employees`, profile);
      toast({ title: `P9 cards downloaded`, description: `${cards.length} employee tax cards for ${year}` });
    } catch (err: any) {
      toast({ title: 'P9 export failed', description: err?.message, variant: 'destructive' });
    } finally {
      setDownloadingP9(false);
    }
  };

  const counts = useMemo(() => {
    const filed = rows.filter((r) => r.status === 'filed').length;
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const due = rows.filter((r) => r.status === 'due').length;
    const upcoming = rows.filter((r) => r.status === 'upcoming').length;
    return { filed, overdue, due, upcoming };
  }, [rows]);

  return (
    <div className="space-y-6">
      <AuroraHero className="p-5 sm:p-6" scanLine={counts.overdue > 0} pattern="pulse">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Compliance Centre</h1>
              <InfoHint>Track every Nigerian statutory filing deadline in one place — PAYE, Pension, VAT, WHT, TCC, CAC, ITF, NSITF. Export a compliance calendar.</InfoHint>
            </div>
            <p className="text-muted-foreground text-sm mt-1">Every Nigerian statutory deadline in one place — PAYE, Pension, VAT, WHT, TCC, CAC, ITF, NSITF.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportP9} disabled={downloadingP9}>
              {downloadingP9 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              P9 Tax Cards
            </Button>
            <Button variant="outline" onClick={exportCalendar}>
              <Download className="mr-2 h-4 w-4" /> Export calendar
            </Button>
            <Button onClick={() => setDialog(true)}>
              <CalendarDays className="mr-2 h-4 w-4" /> New filing
            </Button>
          </div>
        </div>
      </AuroraHero>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Overdue"
          value={counts.overdue}
          subtitle="Escalate to Finance"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          title="Due this week"
          value={counts.due}
          subtitle="Within 3 days"
          icon={ShieldCheck}
          tone="warning"
        />
        <StatCard
          title="Upcoming"
          value={counts.upcoming}
          subtitle="All future filings"
          icon={CalendarDays}
          tone="primary"
        />
        <StatCard
          title="Filed"
          value={counts.filed}
          subtitle="This year"
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      {/* Compliance certificate tracker — surfaces expiring statutory docs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Statutory certificates</CardTitle>
            <a
              href="/documents"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Manage in Documents →
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {certs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No compliance certificates uploaded yet. Head to Documents → upload
              your Group Life, PenCom, NSITF/ITF/FIRS TCC or NDPR certificate and
              set a certificate type so we can track expiries here.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {certs.map((c) => {
                const d = c.expires_at ? daysUntil(c.expires_at) : null;
                const expired = d !== null && d < 0;
                const soon = d !== null && d >= 0 && d <= 30;
                const tone = expired
                  ? 'border-destructive/40 bg-destructive/5'
                  : soon
                  ? 'border-warning/40 bg-warning/5'
                  : 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20';
                const badgeCls = expired
                  ? 'bg-destructive/10 text-destructive'
                  : soon
                  ? 'bg-warning/10 text-warning'
                  : 'bg-success/10 text-success';
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'rounded-lg border p-3 flex flex-col gap-2 text-sm',
                      tone,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          {CERT_LABELS[c.certificate_type] || c.certificate_type}
                        </p>
                        <p className="font-medium truncate">{c.title}</p>
                      </div>
                      <Badge variant="secondary" className={cn('text-[10px]', badgeCls)}>
                        {expired ? 'expired' : soon ? 'expiring' : 'valid'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.expires_at
                        ? `Expires ${formatDate(c.expires_at)}${
                            d !== null
                              ? d < 0
                                ? ` · ${-d}d overdue`
                                : ` · in ${d}d`
                              : ''
                          }`
                        : 'No expiry set'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── PenCom pension schedule export, grouped by PFA ─────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            PenCom Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Generate one pension contribution CSV per PFA from an approved payroll
            run — RSA PIN, surname, first name, other names, employee (8%) and
            employer (10%) contribution, ready to upload to each PSSP portal.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 max-w-xs space-y-1.5">
              <Label htmlFor="pencom-run" className="text-xs">Payroll run</Label>
              <select
                id="pencom-run"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={penComRunId}
                onChange={(e) => { setPenComRunId(e.target.value); setPenComSummary(null); }}
              >
                {payrollRuns.length === 0 && <option value="">No approved payroll runs</option>}
                {payrollRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {monthLabel(r.period)} — {r.status}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={generatePenComPfaFiles} disabled={generatingPenCom || !penComRunId}>
              {generatingPenCom ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Generate PenCom Schedule
            </Button>
          </div>
          {penComSummary && (
            <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">{penComSummary.employees}</span> employees across{' '}
              <span className="font-medium">{penComSummary.pfas}</span> PFA{penComSummary.pfas === 1 ? '' : 's'} ·
              total contribution <span className="font-medium">₦{penComSummary.total.toLocaleString('en-NG')}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Payroll tax remittance tracking ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Pending remittance"
          value={formatNaira(remittanceStats.totalPending)}
          subtitle="Not yet paid out"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          title="Overdue"
          value={remittanceStats.overdueCount}
          subtitle="Past due, unpaid"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          title="Last remitted"
          value={remittanceStats.lastRemittanceDate ? formatDate(remittanceStats.lastRemittanceDate) : '—'}
          subtitle="Most recent payment"
          icon={CalendarDays}
          tone="primary"
        />
        <StatCard
          title="Remitted YTD"
          value={formatNaira(remittanceStats.ytdRemitted)}
          subtitle={`${new Date().getFullYear()} total`}
          icon={BadgeCheck}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Payroll tax remittances</CardTitle>
              <InfoHint>
                Whether PAYE, Pension and NHF withheld from payroll have actually been paid to
                FIRS/LIRS, PenCom (via each PFA) and FMBN — auto-generated from every approved
                payroll run.
              </InfoHint>
            </div>
            <Button variant="outline" size="sm" onClick={exportRemittances} disabled={remittances.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export history
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {remittancesLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : remittancesError ? (
            <ErrorState message={remittancesError} onRetry={loadRemittances} />
          ) : remittances.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No remittances yet"
              description="Remittance obligations are generated automatically once a payroll run is approved."
            />
          ) : (
            <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remittancesByMonth.map(([period, group]) => (
                    <Fragment key={period}>
                      {group.map((r, idx) => {
                        const status = remittanceStatus(r);
                        const d = r.due_date ? daysUntil(r.due_date) : null;
                        return (
                          <TableRow key={r.id} className="kd-transition">
                            {idx === 0 && (
                              <TableCell rowSpan={group.length} className="align-top font-medium text-sm">
                                {monthLabel(period)}
                              </TableCell>
                            )}
                            <TableCell>{REMIT_LABELS[r.remittance_type]}</TableCell>
                            <TableCell className="text-right currency">{formatNaira(r.amount_ngn)}</TableCell>
                            <TableCell>
                              {r.due_date ? formatDate(r.due_date) : '—'}
                              {status !== 'confirmed' && status !== 'remitted' && d !== null && (
                                <p className={cn('text-xs', d < 0 ? 'text-destructive' : d <= 3 ? 'text-warning' : 'text-muted-foreground')}>
                                  {d < 0 ? `${-d}d overdue` : `in ${d}d`}
                                </p>
                              )}
                            </TableCell>
                            <TableCell><StatusBadge status={status} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.provider_reference || '—'}
                              {r.receipt_url && (
                                <a href={r.receipt_url} target="_blank" rel="noreferrer" className="ml-1.5 text-primary inline-flex items-center gap-0.5 hover:underline">
                                  <Receipt className="h-3 w-3" /><ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {(status === 'pending' || status === 'late') && canManageRemittances && (
                                  <Button size="sm" variant="outline" onClick={() => openRemitDialog(r)}>
                                    <UploadCloud className="mr-1.5 h-4 w-4" /> Mark as remitted
                                  </Button>
                                )}
                                {status === 'remitted' && isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="bg-success/10 text-success border-success/40 hover:bg-success/20"
                                    disabled={confirmingRemitId === r.id}
                                    onClick={() => confirmRemittance(r)}
                                  >
                                    {confirmingRemitId === r.id ? (
                                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    ) : (
                                      <BadgeCheck className="mr-1.5 h-4 w-4" />
                                    )}
                                    Confirm
                                  </Button>
                                )}
                                {status === 'confirmed' && (
                                  <span className="text-xs text-muted-foreground self-center">
                                    Confirmed {r.confirmed_at ? formatDate(r.confirmed_at) : ''}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile remittances list */}
            <div className="md:hidden p-3 space-y-2">
              {remittancesByMonth.map(([period, group]) => (
                <div key={period} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                    {monthLabel(period)}
                  </p>
                  {group.map((r) => {
                    const status = remittanceStatus(r);
                    const d = r.due_date ? daysUntil(r.due_date) : null;
                    const accent =
                      status === 'confirmed' ? 'bg-emerald-500'
                      : status === 'remitted' ? 'bg-blue-500'
                      : status === 'late' ? 'bg-red-500'
                      : 'bg-amber-500';
                    return (
                      <MobileCard key={r.id} accentClassName={accent}>
                        <MobileCardHeader>
                          <div className="min-w-0 flex-1">
                            <MobileCardTitle>{REMIT_LABELS[r.remittance_type]}</MobileCardTitle>
                          </div>
                          <MobileCardMeta className="currency text-base">
                            {formatNaira(r.amount_ngn)}
                          </MobileCardMeta>
                        </MobileCardHeader>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <StatusBadge status={status} size="sm" />
                          {r.due_date && (
                            <span className={cn('text-muted-foreground', status === 'late' && 'text-destructive font-medium')}>
                              {formatDate(r.due_date)}{d !== null && status !== 'confirmed' && status !== 'remitted' ? ` (${d < 0 ? `${-d}d overdue` : `in ${d}d`})` : ''}
                            </span>
                          )}
                        </div>
                        {r.provider_reference && (
                          <MobileCardRow label="Reference">{r.provider_reference}</MobileCardRow>
                        )}
                        <MobileCardFooter>
                          {(status === 'pending' || status === 'late') && canManageRemittances && (
                            <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => openRemitDialog(r)}>
                              <UploadCloud className="mr-1.5 h-4 w-4" /> Mark as remitted
                            </Button>
                          )}
                          {status === 'remitted' && isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9 bg-success/10 text-success border-success/40 hover:bg-success/20"
                              disabled={confirmingRemitId === r.id}
                              onClick={() => confirmRemittance(r)}
                            >
                              {confirmingRemitId === r.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-1.5 h-4 w-4" />}
                              Confirm
                            </Button>
                          )}
                        </MobileCardFooter>
                      </MobileCard>
                    );
                  })}
                </div>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All filings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title="No filings yet"
              description={isAdmin ? 'Add your first statutory filing (PAYE, VAT, Pension, etc.) to start tracking deadlines.' : 'No compliance filings have been added yet. Ask an admin to add the first one.'}
            />
          ) : (
            <>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filing</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const d = daysUntil(r.due_date);
                  const isAuto = !!r.payroll_run_id;
                  const pfaSlices: PensionPfaSlice[] = (r.kind === 'pension' && Array.isArray(r.breakdown_json))
                    ? (r.breakdown_json as PensionPfaSlice[])
                    : [];
                  const expandable = pfaSlices.length > 0;
                  const isExpanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                    <TableRow className="kd-transition">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{KIND_LABELS[r.kind]}</p>
                          {isAuto && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0 h-5 gap-1">
                                  <Sparkles className="h-3 w-3" /> Auto
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Auto-calculated from approved payroll for {r.period}
                                {r.auto_calculated_at && (
                                  <p className="text-[10px] opacity-70 mt-1">Last refreshed {formatDate(r.auto_calculated_at)}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {expandable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1 text-[10px]"
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            >
                              <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
                              {pfaSlices.length} PFA{pfaSlices.length === 1 ? '' : 's'}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{KIND_NOTES[r.kind]}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.period}</TableCell>
                      <TableCell>
                        {formatDate(r.due_date)}
                        {r.status !== 'filed' && d !== null && (
                          <p className={cn(
                            'text-xs',
                            d < 0
                              ? 'text-destructive'
                              : d <= 3
                              ? 'text-warning'
                              : 'text-muted-foreground',
                          )}>
                            {d < 0 ? `${-d}d overdue` : `in ${d}d`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right currency">
                        {r.amount_ngn != null ? formatNaira(r.amount_ngn) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_CLASS[r.status]}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status !== 'filed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markingId === r.id}
                              onClick={() => markFiled(r)}
                            >
                              {markingId === r.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileCheck2 className="mr-2 h-4 w-4" />
                              )}
                              Mark filed
                            </Button>
                          )}
                          {r.status === 'filed' && (
                            <span className="text-xs text-muted-foreground mr-2 self-center">
                              Filed {r.filed_at ? formatDate(r.filed_at) : '—'}
                            </span>
                          )}
                          {/^\d{4}-\d{2}$/.test(r.period) && (
                            <FilingPackMenu
                              period={r.period}
                              kind={r.kind}
                              busy={downloadingPack?.startsWith(`${r.period}:`) ?? false}
                              onPick={(w) => downloadFilingPack(r.period, w)}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setForm({
                                kind: r.kind as any,
                                period: r.period,
                                due_date: r.due_date,
                                amount_ngn: r.amount_ngn != null ? String(r.amount_ngn) : '',
                              });
                              setEditingFiling(r);
                              setDialog(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(r)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && expandable && (
                      <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
                        <TableCell colSpan={6} className="py-3">
                          <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Per-PFA breakdown — one remittance per PFA
                            </p>
                            <div className="rounded-md border bg-background overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">PFA</TableHead>
                                    <TableHead className="text-xs text-right">RSAs</TableHead>
                                    <TableHead className="text-xs text-right">Employee 8%</TableHead>
                                    <TableHead className="text-xs text-right">Employer 10%</TableHead>
                                    <TableHead className="text-xs text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {pfaSlices.map((s, i) => (
                                    <TableRow key={`${r.id}-${i}`}>
                                      <TableCell className="text-sm font-medium">{s.pfa}</TableCell>
                                      <TableCell className="text-sm text-right">{s.rsa_count}</TableCell>
                                      <TableCell className="text-sm text-right currency">{formatNaira(s.employee_amount_ngn)}</TableCell>
                                      <TableCell className="text-sm text-right currency">{formatNaira(s.employer_amount_ngn)}</TableCell>
                                      <TableCell className="text-sm text-right currency font-semibold">{formatNaira(s.total_amount_ngn)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile compliance filings list */}
            <div className="md:hidden p-3 space-y-2">
              {rows.map((r) => {
                const d = daysUntil(r.due_date);
                const overdue = d !== null && d < 0 && r.status !== 'filed';
                const dueSoon = d !== null && d >= 0 && d <= 3 && r.status !== 'filed';
                const accent =
                  r.status === 'filed' ? 'bg-emerald-500'
                  : overdue ? 'bg-red-500'
                  : dueSoon ? 'bg-amber-500'
                  : 'bg-blue-500';
                return (
                  <MobileCard key={r.id} accentClassName={accent}>
                    <MobileCardHeader>
                      <div className="min-w-0 flex-1">
                        <MobileCardTitle>{KIND_LABELS[r.kind]}</MobileCardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{KIND_NOTES[r.kind]}</p>
                      </div>
                      {r.amount_ngn != null && (
                        <MobileCardMeta className="currency text-base">
                          {formatNaira(r.amount_ngn)}
                        </MobileCardMeta>
                      )}
                    </MobileCardHeader>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <Badge variant="secondary" className={STATUS_CLASS[r.status]}>{r.status}</Badge>
                      <span className="text-muted-foreground">{r.period}</span>
                    </div>

                    <MobileCardRow label="Due date">
                      <span className={cn(overdue && 'text-destructive font-medium', dueSoon && 'text-warning font-medium')}>
                        {formatDate(r.due_date)}
                        {r.status !== 'filed' && d !== null && (
                          <span className="ml-1 opacity-80">{d < 0 ? `(${-d}d overdue)` : `(in ${d}d)`}</span>
                        )}
                      </span>
                    </MobileCardRow>
                    {r.status === 'filed' && r.filed_at && (
                      <MobileCardRow label="Filed">{formatDate(r.filed_at)}</MobileCardRow>
                    )}

                    <MobileCardFooter>
                      {r.status !== 'filed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9 bg-success/10 text-success border-success/40 hover:bg-success/20"
                          disabled={markingId === r.id}
                          onClick={() => markFiled(r)}
                        >
                          {markingId === r.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-1.5 h-4 w-4" />}
                          Mark filed
                        </Button>
                      )}
                      {/^\d{4}-\d{2}$/.test(r.period) && (
                        <FilingPackMenu
                          period={r.period}
                          kind={r.kind}
                          busy={downloadingPack?.startsWith(`${r.period}:`) ?? false}
                          onPick={(w) => downloadFilingPack(r.period, w)}
                        />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9"
                        onClick={() => {
                          setForm({
                            kind: r.kind as any,
                            period: r.period,
                            due_date: r.due_date,
                            amount_ngn: r.amount_ngn != null ? String(r.amount_ngn) : '',
                          });
                          setEditingFiling(r);
                          setDialog(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-1.5" /> Edit
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-3 text-destructive"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </MobileCardFooter>
                  </MobileCard>
                );
              })}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New statutory filing</DialogTitle>
          </DialogHeader>
          <div
            className="space-y-3"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFiling(); } }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Filing</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm kd-transition"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
                >
                  {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Period</Label>
                <Input
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  placeholder="e.g. 2026-04"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Due date (optional)</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  value={form.amount_ngn}
                  onChange={(e) => setForm({ ...form, amount_ngn: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave Due date blank to use the standard statutory deadline.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addFiling}>Save filing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!remitDialogTarget} onOpenChange={(v) => { if (!v) setRemitDialogTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Mark {remitDialogTarget ? REMIT_LABELS[remitDialogTarget.remittance_type] : ''} as remitted
            </DialogTitle>
          </DialogHeader>
          {remitDialogTarget && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">{monthLabel(remitDialogTarget.period_month)}</span>
                <span className="font-semibold currency">{formatNaira(remitDialogTarget.amount_ngn)}</span>
              </div>
              <div className="space-y-1">
                <Label>Provider / e-filing reference</Label>
                <Input
                  value={remitForm.provider_reference}
                  onChange={(e) => setRemitForm({ ...remitForm, provider_reference: e.target.value })}
                  placeholder="e.g. FIRS TRA-2026-04-118823"
                />
              </div>
              <div className="space-y-1">
                <Label>Receipt / proof of payment (optional)</Label>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setRemitFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input
                  value={remitForm.notes}
                  onChange={(e) => setRemitForm({ ...remitForm, notes: e.target.value })}
                  placeholder="Any context for Finance"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemitDialogTarget(null)} disabled={savingRemit}>
              Cancel
            </Button>
            <Button onClick={submitRemitted} disabled={savingRemit}>
              {savingRemit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mark as remitted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this compliance item?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={deleteItem}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Compliance;
