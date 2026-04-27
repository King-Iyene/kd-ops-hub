import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Download, Pencil, Trash2, Wallet, TrendingDown,
  TrendingUp, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { EXPENSE_CATEGORY_KEYS, expenseCategoryLabel } from '@/lib/expense-categories';

interface Fund {
  id: string;
  name: string;
  custodian_id: string | null;
  custodian_name?: string;
  opening_balance_ngn: number;
  current_balance_ngn: number;
  status: 'active' | 'inactive';
  notes: string | null;
}

interface Entry {
  id: string;
  fund_id: string;
  entry_type: 'disbursement' | 'replenishment';
  amount_ngn: number;
  purpose: string;
  category: string | null;
  payee: string | null;
  entry_date: string;
  recorded_by: string | null;
  recorder_name?: string;
  notes: string | null;
  created_at: string;
}

interface Profile { id: string; full_name: string; }

export default function PettyCash() {
  usePageTitle('Petty Cash');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [funds, setFunds] = useState<Fund[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState<string>('all');
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());

  // Fund dialog
  const [fundDialog, setFundDialog] = useState(false);
  const [editingFund, setEditingFund] = useState<Fund | null>(null);
  const [fundForm, setFundForm] = useState({ name: '', opening_balance_ngn: '', status: 'active', notes: '', custodian_id: '' });
  const [savingFund, setSavingFund] = useState(false);

  // Entry dialog
  const [entryDialog, setEntryDialog] = useState(false);
  const [entryFundId, setEntryFundId] = useState('');
  const [entryType, setEntryType] = useState<'disbursement' | 'replenishment'>('disbursement');
  const [entryForm, setEntryForm] = useState({ amount_ngn: '', purpose: '', category: '', payee: '', entry_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  const [savingEntry, setSavingEntry] = useState(false);

  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: fData }, { data: eData }, { data: pData }] = await Promise.all([
      supabase.from('petty_cash_funds').select('*').order('name'),
      supabase.from('petty_cash_entries').select('*').order('entry_date', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name').limit(200),
    ]);
    const profileMap = new Map((pData as Profile[] || []).map(p => [p.id, p.full_name]));
    setProfiles(pData as Profile[] || []);
    setFunds((fData as Fund[] || []).map(f => ({
      ...f,
      custodian_name: f.custodian_id ? (profileMap.get(f.custodian_id) ?? 'Unknown') : undefined,
    })));
    setEntries((eData as Entry[] || []).map(e => ({
      ...e,
      recorder_name: e.recorded_by ? (profileMap.get(e.recorded_by) ?? '') : undefined,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) =>
    setExpandedFunds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Fund CRUD ──────────────────────────────────────────────────────────────
  const openFundCreate = () => {
    setEditingFund(null);
    setFundForm({ name: '', opening_balance_ngn: '', status: 'active', notes: '', custodian_id: '' });
    setFundDialog(true);
  };
  const openFundEdit = (f: Fund) => {
    setEditingFund(f);
    setFundForm({ name: f.name, opening_balance_ngn: String(f.opening_balance_ngn), status: f.status, notes: f.notes ?? '', custodian_id: f.custodian_id ?? '' });
    setFundDialog(true);
  };
  const saveFund = async () => {
    if (!fundForm.name.trim()) { toast({ title: 'Fund name is required', variant: 'destructive' }); return; }
    setSavingFund(true);
    const payload = {
      name: fundForm.name.trim(),
      opening_balance_ngn: Number(fundForm.opening_balance_ngn) || 0,
      current_balance_ngn: Number(fundForm.opening_balance_ngn) || 0,
      status: fundForm.status,
      notes: fundForm.notes.trim() || null,
      custodian_id: fundForm.custodian_id || null,
      created_by: profile?.id,
    };
    const { error } = editingFund
      ? await supabase.from('petty_cash_funds').update({ name: payload.name, status: payload.status, notes: payload.notes, custodian_id: payload.custodian_id }).eq('id', editingFund.id)
      : await supabase.from('petty_cash_funds').insert(payload);
    setSavingFund(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingFund ? 'Fund updated' : 'Fund created' });
    setFundDialog(false);
    load();
  };

  // ── Entry CRUD ─────────────────────────────────────────────────────────────
  const openEntry = (fundId: string, type: 'disbursement' | 'replenishment') => {
    setEntryFundId(fundId);
    setEntryType(type);
    setEntryForm({ amount_ngn: '', purpose: '', category: '', payee: '', entry_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    setEntryDialog(true);
  };

  const saveEntry = async () => {
    if (!entryForm.amount_ngn || Number(entryForm.amount_ngn) <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' }); return;
    }
    if (!entryForm.purpose.trim()) {
      toast({ title: 'Purpose is required', variant: 'destructive' }); return;
    }
    const fund = funds.find(f => f.id === entryFundId);
    if (fund && entryType === 'disbursement' && Number(entryForm.amount_ngn) > fund.current_balance_ngn) {
      toast({ title: 'Insufficient balance', description: `Available: ${formatNaira(fund.current_balance_ngn)}`, variant: 'destructive' }); return;
    }
    setSavingEntry(true);
    const { error } = await supabase.from('petty_cash_entries').insert({
      fund_id: entryFundId,
      entry_type: entryType,
      amount_ngn: Number(entryForm.amount_ngn),
      purpose: entryForm.purpose.trim(),
      category: entryForm.category || null,
      payee: entryForm.payee.trim() || null,
      entry_date: entryForm.entry_date,
      notes: entryForm.notes.trim() || null,
      recorded_by: profile?.id,
    });
    setSavingEntry(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: entryType === 'disbursement' ? 'Disbursement recorded' : 'Replenishment recorded' });
    setEntryDialog(false);
    load();
  };

  const confirmDeleteEntry = async () => {
    if (!deleteEntry) return;
    setDeletingEntry(true);
    await supabase.from('petty_cash_entries').update({ deleted_at: new Date().toISOString() }).eq('id', deleteEntry.id);
    setDeletingEntry(false);
    toast({ title: 'Entry removed' });
    setDeleteEntry(null);
    load();
  };

  const exportCSV = (fundId: string) => {
    const fundEntries = entries.filter(e => e.fund_id === fundId);
    const fund = funds.find(f => f.id === fundId);
    const header = 'Date,Type,Purpose,Category,Payee,Amount (₦),Recorded By,Notes';
    const rows = fundEntries.map(e => [
      e.entry_date, e.entry_type, e.purpose, e.category ?? '', e.payee ?? '',
      e.amount_ngn, e.recorder_name ?? '', e.notes ?? '',
    ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `petty-cash-${fund?.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const now = new Date();
  const monthEntries = entries.filter(e => {
    const d = new Date(e.entry_date);
    return d >= startOfMonth(now) && d <= endOfMonth(now);
  });
  const totalDisbursedMonth = monthEntries.filter(e => e.entry_type === 'disbursement').reduce((s, e) => s + e.amount_ngn, 0);
  const totalReplenishedMonth = monthEntries.filter(e => e.entry_type === 'replenishment').reduce((s, e) => s + e.amount_ngn, 0);
  const totalFloat = funds.filter(f => f.status === 'active').reduce((s, f) => s + f.current_balance_ngn, 0);

  const displayFunds = selectedFund === 'all' ? funds : funds.filter(f => f.id === selectedFund);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Petty Cash"
        description="Manage cash floats, disbursements, and replenishments."
        actions={<Button onClick={openFundCreate}><Plus className="h-4 w-4 mr-2" />New Fund</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total float (active funds)', value: formatNaira(totalFloat), icon: Wallet, color: 'text-primary' },
          { label: `Disbursed — ${format(now, 'MMM')}`,   value: formatNaira(totalDisbursedMonth),   icon: TrendingDown, color: 'text-destructive' },
          { label: `Replenished — ${format(now, 'MMM')}`, value: formatNaira(totalReplenishedMonth), icon: TrendingUp,   color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fund selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedFund} onValueChange={setSelectedFund}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All funds</SelectItem>
            {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : funds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No funds yet. Create your first petty cash fund above.</p>
      ) : (
        <div className="space-y-4">
          {displayFunds.map(fund => {
            const fundEntries = entries.filter(e => e.fund_id === fund.id);
            const isExpanded = expandedFunds.has(fund.id);
            const lowBalance = fund.current_balance_ngn < 5000;
            return (
              <Card key={fund.id} className={fund.status === 'inactive' ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{fund.name}</CardTitle>
                        <Badge variant={fund.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                          {fund.status}
                        </Badge>
                        {lowBalance && fund.status === 'active' && (
                          <Badge variant="outline" className="text-[10px] border-warning text-warning">
                            <AlertCircle className="h-3 w-3 mr-1" />Low balance
                          </Badge>
                        )}
                      </div>
                      {fund.custodian_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Custodian: {fund.custodian_name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Current balance</p>
                      <p className={`text-xl font-bold ${lowBalance ? 'text-warning' : ''}`}>
                        {formatNaira(fund.current_balance_ngn)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {fund.status === 'active' && (
                      <>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          onClick={() => openEntry(fund.id, 'disbursement')}>
                          <TrendingDown className="h-3.5 w-3.5 mr-1.5" />Disbursement
                        </Button>
                        <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                          onClick={() => openEntry(fund.id, 'replenishment')}>
                          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Replenishment
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openFundEdit(fund)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit fund
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => exportCSV(fund.id)}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />Export
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleExpand(fund.id)}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
                      {isExpanded ? 'Hide' : `Entries (${fundEntries.length})`}
                    </Button>
                  </div>

                  {isExpanded && (
                    fundEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No entries yet.</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/30">
                            <tr>
                              {['Date', 'Type', 'Purpose', 'Payee', 'Category', 'Amount', ''].map(h => (
                                <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {fundEntries.map(e => (
                              <tr key={e.id} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {format(new Date(e.entry_date), 'd MMM yyyy')}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant={e.entry_type === 'disbursement' ? 'destructive' : 'default'}
                                    className="text-[10px]">
                                    {e.entry_type === 'disbursement' ? 'Out' : 'In'}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-xs max-w-[180px] truncate" title={e.purpose}>{e.purpose}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">{e.payee ?? '—'}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {e.category ? expenseCategoryLabel(e.category) : '—'}
                                </td>
                                <td className={`px-3 py-2 font-semibold text-right text-xs ${e.entry_type === 'disbursement' ? 'text-destructive' : 'text-green-600'}`}>
                                  {e.entry_type === 'disbursement' ? '−' : '+'}{formatNaira(e.amount_ngn)}
                                </td>
                                <td className="px-3 py-2">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" aria-label="Delete entry"
                                    onClick={() => setDeleteEntry(e)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Fund dialog */}
      <Dialog open={fundDialog} onOpenChange={setFundDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFund ? 'Edit Fund' : 'New Petty Cash Fund'}</DialogTitle>
            <DialogDescription>A fund tracks a physical cash float held by a custodian.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Fund name *</Label>
              <Input value={fundForm.name} onChange={e => setFundForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Head Office Float" />
            </div>
            {!editingFund && (
              <div className="space-y-1.5">
                <Label>Opening balance (₦)</Label>
                <Input type="number" min={0} value={fundForm.opening_balance_ngn} onChange={e => setFundForm(p => ({ ...p, opening_balance_ngn: e.target.value }))} placeholder="0" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Custodian</Label>
              <Select value={fundForm.custodian_id} onValueChange={v => setFundForm(p => ({ ...p, custodian_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select custodian" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={fundForm.status} onValueChange={v => setFundForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={fundForm.notes} onChange={e => setFundForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialog(false)}>Cancel</Button>
            <Button onClick={saveFund} disabled={savingFund}>{savingFund ? 'Saving…' : editingFund ? 'Update' : 'Create fund'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry dialog */}
      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{entryType === 'disbursement' ? 'Record Disbursement' : 'Record Replenishment'}</DialogTitle>
            <DialogDescription>
              {entryType === 'disbursement'
                ? 'Log cash paid out of the fund. Current balance: ' + formatNaira(funds.find(f => f.id === entryFundId)?.current_balance_ngn ?? 0)
                : 'Log cash added to the fund.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (₦) *</Label>
                <Input type="number" min={1} value={entryForm.amount_ngn} onChange={e => setEntryForm(p => ({ ...p, amount_ngn: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={entryForm.entry_date} onChange={e => setEntryForm(p => ({ ...p, entry_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose *</Label>
              <Input value={entryForm.purpose} onChange={e => setEntryForm(p => ({ ...p, purpose: e.target.value }))} placeholder="e.g. Office stationery, Courier fee" />
            </div>
            {entryType === 'disbursement' && (
              <>
                <div className="space-y-1.5">
                  <Label>Payee</Label>
                  <Input value={entryForm.payee} onChange={e => setEntryForm(p => ({ ...p, payee: e.target.value }))} placeholder="Who received the cash?" />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={entryForm.category} onValueChange={v => setEntryForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORY_KEYS.map(k => <SelectItem key={k} value={k}>{expenseCategoryLabel(k)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialog(false)}>Cancel</Button>
            <Button onClick={saveEntry} disabled={savingEntry}
              className={entryType === 'disbursement' ? 'bg-destructive hover:bg-destructive/90' : ''}>
              {savingEntry ? 'Saving…' : entryType === 'disbursement' ? 'Record disbursement' : 'Record replenishment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete entry confirm */}
      <AlertDialog open={!!deleteEntry} onOpenChange={o => !o && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry?.purpose} — {deleteEntry ? formatNaira(deleteEntry.amount_ngn) : ''}. The fund balance will be recalculated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteEntry} disabled={deletingEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingEntry ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
