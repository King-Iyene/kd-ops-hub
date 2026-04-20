import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, ArrowLeft, ArrowRight, Check, Search, Plus } from 'lucide-react';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';

interface BatchItem {
  full_name: string;
  bank_name: string;
  account_number: string;
  amount_ngn: number;
  reference: string;
  contractor_id?: string;
}

interface Contractor {
  id: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
}

const emptyBank: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

const NewPaymentBatch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [batchName, setBatchName] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2
  const [items, setItems] = useState<BatchItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Ad-hoc beneficiary dialog
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHoc, setAdHoc] = useState({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
  const [adHocBank, setAdHocBank] = useState<BankAccountValue>(emptyBank);

  useEffect(() => {
    supabase
      .from('contractors')
      .select('*')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => {
        setContractors((data as Contractor[]) || []);
      });
  }, []);

  const selectedIds = useMemo(
    () => new Set(items.map((i) => i.contractor_id).filter(Boolean)),
    [items]
  );

  const toggleContractor = (c: Contractor, checked: boolean) => {
    if (checked) {
      if (selectedIds.has(c.id)) return;
      setItems((prev) => [
        ...prev,
        {
          full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
          bank_name: c.bank_name,
          account_number: c.account_number,
          amount_ngn: c.default_amount_ngn || 0,
          reference: '',
          contractor_id: c.id,
        },
      ]);
    } else {
      setItems((prev) => prev.filter((i) => i.contractor_id !== c.id));
    }
  };

  const selectAllVisible = (visible: Contractor[]) => {
    const toAdd = visible
      .filter((c) => !selectedIds.has(c.id))
      .map((c) => ({
        full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        bank_name: c.bank_name,
        account_number: c.account_number,
        amount_ngn: c.default_amount_ngn || 0,
        reference: '',
        contractor_id: c.id,
      }));
    if (toAdd.length === 0) return;
    setItems((prev) => [...prev, ...toAdd]);
  };

  const clearAllVisible = (visible: Contractor[]) => {
    const visibleIds = new Set(visible.map((c) => c.id));
    setItems((prev) => prev.filter((i) => !i.contractor_id || !visibleIds.has(i.contractor_id)));
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof BatchItem, value: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const addAdHoc = () => {
    if (!adHocBank.verified) {
      toast({
        title: 'Verify the account first',
        description: 'Beneficiary account must be verified before adding.',
        variant: 'destructive',
      });
      return;
    }
    const amount = parseFloat(adHoc.amount_ngn);
    if (!adHoc.amount_ngn || amount <= 0) {
      toast({
        title: 'Amount required',
        description: 'Amount must be greater than ₦0.',
        variant: 'destructive',
      });
      return;
    }
    const adHocFullName = `${adHoc.first_name.trim()} ${adHoc.last_name.trim()}`.trim() || adHocBank.account_name;
    setItems((prev) => [
      ...prev,
      {
        full_name: adHocFullName,
        bank_name: adHocBank.bank_name,
        account_number: adHocBank.account_number,
        amount_ngn: amount,
        reference: adHoc.reference,
      },
    ]);
    setShowAdHoc(false);
    setAdHoc({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
    setAdHocBank(emptyBank);
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.amount_ngn || 0), 0);

  const handleSave = async (submit: boolean) => {
    const zeroItems = items.filter((i) => !i.amount_ngn || Number(i.amount_ngn) <= 0);
    if (zeroItems.length > 0) {
      toast({
        title: `${zeroItems.length} beneficiar${zeroItems.length === 1 ? 'y has' : 'ies have'} ₦0 amount`,
        description: 'Set amounts for all beneficiaries before saving.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const { data: batch, error } = await supabase.from('payment_batches').insert({
        name: batchName,
        payment_date: paymentDate,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        period,
        notes,
        total_amount: totalAmount,
        beneficiary_count: items.length,
        status: submit ? 'pending_approval' : 'draft',
        created_by: profile?.id,
      }).select().single();

      if (error) throw error;

      if (items.length > 0) {
        const batchItems = items.map((item) => ({
          batch_id: batch.id,
          contractor_id: item.contractor_id || null,
          full_name: item.full_name,
          bank_name: item.bank_name,
          account_number: item.account_number,
          amount_ngn: item.amount_ngn,
          reference: item.reference,
          status: 'pending',
        }));
        await supabase.from('batch_items').insert(batchItems);
      }

      await logAudit(
        submit ? 'batch_submitted' : 'batch_created',
        submit
          ? `Batch "${batchName}" submitted for approval (${items.length} beneficiaries, ${formatNaira(totalAmount)})`
          : `Batch "${batchName}" saved as draft`,
        profile,
      );

      toast({ title: submit ? 'Batch submitted for approval' : 'Batch saved as draft' });
      navigate('/payments');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filteredContractors = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return contractors;
    return contractors.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(s) ||
        c.bank_name.toLowerCase().includes(s) ||
        c.account_number.includes(s)
    );
  }, [contractors, searchTerm]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/payments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Payment Batch</h1>
          <p className="text-muted-foreground text-sm">Step {step} of 3</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Batch Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Name</Label>
                <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. 30/03/26 — LinkedIn 1-20" />
              </div>
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Payment Period</Label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. March 2026" />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Execution (optional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to process immediately after approval. Set a future
                  date/time to schedule the batch for execution.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!batchName || !paymentDate}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Select Contractors</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAdHoc(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add One-off Beneficiary
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search contractors..."
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectAllVisible(filteredContractors)}
                  disabled={filteredContractors.length === 0}
                >
                  Select all {filteredContractors.length ? `(${filteredContractors.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearAllVisible(filteredContractors)}
                  disabled={filteredContractors.length === 0}
                >
                  Clear visible
                </Button>
                <span className="text-muted-foreground ml-auto">
                  {items.length} selected
                </span>
              </div>

              <div className="border rounded-lg max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Default Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContractors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                          No contractors match your search.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredContractors.map((c) => {
                      const checked = selectedIds.has(c.id);
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer"
                          onClick={() => toggleContractor(c, !checked)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleContractor(c, Boolean(v))}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}</TableCell>
                          <TableCell>{c.bank_name}</TableCell>
                          <TableCell>{c.account_number}</TableCell>
                          <TableCell className="text-right currency">{formatNaira(c.default_amount_ngn || 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Selected Beneficiaries ({items.length})</CardTitle>
                <div className="text-sm">
                  <span className="text-muted-foreground mr-2">Running total:</span>
                  <span className="font-bold currency">{formatNaira(totalAmount)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No beneficiaries selected yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount (₦)</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.full_name || 'Unknown'}</TableCell>
                          <TableCell>{item.bank_name}</TableCell>
                          <TableCell>{item.account_number}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-32 text-right"
                              value={item.amount_ngn}
                              onChange={(e) => updateItem(i, 'amount_ngn', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-32"
                              value={item.reference}
                              onChange={(e) => updateItem(i, 'reference', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={items.length === 0}>
              Review <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Review Batch</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">Batch Name</p><p className="font-medium text-sm">{batchName}</p></div>
              <div><p className="text-xs text-muted-foreground">Payment Date</p><p className="font-medium text-sm">{paymentDate}</p></div>
              <div><p className="text-xs text-muted-foreground">Beneficiaries</p><p className="font-medium text-sm">{items.length}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Amount</p><p className="font-bold text-lg currency">{formatNaira(totalAmount)}</p></div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.full_name || 'Unknown'}</TableCell>
                      <TableCell>{item.bank_name}</TableCell>
                      <TableCell>{item.account_number}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(item.amount_ngn)}</TableCell>
                      <TableCell>{item.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Check className="mr-2 h-4 w-4" /> Submit for Approval
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ad-hoc beneficiary dialog */}
      <Dialog open={showAdHoc} onOpenChange={setShowAdHoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add One-off Beneficiary</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name *</Label>
                <Input
                  value={adHoc.first_name}
                  onChange={(e) => setAdHoc({ ...adHoc, first_name: e.target.value })}
                  placeholder={adHocBank.account_name ? adHocBank.account_name.split(' ')[0] : 'Ada'}
                />
              </div>
              <div className="space-y-1">
                <Label>Last name *</Label>
                <Input
                  value={adHoc.last_name}
                  onChange={(e) => setAdHoc({ ...adHoc, last_name: e.target.value })}
                  placeholder="Okonkwo"
                />
              </div>
            </div>
            <BankAccountField value={adHocBank} onChange={setAdHocBank} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  value={adHoc.amount_ngn}
                  onChange={(e) => setAdHoc({ ...adHoc, amount_ngn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Reference</Label>
                <Input
                  value={adHoc.reference}
                  onChange={(e) => setAdHoc({ ...adHoc, reference: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdHoc(false)}>Cancel</Button>
            <Button onClick={addAdHoc} disabled={!adHocBank.verified || !adHoc.amount_ngn}>
              Add Beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewPaymentBatch;
