import { useEffect, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { formatDateTime, formatNaira } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Snapshot {
  id: string;
  beneficiary_count: number;
  total_amount: number;
  reason: string;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  before_edit: 'Before an edit',
  before_restore: 'Before a restore',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  onRestored: () => void;
}

export function BatchHistoryDialog({ open, onOpenChange, batchId, onRestored }: Props) {
  const { toast } = useToast();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmSnapshot, setConfirmSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('batch_item_snapshots')
        .select('id, beneficiary_count, total_amount, reason, created_at')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({ title: 'Could not load history', description: errorMessage(error), variant: 'destructive' });
      } else {
        setSnapshots((data ?? []) as Snapshot[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, batchId, toast]);

  const handleRestore = async (snap: Snapshot) => {
    setRestoring(snap.id);
    try {
      const { error } = await supabase.rpc('restore_batch_items_snapshot', { p_snapshot_id: snap.id });
      if (error) throw error;
      toast({
        title: 'Restored',
        description: `Beneficiaries restored from ${formatDateTime(snap.created_at)}.`,
      });
      setConfirmSnapshot(null);
      onOpenChange(false);
      onRestored();
    } catch (err: unknown) {
      toast({ title: 'Restore failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Beneficiary history
            </DialogTitle>
            <DialogDescription>
              A snapshot is saved automatically every time this batch's beneficiaries are
              about to change. Restoring replaces the CURRENT list with the selected
              snapshot — the current list is itself saved first, so restoring is undoable too.
              Snapshots are kept for 30 days.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No history yet — a snapshot is saved the next time this batch is edited.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {snap.beneficiary_count} beneficiar{snap.beneficiary_count === 1 ? 'y' : 'ies'} ·{' '}
                      {formatNaira(snap.total_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(snap.created_at)} · {REASON_LABEL[snap.reason] || snap.reason}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmSnapshot(snap)}
                    disabled={restoring === snap.id}
                  >
                    {restoring === snap.id
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmSnapshot} onOpenChange={(v) => !v && setConfirmSnapshot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the batch's current beneficiary list with the
              {confirmSnapshot && (
                <> {confirmSnapshot.beneficiary_count} beneficiar{confirmSnapshot.beneficiary_count === 1 ? 'y' : 'ies'} saved
                  on {formatDateTime(confirmSnapshot.created_at)}</>
              )}. The current list is saved as its own snapshot first, so this can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSnapshot && handleRestore(confirmSnapshot)}
              disabled={!!restoring}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
