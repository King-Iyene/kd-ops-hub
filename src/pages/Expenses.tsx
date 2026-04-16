import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Check, X, Download } from 'lucide-react';

const categories = ['fuel', 'transport', 'office_supplies', 'client_entertainment', 'other'];

const Expenses = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isApprover =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin';
  const isAdmin = isApprover; // retained for existing references
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: '', amount_ngn: '', date: '', description: '' });

  useEffect(() => { fetchExpenses(); }, []);

  const fetchExpenses = async () => {
    let query = supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('submitted_by', profile?.id);
    const { data } = await query;
    setExpenses(data || []);
    setLoading(false);
  };

  const submitExpense = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('expenses').insert({
      submitted_by: profile?.id,
      category: form.category,
      amount_ngn: parseFloat(form.amount_ngn),
      date: form.date,
      description: form.description,
      status: 'pending',
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      await logAudit(
        'expense_submitted',
        `Expense submitted: ${form.category} — ${formatNaira(parseFloat(form.amount_ngn) || 0)}`,
        profile,
      );
      toast({ title: 'Expense submitted' });
      setShowForm(false);
      setForm({ category: '', amount_ngn: '', date: '', description: '' });
      fetchExpenses();
    }
    setSubmitting(false);
  };

  const handleAction = async (expense: any, status: 'approved' | 'rejected') => {
    if (!isApprover) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject expenses.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('expenses').update({ status }).eq('id', expense.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      status === 'approved' ? 'expense_approved' : 'expense_rejected',
      `Expense ${status}: ${expense.category} — ${formatNaira(expense.amount_ngn || 0)}`,
      profile,
    );
    toast({ title: `Expense ${status}` });
    fetchExpenses();
  };

  const exportCSV = () => {
    const approved = expenses.filter((e) => e.status === 'approved');
    const csv = ['Category,Amount,Date,Description', ...approved.map((e) => `${e.category},${e.amount_ngn},${e.date},"${e.description}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'expenses.csv'; a.click();
  };

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track and manage expense claims</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>}
          <Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" /> New Expense</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="capitalize font-medium">{e.category?.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right currency">{formatNaira(e.amount_ngn)}</TableCell>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell className="max-w-xs truncate">{e.description}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={e.status === 'approved' ? 'bg-success/10 text-success' : e.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  {isAdmin && e.status === 'pending' && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleAction(e, 'approved')}><Check className="h-4 w-4 text-success" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAction(e, 'rejected')}><X className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Amount (₦)</Label><Input type="number" value={form.amount_ngn} onChange={(e) => setForm({ ...form, amount_ngn: e.target.value })} /></div>
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={submitExpense} disabled={submitting || !form.category}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
