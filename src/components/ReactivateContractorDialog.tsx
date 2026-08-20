import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface ReactivateContractorDialogProps {
  contractor: { id: string; full_name: string; first_name: string | null } | null;
  profile: any;
  onClose: () => void;
  onReactivated: () => void;
}

export function ReactivateContractorDialog({ contractor, profile, onClose, onReactivated }: ReactivateContractorDialogProps) {
  const { toast } = useToast();

  const reactivateContractor = async () => {
    if (!contractor) return;
    const { error } = await supabase.from('contractors').update({ status: 'active' }).eq('id', contractor.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('contractor_edited', `Contractor "${contractor.full_name}" reactivated`, profile);
    toast({ title: 'Contractor reactivated' });
    onClose();
    onReactivated();
  };

  return (
    <Dialog open={!!contractor} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivate {contractor?.first_name || contractor?.full_name}?</DialogTitle>
          <DialogDescription>
            They will be marked active and eligible for payments again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={reactivateContractor}>
            Reactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
