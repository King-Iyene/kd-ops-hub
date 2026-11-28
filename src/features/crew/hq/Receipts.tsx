// "Sent: Hale is on it": what the owner just wrote, and whether the agent has picked it up (queued, working, woken), so it is clear the agent wakes.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CrewAgent } from '../crewDb';
import { ago } from '../helpers';
import { clearReceipt, firstName, useReceipts, type Receipt } from './actions';
import { useWakeQueue } from './hooks';
import { PICKUP_LABEL, pickup, type Pickup } from './logic';
import { Chip, Face } from './ui';

const TONE: Record<Pickup, 'ok' | 'signal' | 'warn' | 'neutral' | 'risk'> = { paused: 'neutral', queued: 'warn', working: 'signal', woken: 'ok', failed: 'risk', idle: 'neutral' };
const SHOW_FOR_MS = 15 * 60_000;

export function PickupChip({ agent, sentAt, paused }: { agent: Pick<CrewAgent, 'id' | 'status'>; sentAt: string; paused: boolean }) {
  const wakes = useWakeQueue();
  // when the queue cannot be read (no data), the agent's own status is all there is
  const p = pickup(agent, wakes.data, sentAt, paused);
  return <Chip tone={TONE[p]} role="status">{PICKUP_LABEL[p]}</Chip>;
}

function Line({ r, agent, paused }: { r: Receipt; agent?: CrewAgent; paused: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
      {agent ? <Face agent={agent} size={28} paused={paused} /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Sent: {firstName(agent)} is on it <span className="font-normal text-muted-foreground">· {ago(r.at)}</span></p>
        <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.text}</p>
        <p className="mt-1.5">{agent ? <PickupChip agent={agent} sentAt={r.at} paused={paused} /> : null}</p>
      </div>
      <button type="button" aria-label="Hide this receipt" onClick={() => clearReceipt(r.id)} className="hq-focus rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
    </li>
  );
}

/** The last things the owner sent (this session, newer than 15 minutes). aria-live, so a screen reader hears that it was sent. */
export function SentReceipts({ byId, paused, limit = 3 }: { byId: Map<string, CrewAgent>; paused: ReadonlySet<string>; limit?: number }) {
  const receipts = useReceipts();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const shown = receipts.filter((r) => now - Date.parse(r.at) < SHOW_FOR_MS).slice(0, limit);
  return (
    <div aria-live="polite" aria-atomic="false">
      {shown.length ? <ul className="space-y-2">{shown.map((r) => <Line key={r.id} r={r} agent={byId.get(r.agentId)} paused={paused.has(r.agentId)} />)}</ul> : null}
    </div>
  );
}
