import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Gavel, Send, Users } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, CrewMeeting, CrewMeetingMember, CrewMessage, MeetingStatus } from '../crewDb';
import { useCallMeeting, useCrewAgents, useCrewMeetingLines, useCrewMeetingMembers, useCrewMeetings, useMeetingEnd, useMeetingSay } from '../useCrew';
import { ago } from '../helpers';

/**
 * Live agent meetings, on the same dark slate panel as the Command Center cards. The owner calls a meeting (a topic, some context, 2 to 8 executives, a chair),
 * watches the agents discuss it, can speak or end it, and reads the minutes. A meeting changes nothing: whatever an agent wants to change still arrives as a
 * proposal for the owner to approve.
 */

const MAX_PEOPLE = 8;

const STATUS_BADGE: Record<MeetingStatus, { label: string; tone: string }> = {
  open: { label: 'Live', tone: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  summarising: { label: 'Writing minutes', tone: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  closed: { label: 'Closed', tone: 'bg-muted text-foreground/80' },
};

function StatusBadge({ status }: { status: MeetingStatus }) {
  const b = STATUS_BADGE[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', b.tone)}>
      {status === 'open' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden /> : null}
      {b.label}
    </span>
  );
}

function Btn({ tone = 'ghost', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'go' | 'stop' | 'ghost' }) {
  return (
    <button
      type="button"
      {...p}
      className={cn(
        'rounded-md px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'go' && 'bg-primary text-primary-foreground hover:bg-primary/90', tone === 'stop' && 'bg-muted text-foreground hover:bg-muted/70', tone === 'ghost' && 'text-foreground/80 hover:bg-muted',
        className,
      )}
    />
  );
}

const firstName = (a?: CrewAgent) => a?.name.split(' ')[0] ?? 'Someone';
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Face({ agent, size = 40 }: { agent?: CrewAgent; size?: number }) {
  return agent ? <AvatarFace avatar={agentAvatar(agent)} size={size} /> : <span className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size }} aria-hidden />;
}

// ── (a) call a meeting ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function CallForm({ agents, onCalled, initialTopic = '' }: { agents: CrewAgent[]; onCalled: (id: string) => void; initialTopic?: string }) {
  const { toast } = useToast();
  const call = useCallMeeting();
  const [topic, setTopic] = useState(initialTopic);
  const [brief, setBrief] = useState('');
  const [chosen, setChosen] = useState<string[] | null>(null);   // null = nobody ticked yet: the CFO is the starting point
  const [chairPick, setChairPick] = useState('');
  const cfo = agents.find((a) => a.slug === 'cfo');
  const picked = chosen ?? (cfo ? [cfo.id] : []);
  const chair = picked.includes(chairPick) ? chairPick : cfo && picked.includes(cfo.id) ? cfo.id : picked[0] ?? '';
  const full = picked.length >= MAX_PEOPLE;
  const ready = topic.trim().length >= 3 && picked.length >= 2 && !!chair && !call.isPending;

  const toggle = (id: string) => setChosen(picked.includes(id) ? picked.filter((x) => x !== id) : full ? picked : [...picked, id]);
  const submit = () => {
    if (!ready) return;
    call.mutate({ topic, brief, agents: picked, chair }, {
      onSuccess: (id) => {
        setTopic(''); setBrief(''); setChosen(null); setChairPick('');
        toast({ title: 'Meeting called', description: 'The executives are being woken. Each reads the topic and speaks once per round; it can take a few minutes to start.' });
        onCalled(id);
      },
      onError: (e) => toast({ title: 'Meeting not called', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <form className="rounded-xl border border-border bg-card p-4 shadow-lg" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><Users className="h-4 w-4 text-primary" aria-hidden />Call a meeting</h2>
      <p className="mt-1 text-xs text-muted-foreground">They discuss it on their own (two short rounds), then the chair writes the minutes. Nothing is changed in a meeting: anything they want to change comes to you as a proposal.</p>

      <label htmlFor="meeting-topic" className="mt-3 block text-xs font-semibold text-foreground/80">Topic</label>
      <input id="meeting-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="What should they discuss or decide?"
        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />

      <label htmlFor="meeting-context" className="mt-3 block text-xs font-semibold text-foreground/80">Context from you <span className="font-normal text-muted-foreground">(optional)</span></label>
      <Textarea id="meeting-context" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={3000} rows={3} placeholder="Anything they should know before they start: numbers, deadlines, what you lean towards."
        className="mt-1 border-border bg-background text-foreground placeholder:text-muted-foreground" />

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-foreground/80">Who takes part <span className="font-normal text-muted-foreground">({picked.length} of {MAX_PEOPLE}; at least 2)</span></legend>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {agents.map((a) => {
            const on = picked.includes(a.id);
            const disabled = !on && full;
            return (
              <label key={a.id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition', on ? 'border-sky-500/60 bg-sky-500/10' : 'border-border bg-muted/60 hover:bg-muted', disabled && 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(a.id)} className="h-4 w-4 shrink-0 accent-sky-500" />
                <Face agent={a} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{a.name}</span><span className="block truncate text-xs text-primary">{a.title}</span></span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label htmlFor="meeting-chair" className="mt-3 block text-xs font-semibold text-foreground/80">Chair (writes the minutes)</label>
      <select id="meeting-chair" value={chair} onChange={(e) => setChairPick(e.target.value)} disabled={picked.length === 0}
        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:min-w-[16rem]">
        {picked.length === 0 ? <option value="">Pick people first</option> : null}
        {agents.filter((a) => picked.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name}: {a.title}</option>)}
      </select>

      <div className="mt-4"><Btn type="submit" tone="go" disabled={!ready}>{call.isPending ? 'Calling…' : 'Call meeting'}</Btn></div>
    </form>
  );
}

// ── (b) the list and the live transcript ────────────────────────────────────────────────────────────────────────────────────────────────────────
function MeetingList({ meetings, selectedId, onSelect }: { meetings: CrewMeeting[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="space-y-1.5" aria-label="Meetings">
      {meetings.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => onSelect(m.id)} aria-current={m.id === selectedId ? 'true' : undefined}
            className={cn('w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', m.id === selectedId ? 'border-sky-500/60 bg-sky-500/10' : 'border-border bg-card hover:bg-muted')}>
            <span className="flex flex-wrap items-center gap-2"><StatusBadge status={m.status} /><span className="text-[11px] text-muted-foreground">{ago(m.created_at)}</span></span>
            <span className="mt-1 line-clamp-2 block text-sm font-semibold text-foreground">{m.topic}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bubble({ line, agent, mine }: { line: CrewMessage; agent?: CrewAgent; mine: boolean }) {
  return (
    <li className={cn('flex gap-3', mine && 'flex-row-reverse')}>
      {mine ? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-foreground" aria-hidden>You</span> : <Face agent={agent} />}
      <div className={cn('min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5', mine ? 'rounded-tr-sm bg-sky-600/30 ring-1 ring-sky-500/40' : 'rounded-tl-sm bg-muted')}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
          <span className="text-sm font-bold text-foreground">{mine ? 'You' : firstName(agent)}</span>
          {!mine ? <span className="text-primary">{agent?.title ?? ''}</span> : null}
          {line.meeting_round ? <span>round {line.meeting_round}</span> : null}
          <time dateTime={line.created_at} title={new Date(line.created_at).toLocaleString()}>{clock(line.created_at)}</time>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground">{line.body}</p>
      </div>
    </li>
  );
}

function Minutes({ meeting, byId, bySlug }: { meeting: CrewMeeting; byId: Map<string, CrewAgent>; bySlug: Map<string, CrewAgent> }) {
  const mins = meeting.minutes;
  const chair = byId.get(meeting.chair_agent);
  const perAgent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of mins?.action_items ?? []) m.set(it.agent, [...(m.get(it.agent) ?? []), it.task]);
    return [...m.entries()];
  }, [mins]);
  if (!mins) return null;
  return (
    <section className="rounded-xl border border-emerald-500/30 bg-card p-4" aria-label="Minutes">
      <h3 className="flex items-center gap-2 text-base font-bold text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden />Minutes<span className="text-xs font-normal text-muted-foreground">by {firstName(chair)}{meeting.closed_at ? `, ${ago(meeting.closed_at)}` : ''}</span></h3>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{mins.summary}</p>

      {mins.decisions.length > 0 ? (
        <div className="mt-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Decisions</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">{mins.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
      ) : null}

      {mins.needs_owner.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Needs your decision</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">{mins.needs_owner.map((d, i) => <li key={i}>{d}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">If a decision means a change, the executive will put it in your To-Do tab as a proposal. Nothing is done until you approve it there.</p>
        </div>
      ) : null}

      {perAgent.length > 0 ? (
        <div className="mt-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-primary">Action items</h4>
          <ul className="mt-2 space-y-2">
            {perAgent.map(([slug, tasks]) => {
              const a = bySlug.get(slug);
              return (
                <li key={slug} className="flex items-start gap-3 rounded-lg bg-muted/60 p-2.5">
                  <Face agent={a} size={32} />
                  <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{a?.name ?? slug}<span className="ml-2 text-xs font-normal text-primary">{a?.title ?? ''}</span></p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sm text-foreground">{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                </li>
              );
            })}
          </ul></div>
      ) : null}
    </section>
  );
}

function MeetingView({ meeting, agents }: { meeting: CrewMeeting; agents: CrewAgent[] }) {
  const { toast } = useToast();
  const live = meeting.status !== 'closed';
  const lines = useCrewMeetingLines(meeting.id, live);
  const members = useCrewMeetingMembers(meeting.id, live);
  const say = useMeetingSay();
  const end = useMeetingEnd();
  const [text, setText] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const bySlug = useMemo(() => new Map(agents.map((a) => [a.slug, a])), [agents]);
  const rows: CrewMessage[] = lines.data ?? [];
  const mem: CrewMeetingMember[] = members.data ?? [];
  const waiting = meeting.status === 'open' ? mem.filter((m) => m.spoke_round < meeting.round).map((m) => firstName(byId.get(m.agent_id))) : [];
  const chair = byId.get(meeting.chair_agent);

  // keep the newest line in view, unless the owner scrolled up to read
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [rows.length]);

  const send = () => {
    if (!text.trim()) return;
    say.mutate({ meetingId: meeting.id, body: text }, {
      onSuccess: () => { setText(''); stick.current = true; },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };
  const finish = () => end.mutate(meeting.id, {
    onSuccess: () => { setConfirmEnd(false); toast({ title: 'Meeting ended', description: `${firstName(chair)} is asked to write the minutes.` }); },
    onError: (e) => toast({ title: 'Could not end it', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={meeting.status} /><span className="text-xs text-muted-foreground">{meeting.status === 'open' ? `Round ${meeting.round} of ${meeting.max_rounds}` : null} chaired by {firstName(chair)}, called {ago(meeting.created_at)}</span></div>
        <h2 className="mt-2 text-lg font-bold text-foreground">{meeting.topic}</h2>
        {meeting.brief ? <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80"><span className="font-semibold text-foreground">Your context: </span>{meeting.brief}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Members">
          {mem.map((m) => <span key={m.agent_id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-xs text-foreground"><Face agent={byId.get(m.agent_id)} size={20} />{firstName(byId.get(m.agent_id))}</span>)}
        </div>
      </div>

      <div ref={box} role="log" aria-live="polite" aria-label="Meeting transcript" tabIndex={0}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="max-h-[60vh] min-h-[8rem] overflow-y-auto rounded-xl border border-border bg-muted/60 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {rows.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">{live ? 'Nobody has spoken yet. The executives are being woken and read the topic first; the first lines usually appear within a few minutes.' : 'Nothing was said in this meeting.'}</p> : (
          <ul className="space-y-3">{rows.map((l) => <Bubble key={l.id} line={l} agent={l.from_agent ? byId.get(l.from_agent) : undefined} mine={l.from_agent === null} />)}</ul>
        )}
      </div>

      {meeting.status === 'open' && waiting.length > 0 ? <p className="text-sm text-foreground/80"><span className="font-semibold text-foreground">Waiting for:</span> {waiting.join(', ')}</p> : null}
      {meeting.status === 'open' && waiting.length === 0 && mem.length > 0 ? <p className="text-sm text-muted-foreground">Everyone has spoken this round. The next step starts within a minute.</p> : null}
      {meeting.status === 'summarising' ? <p className="text-sm text-amber-700 dark:text-amber-300">Waiting for {firstName(chair)} to write the minutes.</p> : null}

      {live ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <label htmlFor="meeting-say" className="text-xs font-semibold text-foreground/80">Speak in the meeting</label>
          <Textarea id="meeting-say" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Add a point, answer a question or redirect them. They read it at the next round."
            className="mt-1 border-border bg-background text-foreground placeholder:text-muted-foreground" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Btn tone="go" onClick={send} disabled={!text.trim() || say.isPending}><Send className="mr-1 inline h-4 w-4" aria-hidden />Send</Btn>
            <span className="text-[11px] text-muted-foreground">Ctrl+Enter sends</span>
            {meeting.status === 'open' ? (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {confirmEnd ? (
                  <>
                    <span className="text-xs text-foreground/80">Stop now and ask {firstName(chair)} for the minutes?</span>
                    <Btn tone="stop" onClick={finish} disabled={end.isPending}>Yes, end it</Btn>
                    <Btn onClick={() => setConfirmEnd(false)}>Keep going</Btn>
                  </>
                ) : <Btn tone="stop" onClick={() => setConfirmEnd(true)}><Gavel className="mr-1 inline h-4 w-4" aria-hidden />End meeting</Btn>}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {meeting.status === 'closed' ? <Minutes meeting={meeting} byId={byId} bySlug={bySlug} /> : null}
    </div>
  );
}

export function MeetingsTab({ initialTopic }: { initialTopic?: string } = {}) {
  const agents = useCrewAgents();
  const meetings = useCrewMeetings();
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => {
    const rank = (s: MeetingStatus) => (s === 'closed' ? 1 : 0);   // running ones first, then newest first
    return [...(meetings.data ?? [])].sort((a, b) => rank(a.status) - rank(b.status) || b.created_at.localeCompare(a.created_at));
  }, [meetings.data]);
  const selected = list.find((m) => m.id === sel) ?? list[0] ?? null;
  const team = agents.data ?? [];

  return (
    <div className="space-y-4 text-foreground">
      <CallForm key={initialTopic ?? ''} agents={team} onCalled={setSel} initialTopic={initialTopic} />
      {meetings.isError ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">Meetings could not be loaded: {meetings.error.message}</p> : null}
      {!meetings.isLoading && !meetings.isError && list.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No meetings yet. Call one above.</p> : null}
      {list.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <MeetingList meetings={list} selectedId={selected?.id ?? null} onSelect={setSel} />
          {selected ? <MeetingView key={selected.id} meeting={selected} agents={team} /> : null}
        </div>
      ) : null}
    </div>
  );
}
