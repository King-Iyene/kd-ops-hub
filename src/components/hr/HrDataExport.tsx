import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { downloadCsv, toCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2, Database, Archive, Info } from 'lucide-react';
import { formatDate } from '@/lib/format';

// NDPR-sensitive fields, keyed by csvColumns name — masked whenever the
// "Mask sensitive data" toggle is on.
const MASKED_ACCOUNT_FIELDS = new Set(['bank_account_number']);
const MASKED_BLANKET_FIELDS = new Set(['nin', 'tin', 'bvn']);
const MASKED_PHONE_FIELDS = new Set(['phone']);

const maskAccountNumber = (v: string): string => {
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
};

const maskPhone = (v: string): string => {
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 7) return '****';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

const maskRow = (
  columns: string[],
  row: (string | number | null)[],
): (string | number | null)[] =>
  row.map((value, i) => {
    const col = columns[i];
    if (value === null || value === undefined || value === '') return value;
    if (MASKED_ACCOUNT_FIELDS.has(col)) return maskAccountNumber(String(value));
    if (MASKED_BLANKET_FIELDS.has(col)) return '***masked***';
    if (MASKED_PHONE_FIELDS.has(col)) return maskPhone(String(value));
    return value;
  });

/**
 * Full HR data snapshot export.
 *
 * A safety net for the PaidHR→KDOps cutover: any admin can, at any time,
 * pull a zip of CSVs representing the current HR state. Use it for
 *   • pre-migration baseline (before importing PaidHR data)
 *   • post-migration verification (compare to PaidHR export)
 *   • quarterly audit archives
 *   • rollback source if a migration goes wrong
 *
 * Each dataset ships as one CSV so finance can open them in Excel:
 *   • employees             — every profile
 *   • leave_balances        — current-year balances per employee
 *   • leave_requests        — all leave history
 *   • payslips              — every payslip on file (period + gross + net)
 *   • employee_advances     — outstanding + settled advances
 *   • employee_benefits     — pension/hmo/group life enrolments
 *   • employee_loans        — loan register + repayments
 *
 * The user picks which datasets to include. Each is downloaded as its
 * own CSV file (no zip lib pulled in — sequential downloads with a 200ms
 * spacer works reliably across browsers). The naming convention makes
 * the archive obviously a snapshot: `kdops-hr-<dataset>-YYYY-MM-DD.csv`.
 */

interface DatasetSpec {
  key: string;
  label: string;
  description: string;
  fetch: () => Promise<any[]>;
  csvColumns: string[];
  toRow: (r: any) => (string | number | null)[];
}

const today = () => new Date().toISOString().slice(0, 10);

// Data-source guards — some tables (advances, loans) don't exist on every
// tenant. Wrap the query so a missing-table error resolves to []
// instead of blowing up the entire export.
async function safeSelect<T = any>(
  table: string,
  select: string,
): Promise<T[]> {
  try {
    const { data, error } = await supabase.from(table as any).select(select);
    if (error) {
      console.warn(`[HrDataExport] ${table}:`, error.message);
      return [];
    }
    return (data ?? []) as T[];
  } catch (e) {
    console.warn(`[HrDataExport] ${table} threw`, e);
    return [];
  }
}

const DATASETS: DatasetSpec[] = [
  {
    key: 'employees',
    label: 'Employees',
    description: 'Full profile — 30+ fields per row including statutory ids and bank details.',
    csvColumns: [
      'employee_number', 'full_name', 'first_name', 'last_name', 'email', 'phone',
      'role', 'status', 'job_title', 'department', 'employment_type',
      'start_date', 'contract_end_date', 'date_of_birth', 'gender', 'marital_status',
      'address', 'salary_ngn',
      'bank_name', 'bank_account_number', 'bank_account_name',
      'tin', 'nin', 'pension_pin', 'pfa_name', 'pfa_code',
      'nhf_number', 'nhis_number', 'state_of_residence',
      'created_at',
    ],
    fetch: () =>
      safeSelect(
        'profiles',
        'employee_number, full_name, first_name, last_name, email, phone, role, status, job_title, employment_type, start_date, contract_end_date, date_of_birth, gender, marital_status, address, salary_ngn, bank_name, bank_account_number, bank_account_name, tin, nin, pension_pin, pfa_name, pfa_code, nhf_number, nhis_number, state_of_residence, created_at, departments!department_id(name)',
      ),
    toRow: (r: any) => [
      r.employee_number ?? '',
      r.full_name ?? '',
      r.first_name ?? '',
      r.last_name ?? '',
      r.email ?? '',
      r.phone ?? '',
      r.role ?? '',
      r.status ?? '',
      r.job_title ?? '',
      r.departments?.name ?? '',
      r.employment_type ?? '',
      r.start_date ?? '',
      r.contract_end_date ?? '',
      r.date_of_birth ?? '',
      r.gender ?? '',
      r.marital_status ?? '',
      r.address ?? '',
      r.salary_ngn ?? '',
      r.bank_name ?? '',
      r.bank_account_number ?? '',
      r.bank_account_name ?? '',
      r.tin ?? '',
      r.nin ?? '',
      r.pension_pin ?? '',
      r.pfa_name ?? '',
      r.pfa_code ?? '',
      r.nhf_number ?? '',
      r.nhis_number ?? '',
      r.state_of_residence ?? '',
      r.created_at ?? '',
    ],
  },
  {
    key: 'leave_balances',
    label: 'Leave balances',
    description: 'Per-employee, per-year balances — annual quota + used counters.',
    csvColumns: ['employee_email', 'year', 'annual_quota', 'annual_used', 'sick_used', 'unpaid_used'],
    fetch: () =>
      safeSelect(
        'leave_balances',
        'year, annual_quota, annual_used, sick_used, unpaid_used, profiles!employee_id(email)',
      ),
    toRow: (r: any) => [
      r.profiles?.email ?? '',
      r.year ?? '',
      r.annual_quota ?? 0,
      r.annual_used ?? 0,
      r.sick_used ?? 0,
      r.unpaid_used ?? 0,
    ],
  },
  {
    key: 'leave_requests',
    label: 'Leave requests',
    description: 'Full leave history — approved, pending, rejected.',
    csvColumns: [
      'employee_email', 'leave_type', 'start_date', 'end_date',
      'days_requested', 'status', 'reason', 'created_at',
    ],
    fetch: () =>
      safeSelect(
        'leave_requests',
        'leave_type, start_date, end_date, days_requested, status, reason, created_at, profiles!employee_id(email)',
      ),
    toRow: (r: any) => [
      r.profiles?.email ?? '',
      r.leave_type ?? '',
      r.start_date ?? '',
      r.end_date ?? '',
      r.days_requested ?? 0,
      r.status ?? '',
      r.reason ?? '',
      r.created_at ?? '',
    ],
  },
  {
    key: 'payslips',
    label: 'Payslips',
    description: 'Every payslip on file — period, gross, deductions, net.',
    csvColumns: [
      'employee_email', 'employee_name', 'period', 'gross_ngn',
      'paye_ngn', 'pension_ngn', 'nhf_ngn', 'deductions_ngn', 'net_ngn',
      'storage_path', 'created_at',
    ],
    fetch: () =>
      safeSelect(
        'payslips',
        'employee_name, employee_email, period, gross_ngn, paye_ngn, pension_ngn, nhf_ngn, deductions_ngn, net_ngn, storage_path, created_at',
      ),
    toRow: (r: any) => [
      r.employee_email ?? '',
      r.employee_name ?? '',
      r.period ?? '',
      r.gross_ngn ?? 0,
      r.paye_ngn ?? 0,
      r.pension_ngn ?? 0,
      r.nhf_ngn ?? 0,
      r.deductions_ngn ?? 0,
      r.net_ngn ?? 0,
      r.storage_path ?? '',
      r.created_at ?? '',
    ],
  },
  {
    key: 'employee_advances',
    label: 'Employee advances',
    description: 'Outstanding + settled salary advances (optional module).',
    csvColumns: [
      'employee_email', 'amount_ngn', 'outstanding_ngn', 'repayment_months',
      'deduction_per_month', 'start_period', 'status', 'created_at',
    ],
    fetch: () =>
      safeSelect(
        'employee_advances',
        'amount_ngn, outstanding_ngn, repayment_months, deduction_per_month, start_period, status, created_at, profiles!employee_id(email)',
      ),
    toRow: (r: any) => [
      r.profiles?.email ?? '',
      r.amount_ngn ?? 0,
      r.outstanding_ngn ?? 0,
      r.repayment_months ?? 0,
      r.deduction_per_month ?? 0,
      r.start_period ?? '',
      r.status ?? '',
      r.created_at ?? '',
    ],
  },
  {
    key: 'employee_benefits',
    label: 'Employee benefits',
    description: 'Pension / HMO / group-life enrolments per employee.',
    csvColumns: [
      'employee_email', 'benefit_type', 'provider', 'plan_name',
      'premium_ngn', 'status', 'start_date', 'end_date',
    ],
    fetch: () =>
      safeSelect(
        'employee_benefits',
        'benefit_type, provider, plan_name, premium_ngn, status, start_date, end_date, profiles!employee_id(email)',
      ),
    toRow: (r: any) => [
      r.profiles?.email ?? '',
      r.benefit_type ?? '',
      r.provider ?? '',
      r.plan_name ?? '',
      r.premium_ngn ?? 0,
      r.status ?? '',
      r.start_date ?? '',
      r.end_date ?? '',
    ],
  },
  {
    key: 'employee_loans',
    label: 'Employee loans',
    description: 'Staff loan register (optional module).',
    csvColumns: [
      'employee_email', 'principal_ngn', 'outstanding_ngn', 'tenure_months',
      'monthly_repayment_ngn', 'interest_rate_pct', 'status', 'disbursed_at',
    ],
    fetch: () =>
      safeSelect(
        'employee_loans',
        'principal_ngn, outstanding_ngn, tenure_months, monthly_repayment_ngn, interest_rate_pct, status, disbursed_at, profiles!employee_id(email)',
      ),
    toRow: (r: any) => [
      r.profiles?.email ?? '',
      r.principal_ngn ?? 0,
      r.outstanding_ngn ?? 0,
      r.tenure_months ?? 0,
      r.monthly_repayment_ngn ?? 0,
      r.interest_rate_pct ?? 0,
      r.status ?? '',
      r.disbursed_at ?? '',
    ],
  },
];

export const HrDataExport = () => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(DATASETS.map((d) => d.key)),
  );
  const [busy, setBusy] = useState(false);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [maskSensitive, setMaskSensitive] = useState(true);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    setSelected(next);
  };

  const runExport = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    let filesExported = 0;
    let totalRows = 0;
    try {
      for (const spec of DATASETS) {
        if (!selected.has(spec.key)) continue;
        const data = await spec.fetch();
        const rows = data
          .map(spec.toRow)
          .map((row) => (maskSensitive ? maskRow(spec.csvColumns, row) : row));
        const csv = toCsv(spec.csvColumns, rows);
        downloadCsv(`kdops-hr-${spec.key}-${today()}.csv`, csv);
        filesExported++;
        totalRows += data.length;
        // Spacer prevents Chrome from collapsing many rapid downloads.
        await new Promise((r) => setTimeout(r, 220));
      }
      await logAudit(
        'hr_data_exported' as any,
        `HR snapshot: ${filesExported} file(s), ${totalRows} row(s) exported (sensitive data ${maskSensitive ? 'masked' : 'unmasked'})`,
        profile,
      );
      setLastExportedAt(new Date().toISOString());
      toast({
        title: `${filesExported} snapshot file${filesExported === 1 ? '' : 's'} downloaded`,
        description: `${totalRows} row${totalRows === 1 ? '' : 's'} total.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Snapshot failed',
        description: errorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="h-4 w-4" /> HR data snapshot export
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Download a CSV per dataset — safety net for the PaidHR migration and
          for quarterly audit archives. Each dataset is fetched fresh at click
          time.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {DATASETS.map((d) => (
            <label
              key={d.key}
              className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
            >
              <Checkbox
                checked={selected.has(d.key)}
                onCheckedChange={(v) => toggle(d.key, Boolean(v))}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Label className="font-medium text-sm cursor-pointer">
                    {d.label}
                  </Label>
                  <Badge variant="secondary" className="text-[10px]">
                    {d.csvColumns.length} columns
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {d.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2 min-w-0">
            <Label htmlFor="mask-sensitive" className="text-sm font-medium cursor-pointer">
              Mask sensitive data
            </Label>
            <span
              title="Masks bank accounts, NIN, TIN, and BVN in exports for NDPR compliance"
              className="text-muted-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
          <Switch
            id="mask-sensitive"
            checked={maskSensitive}
            onCheckedChange={setMaskSensitive}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Database className="h-3.5 w-3.5" />
            {lastExportedAt
              ? `Last export ${formatDate(lastExportedAt)}`
              : 'No export this session'}
          </div>
          <Button onClick={runExport} disabled={busy || selected.size === 0}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {busy
              ? 'Exporting…'
              : `Export ${selected.size} dataset${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default HrDataExport;
