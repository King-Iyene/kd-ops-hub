import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { formatNaira } from '@/lib/format';
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

interface ResolveItemDialogProps {
  item: { id: string; full_name?: string; amount_ngn?: number } | null;
  mode: 'paid' | 'cancel';
  profile: any;
  onClose: () => void;
  onResolved: () => void | Promise<void>;
}

/**
 * Closes a failed batch item without retrying — writes it off as manually
 * resolved. Dual-mode state (paid / cancel) is kept in case "Mark paid" is
 * reintroduced, but only the cancel path is currently wired up to a trigger.
 */
export function ResolveItemDialog({ item, mode, profile, onClose, onResolved }: ResolveItemDialogProps) {
  const { toast } = useToast();
  const [resolveMethod, setResolveMethod] = useState<string>(mode === 'cancel' ? 'cancelled' : 'bank_transfer');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (item) {
      setResolveMethod(mode === 'cancel' ? 'cancelled' : 'bank_transfer');
      setResolveNote('');
    }
  }, [item, mode]);

  const submitResolve = async () => {
    if (!item) return;
    setResolving(true);
    try {
      const method = mode === 'cancel' ? 'cancelled' : resolveMethod;
      const { error } = await supabase.rpc('mark_batch_item_resolved', {
        p_item_id: item.id,
        p_method:  method,
        p_note:    resolveNote.trim() || null,
      });
      if (error) throw error;
      await logAudit(
        mode === 'cancel' ? 'batch_item_cancelled' : 'batch_item_resolved',
        mode === 'cancel'
          ? `${item.full_name || 'Item'} cancelled — closed without payment`
          : `${item.full_name || 'Item'} marked as paid manually (${method})`,
        profile,
      );
      toast({
        title: mode === 'cancel' ? 'Item cancelled' : 'Marked as resolved',
        description: 'Batch status will update shortly.',
      });
      onClose();
      setResolveNote('');
      setResolveMethod('bank_transfer');
      await onResolved();
    } catch (err: unknown) {
      toast({ title: 'Resolve failed', description: errorMessage(err) ?? '', variant: 'destructive' });
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !resolving) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this transfer</DialogTitle>
          <DialogDescription>
            Close <span className="font-semibold text-foreground">{item?.full_name}</span> ({formatNaira(item?.amount_ngn || 0)}) without paying.
            Use this when the transfer can't be retried — wrong account, dormant, recipient unreachable.
            The batch can then close out. If you paid this person another way, record it in your bank reconciliation rather than here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="e.g. Account number incorrect, contractor confirmed they no longer use this bank"
              className="min-h-[70px]"
            />
          </div>
          <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-2.5 text-[11px] leading-snug text-muted-foreground">
            No money will be sent. The original failed status stays on the row for audit; the row drops out of pending and the batch closes. Cancellations are reversible — use the Undo button if you change your mind.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={resolving}>Back</Button>
          <Button
            onClick={submitResolve}
            disabled={resolving || !resolveNote.trim()}
            variant="secondary"
          >
            {resolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
