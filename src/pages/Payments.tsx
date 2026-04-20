import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Loader2 } from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge, statusLabel } from '@/components/ui-kit/StatusBadge';

interface PaymentBatch {
  id: string;
  name: string;
  payment_date: string;
  period: string;
  total_amount: number;
  beneficiary_count: number;
  status: string;
  created_at: string;
  notes: string;
}


const Payments = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchBatches();
  }, [statusFilter, page]);

  const fetchBatches = async () => {
    setLoading(true);
    let query = supabase
      .from('payment_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * 20, (page + 1) * 20 - 1);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const fetched = (data as PaymentBatch[]) || [];

    // Sync stale batch statuses: if a batch is processing/partially_processed
    // but all its items have settled, update the parent status.
    const stale = fetched.filter(
      (b) => b.status === 'processing' || b.status === 'partially_processed',
    );
    for (const b of stale) {
      const { data: items } = await supabase
        .from('batch_items')
        .select('status')
        .eq('batch_id', b.id);
      if (!items || items.length === 0) continue;
      const anyPending = items.some((r: any) => r.status === 'pending' || r.status === 'retry');
      const anyFailed = items.some((r: any) => r.status === 'failed');
      const correct = anyPending ? 'processing' : anyFailed ? 'partially_processed' : 'processed';
      if (correct !== b.status) {
        await supabase.from('payment_batches').update({ status: correct }).eq('id', b.id);
        b.status = correct;
      }
    }

    setBatches(fetched);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search) return batches;
    const s = search.toLowerCase();
    return batches.filter((b) => b.name.toLowerCase().includes(s));
  }, [batches, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment Batches</h1>
          <p className="text-muted-foreground text-sm">Manage partner and contractor payments</p>
        </div>
        <div className="flex gap-2">
          <QuickPayDialog />
          <Button onClick={() => navigate('/payments/new')}>
            <Plus className="mr-2 h-4 w-4" /> New Batch
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search batches..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {['draft', 'pending_approval', 'approved', 'funded', 'processing', 'processed', 'partially_processed', 'rejected'].map((k) => (
                  <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No batches found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Name</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead className="text-right">Beneficiaries</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((batch) => (
                    <TableRow key={batch.id} className="cursor-pointer" onClick={() => navigate(`/payments/${batch.id}`)}>
                      <TableCell className="font-medium">{batch.name}</TableCell>
                      <TableCell>{formatDate(batch.payment_date)}</TableCell>
                      <TableCell className="text-right">{batch.beneficiary_count}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(batch.total_amount || 0)}</TableCell>
                      <TableCell>
                        <StatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(batch.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={filtered.length < 20} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Payments;
