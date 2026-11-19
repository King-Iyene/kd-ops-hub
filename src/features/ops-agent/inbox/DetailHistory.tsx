import { Mail } from 'lucide-react';
import type { SentMessage, TimelineEvent } from '../detailTypes';
import { formatEst } from '../time';

const KIND: Record<string, string> = {
  created: 'First seen', opened: 'Opened', seen: 'Seen again', reopened: 'Reopened', handled: 'Marked as handled', snoozed: 'Snoozed',
  dismissed: 'Dismissed', auto_resolved: 'Cleared by the agent', escalated: 'Escalated', message_sent: 'Message sent', sent: 'Message sent',
};
const kindLabel = (k: string) => KIND[k] ?? (k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

/** The history of the item, newest first, in Eastern time. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="space-y-2" data-testid="detail-timeline">
      {events.map((e, i) => {
        const note = typeof e.detail?.note === 'string' ? e.detail.note : null;
        return (
          <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <div className="min-w-0">
              <p><span className="font-medium">{kindLabel(e.kind)}</span>{e.actor && <span className="text-muted-foreground"> · {e.actor}</span>}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatEst(e.at, { year: true })}</p>
              {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Messages already sent about this item. */
export function SentMessages({ messages }: { messages: SentMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="detail-messages" aria-label="Messages already sent">
      {messages.map((m) => (
        <li key={m.id} className="rounded-lg border p-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium text-foreground/80">{m.channel}</span>
            {m.recipient && <span>to {m.recipient}</span>}
            <span>· {m.status}</span>
            {m.sent_at && <span className="tabular-nums">· {formatEst(m.sent_at, { year: true })}</span>}
          </p>
          {m.body && <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{m.body}</p>}
          {m.error && <p className="mt-1 text-xs text-destructive">{m.error}</p>}
        </li>
      ))}
    </ul>
  );
}
