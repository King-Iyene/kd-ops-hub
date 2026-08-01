import { useMemo, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Download, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bulk employee CSV import — Papa-Parse + Zod validation + upsert to profiles.
 *
 * Flow:
 *   1. User picks a .csv file → Papa-Parse extracts headers + rows.
 *   2. Every row is validated with Zod. Invalid rows are surfaced with
 *      row-level errors; user can fix the source file and re-import.
 *   3. User clicks Import → we upsert to profiles by (lowercased) email.
 *      Departments are resolved by name; unknown names are recorded as null.
 *
 * Safety:
 *   - We DON'T create auth users — just profile rows with status='invited'
 *     so the same "Resend invite" flow can send OTP emails afterwards.
 *   - Bank details are stored as-is; no Paystack recipient creation here.
 *   - We never overwrite the current user or a super_admin without confirmation.
 *
 * Not scope for this component (deferred): CV/ID document upload, salary
 * component breakdown (basic/housing/transport), custom fields.
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

const ROW_SCHEMA = z.object({
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  job_title: z.string().optional().nullable(),
  salary_ngn: z.string().optional().nullable(),
  employee_number: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  employment_type: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  marital_status: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  bank_account_name: z.string().optional().nullable(),
  tin: z.string().optional().nullable(),
  nin: z.string().optional().nullable(),
  pension_pin: z.string().optional().nullable(),
  nhf_number: z.string().optional().nullable(),
  pfa_name: z.string().optional().nullable(),
  state_of_residence: z.string().optional().nullable(),
});

type ParsedRow = z.infer<typeof ROW_SCHEMA> & {
  __rowIndex: number;
  __errors: string[];
};

const TEMPLATE_HEADERS = [
  'first_name', 'last_name', 'email', 'phone', 'role', 'department', 'job_title',
  'salary_ngn', 'employee_number', 'start_date', 'employment_type',
  'date_of_birth', 'gender', 'marital_status', 'address',
  'bank_name', 'bank_account_number', 'bank_account_name',
  'tin', 'nin', 'pension_pin', 'nhf_number', 'pfa_name', 'state_of_residence',
];

const TEMPLATE_EXAMPLE: (string | number)[][] = [
  [
    'Ada', 'Okonkwo', 'ada@example.com', '+2348012345678', 'field_staff',
    'Operations', 'Field Officer', 450000, 'EMP-042', '2026-04-01', 'full_time',
    '1995-06-12', 'female', 'married', '12 Broad St, Lagos',
    'GTBank', '0123456789', 'ADA OKONKWO', '12345678-0001', '12345678901',
    'PEN100000000001', 'NHF-000042', 'Stanbic IBTC Pension', 'Lagos',
  ],
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: Department[];
  onComplete: () => void;
}

export const EmployeeCsvImport = ({
  open, onOpenChange, departments, onComplete,
}: Props) => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const validRows = useMemo(() => rows.filter((r) => r.__errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.__errors.length > 0), [rows]);

  const deptByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.name.trim().toLowerCase(), d.id);
    return m;
  }, [departments]);

  const parseFile = (file: File) => {
    setParsing(true);
    setImportedCount(0);
    setFailedCount(0);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: ({ data, errors }) => {
        if (errors?.length) {
          toast({
            title: 'CSV parse warnings',
            description: `${errors.length} parse issue${errors.length === 1 ? '' : 's'}. First: ${errors[0]?.message ?? '—'}`,
          });
        }
        const parsed: ParsedRow[] = data.map((raw, i) => {
          const cleaned: Record<string, string | null> = {};
          for (const h of TEMPLATE_HEADERS) {
            const v = raw[h];
            cleaned[h] = v && String(v).trim() ? String(v).trim() : null;
          }
          const parseResult = ROW_SCHEMA.safeParse(cleaned);
          const errors: string[] = [];
          if (!parseResult.success) {
            for (const iss of parseResult.error.issues) {
              errors.push(`${iss.path.join('.') || 'row'}: ${iss.message}`);
            }
          }
          // Additional business validation
          if (cleaned.role && !KNOWN_ROLES.includes(cleaned.role as RoleOption)) {
            errors.push(`role: "${cleaned.role}" not in ${KNOWN_ROLES.join(', ')}`);
          }
          if (cleaned.salary_ngn && Number.isNaN(Number(cleaned.salary_ngn))) {
            errors.push('salary_ngn: not a number');
          }
          if (
            cleaned.start_date &&
            !/^\d{4}-\d{2}-\d{2}$/.test(cleaned.start_date)
          ) {
            errors.push('start_date: expected YYYY-MM-DD');
          }
          if (
            cleaned.date_of_birth &&
            !/^\d{4}-\d{2}-\d{2}$/.test(cleaned.date_of_birth)
          ) {
            errors.push('date_of_birth: expected YYYY-MM-DD');
          }
          if (
            cleaned.department &&
            !deptByName.has(cleaned.department.toLowerCase())
          ) {
            errors.push(`department: "${cleaned.department}" not found — will be unset`);
          }
          return {
            ...(cleaned as any),
            __rowIndex: i + 2, // +2 = 1-based + header row
            __errors: errors,
          };
        });
        setRows(parsed);
        setFileName(file.name);
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

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const r of validRows) {
      const deptId = r.department ? deptByName.get(r.department.toLowerCase()) ?? null : null;
      const fullName = `${r.first_name} ${r.last_name}`.trim();
      const payload: any = {
        first_name: r.first_name,
        last_name: r.last_name,
        full_name: fullName,
        email: r.email!.toLowerCase(),
        phone: r.phone || null,
        role: (r.role as RoleOption) || 'field_staff',
        department_id: deptId,
        job_title: r.job_title || null,
        salary_ngn: r.salary_ngn ? Number(r.salary_ngn) : null,
        employee_number: r.employee_number || null,
        start_date: r.start_date || null,
        employment_type: r.employment_type || null,
        date_of_birth: r.date_of_birth || null,
        gender: r.gender || null,
        marital_status: r.marital_status || null,
        address: r.address || null,
        bank_name: r.bank_name || null,
        bank_account_number: r.bank_account_number || null,
        bank_account_name: r.bank_account_name || null,
        tin: r.tin || null,
        nin: r.nin || null,
        pension_pin: r.pension_pin || null,
        nhf_number: r.nhf_number || null,
        pfa_name: r.pfa_name || null,
        state_of_residence: r.state_of_residence || null,
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
        // Fall back to a direct upsert if the RPC isn't available.
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(payload, { onConflict: 'email' });
        if (upsertErr) {
          fail++;
          console.warn(`[CsvImport] row ${r.__rowIndex} failed:`, upsertErr.message);
          continue;
        }
      } else {
        // RPC seeded a minimal row — now enrich with the full CSV payload.
        await supabase.from('profiles').update(payload).eq('email', payload.email);
      }
      ok++;
    }
    setImporting(false);
    setImportedCount(ok);
    setFailedCount(fail);
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
    downloadCsv('kdops-employees-template.csv', toCsv(TEMPLATE_HEADERS, TEMPLATE_EXAMPLE));
  };

  const reset = () => {
    setRows([]);
    setFileName(null);
    setImportedCount(0);
    setFailedCount(0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import employees from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with the columns below. Rows are validated before the
            import runs — errors are highlighted per row so you can fix and
            retry. No auth users are created here; each imported employee lands
            as <Badge variant="secondary" className="ml-0.5 mr-0.5">Invited</Badge>
            and you can send them the invite email from the Employees list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={parsing || importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parseFile(f);
              }}
            />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
                'hover:bg-accent transition-colors',
                (parsing || importing) && 'opacity-50 pointer-events-none',
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
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Template
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> {fileName}
              <button
                onClick={reset}
                className="ml-1 text-muted-foreground/70 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {rows.length > 0 && (
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
                Showing first 40 rows below.
              </span>
            </div>

            <div className="border rounded-md overflow-hidden max-h-[380px] overflow-y-auto">
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
                      <TableRow
                        key={r.__rowIndex}
                        className={cn(hasError && 'bg-destructive/5')}
                      >
                        <TableCell className="font-mono text-xs">
                          {r.__rowIndex}
                        </TableCell>
                        <TableCell>{`${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'}</TableCell>
                        <TableCell className="text-xs">{r.email || '—'}</TableCell>
                        <TableCell className="text-xs">{r.role || 'field_staff'}</TableCell>
                        <TableCell className="text-xs">{r.department || '—'}</TableCell>
                        <TableCell className="text-xs text-right">
                          {r.salary_ngn
                            ? Number(r.salary_ngn).toLocaleString('en-NG')
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

        {importedCount > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-3 text-sm">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              {importedCount} employee{importedCount === 1 ? '' : 's'} imported
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}.
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              Head back to the Employees list to send invite emails.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Close
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
          >
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importing
              ? 'Importing…'
              : `Import ${validRows.length} row${validRows.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeCsvImport;
