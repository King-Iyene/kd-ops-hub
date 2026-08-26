import { useState } from 'react';
import { Repeat, LogOut } from 'lucide-react';
import { getImpersonationMeta, endImpersonation } from '@/lib/impersonation';
import { useToast } from '@/hooks/use-toast';
import { ImpersonateUserDialog } from '@/components/ImpersonateUserDialog';
import { AvatarBubble } from '@/components/AvatarBubble';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Compact, unmissable-but-not-overbearing strip shown for the duration of
 * a real "log in as" impersonation session (see lib/impersonation.ts) —
 * distinct from the gold ViewAsBanner, which only simulates a role using
 * the admin's own session and data.
 *
 * Two distinct actions, always both visible: "Switch" jumps straight to a
 * different person without a visible round-trip back through the admin's
 * own dashboard first; "Exit" returns to the admin's own account. Neither
 * is the other done twice — switching never touches the admin's own
 * profile view in between.
 */
export function ImpersonationBanner() {
  const meta = getImpersonationMeta();
  const [exiting, setExiting] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
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
    <>
      <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-white bg-red-600 shadow-sm">
        <AvatarBubble
          photoUrl={null}
          initials={initialsOf(meta.targetName)}
          size={18}
          ringClass="ring-1 ring-white/40 shrink-0"
        />
        {/* min-w-0 is required here: a flex child's default min-width is
            "auto" (its content size), which silently defeats `truncate` —
            without it the name doesn't ellipsize, it just overflows the
            row, and depending on what's above this in the layout that can
            read as the START of the name being clipped instead. */}
        <span className="truncate min-w-0 flex-1" title={meta.targetName}>
          Viewing as <span className="font-bold">{meta.targetName}</span>
        </span>
        <button
          type="button"
          onClick={() => setSwitchOpen(true)}
          disabled={exiting}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/15 kd-transition disabled:opacity-60"
          title="Switch to a different person without exiting first"
        >
          <Repeat className="h-3 w-3" /> Switch
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={exiting}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/15 kd-transition disabled:opacity-60"
          title="End impersonation and return to your own account"
        >
          <LogOut className="h-3 w-3" /> {exiting ? 'Exiting…' : 'Exit'}
        </button>
      </div>
      <ImpersonateUserDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        excludeUserId={meta.targetId}
        mode="switch"
      />
    </>
  );
}
