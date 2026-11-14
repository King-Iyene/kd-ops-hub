import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Receipt, Plus, Check, X, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { TimeClient, TimeProject } from '../lib/types';

interface ExpenseCategory { id: string; name: string; is_active: boolean }
interface TimeExpense {
  id: string;
  employee_id: string;
  project_id: string | null;
  client_id: string | null;
  category_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  description: string | null;
  is_billable: boolean;
  receipt_path: string | null;
  status: 'submitted' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
};

const EMPTY_FORM = { amount: '', currency: 'USD', category_id: '', project_id: '', client_id: '', expense_date: new Date().toISOString().slice(0, 10), description: '', is_billable: false };

export default function ExpensesPage() {
  const { has } = useTimetrackCapabilities();
  const { profile } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canApprove = has('manage_expenses');
  const { data: employees } = useActiveEmployees();

  const { data: categories } = useQuery({
    queryKey: ['timetrack', 'expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_expense_categories').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });
  const { data: projects } = useQuery({
    queryKey: ['timetrack', 'projects-for-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_projects').select('*').eq('is_archived', false).order('name');
      if (error) throw error;
      return data as TimeProject[];
    },
  });
  const { data: clients } = useQuery({
    queryKey: ['timetrack', 'clients-for-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_clients').select('*').eq('is_archived', false).order('name');
      if (error) throw error;
      return data as TimeClient[];
    },
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['timetrack', 'expenses', canApprove ? 'all' : profile?.id],
    queryFn: async () => {
      let q = supabase.from('time_expenses').select('*').order('expense_date', { ascending: false });
      if (!canApprove) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as TimeExpense[];
    },
    enabled: !!profile?.id,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{ expense: TimeExpense; decision: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!profile?.id) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      let receiptPath: string | null = null;
      if (receiptFile) {
        const path = `${profile.id}/${Date.now()}-${receiptFile.name}`;
        const { error: upErr } = await supabase.storage.from('timetrack-receipts').upload(path, receiptFile);
        if (upErr) throw upErr;
        receiptPath = path;
      }
      const { error } = await supabase.from('time_expenses').insert({
        employee_id: profile.id,
        amount,
        currency: form.currency || 'USD',
        category_id: form.category_id || null,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        expense_date: form.expense_date,
        description: form.description || null,
        is_billable: form.is_billable,
        receipt_path: receiptPath,
      });
      if (error) throw error;
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setReceiptFile(null);
      qc.invalidateQueries({ queryKey: ['timetrack', 'expenses'] });
      toast({ title: 'Expense submitted' });
    } catch (err) {
      toast({ title: 'Could not submit expense', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const decide = async () => {
    if (!decisionTarget || !profile?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('time_expenses').update({
        status: decisionTarget.decision,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      }).eq('id', decisionTarget.expense.id);
      if (error) throw error;
      setDecisionTarget(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'expenses'] });
    } catch (err) {
      toast({ title: 'Could not record decision', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from('timetrack-receipts').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: 'Could not open receipt', description: error ? errorMessage(error) : undefined, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const withdraw = async (expense: TimeExpense) => {
    try {
      const { error } = await supabase.from('time_expenses').delete().eq('id', expense.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'expenses'] });
    } catch (err) {
      toast({ title: 'Could not withdraw expense', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const counts = {
    submitted: (expenses ?? []).filter((e) => e.status === 'submitted').length,
    approvedTotal: (expenses ?? []).filter((e) => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0),
    rejected: (expenses ?? []).filter((e) => e.status === 'rejected').length,
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Time Expenses"
        description={canApprove
          ? 'Project/client-billable expenses from everyone, awaiting or past review — distinct from the company-wide Expenses module'
          : 'Your project/client-billable expenses, for time-tracking and invoicing'}
        icon={Receipt}
        actions={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New expense</Button>}
      />

      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="Awaiting approval" value={counts.submitted} tone={counts.submitted > 0 ? 'warning' : 'default'} />
        <StatCard title="Approved total" value={counts.approvedTotal.toFixed(2)} tone="success" />
        <StatCard title="Rejected" value={counts.rejected} tone={counts.rejected > 0 ? 'danger' : 'default'} />
      </div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead>
            {canApprove && <TableHead>Employee</TableHead>}
            <TableHead>Category</TableHead><TableHead>Project</TableHead>
            <TableHead>Amount</TableHead><TableHead>Billable</TableHead>
            <TableHead>Receipt</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {(expenses ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.expense_date}</TableCell>
                {canApprove && <TableCell>{employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id}</TableCell>}
                <TableCell>{categories?.find((c) => c.id === e.category_id)?.name ?? '—'}</TableCell>
                <TableCell>{projects?.find((p) => p.id === e.project_id)?.name ?? '—'}</TableCell>
                <TableCell>{e.currency} {Number(e.amount).toFixed(2)}</TableCell>
                <TableCell>{e.is_billable ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  {e.receipt_path ? (
                    <Button variant="ghost" size="sm" onClick={() => openReceipt(e.receipt_path!)}><Paperclip className="h-3.5 w-3.5 mr-1" />View</Button>
                  ) : '—'}
                </TableCell>
                <TableCell><Badge variant="outline" className={STATUS_BADGE[e.status]}>{e.status}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  {canApprove && e.status === 'submitted' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setDecisionTarget({ expense: e, decision: 'approved' })}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setDecisionTarget({ expense: e, decision: 'rejected' })}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>
                  )}
                  {!canApprove && e.employee_id === profile?.id && e.status === 'submitted' && (
                    <Button size="sm" variant="ghost" onClick={() => withdraw(e)}>Withdraw</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(expenses ?? []).length === 0 && <TableRow><TableCell colSpan={canApprove ? 9 : 8} className="text-center text-muted-foreground">No expenses yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></div>
            </div>
            <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{(categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project (optional)</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client (optional)</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                <SelectContent>{(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_billable} onCheckedChange={(v) => setForm({ ...form, is_billable: !!v })} />
              Billable to client
            </label>
            <div>
              <Label>Receipt (optional)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisionTarget} onOpenChange={(v) => !v && setDecisionTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decisionTarget?.decision === 'approved' ? 'Approve' : 'Reject'} expense</DialogTitle></DialogHeader>
          <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionTarget(null)}>Cancel</Button>
            <Button onClick={decide} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
