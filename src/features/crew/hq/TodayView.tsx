// TODAY: the briefing. Hale's latest brief, four live numbers, the team's pulse, and the three decisions that matter most.
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CrewAgent, CrewMessage } from '../crewDb';
import { ago } from '../helpers';
import { useCrewChannel } from '../useCrew';
import { useHqActions } from './actions';
import { DecisionCard } from './DecisionCard';
import { useLatestRuns } from './hooks';
import { computeHandoffs, isBusy, type Navigate } from './logic';
import { usePausedIds } from './pause';
import { Btn, Chip, EmptyState, ErrorState, Eyebrow, Face, HqCard, LoadingRows, Prose, Section } from './ui';
import { STATUS_WORD } from './tones';
import type { HqData } from './useHq';

function greeting(d = new Date()) { const h = d.getHours(); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

function Tile({ label, value, sub, tone, onClick }: { label: string; value: number | string; sub: string; tone?: 'risk' | 'warn' | 'signal' | 'ok'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. ${sub}`} className="hq-focus hq-card hq-card-flat hq-interactive group p-4 text-left">
      <span className="flex items-start justify-between"><Eyebrow>{label}</Eyebrow><ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden /></span>
      <span className="mt-2 flex items-baseline gap-2">
        <span className={cn('hq-num text-4xl font-bold leading-none', tone === 'risk' && 'text-[hsl(var(--hq-risk))]', tone === 'warn' && 'text-[hsl(var(--hq-warn))]', tone === 'signal' && 'text-[hsl(var(--hq-signal-ink))]', tone === 'ok' && 'text-[hsl(var(--hq-ok))]')}>{value}</span>
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}

function Brief({ data, onSend }: { data: HqData; onSend: ReturnType<typeof useHqActions> }) {
  const cfo = data.agents.find((a) => a.slug === 'cfo');
  const briefs = data.messages.filter((m) => m.kind === 'brief' && m.to_owner && m.from_agent);
  const mine = briefs.filter((m) => m.from_agent === cfo?.id);
  const brief: CrewMessage | undefined = [...(mine.length ? mine : briefs)].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const author = brief?.from_agent ? data.byId.get(brief.from_agent) : cfo;
  const [text, setText] = useState('');
  const paused = usePausedIds();
  return (
    <HqCard glow className="p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        {author ? <Face agent={author} size={52} paused={paused.has(author.id)} /> : null}
        <div className="min-w-0 flex-1 basis-40">
          <Eyebrow>{greeting()}<span className="hidden sm:inline"> · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span></Eyebrow>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">{author ? `${author.name.split(' ')[0]}'s daily brief` : 'Daily brief'}</h2>
          {brief ? <p className="text-xs text-muted-foreground">{author?.title} · written {ago(brief.created_at)}</p> : null}
        </div>
        {brief && !brief.read_at ? <Btn tone="soft" onClick={() => onSend.markUpdateRead([brief.id])}><Check className="h-4 w-4" />Got it</Btn> : brief ? <Chip tone="ok">Read</Chip> : null}
      </div>
      {brief ? <Prose text={brief.body} lines={9} className="mt-4 max-w-3xl [&_p]:text-[15px]" /> : (
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">No brief yet. Your CFO writes one each morning after the stand-up; ask for one now and it will be here when they have it.</p>
      )}
      {author ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Textarea aria-label={`Message ${author.name.split(' ')[0]}`} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={brief ? `Reply to ${author.name.split(' ')[0]}, or ask a follow-up…` : `Ask ${author.name.split(' ')[0]} for today's brief…`} className="min-h-10 flex-1 resize-none bg-background"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) onSend.send(author.id, text.trim(), 'brief', () => setText('')); } }} />
          <Btn tone="go" disabled={!text.trim() || onSend.sending} onClick={() => onSend.send(author.id, text.trim(), 'brief', () => setText(''))}><Send className="h-4 w-4" />Send</Btn>
        </div>
      ) : null}
    </HqCard>
  );
}

function Pulse({ agents, onOpen }: { agents: CrewAgent[]; onOpen: (a: CrewAgent) => void }) {
  const runs = useLatestRuns();
  const paused = usePausedIds();
  return (
    <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" aria-label="The team">
      {agents.map((a) => {
        const isPaused = paused.has(a.id);
        const last = runs.byAgent.get(a.id) ?? a.last_seen_at;
        return (
          <li key={a.id} className="shrink-0">
            <button type="button" onClick={() => onOpen(a)} aria-label={`${a.name}, ${isPaused ? 'paused' : a.status}. Open profile`} className="hq-focus hq-card hq-card-flat hq-interactive flex w-[9.5rem] flex-col items-center gap-2 p-3 text-center">
              <Face agent={a} size={48} paused={isPaused} />
              <span className="min-w-0 max-w-full"><span className="block truncate text-sm font-bold">{a.name.split(' ')[0]}</span><span className="block truncate text-[11px] text-muted-foreground">{a.title}</span></span>
              {isPaused ? <Chip>Paused</Chip> : <Chip tone={a.status === 'idle' ? 'ok' : a.status === 'waiting_approval' ? 'warn' : a.status === 'offline' ? 'neutral' : a.status === 'meeting' ? 'meet' : 'signal'}>{STATUS_WORD[a.status] ?? a.status}</Chip>}
              <span className="text-[11px] text-muted-foreground">{last ? `Last run ${ago(last)}` : 'No runs yet'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TodayView({ data, onNavigate, onOpenAgent }: { data: HqData; onNavigate: Navigate; onOpenAgent: (a: CrewAgent) => void }) {
  const actions = useHqActions(data.agents);
  const paused = usePausedIds();
  const channel = useCrewChannel();
  const stuck = useMemo(() => computeHandoffs(channel.data ?? [], Date.now()).filter((h) => h.stuck), [channel.data]);
  const busy = data.agents.filter(isBusy);
  const decisions = data.proposalsWaiting + data.ordersChallenged;
  const top = data.items.slice(0, 3);

  if (data.loading) return <LoadingRows rows={4} label="Loading today" />;
  return (
    <div className="space-y-8">
      {data.error ? <ErrorState message={data.error} /> : null}
      <Brief data={data} onSend={actions} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        <Tile label="Decisions waiting" value={decisions} sub={decisions ? 'Proposals and challenged orders' : 'Nothing to approve'} tone={decisions ? 'risk' : 'ok'} onClick={() => onNavigate('decisions')} />
        <Tile label="Questions" value={data.questionsOpen} sub={data.questionsOpen ? 'Agents waiting for your answer' : 'No one is waiting on you'} tone={data.questionsOpen ? 'warn' : 'ok'} onClick={() => onNavigate('decisions')} />
        <Tile label="Agents working" value={`${busy.length}/${data.agents.length}`} sub={busy.length ? busy.slice(0, 3).map((a) => a.name.split(' ')[0]).join(', ') + (busy.length > 3 ? '…' : '') : 'The team is idle'} tone={busy.length ? 'signal' : undefined} onClick={() => onNavigate('agents')} />
        <Tile label="Hand-offs stuck" value={stuck.length} sub={stuck.length ? 'Unanswered for over 30 minutes' : 'Nothing stuck between agents'} tone={stuck.length ? 'risk' : 'ok'} onClick={() => onNavigate('work', { sub: 'handoffs' })} />
      </div>

      <Section title="Team pulse" hint="Every agent, live. Click one for their profile.">
        {data.agents.length === 0 ? <EmptyState title="No agents yet" /> : <Pulse agents={data.agents} onOpen={onOpenAgent} />}
      </Section>

      <Section title="Most urgent" hint={top.length ? 'The first three of your stack, most urgent first.' : undefined}
        action={data.items.length > 3 ? <Btn tone="soft" onClick={() => onNavigate('decisions')}>See all {data.items.length}</Btn> : undefined}>
        {top.length === 0 ? <EmptyState title="All clear">When an agent needs a decision or an answer it will show here first.</EmptyState> : (
          <div className="grid gap-4 xl:grid-cols-1">
            {top.map((i) => <DecisionCard key={i.id} item={i} byId={data.byId} actions={actions} paused={paused} stateOf={data.stateOf} compact onOpen={() => onNavigate('decisions', { focus: i.id })} />)}
          </div>
        )}
      </Section>

      {data.updates.length ? (
        <Section title="Updates" hint="Alerts, reports and reminders. Read, then say got it."
          action={data.updates.length > 1 ? <Btn tone="soft" onClick={() => actions.markUpdateRead(data.updates.map((m) => m.id))}>Got it on all {data.updates.length}</Btn> : undefined}>
          <ul className="space-y-2">
            {data.updates.slice(0, 5).map((m) => {
              const a = m.from_agent ? data.byId.get(m.from_agent) : undefined;
              return (
                <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
                  {a ? <Face agent={a} size={32} paused={paused.has(a.id)} /> : null}
                  <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">{a?.name.split(' ')[0]}</span><Chip tone={m.kind === 'alert' || m.kind === 'challenge' ? 'risk' : 'neutral'}>{m.kind}</Chip>{ago(m.created_at)}</p><Prose text={m.body} lines={3} className="mt-1" /></div>
                  <Btn tone="soft" onClick={() => actions.markUpdateRead([m.id])} aria-label="Got it"><Check className="h-4 w-4" /></Btn>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
