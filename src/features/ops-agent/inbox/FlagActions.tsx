import { AlarmClock, Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LiveFlag } from '../liveTypes';

export type FlagStatus = 'open' | 'snoozed' | 'handled' | 'dismissed';
export type OnAct = (f: Pick<LiveFlag, 'id'>, status: FlagStatus, done: string) => void;

/** Handled / Snooze / Dismiss for an open item, Reopen for any other. Used on the card and in the detail sheet. */
export function FlagActions({ flag, busy, onAct }: { flag: Pick<LiveFlag, 'id' | 'status'>; busy: boolean; onAct: OnAct }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flag.status === 'open' ? (
        <>
          <Button size="sm" variant="outline" className="h-8 px-2.5" disabled={busy} onClick={() => onAct(flag, 'handled', 'Marked as handled')} data-testid="flag-handled"><Check className="mr-1 h-3.5 w-3.5" /> Handled</Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" disabled={busy} onClick={() => onAct(flag, 'snoozed', 'Snoozed for a day')} aria-label="Snooze a day"><AlarmClock className="mr-1 h-3.5 w-3.5" /> <span>Snooze<span className="hidden sm:inline"> a day</span></span></Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" disabled={busy} onClick={() => onAct(flag, 'dismissed', 'Dismissed')}><X className="mr-1 h-3.5 w-3.5" /> Dismiss</Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(flag, 'open', 'Back in the Inbox')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen</Button>
      )}
    </div>
  );
}
