import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Upload, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Papa from 'papaparse';

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

const NewPaymentBatch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [batchName, setBatchName] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2
  const [items, setItems] = useState<BatchItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    supabase.from('contractors').select('*').eq('status', 'active').then(({ data }) => {
      setContractors((data as Contractor[]) || []);
    });
  }, []);

  const addContractor = (c: Contractor) => {
    if (items.find((i) => i.contractor_id === c.id)) return;
    setItems([...items, {
      full_name: c.full_name,
      bank_name: c.bank_name,
      account_number: c.account_number,
      amount_ngn: c.default_amount_ngn || 0,
      reference: '',
      contractor_id: c.id,
    }]);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof BatchItem, value: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const csvItems: BatchItem[] = results.data.map((row: any) => ({
          full_name: row.full_name || row.name || '',
          bank_name: row.bank_name || row.bank || '',
          account_number: row.account_number || row.account || '',
          amount_ngn: parseFloat(row.amount_ngn || row.amount || '0'),
          reference: row.reference || '',
        }));
        setItems([...items, ...csvItems.filter((i) => i.full_name)]);
        toast({ title: 'CSV imported', description: `${csvItems.length} beneficiaries added` });
      },
    });
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.amount_ngn || 0), 0);

  const handleSave = async (submit: boolean) => {
    setSaving(true);
    try {
      const { data: batch, error } = await supabase.from('payment_batches').insert({
        name: batchName,
        payment_date: paymentDate,
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

      toast({ title: submit ? 'Batch submitted for approval' : 'Batch saved as draft' });
      navigate('/payments');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filteredContractors = contractors.filter((c) =>
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl">
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Add Beneficiaries</CardTitle>
              <label className="cursor-pointer">
                <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                <Button variant="outline" size="sm" asChild><span><Upload className="mr-2 h-4 w-4" /> Import CSV</span></Button>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Search contractors to add</Label>
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name..." className="mt-1" />
              {searchTerm && (
                <div className="border rounded-lg mt-2 max-h-48 overflow-y-auto">
                  {filteredContractors.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer" onClick={() => addContractor(c)}>
                      <div>
                        <p className="text-sm font-medium">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground">{c.bank_name} — {c.account_number}</p>
                      </div>
                      <span className="text-xs text-muted-foreground currency">{formatNaira(c.default_amount_ngn || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
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
                        <TableCell className="font-medium">{item.full_name}</TableCell>
                        <TableCell>{item.bank_name}</TableCell>
                        <TableCell>{item.account_number}</TableCell>
                        <TableCell>
                          <Input type="number" className="w-32 text-right" value={item.amount_ngn} onChange={(e) => updateItem(i, 'amount_ngn', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-32" value={item.reference} onChange={(e) => updateItem(i, 'reference', e.target.value)} />
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

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={items.length === 0}>
                Review <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
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
                      <TableCell className="font-medium">{item.full_name}</TableCell>
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
    </div>
  );
};

export default NewPaymentBatch;
