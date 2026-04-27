import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
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
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { cn } from '@/lib/utils';

type Kind = 'paye' | 'pension' | 'vat' | 'wht' | 'tcc' | 'cac' | 'itf' | 'nsitf';

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
}

const KIND_LABELS: Record<Kind, string> = {
  paye: 'PAYE',
  pension: 'Pension',
  vat: 'VAT',
  wht: 'WHT',
  tcc: 'Tax Clearance Certificate',
  cac: 'CAC Annual Return',
  itf: 'ITF Levy',
  nsitf: 'NSITF',
};

const KIND_NOTES: Record<Kind, string> = {
  paye: 'File PAYE return for previous month by the 10th',
  pension: 'Remit pension contributions by the 7th',
  vat: 'File monthly VAT return by the 21st',
  wht: 'Quarterly withholding tax remittance',
  tcc: 'Renew annual Tax Clearance Certificate',
  cac: 'File annual return with CAC',
  itf: 'ITF levy annual contribution',
  nsitf: 'NSITF monthly contribution',
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

const STATUS_CLASS: Record<ComplianceFiling['status'], string> = {
  filed: 'bg-success/10 text-success',
  overdue: 'bg-destructive/10 text-destructive',
  due: 'bg-warning/10 text-warning',
  upcoming: 'bg-muted text-muted-foreground',
};

const Compliance = () => {
  usePageTitle('Compliance');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ComplianceFiling[]>([]);

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

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('compliance_filings')
      .select('*')
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
        for (const k of ['paye', 'pension', 'vat', 'nsitf'] as Kind[]) {
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

  const counts = useMemo(() => {
    const filed = rows.filter((r) => r.status === 'filed').length;
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const due = rows.filter((r) => r.status === 'due').length;
    const upcoming = rows.filter((r) => r.status === 'upcoming').length;
    return { filed, overdue, due, upcoming };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Compliance Centre</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Track every Nigerian statutory filing deadline in one place — PAYE, Pension, VAT, WHT, TCC, CAC, ITF, NSITF. Export a compliance calendar.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Every Nigerian statutory deadline in one place — PAYE, Pension, VAT, WHT, TCC, CAC, ITF, NSITF.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCalendar}>
            <Download className="mr-2 h-4 w-4" /> Export calendar
          </Button>
          <Button onClick={() => setDialog(true)}>
            <CalendarDays className="mr-2 h-4 w-4" /> New filing
          </Button>
        </div>
      </div>

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
                  return (
                    <TableRow key={r.id} className="kd-transition">
                      <TableCell>
                        <p className="font-medium">{KIND_LABELS[r.kind]}</p>
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
