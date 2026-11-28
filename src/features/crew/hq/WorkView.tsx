// WORK: what the team is doing, as four lanes built from orders, proposals, meetings, hand-offs and ideas; plus the full Orders, Ideas and Hand-offs screens.
import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { HandoffsTab } from '../components/HandoffsTab';
import { IdeasTab } from '../components/IdeasTab';
import { OrdersTab } from '../components/OrdersTab';
import type { CrewAgent, CrewIdea, CrewMeeting, CrewOrder, CrewProposal } from '../crewDb';
import { ago } from '../helpers';
import { useCrewChannel, useCrewIdeas, useCrewMeetings, useCrewOrders, useCrewProposals } from '../useCrew';
import { useHqActions } from './actions';
import { DecisionCard } from './DecisionCard';
import { buildLanes, computeHandoffs, LANES, type LaneKey, type Navigate, type WorkCard } from './logic';
import { usePausedIds } from './pause';
import { Btn, Chip, EmptyState, ErrorState, Face, Eyebrow, LoadingRows, Prose } from './ui';
import type { HqData } from './useHq';

export type WorkSub = 'board' | 'orders' | 'ideas' | 'handoffs';
const SUBS: { key: WorkSub; label: string }[] = [{ key: 'board', label: 'Board' }, { key: 'orders', label: 'Orders' }, { key: 'ideas', label: 'Ideas' }, { key: 'handoffs', label: 'Hand-offs' }];
const LANE_TONE: Record<LaneKey, 'neutral' | 'signal' | 'warn' | 'ok'> = { planned: 'neutral', progress: 'signal', waiting: 'warn', done: 'ok' };
const KIND_LABEL: Record<WorkCard['kind'], string> = { order: 'Order', proposal: 'Proposal', meeting: 'Meeting', handoff: 'Hand-off', idea: 'Idea' };
const PER_LANE = 25;

function Card({ c, agent, paused, onOpen }: { c: WorkCard; agent?: CrewAgent; paused: boolean; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn('hq-focus hq-interactive w-full rounded-2xl border bg-card p-3 text-left', c.alert ? 'border-[hsl(var(--hq-risk)/0.5)]' : 'border-border')}>
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[c.kind]}<span className="font-normal normal-case tracking-normal">· {ago(c.at)}</span></span>
        <span className="mt-1 line-clamp-3 block text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{c.title}</span>
        <span className="mt-2 flex items-center gap-2">
          {agent ? <Face agent={agent} size={24} paused={paused} /> : null}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{agent?.name.split(' ')[0]}</span>
          {c.badge ? <Chip tone={c.alert ? 'risk' : LANE_TONE[c.lane]} className="shrink-0">{c.badge}</Chip> : null}
        </span>
      </button>
    </li>
  );
}

interface Detail { card: WorkCard; proposal?: CrewProposal; order?: CrewOrder; meeting?: CrewMeeting; idea?: CrewIdea; handoff?: ReturnType<typeof computeHandoffs>[number] }

function DetailSheet({ d, data, onClose, onNavigate }: { d: Detail | null; data: HqData; onClose: () => void; onNavigate: Navigate }) {
  const actions = useHqActions(data.agents);
  const paused = usePausedIds();
  const agent = d?.card.agentId ? data.byId.get(d.card.agentId) : undefined;
  const p = d?.proposal;
  const pendingItem = p && p.status === 'pending' ? data.items.find((i) => i.id === p.id) ?? { kind: 'proposal' as const, id: p.id, at: p.created_at, rank: 0, proposal: p } : null;
  return (
    <Sheet open={!!d} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {d ? (
          <>
            <SheetHeader className="space-y-1 border-b border-border p-5 text-left">
              <Eyebrow>{KIND_LABEL[d.card.kind]} · {d.card.badge}</Eyebrow>
              <SheetTitle className="pr-8 text-lg leading-snug [overflow-wrap:anywhere]">{d.card.title.length > 160 ? d.card.title.slice(0, 160) + '…' : d.card.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">{agent ? <><Face agent={agent} size={24} paused={paused.has(agent.id)} />{agent.name} · {agent.title}</> : 'Details'}</SheetDescription>
            </SheetHeader>
            <div className="min-w-0 space-y-4 p-5">
              {pendingItem ? <DecisionCard item={pendingItem} byId={data.byId} actions={actions} paused={paused} stateOf={data.stateOf} compact /> : null}
              {p && !pendingItem ? (
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2"><Chip>{p.status}</Chip><Chip tone={p.risk === 'high' ? 'risk' : p.risk === 'medium' ? 'warn' : 'ok'}>{p.risk} risk</Chip>{p.decided_at ? <span className="text-xs text-muted-foreground">decided {ago(p.decided_at)}</span> : null}</p>
                  {p.rationale ? <Prose text={p.rationale} lines={8} /> : null}
                  {p.decision_note ? <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Your note: {p.decision_note}</p> : null}
                  {p.error ? <p className="text-xs text-[hsl(var(--hq-risk))] [overflow-wrap:anywhere]">Could not be applied: {p.error}</p> : null}
                  <Btn tone="soft" onClick={() => onNavigate('decisions', { sub: 'history' })}>Open in decision history</Btn>
                </div>
              ) : null}
              {d.order ? (
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2"><Chip>{d.order.status}</Chip><span className="text-xs text-muted-foreground">given {ago(d.order.created_at)}</span></p>
                  <Prose text={d.order.text} lines={8} />
                  {d.order.challenge ? <div className="rounded-xl bg-[hsl(var(--hq-risk)/0.08)] p-3"><Eyebrow>Their challenge</Eyebrow><Prose text={d.order.challenge} lines={8} className="mt-1" /></div> : null}
                  {d.order.owner_response ? <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Your answer: {d.order.owner_response}</p> : null}
                  <Btn tone="soft" onClick={() => onNavigate('work', { sub: 'orders' })}>Open in Orders</Btn>
                </div>
              ) : null}
              {d.meeting ? (
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2"><Chip tone={d.meeting.status === 'open' ? 'ok' : 'neutral'}>{d.meeting.status}</Chip><span className="text-xs text-muted-foreground">round {d.meeting.round} of {d.meeting.max_rounds}</span></p>
                  {d.meeting.brief ? <Prose text={d.meeting.brief} lines={5} /> : null}
                  {d.meeting.minutes ? <div className="rounded-xl bg-muted/60 p-3"><Eyebrow>Minutes</Eyebrow><Prose text={d.meeting.minutes.summary} lines={8} className="mt-1" />{d.meeting.minutes.needs_owner.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{d.meeting.minutes.needs_owner.map((n, i) => <li key={i} className="[overflow-wrap:anywhere]">{n}</li>)}</ul> : null}</div> : null}
                  <Btn tone="soft" onClick={() => onNavigate('meetings')}>Open in Meetings</Btn>
                </div>
              ) : null}
              {d.handoff ? (
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2"><Chip tone={d.handoff.stuck ? 'risk' : 'neutral'}>{d.handoff.answeredAt ? `Answered ${ago(d.handoff.answeredAt)}` : d.handoff.stuck ? 'Stuck' : 'Waiting for an answer'}</Chip><span className="text-xs text-muted-foreground">{data.byId.get(d.handoff.m.from_agent ?? '')?.name.split(' ')[0]} to {data.byId.get(d.handoff.m.to_agent ?? '')?.name.split(' ')[0]} · {ago(d.handoff.m.created_at)}</span></p>
                  <Prose text={d.handoff.m.body} lines={12} />
                  <Btn tone="soft" onClick={() => onNavigate('work', { sub: 'handoffs' })}>Open in Hand-offs</Btn>
                </div>
              ) : null}
              {d.idea ? (
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2"><Chip>{d.idea.status}</Chip><Chip>{d.idea.priority} priority</Chip><span className="text-xs text-muted-foreground">{d.idea.support_count} need it</span></p>
                  <Prose text={d.idea.problem} lines={8} />
                  {d.idea.proposal ? <Prose text={'Build: ' + d.idea.proposal} lines={6} /> : null}
                  <Btn tone="soft" onClick={() => onNavigate('work', { sub: 'ideas' })}>Open in Ideas</Btn>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Board({ data, onNavigate }: { data: HqData; onNavigate: Navigate }) {
  const orders = useCrewOrders();
  const waiting = useCrewProposals('waiting');
  const carry = useCrewProposals('carry_out');
  const history = useCrewProposals('history');
  const meetings = useCrewMeetings(true);
  const channel = useCrewChannel();
  const ideas = useCrewIdeas();
  const paused = usePausedIds();
  const [open, setOpen] = useState<Detail | null>(null);
  const [only, setOnly] = useState<LaneKey | 'all'>('all');

  const loading = [orders, waiting, carry, history, meetings, channel, ideas].some((q) => q.isLoading);
  const error = [orders, waiting, carry, history, meetings, channel, ideas].find((q) => q.error)?.error?.message ?? null;
  const proposals = useMemo(() => [...(waiting.data ?? []), ...(carry.data ?? []), ...(history.data ?? [])], [waiting.data, carry.data, history.data]);
  const handoffs = useMemo(() => computeHandoffs(channel.data ?? [], Date.now()), [channel.data]);
  const lanes = useMemo(() => buildLanes({ orders: orders.data ?? [], proposals, meetings: meetings.data ?? [], handoffs, ideas: ideas.data ?? [], now: Date.now() }), [orders.data, proposals, meetings.data, handoffs, ideas.data]);

  const find = (c: WorkCard): Detail => ({
    card: c,
    proposal: c.kind === 'proposal' ? proposals.find((p) => p.id === c.ref) : undefined,
    order: c.kind === 'order' ? (orders.data ?? []).find((o) => o.id === c.ref) : undefined,
    meeting: c.kind === 'meeting' ? (meetings.data ?? []).find((m) => m.id === c.ref) : undefined,
    handoff: c.kind === 'handoff' ? handoffs.find((h) => h.m.id === c.ref) : undefined,
    idea: c.kind === 'idea' ? (ideas.data ?? []).find((i) => i.id === c.ref) : undefined,
  });

  if (loading) return <LoadingRows rows={3} label="Loading the board" />;
  const empty = LANES.every((l) => lanes[l.key].length === 0);
  return (
    <div className="space-y-4">
      {error ? <ErrorState message={error} /> : null}
      <div className="flex flex-wrap gap-1.5 lg:hidden" role="group" aria-label="Show lane">
        {(['all', ...LANES.map((l) => l.key)] as const).map((k) => (
          <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={cn('hq-focus rounded-full border px-3 py-1 text-xs font-bold', only === k ? 'border-[hsl(var(--hq-signal))] bg-[hsl(var(--hq-signal)/0.12)] text-[hsl(var(--hq-signal-ink))]' : 'border-border text-muted-foreground')}>
            {k === 'all' ? 'All lanes' : `${LANES.find((l) => l.key === k)!.label} ${lanes[k].length}`}
          </button>
        ))}
      </div>
      {empty ? <EmptyState title="Nothing on the board yet">Orders you give, proposals, meetings and hand-offs between agents appear here as they happen.</EmptyState> : (
        <div className="grid gap-4 lg:grid-cols-4">
          {LANES.map((l) => (
            <section key={l.key} aria-label={l.label} className={cn('min-w-0 rounded-2xl bg-muted/40 p-3', only !== 'all' && only !== l.key && 'hidden lg:block')}>
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                <div><h3 className="flex items-center gap-2 text-sm font-bold"><span className="hq-dot" data-tone={l.key === 'progress' ? 'signal' : l.key === 'waiting' ? 'warn' : l.key === 'done' ? 'ok' : undefined} aria-hidden />{l.label}</h3><p className="text-[11px] text-muted-foreground">{l.hint}</p></div>
                <span className="hq-num rounded-full bg-card px-2 py-0.5 text-xs font-bold">{lanes[l.key].length}</span>
              </header>
              {lanes[l.key].length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nothing here</p> : (
                <ul className="space-y-2">{lanes[l.key].slice(0, PER_LANE).map((c) => <Card key={c.id} c={c} agent={c.agentId ? data.byId.get(c.agentId) : undefined} paused={!!c.agentId && paused.has(c.agentId)} onOpen={() => setOpen(find(c))} />)}</ul>
              )}
              {lanes[l.key].length > PER_LANE ? <p className="mt-2 text-center text-[11px] text-muted-foreground">+{lanes[l.key].length - PER_LANE} more</p> : null}
            </section>
          ))}
        </div>
      )}
      <DetailSheet d={open} data={data} onClose={() => setOpen(null)} onNavigate={(v, o) => { setOpen(null); onNavigate(v, o); }} />
    </div>
  );
}

export function WorkView({ data, sub, onSub, onNavigate }: { data: HqData; sub: WorkSub; onSub: (s: WorkSub) => void; onNavigate: Navigate }) {
  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap rounded-xl bg-muted p-1" role="tablist" aria-label="Work">
        {SUBS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={sub === s.key} onClick={() => onSub(s.key)} className={cn('hq-focus rounded-lg px-3 py-1.5 text-sm font-bold transition', sub === s.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{s.label}</button>)}
      </div>
      {sub === 'board' ? <Board data={data} onNavigate={onNavigate} /> : null}
      {sub === 'orders' ? <OrdersTab /> : null}
      {sub === 'ideas' ? <IdeasTab /> : null}
      {sub === 'handoffs' ? <div className="rounded-2xl border border-border bg-card p-4"><HandoffsTab /></div> : null}
    </div>
  );
}
