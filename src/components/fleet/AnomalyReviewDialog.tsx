import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface AnomalyReviewDialogProps {
  target: { type: 'trip' | 'fuel'; id: string; label: string } | null;
  onClose: () => void;
  profile: { id: string; full_name?: string } | null;
  onSuccess: () => void;
}

export function AnomalyReviewDialog({ target, onClose, profile, onSuccess }: AnomalyReviewDialogProps) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<'valid' | 'fraudulent' | ''>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    onClose();
    setDecision('');
    setNote('');
  };

  const handleSubmit = async () => {
    if (!target || !decision || !note.trim()) return;
    setSubmitting(true);
    const reviewedAt = new Date().toISOString();
    const reviewPayload = {
      anomaly_reviewed_by: profile?.id,
      anomaly_reviewed_at: reviewedAt,
      anomaly_review_note: `${decision === 'valid' ? 'Reviewed — Valid' : 'Fraudulent / Error'}: ${note.trim()}`,
    };
    const table = target.type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update(reviewPayload).eq('id', target.id);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Review failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'anomaly_reviewed',
      `Anomaly on ${target.type} "${target.label}" marked as ${decision === 'valid' ? 'Valid' : 'Fraudulent/Error'}: ${note.trim()}`,
      profile,
    );
    toast({ title: 'Anomaly review saved' });
    handleClose();
    onSuccess();
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review anomaly</DialogTitle>
          <DialogDescription className="text-xs break-words">
            {target?.label}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Decision <span className="text-destructive">*</span></Label>
            <Select value={decision || undefined} onValueChange={(v) => setDecision(v as 'valid' | 'fraudulent')}>
              <SelectTrigger><SelectValue placeholder="Select outcome…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valid">Reviewed — Valid</SelectItem>
                <SelectItem value="fraudulent">Fraudulent / Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason / notes <span className="text-destructive">*</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this anomaly is valid or fraudulent…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !decision || !note.trim()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
