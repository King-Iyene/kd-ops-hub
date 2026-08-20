import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const REASON_REQUIRED_STATUSES = new Set(['approved', 'funded']);

interface ArchiveBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  batchName?: string;
  batchStatus?: string;
}

export function ArchiveBatchDialog({ open, onOpenChange, batchId, batchName, batchStatus }: ArchiveBatchDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const requiresReason = !!batchStatus && REASON_REQUIRED_STATUSES.has(batchStatus);
    if (requiresReason && deleteReason.trim().length < 5) {
      toast({
        title: 'Reason required',
        description: 'Approved/funded batches need a reason of at least 5 characters.',
        variant: 'destructive',
      });
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('soft_delete_payment_batch', {
        p_batch_id: batchId,
        p_reason: deleteReason.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Batch archived', description: `"${batchName}" was archived (purged after 90 days).` });
      navigate('/payments');
    } catch (err: unknown) {
      toast({
        title: 'Could not archive batch',
        description: errorMessage(err) || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      onOpenChange(false);
      setDeleteReason('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Archive this batch?
          </DialogTitle>
          <DialogDescription>
            The batch is hidden from every list, report and KPI, and its audit history
            stays intact. Archived batches are permanently purged after 90 days.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            You're about to archive{' '}
            <span className="font-semibold">"{batchName}"</span> (status:{' '}
            <span className="font-mono">{batchStatus}</span>). It disappears from all
            lists and reports immediately; audit history is preserved and the record is
            permanently purged after 90 days.
          </p>
          {batchStatus && REASON_REQUIRED_STATUSES.has(batchStatus) && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This batch is {batchStatus} — please explain why you're archiving it.
              </p>
              <Textarea
                placeholder="e.g. Funds returned to wallet — payroll cancelled for April"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {batchStatus === 'funded'
                ? 'Funds are on your Paystack balance. Deleting here does NOT recall them — handle the recall separately.'
                : 'This action is logged. Restore is via the database only — ask an engineer if needed.'}
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {deleting ? 'Archiving…' : 'Archive batch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
