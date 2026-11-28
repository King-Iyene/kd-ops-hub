// MEMORY: the company brain (what every agent reads first) and a digest of what the agents wrote down this week.
import { useMemo } from 'react';
import { BrainTab } from '../components/BrainTab';
import type { CrewAgent } from '../crewDb';
import { ago } from '../helpers';
import { cn } from '@/lib/utils';
import { useWeeklyNotes } from './hooks';
import { weeklyDigest } from './logic';
import { usePausedIds } from './pause';
import { Chip, EmptyState, ErrorState, Eyebrow, Face, HqCard, LoadingRows, Prose } from './ui';
import type { HqData } from './useHq';

export type MemorySub = 'week' | 'brain';
const SUBS: { key: MemorySub; label: string }[] = [{ key: 'week', label: 'Learned this week' }, { key: 'brain', label: 'Company brain' }];
const KIND_TONE: Record<string, 'signal' | 'ok' | 'warn' | 'meet' | 'risk'> = { lesson: 'signal', rule: 'ok', fact: 'meet', preference: 'warn', mistake: 'risk' };

function Digest({ data, onOpen }: { data: HqData; onOpen: (a: CrewAgent) => void }) {
  const notes = useWeeklyNotes();
  const paused = usePausedIds();
  const digest = useMemo(() => weeklyDigest(notes.data ?? [], Date.now()), [notes.data]);
  const total = digest.reduce((n, d) => n + d.notes.length, 0);
  const kinds = digest.reduce<Record<string, number>>((m, d) => { for (const [k, v] of Object.entries(d.byKind)) m[k] = (m[k] ?? 0) + v; return m; }, {});
  if (notes.isLoading) return <LoadingRows rows={3} label="Loading what the agents learned" />;
  if (notes.error) return <ErrorState message={notes.error.message} onRetry={() => void notes.refetch()} />;
  if (total === 0) return <EmptyState title="Nothing written down this week">Agents write a lesson after a rejection, a challenge or a failure, and after their weekly self-review. It will show here.</EmptyState>;
  return (
    <div className="space-y-5">
      <HqCard glow className="p-5">
        <Eyebrow>This week</Eyebrow>
        <p className="mt-1 text-2xl font-bold tracking-tight"><span className="hq-num">{total}</span> thing{total === 1 ? '' : 's'} learned across <span className="hq-num">{digest.length}</span> agent{digest.length === 1 ? '' : 's'}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">{Object.entries(kinds).map(([k, v]) => <Chip key={k} tone={KIND_TONE[k] ?? 'neutral'}>{v} {k}{v === 1 ? '' : 's'}</Chip>)}</p>
      </HqCard>
      <ul className="grid gap-4 lg:grid-cols-2">
        {digest.map((d) => {
          const a = data.byId.get(d.agentId);
          if (!a) return null;
          return (
            <li key={d.agentId}>
              <HqCard flat className="h-full p-4">
                <div className="flex items-center gap-3">
                  <Face agent={a} size={40} paused={paused.has(a.id)} />
                  <div className="min-w-0 flex-1"><p className="truncate font-bold">{a.name}</p><p className="flex flex-wrap gap-1.5 pt-0.5">{Object.entries(d.byKind).map(([k, v]) => <Chip key={k} tone={KIND_TONE[k] ?? 'neutral'}>{v} {k}</Chip>)}</p></div>
                </div>
                <ul className="mt-3 space-y-2">
                  {d.notes.slice(0, 3).map((n) => <li key={n.id} className="rounded-xl bg-muted/60 p-2.5"><Prose text={n.body} lines={3} /><p className="mt-1 text-[11px] text-muted-foreground">{n.kind} · {ago(n.created_at)}</p></li>)}
                </ul>
                <button type="button" onClick={() => onOpen(a)} className="hq-focus mt-3 rounded text-xs font-bold text-[hsl(var(--hq-signal-ink))] hover:underline">{d.notes.length > 3 ? `See all ${d.notes.length} in ${a.name.split(' ')[0]}'s memory` : `Open ${a.name.split(' ')[0]}'s memory`}</button>
              </HqCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MemoryView({ data, sub, onSub, onOpenAgent }: { data: HqData; sub: MemorySub; onSub: (s: MemorySub) => void; onOpenAgent: (a: CrewAgent) => void }) {
  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap rounded-xl bg-muted p-1" role="tablist" aria-label="Memory">
        {SUBS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={sub === s.key} onClick={() => onSub(s.key)} className={cn('hq-focus rounded-lg px-3 py-1.5 text-sm font-bold transition', sub === s.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{s.label}</button>)}
      </div>
      {sub === 'week' ? <Digest data={data} onOpen={onOpenAgent} /> : <BrainTab />}
    </div>
  );
}
