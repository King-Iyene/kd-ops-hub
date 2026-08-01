import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { downloadCsv, toCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Download, X,
  ArrowRight, ArrowLeft, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Universal bulk employee CSV importer.
 *
 * Three-step wizard:
 *   1. UPLOAD  — pick any CSV. Papa-Parse extracts the header row and up
 *                to 100 preview rows.
 *   2. MAP     — user maps each source column to a KDOps profile field via
 *                a dropdown. An auto-mapper pre-fills obvious matches
 *                (email→email, first name→first_name, phone→phone…) using
 *                a fuzzy header dictionary that covers PaidHR, BizEdge,
 *                SeamlessHR, Bento, and generic Excel headers.
 *   3. IMPORT  — validate each mapped row with Zod, show error preview,
 *                upsert to profiles with status='invited'.
 *
 * Safety:
 *   - No auth users created. Same 'Resend invite' path handles OTP later.
 *   - Bank details stored as-is; no Paystack recipient creation here.
 *   - Fallback upsert path in case seed_invited_profile RPC is unavailable.
 */

interface Department {
  id: string;
  name: string;
}

type RoleOption =
  | 'super_admin' | 'admin' | 'finance' | 'operations'
  | 'field_staff' | 'driver' | 'candidate';

const KNOWN_ROLES: RoleOption[] = [
  'super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver', 'candidate',
];

// Canonical target field library — the destinations users can map into.
// Grouped so the mapping UI is readable when a CSV has 50+ columns.
export const KDOPS_FIELDS = [
  { key: 'first_name',          label: 'First name',            group: 'Identity', required: true },
  { key: 'last_name',           label: 'Last name',             group: 'Identity', required: true },
  { key: 'email',               label: 'Email',                 group: 'Identity', required: true },
  { key: 'phone',               label: 'Phone',                 group: 'Identity' },
  { key: 'date_of_birth',       label: 'Date of birth',         group: 'Identity' },
  { key: 'gender',              label: 'Gender',                group: 'Identity' },
  { key: 'marital_status',      label: 'Marital status',        group: 'Identity' },
  { key: 'address',             label: 'Address',               group: 'Identity' },

  { key: 'role',                label: 'Role (KDOps)',          group: 'Employment' },
  { key: 'employee_number',     label: 'Employee / staff no.',  group: 'Employment' },
  { key: 'job_title',           label: 'Job title',             group: 'Employment' },
  { key: 'department',          label: 'Department (name)',     group: 'Employment' },
  { key: 'start_date',          label: 'Start date',            group: 'Employment' },
  { key: 'employment_type',     label: 'Employment type',       group: 'Employment' },
  { key: 'salary_ngn',          label: 'Monthly salary (₦)',    group: 'Employment' },

  { key: 'bank_name',           label: 'Bank name',             group: 'Bank' },
  { key: 'bank_account_number', label: 'Bank account no.',      group: 'Bank' },
  { key: 'bank_account_name',   label: 'Bank account name',     group: 'Bank' },

  { key: 'tin',                 label: 'TIN (FIRS)',            group: 'Statutory' },
  { key: 'nin',                 label: 'NIN',                   group: 'Statutory' },
  { key: 'pension_pin',         label: 'RSA PIN',               group: 'Statutory' },
  { key: 'pfa_name',            label: 'PFA name',              group: 'Statutory' },
  { key: 'pfa_code',            label: 'PFA code',              group: 'Statutory' },
  { key: 'nhf_number',          label: 'NHF number',            group: 'Statutory' },
  { key: 'nhis_number',         label: 'NHIS number',           group: 'Statutory' },
  { key: 'state_of_residence',  label: 'State of residence',    group: 'Statutory' },
] as const;

type FieldKey = typeof KDOPS_FIELDS[number]['key'];
const FIELD_KEYS = KDOPS_FIELDS.map((f) => f.key);

// Fuzzy header dictionary. Keys are the KDOps field; values are lowercased
// substrings we look for in the source header. First match wins.
const AUTO_MAP_HINTS: Record<FieldKey, string[]> = {
  first_name:          ['first name', 'first_name', 'firstname', 'given name', 'givenname', 'fname'],
  last_name:           ['last name', 'last_name', 'lastname', 'surname', 'family name', 'lname'],
  email:               ['email', 'e-mail', 'personal email', 'work email'],
  phone:               ['phone', 'mobile', 'gsm', 'cell', 'msisdn', 'contact no'],
  date_of_birth:       ['date of birth', 'dob', 'birth date', 'birthday', 'birthdate'],
  gender:              ['gender', 'sex'],
  marital_status:      ['marital', 'marriage', 'civil status'],
  address:             ['address', 'residential', 'home address', 'street'],
  role:                ['role', 'access level', 'system role'],
  employee_number:     ['employee number', 'employee no', 'employee id', 'staff number', 'staff no', 'staff id', 'emp no', 'emp id', 'payroll no', 'payroll id'],
  job_title:           ['job title', 'position', 'designation', 'title', 'grade level'],
  department:          ['department', 'dept', 'business unit', 'team', 'division'],
  start_date:          ['start date', 'hire date', 'date hired', 'date of hire', 'employment start', 'commencement', 'joined'],
  employment_type:     ['employment type', 'engagement type', 'contract type', 'employee type', 'staff type'],
  salary_ngn:          ['salary', 'monthly salary', 'gross salary', 'basic salary', 'monthly gross', 'salary_ngn'],
  bank_name:           ['bank name', 'bank', 'bank of'],
  bank_account_number: ['account number', 'account no', 'acct no', 'acct number', 'bank account', 'nuban'],
  bank_account_name:   ['account name', 'beneficiary name', 'bank account name'],
  tin:                 ['tin', 'tax id', 'firs id', 'firs tin', 'tax identification'],
  nin:                 ['nin', 'national id', 'national identification'],
  pension_pin:         ['rsa pin', 'rsa', 'pension pin', 'pension id', 'pfa pin'],
  pfa_name:            ['pfa name', 'pfa', 'pension fund', 'pension provider'],
  pfa_code:            ['pfa code', 'pssp', 'pfa id'],
  nhf_number:          ['nhf number', 'nhf', 'housing fund', 'fmbn number', 'fmbn'],
  nhis_number:         ['nhis number', 'nhis', 'hmo number', 'health insurance no'],
  state_of_residence:  ['state of residence', 'state', 'residence state', 'paye state'],
};

const ROW_SCHEMA = z.object({
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  email: z.string().email('Valid email required'),
});

interface ParsedRow {
  __rowIndex: number;
  __errors: string[];
  data: Partial<Record<FieldKey, string | null>>;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: Department[];
  onComplete: () => void;
}

const NONE = '__none__';

// Auto-detect the best KDOps field for a source header. Returns null if
// nothing seems to match. Prefers longer hint matches (more specific).
function autoMap(header: string): FieldKey | null {
  const h = header.toLowerCase().trim();
  if (!h) return null;
  let bestField: FieldKey | null = null;
  let bestLen = 0;
  for (const [field, hints] of Object.entries(AUTO_MAP_HINTS) as [FieldKey, string[]][]) {
    for (const hint of hints) {
      if ((h === hint || h.includes(hint)) && hint.length > bestLen) {
        bestField = field;
        bestLen = hint.length;
      }
    }
  }
  return bestField;
}

export const EmployeeCsvImport = ({
  open, onOpenChange, departments, onComplete,
}: Props) => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [step, setStep] = useState<Step>('upload');
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey | typeof NONE>>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const deptByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.name.trim().toLowerCase(), d.id);
    return m;
  }, [departments]);

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      setStep('upload');
      setRawRows([]);
      setSourceHeaders([]);
      setMapping({});
      setRows([]);
      setFileName(null);
      setImportedCount(0);
      setFailedCount(0);
    }
  }, [open]);

  const validRows = useMemo(() => rows.filter((r) => r.__errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.__errors.length > 0), [rows]);

  // ────────────────────────────────────────────────────────────────────
  // STEP 1 — parse CSV, extract headers + preview rows
  // ────────────────────────────────────────────────────────────────────
  const parseFile = (file: File) => {
    setParsing(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // Keep source headers verbatim (case + spaces) so the mapping UI is
      // recognisable to the user; we only lowercase for auto-detection.
      transformHeader: (h) => h.trim(),
      complete: ({ data, meta, errors }) => {
        if (errors?.length) {
          toast({
            title: 'CSV parse warnings',
            description: `${errors.length} issue${errors.length === 1 ? '' : 's'}. First: ${errors[0]?.message ?? '—'}`,
          });
        }
        const headers = (meta.fields ?? []).filter(Boolean);
        setSourceHeaders(headers);
        setRawRows(data);
        setFileName(file.name);
        // Prime the mapping with auto-detected matches.
        const initial: Record<string, FieldKey | typeof NONE> = {};
        for (const h of headers) initial[h] = (autoMap(h) ?? NONE) as any;
        setMapping(initial);
        setStep('map');
        setParsing(false);
      },
      error: (err) => {
        setParsing(false);
        toast({
          title: 'Could not parse CSV',
          description: err.message,
          variant: 'destructive',
        });
      },
    });
  };

  // ────────────────────────────────────────────────────────────────────
  // STEP 2 → 3 — apply mapping, validate each row
  // ────────────────────────────────────────────────────────────────────
  const applyMapping = () => {
    // Reverse map: KDOps field → source header (if user mapped multiple
    // source columns to the same field, the LAST one wins — same as Excel).
    const targetToSource: Record<FieldKey, string | null> = {} as any;
    for (const key of FIELD_KEYS) targetToSource[key] = null;
    for (const [source, target] of Object.entries(mapping)) {
      if (target !== NONE) targetToSource[target as FieldKey] = source;
    }

    const parsed: ParsedRow[] = rawRows.map((row, i) => {
      const data: Partial<Record<FieldKey, string | null>> = {};
      for (const key of FIELD_KEYS) {
        const src = targetToSource[key];
        const raw = src ? row[src] : null;
        const trimmed = raw != null ? String(raw).trim() : '';
        data[key] = trimmed || null;
      }
      const errors: string[] = [];
      const requiredCheck = ROW_SCHEMA.safeParse(data);
      if (!requiredCheck.success) {
        for (const iss of requiredCheck.error.issues) {
          errors.push(`${iss.path.join('.') || 'row'}: ${iss.message}`);
        }
      }
      if (data.role && !KNOWN_ROLES.includes(data.role as RoleOption)) {
        errors.push(`role: "${data.role}" not one of ${KNOWN_ROLES.join(', ')}`);
      }
      if (data.salary_ngn && Number.isNaN(Number(String(data.salary_ngn).replace(/[^\d.-]/g, '')))) {
        errors.push('salary_ngn: not a number');
      }
      if (data.start_date && !/^\d{4}-\d{2}-\d{2}/.test(String(data.start_date))) {
        errors.push('start_date: expected YYYY-MM-DD');
      }
      if (data.date_of_birth && !/^\d{4}-\d{2}-\d{2}/.test(String(data.date_of_birth))) {
        errors.push('date_of_birth: expected YYYY-MM-DD');
      }
      if (data.department && !deptByName.has(String(data.department).toLowerCase())) {
        errors.push(`department: "${data.department}" not found — will land as null`);
      }
      return { __rowIndex: i + 2, __errors: errors, data };
    });
    setRows(parsed);
    setStep('preview');
  };

  // ────────────────────────────────────────────────────────────────────
  // STEP 3 → import to Supabase
  // ────────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const r of validRows) {
      const d = r.data;
      const deptId = d.department ? deptByName.get(String(d.department).toLowerCase()) ?? null : null;
      const first = d.first_name ?? '';
      const last  = d.last_name ?? '';
      const fullName = `${first} ${last}`.trim();
      const cleanSalary = d.salary_ngn
        ? Number(String(d.salary_ngn).replace(/[^\d.-]/g, '')) || null
        : null;
      const payload: any = {
        first_name: first,
        last_name: last,
        full_name: fullName,
        email: String(d.email).toLowerCase(),
        phone: d.phone || null,
        role: (d.role as RoleOption) || 'field_staff',
        department_id: deptId,
        job_title: d.job_title || null,
        salary_ngn: cleanSalary,
        employee_number: d.employee_number || null,
        start_date: d.start_date || null,
        employment_type: d.employment_type || null,
        date_of_birth: d.date_of_birth || null,
        gender: d.gender ? String(d.gender).toLowerCase() : null,
        marital_status: d.marital_status ? String(d.marital_status).toLowerCase() : null,
        address: d.address || null,
        bank_name: d.bank_name || null,
        bank_account_number: d.bank_account_number || null,
        bank_account_name: d.bank_account_name || null,
        tin: d.tin || null,
        nin: d.nin || null,
        pension_pin: d.pension_pin || null,
        pfa_name: d.pfa_name || null,
        pfa_code: d.pfa_code || null,
        nhf_number: d.nhf_number || null,
        nhis_number: d.nhis_number || null,
        state_of_residence: d.state_of_residence || null,
        status: 'invited',
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any).rpc('seed_invited_profile', {
        p_email: payload.email,
        p_full_name: fullName,
        p_phone: payload.phone,
        p_role: payload.role,
      });
      if (error) {
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(payload, { onConflict: 'email' });
        if (upsertErr) {
          fail++;
          continue;
        }
      } else {
        await supabase.from('profiles').update(payload).eq('email', payload.email);
      }
      ok++;
    }
    setImporting(false);
    setImportedCount(ok);
    setFailedCount(fail);
    setStep('done');
    await logAudit(
      'employees_bulk_imported' as any,
      `Bulk CSV import: ${ok} succeeded, ${fail} failed (source: ${fileName || 'clipboard'})`,
      profile,
    );
    toast({
      title: fail === 0
        ? `${ok} employee${ok === 1 ? '' : 's'} imported`
        : `${ok} imported · ${fail} failed`,
      description: 'Invited employees can now be sent invite emails from the list.',
      variant: fail === 0 ? undefined : 'destructive',
    });
    if (ok > 0) onComplete();
  };

  const downloadTemplate = () => {
    const headers = KDOPS_FIELDS.map((f) => f.key);
    const example = [
      'Ada', 'Okonkwo', 'ada@example.com', '+2348012345678',
      '1995-06-12', 'female', 'married', '12 Broad St, Lagos',
      'field_staff', 'EMP-042', 'Field Officer', 'Operations',
      '2026-04-01', 'full_time', 450000,
      'GTBank', '0123456789', 'ADA OKONKWO',
      '12345678-0001', '12345678901', 'PEN100000000001',
      'Stanbic IBTC Pension', 'PFA-STAN-01', 'NHF-000042', 'NHIS-000042', 'Lagos',
    ];
    downloadCsv('kdops-employees-template.csv', toCsv(headers, [example]));
  };

  // ────────────────────────────────────────────────────────────────────
  // Small helper to render mapping progress
  // ────────────────────────────────────────────────────────────────────
  const mappedRequired = KDOPS_FIELDS.filter((f) => f.required).every((f) =>
    Object.values(mapping).includes(f.key),
  );
  const mappedCount = Object.values(mapping).filter((v) => v !== NONE).length;

  const grouped = useMemo(() => {
    const g: Record<string, typeof KDOPS_FIELDS[number][]> = {};
    for (const f of KDOPS_FIELDS) {
      g[f.group] ??= [];
      g[f.group].push(f);
    }
    return g;
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import employees from CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload any CSV — PaidHR export, BizEdge, Excel, anything. You map columns in the next step.'}
            {step === 'map' && 'Match each column in your file to the KDOps field it belongs to. We pre-fill the obvious ones.'}
            {step === 'preview' && 'Verify what will be imported. Rows with errors are highlighted; fix them in the source file and re-upload.'}
            {step === 'done' && 'Import complete. Head to the Employees list to send invite emails.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-2 text-xs">
          {[
            { key: 'upload', label: '1. Upload' },
            { key: 'map', label: '2. Map columns' },
            { key: 'preview', label: '3. Preview & import' },
          ].map((s) => (
            <div
              key={s.key}
              className={cn(
                'flex-1 py-1.5 rounded-md text-center font-medium border',
                step === s.key
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground border-transparent',
              )}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* ── STEP 1: UPLOAD ─────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-4 py-6">
            <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={parsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) parseFile(f);
                  }}
                />
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors',
                    parsing && 'opacity-50 pointer-events-none',
                  )}
                >
                  {parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Choose CSV
                </span>
              </label>
              <p className="text-xs text-muted-foreground mt-3">
                Any CSV works. You'll map columns in the next step.
              </p>
              <Button
                size="sm"
                variant="link"
                onClick={downloadTemplate}
                className="mt-1 h-auto p-0"
              >
                <Download className="mr-1 h-3 w-3" /> Download blank template
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: MAP COLUMNS ────────────────────────────────────── */}
        {step === 'map' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{fileName}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {rawRows.length} rows · {sourceHeaders.length} columns
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px]',
                    mappedRequired
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-warning/10 text-warning',
                  )}
                >
                  {mappedRequired ? (
                    <>
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Required fields mapped
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mr-1 h-3 w-3" /> Map First name, Last name, Email
                    </>
                  )}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  <Wand2 className="mr-1 h-3 w-3" /> {mappedCount} auto-mapped
                </Badge>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden max-h-[440px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Your column</TableHead>
                    <TableHead>Sample</TableHead>
                    <TableHead className="w-64">Map to KDOps field</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceHeaders.map((h) => {
                    const sample = rawRows
                      .slice(0, 3)
                      .map((r) => r[h])
                      .filter(Boolean)[0];
                    const current = mapping[h] || NONE;
                    return (
                      <TableRow key={h}>
                        <TableCell className="font-medium text-sm">{h}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-xs">
                          {sample || '—'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={current}
                            onValueChange={(v) =>
                              setMapping({ ...mapping, [h]: v as any })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value={NONE}>— Ignore this column —</SelectItem>
                              {Object.entries(grouped).map(([groupName, fields]) => (
                                <div key={groupName}>
                                  <p className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                    {groupName}
                                  </p>
                                  {fields.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>
                                      {f.label} {f.required && <span className="text-destructive">*</span>}
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── STEP 3: PREVIEW & IMPORT ───────────────────────────────── */}
        {step === 'preview' && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {invalidRows.length} with errors
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                Showing first 40 rows.
              </span>
            </div>
            <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 40).map((r) => {
                    const hasError = r.__errors.length > 0;
                    return (
                      <TableRow key={r.__rowIndex} className={cn(hasError && 'bg-destructive/5')}>
                        <TableCell className="font-mono text-xs">{r.__rowIndex}</TableCell>
                        <TableCell className="text-xs">
                          {`${r.data.first_name || ''} ${r.data.last_name || ''}`.trim() || '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.data.email || '—'}</TableCell>
                        <TableCell className="text-xs">{r.data.role || 'field_staff'}</TableCell>
                        <TableCell className="text-xs">{r.data.department || '—'}</TableCell>
                        <TableCell className="text-xs text-right">
                          {r.data.salary_ngn
                            ? Number(String(r.data.salary_ngn).replace(/[^\d.-]/g, '')).toLocaleString('en-NG')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {hasError ? (
                            <div className="space-y-0.5">
                              {r.__errors.slice(0, 2).map((err, i) => (
                                <p key={i} className="text-destructive text-[11px]">
                                  {err}
                                </p>
                              ))}
                              {r.__errors.length > 2 && (
                                <p className="text-destructive/70 text-[10px]">
                                  +{r.__errors.length - 2} more
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-600 text-[11px]">OK</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {rows.length > 40 && (
              <p className="text-xs text-muted-foreground">
                +{rows.length - 40} more rows will import (only first 40 shown).
              </p>
            )}
          </>
        )}

        {/* ── STEP 4: DONE ───────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              {importedCount} employee{importedCount === 1 ? '' : 's'} imported
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              Head back to the Employees list to send invite emails.
            </p>
          </div>
        )}

        {/* Footer buttons vary per step */}
        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={applyMapping}
                disabled={!mappedRequired}
                title={!mappedRequired ? 'Map First name, Last name and Email first' : undefined}
              >
                Preview {rawRows.length} rows <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('map')} disabled={importing}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Adjust mapping
              </Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {importing
                  ? 'Importing…'
                  : `Import ${validRows.length} row${validRows.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeCsvImport;
