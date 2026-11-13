import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Plus, FileDown, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TimeClient, TimeInvoice } from '../lib/types';

export default function ClientsInvoicesPage() {
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Clients & Invoices" description="Build invoices straight from unbilled time, track status, export to PDF" icon={Receipt} />
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="clients" className="mt-4"><ClientsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
};

function InvoicesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { has } = useTimetrackCapabilities();
  const { data: clients } = useQuery({
    queryKey: ['timetrack', 'clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_clients').select('*').eq('is_archived', false).order('name');
      if (error) throw error;
      return data as TimeClient[];
    },
  });
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['timetrack', 'invoices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_invoices').select('*').order('issue_date', { ascending: false });
      if (error) throw error;
      return data as TimeInvoice[];
    },
  });

  const [buildOpen, setBuildOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [start, setStart] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [building, setBuilding] = useState(false);

  const build = async () => {
    if (!clientId) return;
    setBuilding(true);
    try {
      const { error } = await supabase.rpc('time_build_invoice', { p_client_id: clientId, p_start_date: start, p_end_date: end });
      if (error) throw error;
      setBuildOpen(false);
      qc.invalidateQueries({ queryKey: ['timetrack', 'invoices'] });
      toast({ title: 'Invoice created' });
    } catch (err) {
      toast({ title: 'Could not build invoice', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBuilding(false);
    }
  };

  const setStatus = async (invoice: TimeInvoice, status: TimeInvoice['status']) => {
    try {
      const { error } = await supabase.from('time_invoices').update({ status }).eq('id', invoice.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'invoices'] });
    } catch (err) {
      toast({ title: 'Could not update status', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const exportPdf = async (invoice: TimeInvoice) => {
    const { default: jsPDF } = await import('jspdf');
    const client = clients?.find((c) => c.id === invoice.client_id);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let y = 20;
    pdf.setFontSize(18); pdf.text('Invoice', 15, y); y += 10;
    pdf.setFontSize(10);
    pdf.text(`Invoice #: ${invoice.invoice_number}`, 15, y); y += 6;
    pdf.text(`Client: ${client?.name ?? invoice.client_id}`, 15, y); y += 6;
    pdf.text(`Issue date: ${invoice.issue_date}`, 15, y); y += 6;
    pdf.text(`Due date: ${invoice.due_date ?? '—'}`, 15, y); y += 10;
    pdf.setFontSize(9);
    pdf.text('Description', 15, y); pdf.text('Hours', 120, y); pdf.text('Rate', 145, y); pdf.text('Amount', 170, y);
    y += 4; pdf.line(15, y, 195, y); y += 6;
    for (const li of invoice.line_items) {
      pdf.text(String(li.description).slice(0, 55), 15, y);
      pdf.text(String(li.hours), 120, y);
      pdf.text(formatNaira(li.rate), 145, y);
      pdf.text(formatNaira(li.amount), 170, y);
      y += 6;
    }
    y += 4; pdf.line(15, y, 195, y); y += 8;
    pdf.setFontSize(11); pdf.text(`Total: ${formatNaira(invoice.total)}`, 145, y);
    pdf.save(`${invoice.invoice_number}.pdf`);
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {has('create_invoices') && <Button onClick={() => setBuildOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Build invoice</Button>}
      <Table>
        <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Client</TableHead><TableHead>Issue date</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(invoices ?? []).map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>{inv.invoice_number}</TableCell>
              <TableCell>{clients?.find((c) => c.id === inv.client_id)?.name ?? inv.client_id}</TableCell>
              <TableCell>{inv.issue_date}</TableCell>
              <TableCell>{formatNaira(inv.total)}</TableCell>
              <TableCell>
                <Select value={inv.status} onValueChange={(v) => setStatus(inv, v as TimeInvoice['status'])}>
                  <SelectTrigger className="w-28 h-7"><Badge variant="outline" className={STATUS_BADGE[inv.status]}>{inv.status}</Badge></SelectTrigger>
                  <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
                </Select>
              </TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => exportPdf(inv)}><FileDown className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
          {(invoices ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No invoices yet.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={buildOpen} onOpenChange={setBuildOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Build invoice from unbilled time</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Pulls every billable, unbilled entry for this client's projects in range — each entry can only be invoiced once.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuildOpen(false)}>Cancel</Button>
            <Button onClick={build} disabled={building || !clientId}>{building && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Build</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { has } = useTimetrackCapabilities();
  const { data: clients, isLoading } = useQuery({
    queryKey: ['timetrack', 'clients-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_clients').select('*').order('name');
      if (error) throw error;
      return data as TimeClient[];
    },
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_clients').insert({ name: name.trim(), contact_email: email || null, contact_phone: phone || null });
      if (error) throw error;
      setOpen(false); setName(''); setEmail(''); setPhone('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'clients-all'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'clients'] });
    } catch (err) {
      toast({ title: 'Could not save client', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      {has('manage_clients') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New client</Button>}
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead></TableRow></TableHeader>
        <TableBody>
          {(clients ?? []).map((c) => (
            <TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell>{c.contact_email ?? '—'}</TableCell><TableCell>{c.contact_phone ?? '—'}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Contact email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Contact phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
