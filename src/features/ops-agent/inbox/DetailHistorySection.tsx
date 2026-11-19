import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SentMessage, TimelineEvent } from '../detailTypes';
import { SentMessages, Timeline } from './DetailHistory';

/** History and the messages already sent, collapsed by default so the draft stays near the top. */
export function DetailHistoryAndMessages({ timeline, messages }: { timeline: TimelineEvent[]; messages: SentMessage[] }) {
  const [open, setOpen] = useState(messages.length > 0);
  return (
    <section className="space-y-2.5 border-t px-4 py-4 sm:px-6" aria-label="History">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="history-toggle"
        className="flex w-full items-center justify-between rounded text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>History and messages sent ({timeline.length + messages.length})</span>
        <ChevronDown className={cn('h-3.5 w-3.5 motion-safe:transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4">
          <SentMessages messages={messages} />
          <Timeline events={timeline} />
        </div>
      )}
    </section>
  );
}
