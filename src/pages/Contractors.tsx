import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Upload, Pencil } from 'lucide-react';
import Papa from 'papaparse';

interface Contractor {
  id: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
  linkedin_id: string;
  status: string;
}

const Contractors = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ full_name: '', bank_name: '', account_number: '', default_amount_ngn: '', linkedin_id: '' });

  useEffect(() => { fetchContractors(); }, []);

  const fetchContractors = async () => {
    const { data } = await supabase.from('contractors').select('*').order('full_name');
    setContractors((data as Contractor[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    setSubmitting(true);
    const payload = {
      full_name: form.full_name,
      bank_name: form.bank_name,
      account_number: form.account_number,
      default_amount_ngn: parseFloat(form.default_amount_ngn) || 0,
      linkedin_id: form.linkedin_id,
      status: 'active',
    };

    if (editing) {
      await supabase.from('contractors').update(payload).eq('id', editing.id);
      toast({ title: 'Contractor updated' });
    } else {
      await supabase.from('contractors').insert(payload);
      toast({ title: 'Contractor added' });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ full_name: '', bank_name: '', account_number: '', default_amount_ngn: '', linkedin_id: '' });
    fetchContractors();
    setSubmitting(false);
  };

  const openEdit = (c: Contractor) => {
    setEditing(c);
    setForm({ full_name: c.full_name, bank_name: c.bank_name, account_number: c.account_number, default_amount_ngn: String(c.default_amount_ngn), linkedin_id: c.linkedin_id || '' });
    setShowForm(true);
  };

  const toggleStatus = async (c: Contractor) => {
    const newStatus = c.status === 'active' ? 'inactive' : 'active';
    await supabase.from('contractors').update({ status: newStatus }).eq('id', c.id);
    toast({ title: `Contractor ${newStatus}` });
    fetchContractors();
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data.map((row: any) => ({
          full_name: row.full_name || row.name || '',
          bank_name: row.bank_name || row.bank || '',
          account_number: row.account_number || row.account || '',
          default_amount_ngn: parseFloat(row.default_amount_ngn || row.amount || '0'),
          linkedin_id: row.linkedin_id || '',
          status: 'active',
        })).filter((r) => r.full_name);
        await supabase.from('contractors').insert(rows);
        toast({ title: `${rows.length} contractors imported` });
        fetchContractors();
      },
    });
  };

  const filtered = contractors.filter((c) => c.full_name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contractors</h1>
          <p className="text-muted-foreground text-sm">{contractors.length} contractors</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
            <Button variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" /> Import CSV</span></Button>
          </label>
          <Button onClick={() => { setEditing(null); setForm({ full_name: '', bank_name: '', account_number: '', default_amount_ngn: '', linkedin_id: '' }); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Contractor
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search contractors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                <TableHead>LinkedIn ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell>{c.bank_name}</TableCell>
                  <TableCell>{c.account_number}</TableCell>
                  <TableCell className="text-right currency">{formatNaira(c.default_amount_ngn || 0)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.linkedin_id || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={c.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'} onClick={() => toggleStatus(c)}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Contractor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Bank Name</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Account Number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Default Amount (₦)</Label><Input type="number" value={form.default_amount_ngn} onChange={(e) => setForm({ ...form, default_amount_ngn: e.target.value })} /></div>
              <div className="space-y-1"><Label>LinkedIn ID</Label><Input value={form.linkedin_id} onChange={(e) => setForm({ ...form, linkedin_id: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting || !form.full_name}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contractors;
