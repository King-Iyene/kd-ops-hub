import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';

/** One place for the toast wording after a save, so a database refusal reads the same everywhere. */
export function useAgentToast() {
  const { toast } = useToast();
  return {
    saved: (what = 'Saved') => toast({ title: what }),
    failed: (err: unknown) => {
      const raw = errorMessage(err);
      const message = /not_allowed|permission denied|row-level security/i.test(raw) ? 'Only a Super Admin can change this.' : raw;
      toast({ title: 'Could not save', description: message, variant: 'destructive' });
    },
  };
}
