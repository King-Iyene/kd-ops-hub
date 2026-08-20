import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface RenameBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  currentName: string;
  profile: any;
  onRenamed: (newName: string) => void;
}

export function RenameBatchDialog({ open, onOpenChange, batchId, currentName, profile, onRenamed }: RenameBatchDialogProps) {
  const { toast } = useToast();
  const [renameValue, setRenameValue] = useState(currentName);
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    if (open) setRenameValue(currentName);
  }, [open, currentName]);

  const submitRename = async () => {
    const next = renameValue.trim();
    if (!next || next === currentName) {
      onOpenChange(false);
      return;
    }
    setRenameSaving(true);
    try {
      const { error } = await supabase
        .from('payment_batches')
        .update({ name: next })
        .eq('id', batchId);
      if (error) throw error;
      onRenamed(next);
      await logAudit(
        'batch_renamed',
        `Batch renamed from "${currentName}" to "${next}"`,
        profile,
      );
      toast({ title: 'Batch renamed', description: `Now "${next}"` });
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: 'Could not rename batch',
        description: errorMessage(err) || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRenameSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename batch</DialogTitle>
          <DialogDescription>
            Updates the display name only. Recipients, amounts, status, and
            payment processing are unaffected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="batch-rename">Batch name</Label>
          <Input
            id="batch-rename"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renameSaving) submitRename();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={renameSaving}>
            Cancel
          </Button>
          <Button
            onClick={submitRename}
            disabled={renameSaving || !renameValue.trim() || renameValue.trim() === currentName}
          >
            {renameSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
