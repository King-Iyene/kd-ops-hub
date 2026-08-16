import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { downloadCsv, toCsv } from '@/lib/csv';
import { getBankCode, NIGERIAN_BANKS, fetchBanks, type NigerianBank } from '@/lib/nigerian-banks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Download,
} from 'lucide-react';

const MAX_ROWS = 500;

// Header dictionary — case-insensitive substring match against the CSV's
// header row. First match wins per column; longest hint wins per field.
const HEADER_HINTS: Record<'name' | 'bank_name' | 'account_number' | 'amount' | 'reference', string[]> = {
  name: ['beneficiary name', 'beneficiary_name', 'full name', 'full_name', 'name'],
  bank_name: ['bank name', 'bank_name', 'bank'],
  account_number: ['account number', 'account_number', 'acct number', 'acct no', 'account no', 'nuban'],
  amount: ['amount', 'amount_ngn', 'amount (ngn)', 'amount (₦)', 'salary', 'value'],
  reference: ['reference', 'ref', 'narration', 'description'],
};

type FieldKey = keyof typeof HEADER_HINTS;

function detectColumn(headers: string[], field: FieldKey): string | null {
  const hints = HEADER_HINTS[field];
  let best: string | null = null;
  let bestLen = 0;
  for (const h of headers) {
    const lc = h.toLowerCase().trim();
    for (const hint of hints) {
      if ((lc === hint || lc.includes(hint)) && hint.length > bestLen) {
        best = h;
        bestLen = hint.length;
      }
    }
  }
  return best;
}

export interface ParsedBeneficiaryRow {
  __rowIndex: number;
  __errors: string[];
  full_name: string;
  bank_name: string;
  account_number: string;
  amount_ngn: number;
  reference: string;
}

export interface ImportedBeneficiary {
  full_name: string;
  bank_name: string;
  account_number: string;
  amount_ngn: number;
  reference: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (rows: ImportedBeneficiary[]) => void;
}

const NUBAN_RE = /^\d{10}$/;

function validateRow(row: {
  full_name: string;
  bank_name: string;
  account_number: string;
  amount_raw: string;
}, bankNames: string[]): { amount_ngn: number; errors: string[] } {
  const errors: string[] = [];

  if (!row.full_name.trim()) errors.push('Name is required');

  const digits = row.account_number.replace(/\D/g, '');
  if (!digits) {
    errors.push('Account number is required');
  } else if (!NUBAN_RE.test(digits)) {
    errors.push('Account number must be 10 digits (NUBAN)');
  }

  const cleanAmount = row.amount_raw.replace(/[₦,\s]/g, '');
  const amount_ngn = Number(cleanAmount);
  if (!row.amount_raw.trim()) {
    errors.push('Amount is required');
  } else if (!Number.isFinite(amount_ngn) || amount_ngn <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (!row.bank_name.trim()) {
    errors.push('Bank name is required');
  } else if (!getBankCode(row.bank_name) && !bankNames.includes(row.bank_name.trim().toLowerCase())) {
    errors.push(`Bank "${row.bank_name}" not recognised — check spelling`);
  }

  return { amount_ngn: Number.isFinite(amount_ngn) ? amount_ngn : 0, errors };
}

export const BeneficiaryCsvImport = ({ open, onOpenChange, onImport }: Props) => {
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedBeneficiaryRow[]>([]);
  const [tooManyRows, setTooManyRows] = useState(false);
  const [banks, setBanks] = useState<NigerianBank[]>(NIGERIAN_BANKS);

  useEffect(() => {
    if (open) fetchBanks().then(setBanks).catch(() => { /* keep static list */ });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setRows([]);
      setTooManyRows(false);
      setParsing(false);
    }
  }, [open]);

  const bankNames = useMemo(() => banks.map((b) => b.name.toLowerCase()), [banks]);

  const validRows = useMemo(() => rows.filter((r) => r.__errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.__errors.length > 0), [rows]);

  const parseFile = (file: File) => {
    setParsing(true);
    setTooManyRows(false);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: ({ data, meta }) => {
        const headers = (meta.fields ?? []).filter(Boolean);
        const nameCol = detectColumn(headers, 'name');
        const bankCol = detectColumn(headers, 'bank_name');
        const acctCol = detectColumn(headers, 'account_number');
        const amountCol = detectColumn(headers, 'amount');
        const refCol = detectColumn(headers, 'reference');

        if (data.length > MAX_ROWS) {
          setTooManyRows(true);
          setRows([]);
          setFileName(file.name);
          setParsing(false);
          return;
        }

        const parsed: ParsedBeneficiaryRow[] = data.map((raw, i) => {
          const full_name = (nameCol ? raw[nameCol] : '') || '';
          const bank_name = (bankCol ? raw[bankCol] : '') || '';
          const account_number = ((acctCol ? raw[acctCol] : '') || '').replace(/\D/g, '');
          const amount_raw = (amountCol ? raw[amountCol] : '') || '';
          const reference = (refCol ? raw[refCol] : '') || '';
          const { amount_ngn, errors } = validateRow(
            { full_name, bank_name, account_number, amount_raw },
            bankNames,
          );
          return {
            __rowIndex: i + 2,
            __errors: errors,
            full_name: full_name.trim(),
            bank_name: bank_name.trim(),
            account_number,
            amount_ngn,
            reference: reference.trim(),
          };
        });

        setRows(parsed);
        setFileName(file.name);
        setParsing(false);
      },
      error: () => {
        setParsing(false);
      },
    });
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    onImport(
      validRows.map((r) => ({
        full_name: r.full_name,
        bank_name: r.bank_name,
        account_number: r.account_number,
        amount_ngn: r.amount_ngn,
        reference: r.reference,
      })),
    );
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const headers = ['name', 'bank_name', 'account_number', 'amount', 'reference'];
    const examples = [
      ['Ada Okonkwo', 'GTBank', '0123456789', '150000', 'March fee'],
      ['Chidi Eze', 'Access Bank', '0987654321', '200000', 'March fee'],
    ];
    downloadCsv('kdops-beneficiaries-template.csv', toCsv(headers, examples));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import beneficiaries from CSV</DialogTitle>
          <DialogDescription>
            Columns expected: name, bank_name, account_number, amount. Headers are matched
            automatically regardless of case or exact wording.
          </DialogDescription>
        </DialogHeader>

        {!fileName && (
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
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Choose CSV
                </span>
              </label>
              <p className="text-xs text-muted-foreground mt-3">
                Up to {MAX_ROWS} rows per file.
              </p>
              <Button size="sm" variant="link" onClick={downloadTemplate} className="mt-1 h-auto p-0">
                <Download className="mr-1 h-3 w-3" /> Download template
              </Button>
            </div>
          </div>
        )}

        {tooManyRows && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            This file has more than {MAX_ROWS} rows. Split it into smaller files and import each separately.
          </div>
        )}

        {fileName && !tooManyRows && rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> {fileName}
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {invalidRows.length} invalid
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                {validRows.length} valid, {invalidRows.length} invalid of {rows.length} total
              </span>
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => { setFileName(null); setRows([]); }}>
                Choose a different file
              </Button>
            </div>

            <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r) => {
                    const hasError = r.__errors.length > 0;
                    return (
                      <TableRow key={r.__rowIndex} className={cn(hasError && 'bg-destructive/5')}>
                        <TableCell className="font-mono text-xs">{r.__rowIndex}</TableCell>
                        <TableCell className="text-xs">{r.full_name || '—'}</TableCell>
                        <TableCell className="text-xs">{r.bank_name || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{r.account_number || '—'}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums">
                          {r.amount_ngn ? r.amount_ngn.toLocaleString('en-NG') : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.reference || '—'}</TableCell>
                        <TableCell className="text-xs">
                          {hasError ? (
                            <div className="space-y-0.5">
                              {r.__errors.slice(0, 2).map((err, i) => (
                                <p key={i} className="text-destructive text-[11px]">{err}</p>
                              ))}
                              {r.__errors.length > 2 && (
                                <p className="text-destructive/70 text-[10px]">+{r.__errors.length - 2} more</p>
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
            {rows.length > 200 && (
              <p className="text-xs text-muted-foreground">
                Showing first 200 of {rows.length} rows. All valid rows will still import.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {fileName && !tooManyRows && rows.length > 0 && (
            <Button onClick={handleImport} disabled={validRows.length === 0}>
              Import {validRows.length} beneficiar{validRows.length === 1 ? 'y' : 'ies'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BeneficiaryCsvImport;
