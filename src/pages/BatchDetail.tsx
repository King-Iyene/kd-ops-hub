import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Check, X, Loader2, Play, DollarSign, ShieldAlert } from 'lucide-react';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-info/10 text-info',
  funded: 'bg-accent/10 text-accent',
  processing: 'bg-info/10 text-info',
  processed: 'bg-success/10 text-success',
  partially_processed: 'bg-warning/10 text-warning',
  rejected: 'bg-destructive/10 text-destructive',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  funded: 'Funded',
  processing: 'Processing',
  processed: 'Processed',
  partially_processed: 'Partial',
  rejected: 'Rejected',
};

const APPROVER_ROLES = ['admin', 'finance'] as const;

const BatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [batch, setBatch] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchBatch();
  }, [id]);

  const fetchBatch = async () => {
    const [batchRes, itemsRes] = await Promise.all([
      supabase.from('payment_batches').select('*').eq('id', id).single(),
      supabase.from('batch_items').select('*').eq('batch_id', id).order('created_at'),
    ]);
    setBatch(batchRes.data);
    setItems(itemsRes.data || []);
    setLoading(false);
  };

  const canApprove =
    !!profile &&
    APPROVER_ROLES.includes(profile.role as any) &&
    batch?.created_by !== profile.id;

  const cannotApproveReason = (() => {
    if (!profile) return 'Not authenticated.';
    if (!APPROVER_ROLES.includes(profile.role as any)) {
      return 'Only Admin or Finance roles can approve payment batches.';
    }
    if (batch?.created_by === profile.id) {
      return 'You cannot approve a batch you created. A second reviewer must approve it.';
    }
    return null;
  })();

  const updateStatus = async (status: string, extra?: any) => {
    setActionLoading(true);
    try {
      // Hard guard for approve/reject: enforce role + separation of duties.
      if ((status === 'approved' || status === 'rejected')) {
        if (!profile) {
          toast({ title: 'Not authenticated', variant: 'destructive' });
          setActionLoading(false);
          return;
        }
        if (!APPROVER_ROLES.includes(profile.role as any)) {
          toast({
            title: 'Not authorized',
            description: 'Only Admin or Finance roles can approve or reject batches.',
            variant: 'destructive',
          });
          setActionLoading(false);
          return;
        }
        if (batch?.created_by === profile.id) {
          toast({
            title: 'Cannot approve own batch',
            description: 'The approver must be different from the person who created the batch.',
            variant: 'destructive',
          });
          setActionLoading(false);
          return;
        }
      }

      const update: any = { status, ...extra };
      if (status === 'approved') update.approved_by = profile?.id;
      const { error } = await supabase.from('payment_batches').update(update).eq('id', id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `Batch ${statusLabels[status]?.toLowerCase() || status}` });

        const amountTxt = formatNaira(batch?.total_amount || 0);
        if (status === 'approved') {
          await logAudit('batch_approved', `Batch "${batch?.name}" approved (${amountTxt})`, profile);
        } else if (status === 'rejected') {
          await logAudit('batch_rejected', `Batch "${batch?.name}" rejected: ${extra?.rejection_reason || ''}`, profile);
        } else if (status === 'pending_approval') {
          await logAudit('batch_submitted', `Batch "${batch?.name}" submitted for approval`, profile);
        } else if (status === 'funded') {
          await logAudit('batch_funded', `Batch "${batch?.name}" marked funded`, profile);
        }
        fetchBatch();
      }
    } finally {
      setActionLoading(false);
      setShowReject(false);
    }
  };

  const handleProcess = async () => {
    setActionLoading(true);
    try {
      await supabase.from('payment_batches').update({ status: 'processing' }).eq('id', id);
      await supabase.from('batch_items').update({ status: 'succeeded' }).eq('batch_id', id);
      await supabase.from('payment_batches').update({ status: 'processed' }).eq('id', id);
      await logAudit(
        'batch_processed',
        `Batch "${batch?.name}" processed (${formatNaira(batch?.total_amount || 0)})`,
        profile,
      );
      toast({ title: 'Batch processed successfully' });
      fetchBatch();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!batch) return <div className="text-center py-12">Batch not found</div>;

  const isAdmin = profile?.role === 'admin';
  const isFinance = profile?.role === 'finance';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/payments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{batch.name}</h1>
          <p className="text-muted-foreground text-sm">{batch.period}</p>
        </div>
        <Badge variant="secondary" className={statusColors[batch.status]}>
          {statusLabels[batch.status] || batch.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Payment Date</p><p className="font-medium">{formatDate(batch.payment_date)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Beneficiaries</p><p className="font-medium">{batch.beneficiary_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Amount</p><p className="font-bold currency">{formatNaira(batch.total_amount || 0)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Created</p><p className="font-medium">{formatDate(batch.created_at)}</p></CardContent></Card>
      </div>

      {batch.notes && (
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{batch.notes}</p></CardContent></Card>
      )}

      {batch.rejection_reason && (
        <Card className="border-destructive/30"><CardContent className="pt-4"><p className="text-xs text-destructive mb-1">Rejection Reason</p><p className="text-sm">{batch.rejection_reason}</p></CardContent></Card>
      )}

      {batch.status === 'pending_approval' && cannotApproveReason && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{cannotApproveReason}</AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      {(isAdmin || isFinance) && (
        <div className="flex gap-2 flex-wrap">
          {batch.status === 'draft' && batch.created_by === profile?.id && (
            <Button onClick={() => updateStatus('pending_approval')} disabled={actionLoading}>
              Submit for Approval
            </Button>
          )}
          {batch.status === 'pending_approval' && canApprove && (
            <>
              <Button onClick={() => updateStatus('approved')} disabled={actionLoading}>
                <Check className="mr-2 h-4 w-4" /> Approve
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {batch.status === 'approved' && (
            <Button onClick={() => updateStatus('funded')} disabled={actionLoading}>
              <DollarSign className="mr-2 h-4 w-4" /> Confirm Funded
            </Button>
          )}
          {batch.status === 'funded' && (
            <Button onClick={handleProcess} disabled={actionLoading}>
              <Play className="mr-2 h-4 w-4" /> Process Payments
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Beneficiaries ({items.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.full_name}</TableCell>
                    <TableCell>{item.bank_name}</TableCell>
                    <TableCell>{item.account_number}</TableCell>
                    <TableCell className="text-right currency">{formatNaira(item.amount_ngn || 0)}</TableCell>
                    <TableCell>{item.reference}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={item.status === 'succeeded' ? 'bg-success/10 text-success' : item.status === 'failed' ? 'bg-destructive/10 text-destructive' : ''}>
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Batch</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => updateStatus('rejected', { rejection_reason: rejectReason })} disabled={!rejectReason}>
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchDetail;
