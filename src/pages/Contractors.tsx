import { useCallback, useEffect, useRef, useState } from 'react';
import { ContractorApplications } from '@/components/ContractorApplications';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { displayName } from '@/lib/name';
import { formatDate, formatNaira } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Loader2,
  Plus,
  Search,
  Upload,
  Pencil,
  Download,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
  FileText,
  Info,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Papa from 'papaparse';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { NIGERIAN_BANKS } from '@/lib/paystack';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  module: string | null;
}

interface Contractor {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
  linkedin_id: string;
  status: string;
  agreement_signed?: boolean | null;
  kyc_document_uploaded?: boolean | null;
  onboarding_complete?: boolean | null;
  tags?: string[] | null;
}

// Compute a 0–5 onboarding score from the boolean flags + bank format +
// default amount being set. Returned as a {done, total} tuple so callers
// can also render a progress bar.
const onboardingScore = (c: Contractor): { done: number; total: number } => {
  let done = 0;
  const total = 5;
  // 1. Full name set.
  if (c.full_name && c.full_name.trim().length > 0) done++;
  // 2. Bank account looks verified (10-digit number + bank name).
  if (/^\d{10}$/.test(c.account_number || '') && (c.bank_name || '').length > 0)
    done++;
  // 3. LinkedIn ID set.
  if (c.linkedin_id && c.linkedin_id.trim().length > 0) done++;
  // 4. Default amount set.
  if ((c.default_amount_ngn || 0) > 0) done++;
  // 5. Either agreement signed OR KYC document uploaded.
  if (c.agreement_signed || c.kyc_document_uploaded) done++;
  return { done, total };
};

interface ParsedRow {
  rowNumber: number; // 1-based as shown to the user (excluding header)
  raw: Record<string, string>;
  full_name: string;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
  linkedin_id: string;
  valid: boolean;
  errors: string[];
}

const emptyBank: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

// CSV escape: wrap field in quotes if it contains a comma, quote, or newline.
const csvEscape = (v: any): string => {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};


// Case-insensitive bank name matcher; returns the canonical name if found.
const BANK_NAME_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const b of NIGERIAN_BANKS) {
    m.set(b.name.toLowerCase(), b.name);
    // also accept short forms without suffix like "Bank"
    const short = b.name.replace(/\s*bank\s*$/i, '').trim().toLowerCase();
    if (short) m.set(short, b.name);
  }
  // common aliases
  m.set('gt bank', 'GTBank');
  m.set('gtb', 'GTBank');
  m.set('first bank of nigeria', 'First Bank');
  m.set('stanbic ibtc bank', 'Stanbic IBTC');
  m.set('stanbic', 'Stanbic IBTC');
  m.set('fidelity', 'Fidelity Bank');
  m.set('united bank for africa', 'UBA');
  return m;
})();

const normalizeBankName = (raw: string): string | null => {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return null;
  return BANK_NAME_LOOKUP.get(key) ?? null;
};

const Contractors = () => {
  usePageTitle('Contractors');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    default_amount_ngn: '',
    linkedin_id: '',
  });
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    failed: number;
    failures: { row: number; name: string; reason: string }[];
  } | null>(null);

  useEffect(() => {
    fetchContractors();
  }, []);

  const fetchContractors = async () => {
    const [contractorsRes, tagsRes] = await Promise.all([
      supabase.from('contractors').select('*').order('full_name'),
      supabase.from('tags').select('*').or('module.eq.all,module.eq.contractor').order('name'),
    ]);
    setContractors((contractorsRes.data as Contractor[]) || []);
    setAvailableTags((tagsRes.data as Tag[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ first_name: '', last_name: '', default_amount_ngn: '', linkedin_id: '' });
    setBank(emptyBank);
    setSelectedTagIds([]);
  };

  const handleSave = async () => {
    if (!bank.verified) {
      toast({
        title: 'Verify the account first',
        description: 'The bank account must be verified via Paystack before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const computedFullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim() || bank.account_name;
    const payload = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      full_name: computedFullName,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      default_amount_ngn: parseFloat(form.default_amount_ngn) || 0,
      linkedin_id: form.linkedin_id,
      status: 'active',
      tags: selectedTagIds,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('contractors').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('contractor_edited', `Contractor "${payload.full_name}" updated`, profile);
        toast({ title: 'Contractor updated' });
      } else {
        const { error } = await supabase.from('contractors').insert(payload);
        if (error) throw error;
        await logAudit('contractor_added', `Contractor "${payload.full_name}" added`, profile);
        toast({ title: 'Contractor added' });
      }
      setShowForm(false);
      resetForm();
      fetchContractors();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (c: Contractor) => {
    setEditing(c);
    setForm({
      first_name: c.first_name || (c.full_name || '').split(' ')[0] || '',
      last_name: c.last_name || (c.full_name || '').split(' ').slice(1).join(' ') || '',
      default_amount_ngn: String(c.default_amount_ngn),
      linkedin_id: c.linkedin_id || '',
    });
    setBank({
      bank_name: c.bank_name,
      account_number: c.account_number,
      account_name: c.full_name,
      verified: false,
    });
    setSelectedTagIds(c.tags || []);
    setShowForm(true);
  };

  const toggleStatus = async (c: Contractor) => {
    const newStatus = c.status === 'active' ? 'inactive' : 'active';
    await supabase.from('contractors').update({ status: newStatus }).eq('id', c.id);
    if (newStatus === 'inactive') {
      await logAudit('contractor_deactivated', `Contractor "${c.full_name}" deactivated`, profile);
    } else {
      await logAudit('contractor_edited', `Contractor "${c.full_name}" reactivated`, profile);
    }
    toast({ title: `Contractor ${newStatus}` });
    fetchContractors();
  };

  // --- CSV export ---------------------------------------------------

  const [exportingCsv, setExportingCsv] = useState(false);

  const exportCsv = async () => {
    setExportingCsv(true);
    try {
      const { data: rows, error } = await supabase
        .from('contractors')
        .select('first_name, last_name, email, phone, bank_name, account_number, account_name, status, created_at')
        .order('full_name');
      if (error) throw error;
      const header = ['first_name', 'last_name', 'email', 'phone', 'bank_name', 'account_number', 'account_name', 'status', 'created_at'];
      const csvRows = (rows as any[]).map((r) =>
        header.map((col) => csvEscape(r[col])).join(','),
      );
      const csv = [header.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contractors-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  // --- CSV import flow ---------------------------------------------------

  const downloadSample = () => {
    const header = ['full_name', 'bank_name', 'account_number', 'default_amount_ngn', 'linkedin_id'];
    const rows = [
      ['Chinwe Okafor', 'GTBank', '0123456789', '150000', 'chinwe-okafor-123'],
      ['Adewale Ogunleye', 'Access Bank', '0234567890', '200000', 'adewale-ogunleye'],
      ['Ifeoma Nwachukwu', 'Zenith Bank', '0345678901', '175000', ''],
    ];
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kdops-contractors-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const validateRow = (raw: Record<string, string>, rowNumber: number): ParsedRow => {
    const full_name = (raw.full_name || raw.name || '').trim();
    const bank_raw = (raw.bank_name || raw.bank || '').trim();
    const account_number = (raw.account_number || raw.account || '').trim();
    const amount_raw = raw.default_amount_ngn ?? raw.amount ?? '0';
    const default_amount_ngn = parseFloat(String(amount_raw).replace(/,/g, '')) || 0;
    const linkedin_id = (raw.linkedin_id || '').trim();

    const errors: string[] = [];
    if (!full_name) errors.push('Full name is required');

    const canonicalBank = normalizeBankName(bank_raw);
    if (!bank_raw) {
      errors.push('Bank name is required');
    } else if (!canonicalBank) {
      errors.push(`Unknown bank "${bank_raw}"`);
    }

    if (!/^\d{10}$/.test(account_number)) {
      errors.push('Account number must be exactly 10 digits');
    }

    return {
      rowNumber,
      raw,
      full_name,
      bank_name: canonicalBank ?? bank_raw,
      account_number,
      default_amount_ngn,
      linkedin_id,
      valid: errors.length === 0,
      errors,
    };
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportSummary(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const rows = (results.data || []).map((row, idx) => validateRow(row, idx + 1));
        setParsedRows(rows);
        setImportDialog(true);
        // Reset the input so the same file can be re-picked later.
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        toast({
          title: 'Could not parse CSV',
          description: err.message,
          variant: 'destructive',
        });
      },
    });
  };

  const confirmImport = async () => {
    const valid = parsedRows.filter((r) => r.valid);
    const invalid = parsedRows.filter((r) => !r.valid);

    if (valid.length === 0) {
      toast({
        title: 'Nothing to import',
        description: 'All rows have validation errors. Fix them and try again.',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    try {
      const payload = valid.map((r) => ({
        full_name: r.full_name,
        bank_name: r.bank_name,
        account_number: r.account_number,
        default_amount_ngn: r.default_amount_ngn,
        linkedin_id: r.linkedin_id || null,
        status: 'active',
      }));

      const { error } = await supabase.from('contractors').insert(payload);
      if (error) {
        toast({
          title: 'Import failed',
          description: error.message,
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      await logAudit(
        'contractor_added',
        `Imported ${payload.length} contractors via CSV${
          invalid.length ? ` (${invalid.length} row(s) skipped)` : ''
        }`,
        profile,
      );

      setImportSummary({
        imported: valid.length,
        failed: invalid.length,
        failures: invalid.map((r) => ({
          row: r.rowNumber,
          name: r.full_name || '(no name)',
          reason: r.errors.join(', '),
        })),
      });
      fetchContractors();
    } finally {
      setImporting(false);
    }
  };

  const closeImportDialog = () => {
    setImportDialog(false);
    setParsedRows([]);
    setImportFileName('');
    setImportSummary(null);
  };

  const filtered = contractors.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <TableSkeleton rows={5} />;

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Contractors</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Manage independent contractors and freelancers. Store bank details, track engagement status and bulk-import via CSV for payment batches.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm">{contractors.length} contractors</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv} disabled={exportingCsv}>
            {exportingCsv
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFilePick}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Contractor
          </Button>
        </div>
      </div>

      <Tabs defaultValue="contractors">
        <TabsList>
          <TabsTrigger value="contractors">Contractors</TabsTrigger>
          <TabsTrigger value="applications">
            <FileText className="mr-2 h-4 w-4" /> Applications
            <ApplicationsBadge />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contractors" className="mt-4 space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contractors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Default Amount</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const { done, total } = onboardingScore(c);
                const pct = Math.round((done / total) * 100);
                const tone =
                  pct === 100
                    ? 'bg-success'
                    : pct >= 60
                    ? 'bg-accent'
                    : 'bg-destructive';
                return (
                <TableRow key={c.id} className="cursor-pointer kd-transition" onClick={() => navigate(`/contractors/${c.id}`)}>
                  <TableCell className="font-medium">
                    <div>{displayName(c.first_name, c.last_name, c.full_name)}</div>
                    {c.linkedin_id && (
                      <div className="text-[11px] text-muted-foreground">
                        {c.linkedin_id}
                      </div>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.tags.map((tid) => {
                          const tag = availableTags.find((t) => t.id === tid);
                          if (!tag) return null;
                          return (
                            <span
                              key={tid}
                              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color } : undefined}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{c.bank_name}</TableCell>
                  <TableCell>{c.account_number}</TableCell>
                  <TableCell className="text-right currency">
                    {formatNaira(c.default_amount_ngn || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[120px]">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full kd-transition ${tone}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {done}/{total} steps · {pct}%
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        c.status === 'active'
                          ? 'bg-success/10 text-success cursor-pointer'
                          : 'bg-muted text-muted-foreground cursor-pointer'
                      }
                      onClick={() => toggleStatus(c)}
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <ContractorApplications />
        </TabsContent>
      </Tabs>

      {/* Add / edit contractor dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Contractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Ada"
                />
              </div>
              <div className="space-y-1">
                <Label>Last name *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Okonkwo"
                />
              </div>
            </div>
            {bank.verified &&
              bank.account_name &&
              (form.first_name.trim() || form.last_name.trim()) &&
              `${form.first_name.trim()} ${form.last_name.trim()}`.trim().toLowerCase() !==
                bank.account_name.trim().toLowerCase() && (
                <p className="text-xs text-warning">
                  Heads up: entered name differs from verified bank name "{bank.account_name}".
                </p>
              )}

            <BankAccountField value={bank} onChange={setBank} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Default Amount (₦)</Label>
                <Input
                  type="number"
                  value={form.default_amount_ngn}
                  onChange={(e) =>
                    setForm({ ...form, default_amount_ngn: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>LinkedIn ID</Label>
                <Input
                  value={form.linkedin_id}
                  onChange={(e) => setForm({ ...form, linkedin_id: e.target.value })}
                />
              </div>
            </div>
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTagIds((prev) =>
                            selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                          )
                        }
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                          selected ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                        )}
                        style={
                          tag.color
                            ? {
                                backgroundColor: `${tag.color}25`,
                                color: tag.color,
                                borderColor: `${tag.color}50`,
                                outline: selected ? `2px solid ${tag.color}` : undefined,
                                outlineOffset: '1px',
                              }
                            : undefined
                        }
                      >
                        {selected && <Check className="mr-1 h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting || !form.first_name.trim() || !bank.verified}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import preview dialog */}
      <Dialog
        open={importDialog}
        onOpenChange={(v) => {
          if (!v) closeImportDialog();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {importSummary ? 'Import complete' : 'Review CSV import'}
            </DialogTitle>
            <DialogDescription>
              {importSummary
                ? `${importSummary.imported} contractor(s) imported${
                    importSummary.failed
                      ? `, ${importSummary.failed} row(s) skipped.`
                      : '.'
                  }`
                : `${importFileName || 'Uploaded file'} — ${parsedRows.length} row(s) parsed. ${validCount} valid, ${invalidCount} with errors.`}
            </DialogDescription>
          </DialogHeader>

          {!importSummary && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {validCount} valid
                </span>
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" /> {invalidCount} invalid
                </span>
              </div>

              <div className="border rounded-lg max-h-[360px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((r) => (
                      <TableRow
                        key={r.rowNumber}
                        className={
                          r.valid ? '' : 'bg-destructive/5'
                        }
                      >
                        <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="font-medium">{r.full_name || '—'}</TableCell>
                        <TableCell>{r.bank_name || '—'}</TableCell>
                        <TableCell>{r.account_number || '—'}</TableCell>
                        <TableCell className="text-right currency">
                          {formatNaira(r.default_amount_ngn || 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.linkedin_id || '—'}
                        </TableCell>
                        <TableCell>
                          {r.valid ? (
                            <Badge
                              variant="secondary"
                              className="bg-success/10 text-success"
                            >
                              OK
                            </Badge>
                          ) : (
                            <span className="text-xs text-destructive">
                              {r.errors.join(', ')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {importSummary && importSummary.failures.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Skipped rows</p>
              <div className="border rounded-lg max-h-[240px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importSummary.failures.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{f.row}</TableCell>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell className="text-destructive">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            {!importSummary ? (
              <>
                <Button variant="outline" onClick={closeImportDialog} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmImport}
                  disabled={importing || validCount === 0}
                >
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import {validCount} valid row{validCount === 1 ? '' : 's'}
                </Button>
              </>
            ) : (
              <Button onClick={closeImportDialog}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contractors;

// ---------------------------------------------------------------------------
// Pending applications count badge (shown in the tab trigger)
// ---------------------------------------------------------------------------

function ApplicationsBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    supabase
      .from('contractor_applications')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_review'])
      .then(({ count: c }) => setCount(c || 0));
  }, []);
  if (count === 0) return null;
  return (
    <Badge className="ml-2 bg-warning text-warning-foreground h-5 px-1.5 text-[10px] font-semibold">
      {count}
    </Badge>
  );
}
