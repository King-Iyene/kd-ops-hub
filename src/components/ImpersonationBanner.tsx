import { useCallback, useEffect, useState } from 'react';
import { Repeat, LogOut, Clock } from 'lucide-react';
import { getImpersonationMeta } from '@/lib/impersonation';
import { endImpersonation } from '@/lib/impersonation';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
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
  const currentUser = useAuthStore((s) => s.user);
  const [exiting, setExiting] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const { toast } = useToast();

  // Auto-clear stale impersonation state: if the current logged-in user
  // is NOT the impersonation target (e.g. session expired, user signed in
  // as themselves from /login without going through the app's Sign Out),
  // the sessionStorage keys are leftover garbage — clear them silently.
  useEffect(() => {
    if (!meta || !currentUser) return;
    if (currentUser.id !== meta.targetId) {
      try {
        window.sessionStorage.removeItem('kdops:impersonation:originRefreshToken');
        window.sessionStorage.removeItem('kdops:impersonation:meta');
      } catch { /* ignore */ }
    }
  }, [meta, currentUser]);

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
  if (currentUser && currentUser.id !== meta.targetId) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white" style={{ background: 'linear-gradient(90deg, #9f1239, #be123c, #9f1239)' }}>
        <AvatarBubble
          photoUrl={null}
          initials={initialsOf(meta.targetName)}
          size={20}
          ringClass="ring-1.5 ring-white/50 shrink-0"
        />

        <span className="truncate min-w-0 flex-1" title={`${meta.targetName} (${meta.targetEmail})`}>
          {meta.targetEmail || meta.targetName}
        </span>

        {elapsed && (
          <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-white/60 shrink-0 tabular-nums">
            <Clock className="h-3 w-3" />
            {elapsed}
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            disabled={exiting}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-white/15 hover:bg-white/25 kd-transition disabled:opacity-60"
            title="Switch to a different person"
          >
            <Repeat className="h-3 w-3" /> Switch
          </button>
          <button
            type="button"
            onClick={handleExit}
            disabled={exiting}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-white/90 text-rose-800 hover:bg-white kd-transition disabled:opacity-60"
            title="Exit impersonation (Esc)"
          >
            <LogOut className="h-3 w-3" /> {exiting ? 'Exiting…' : 'Exit'}
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
