import { useState } from 'react';
import { UserCog } from 'lucide-react';
import { getImpersonationMeta, endImpersonation } from '@/lib/impersonation';
import { useToast } from '@/hooks/use-toast';

/**
 * Bright, impossible-to-miss banner shown for the duration of a real
 * "log in as" impersonation session (see lib/impersonation.ts) — distinct
 * from the gold ViewAsBanner, which only simulates a role using the
 * admin's own session and data.
 */
export function ImpersonationBanner() {
  const meta = getImpersonationMeta();
  const [exiting, setExiting] = useState(false);
  const { toast } = useToast();

  if (!meta) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await endImpersonation();
    } catch (err) {
      setExiting(false);
      toast({
        title: 'Could not exit impersonation cleanly',
        description: err instanceof Error ? err.message : 'Please sign out and back in.',
        variant: 'destructive',
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleExit}
      disabled={exiting}
      title="Click to end impersonation and return to your own account"
      className="w-full flex items-center justify-center gap-2 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 kd-transition focus:outline-none shadow-sm disabled:opacity-70"
    >
      <UserCog className="h-4 w-4" aria-hidden="true" />
      <span>
        Logged in as: <span className="font-bold">{meta.targetName}</span>
      </span>
      <span className="mx-2 text-white/60">—</span>
      <span className="underline underline-offset-2">
        {exiting ? 'Returning to your account…' : 'Click to exit'}
      </span>
    </button>
  );
}
