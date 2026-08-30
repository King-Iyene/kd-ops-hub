import { useCallback, useEffect, useState } from 'react';
import { Repeat, LogOut, Shield, Clock } from 'lucide-react';
import { getImpersonationMeta } from '@/lib/impersonation';
import { endImpersonation } from '@/lib/impersonation';
import { useToast } from '@/hooks/use-toast';
import { ImpersonateUserDialog } from '@/components/ImpersonateUserDialog';
import { AvatarBubble } from '@/components/AvatarBubble';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return '0s';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

/**
 * Prominent, impossible-to-miss banner shown while genuinely logged in as
 * another user. GHL-inspired: pulsing indicator, elapsed-time timer, and
 * keyboard hint so the admin always knows they're impersonating and can
 * exit instantly.
 */
export function ImpersonationBanner() {
  const meta = getImpersonationMeta();
  const [exiting, setExiting] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (!meta?.startedAt) return;
    setElapsed(formatElapsed(meta.startedAt));
    const interval = window.setInterval(() => {
      setElapsed(formatElapsed(meta.startedAt));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [meta?.startedAt]);

  const handleExit = useCallback(async () => {
    if (exiting) return;
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
  }, [exiting, toast]);

  useEffect(() => {
    if (!meta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return;
        const dialog = target?.closest('[role="dialog"]');
        if (dialog) return;
        e.preventDefault();
        handleExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [meta, handleExit]);

  if (!meta) return null;

  return (
    <>
      <div className="relative flex items-center gap-3 px-4 py-2 text-sm font-medium text-white shadow-md" style={{ background: 'linear-gradient(90deg, #9f1239, #be123c, #9f1239)' }}>
        {/* Pulsing live indicator */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>

        <Shield className="h-4 w-4 shrink-0 opacity-80" />

        <AvatarBubble
          photoUrl={null}
          initials={initialsOf(meta.targetName)}
          size={24}
          ringClass="ring-2 ring-white/50 shrink-0"
        />

        <span className="truncate min-w-0 flex-1" title={`${meta.targetName} (${meta.targetEmail})`}>
          Impersonating <span className="font-bold">{meta.targetEmail || meta.targetName}</span>
        </span>

        {elapsed && (
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-white/70 shrink-0 tabular-nums">
            <Clock className="h-3 w-3" />
            {elapsed}
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            disabled={exiting}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-white/15 hover:bg-white/25 kd-transition disabled:opacity-60"
            title="Switch to a different person without exiting first"
          >
            <Repeat className="h-3 w-3" /> Switch
          </button>
          <button
            type="button"
            onClick={handleExit}
            disabled={exiting}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-white/90 text-rose-800 hover:bg-white kd-transition disabled:opacity-60"
            title="End impersonation and return to your own account (Esc)"
          >
            <LogOut className="h-3 w-3" /> {exiting ? 'Exiting…' : 'Exit'}
            <kbd className="hidden lg:inline ml-0.5 text-[10px] opacity-70 font-mono">Esc</kbd>
          </button>
        </div>
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
