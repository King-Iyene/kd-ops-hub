import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface CancelBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  batchName?: string;
  profile: any;
  onCancelled: () => void | Promise<void>;
}

export function CancelBatchDialog({ open, onOpenChange, batchId, batchName, profile, onCancelled }: CancelBatchDialogProps) {
  const { toast } = useToast();
  const [cancelBatchNote, setCancelBatchNote] = useState('');
  const [cancelBatchSaving, setCancelBatchSaving] = useState(false);

  const submitCancelBatch = async () => {
    setCancelBatchSaving(true);
    try {
      const { data, error } = await supabase.rpc('cancel_batch_bulk', {
        p_batch_id: batchId,
        p_note:     cancelBatchNote.trim() || null,
      });
      if (error) throw error;
      const cancelled = (data as any)?.cancelled_count ?? 0;
      const skipped   = (data as any)?.skipped_count   ?? 0;
      await logAudit(
        'batch_cancelled_bulk',
        `Batch "${batchName}" cancelled in bulk — ${cancelled} item(s) closed${skipped ? `, ${skipped} skipped` : ''}`,
        profile,
      );
      toast({
        title: 'Batch cancelled',
        description: `${cancelled} item(s) marked cancelled${skipped ? ` (${skipped} skipped)` : ''}.`,
      });
      onOpenChange(false);
      setCancelBatchNote('');
      await onCancelled();
    } catch (err: unknown) {
      toast({
        title: 'Cancel failed',
        description: errorMessage(err) || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancelBatchSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this batch?</DialogTitle>
          <DialogDescription>
            Marks every outstanding recipient in "{batchName}" as cancelled
            — the same as clicking Cancel on each row one by one. This closes
            the batch out for accounting: the amounts drop off the Pending
            KPI immediately. No money moves. You can Undo any individual
            recipient later from the row menu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-batch-note">Reason for cancelling *</Label>
          <Textarea
            id="cancel-batch-note"
            value={cancelBatchNote}
            onChange={(e) => setCancelBatchNote(e.target.value)}
            placeholder="Why is this batch being cancelled?"
            maxLength={500}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelBatchSaving}>
            Keep
          </Button>
          <Button
            variant="destructive"
            onClick={submitCancelBatch}
            disabled={cancelBatchSaving || !cancelBatchNote.trim()}
          >
            {cancelBatchSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
