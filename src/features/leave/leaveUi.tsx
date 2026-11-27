// Small shared pieces: who is who, type and status labels, and the "why?" box.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { initials } from './leaveMath';
import type { LeaveStatus } from './types';

export function PersonAvatar({ name, photo, className }: { name: string | null | undefined; photo?: string | null; className?: string }) {
  return (
    <Avatar className={cn('h-9 w-9', className)}>
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function TypeChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80', className)}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}

const STATUS_STYLE: Record<LeaveStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting for approval', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  rejected: { label: 'Not approved', cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border' },
};

export function LeaveStatusPill({ status, short, className }: { status: LeaveStatus; short?: boolean; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', s.cls, className)}>
      {short && status === 'pending' ? 'Pending' : s.label}
    </span>
  );
}

/** Asks for a reason in a proper box (required or optional) before something is done. */
export function ReasonDialog({ open, title, description, label, placeholder, confirmLabel, destructive, required, suggestions, onClose, onConfirm }: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  required?: boolean;
  suggestions?: string[];
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !required || text.trim().length >= 3;
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await onConfirm(text.trim()); setText(''); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { setText(''); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="leave-reason">{label}{required ? '' : ' (optional)'}</label>
          <Textarea id="leave-reason" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          {suggestions?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{s}</button>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { setText(''); onClose(); }} disabled={busy}>Back</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={go} disabled={!ok || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
