import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, CrewMessage } from '../crewDb';
import { useCrewAgents, useCrewChannel } from '../useCrew';
import { ago } from '../helpers';

const KIND_TONE: Record<string, string> = {
  question: 'bg-sky-500/20 text-sky-300', alert: 'bg-red-500/20 text-red-300', report: 'bg-emerald-500/20 text-emerald-300',
  challenge: 'bg-orange-500/20 text-orange-300', brief: 'bg-violet-500/20 text-violet-300', reminder: 'bg-amber-500/20 text-amber-300',
};
const WAITING_SLOW_MS = 30 * 60_000;

interface Handoff { m: CrewMessage; from?: CrewAgent; to?: CrewAgent; answeredAt: string | null }

function Face({ a }: { a?: CrewAgent }) {
  return a ? <AvatarFace avatar={agentAvatar(a)} size={40} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-slate-700" />;
}

/**
 * The hand-off feed: every time one agent hands work, a question, a report or a challenge to another, who to whom, what, and whether the other one
 * has answered yet. It shows you where work is stuck between agents before it costs you. Read-only; built from the messages between agents.
 */
export function HandoffsTab() {
  const channel = useCrewChannel();
  const agents = useCrewAgents();
  const [who, setWho] = useState('');
  const [onlyWaiting, setOnlyWaiting] = useState(false);

  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);
  const all = useMemo(() => {
    const msgs = (channel.data ?? []).filter((m) => m.from_agent && m.to_agent);
    return msgs.map<Handoff>((m) => {
      const answer = msgs.filter((x) => x.from_agent === m.to_agent && x.to_agent === m.from_agent && x.created_at > m.created_at).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return { m, from: byId.get(m.from_agent!), to: byId.get(m.to_agent!), answeredAt: answer?.created_at ?? null };
    }).sort((a, b) => b.m.created_at.localeCompare(a.m.created_at));
  }, [channel.data, byId]);

  // a reply or a plain report closes nothing: only the first reply back counts as an answer, and a "report" needs none
  const needsAnswer = (h: Handoff) => h.m.kind !== 'report' && h.m.kind !== 'reply';
  const waiting = all.filter((h) => needsAnswer(h) && !h.answeredAt);
  const slow = waiting.filter((h) => Date.now() - new Date(h.m.created_at).getTime() > WAITING_SLOW_MS);
  const dayAgo = Date.now() - 86400_000;
  const today = all.filter((h) => new Date(h.m.created_at).getTime() > dayAgo);
  const times = all.filter((h) => h.answeredAt).map((h) => new Date(h.answeredAt!).getTime() - new Date(h.m.created_at).getTime());
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60_000) : null;

  const shown = all.filter((h) => (!who || h.m.from_agent === who || h.m.to_agent === who) && (!onlyWaiting || (needsAnswer(h) && !h.answeredAt))).slice(0, 80);
  const active = (agents.data ?? []).filter((a) => a.active);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {[['Hand-offs in 24 h', String(today.length), 'text-white'], ['Waiting for an answer', String(waiting.length), waiting.length ? 'text-amber-300' : 'text-white'], ['Stuck over 30 min', String(slow.length), slow.length ? 'text-red-300' : 'text-white'], ['Average answer time', avgMin === null ? '–' : `${avgMin} min`, 'text-white']].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg bg-slate-900 p-3"><p className="text-[11px] text-slate-400">{label}</p><p className={cn('text-xl font-bold', tone)}>{value}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show hand-offs of" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-white">
          <option value="">Everyone</option>
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />Only the ones still waiting</label>
      </div>
      {shown.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No hand-offs yet. When one agent passes work, a question or a challenge to another, it shows up here with who answered and how fast.</p> : null}
      {shown.map((h) => {
        const open = needsAnswer(h) && !h.answeredAt;
        const age = Date.now() - new Date(h.m.created_at).getTime();
        return (
          <div key={h.m.id} className={cn('rounded-xl border bg-slate-900 p-4', open && age > WAITING_SLOW_MS ? 'border-red-400/60' : open ? 'border-amber-400/40' : 'border-slate-700')}>
            <div className="flex items-center gap-3">
              <Face a={h.from} />
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
              <Face a={h.to} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm"><span className="font-bold text-white">{h.from?.name.split(' ')[0] ?? 'Someone'}</span><span className="text-slate-400"> handed to </span><span className="font-bold text-white">{h.to?.name.split(' ')[0] ?? 'someone'}</span></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide', KIND_TONE[h.m.kind] ?? 'bg-slate-600/40 text-slate-200')}>{h.m.kind}</span>
                  <span>{ago(h.m.created_at)}</span>
                </p>
              </div>
              {needsAnswer(h) ? (
                h.answeredAt
                  ? <span className="shrink-0 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">Answered {ago(h.answeredAt)}</span>
                  : <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', age > WAITING_SLOW_MS ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300')}>Waiting for {h.to?.name.split(' ')[0] ?? 'them'}</span>
              ) : null}
            </div>
            <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-200">{h.m.body}</p>
          </div>
        );
      })}
    </div>
  );
}
