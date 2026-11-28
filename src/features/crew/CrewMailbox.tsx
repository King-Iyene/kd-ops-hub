import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Mail, MessageSquare, Search, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, CrewMessage, CrewProposal } from './crewDb';
import { useCrewAgents, useCrewAttention, useCrewInbox, useCrewMistakes, useCrewOrders, useCrewProposals, useCrewRuns, useCrewSettings, useDecideProposal, useMarkRead, useSay } from './useCrew';
import { approveLabel, buildOrgTree, describeAction, riskOrder, STATUS_LABEL, type OrgNode } from './orgChart';
import { RiskBadge } from './components/shared';
import { ago } from './helpers';
import { OrdersTab } from './components/OrdersTab';
import { ChannelTab } from './components/ChannelTab';
import { HandoffsTab } from './components/HandoffsTab';

export const OPEN_MAILBOX = 'crew-open-mailbox';

/** Opens the Command Center from anywhere (a pop-up, a link, the mailbox in the office), optionally on one message. */
export function openMailbox(messageId?: string) { window.dispatchEvent(new CustomEvent(OPEN_MAILBOX, { detail: { id: messageId ?? null } })); }

const KIND_LABEL: Record<string, string> = {
  question: 'Question for you', alert: 'Alert', brief: 'Briefing', report: 'Report', reminder: 'Reminder', challenge: 'Challenge', reply: 'Reply', message: 'Message',
};
const KIND_TONE: Record<string, string> = {
  question: 'bg-sky-500/20 text-sky-300', alert: 'bg-red-500/20 text-red-300', brief: 'bg-violet-500/20 text-violet-300', report: 'bg-emerald-500/20 text-emerald-300',
  reminder: 'bg-amber-500/20 text-amber-300', challenge: 'bg-orange-500/20 text-orange-300',
};

const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** One long text: four lines, with "Show more" for the rest. */
function Detail({ text, className }: { text: string; className?: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 280 || text.split('\n').length > 4;
  return (
    <div className={className}>
      <p className={cn('whitespace-pre-wrap text-[14px] leading-relaxed text-slate-200', long && !more && 'line-clamp-4')}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setMore(!more)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:underline">
          {more ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show more</>}
        </button>
      ) : null}
    </div>
  );
}

function Who({ agent, kind, tone, at, extra }: { agent?: CrewAgent; kind: string; tone: string; at: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {agent ? <AvatarFace avatar={agentAvatar(agent)} size={48} /> : <span className="h-12 w-12 shrink-0 rounded-full bg-slate-700" />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-base font-bold text-white">{agent?.name.split(' ')[0] ?? 'An executive'}</span><span className="truncate text-xs text-sky-300">{agent?.title ?? ''}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide', tone)}>{kind}</span>
          <span>{ago(at)}</span>{extra}
        </p>
      </div>
    </div>
  );
}

function Btn({ tone = 'ghost', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'go' | 'stop' | 'ghost' }) {
  return (
    <button type="button" {...p} className={cn('rounded-md px-4 py-2 text-sm font-bold transition disabled:opacity-50', tone === 'go' && 'bg-sky-500 text-white hover:bg-sky-400', tone === 'stop' && 'bg-slate-700 text-slate-100 hover:bg-slate-600', tone === 'ghost' && 'text-slate-300 hover:bg-slate-800', className)} />
  );
}

/** "Remind me later": hides a card until a time you pick. Kept in this browser only (a convenience, not shared state). */
const SNOOZE_KEY = 'crew-snooze';
function useSnooze() {
  const [map, setMap] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>; } catch { return {}; } });
  const save = (m: Record<string, number>) => { setMap(m); try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(m)); } catch { /* private window: it simply resets */ } };
  return {
    snooze: (id: string, until: number) => save({ ...map, [id]: until }),
    wake: (id: string) => { const m = { ...map }; delete m[id]; save(m); },
    isSnoozed: (id: string) => (map[id] ?? 0) > Date.now(),
  };
}
function tomorrow8() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.getTime(); }

function Later({ onPick }: { onPick: (until: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Btn onClick={() => setOpen(true)}>Remind me later</Btn>;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 p-1 text-xs">
      <button type="button" className="rounded px-2 py-1 font-semibold text-slate-100 hover:bg-slate-700" onClick={() => onPick(Date.now() + 3600_000)}>1 hour</button>
      <button type="button" className="rounded px-2 py-1 font-semibold text-slate-100 hover:bg-slate-700" onClick={() => onPick(tomorrow8())}>Tomorrow 8am</button>
      <button type="button" className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

/** Talk back to the agent about one thing: a challenge on a proposal, or a reply to a message. */
function Say({ agentId, placeholder, prefix, onSent, label = 'Send' }: { agentId: string; placeholder: string; prefix?: string; onSent?: () => void; label?: string }) {
  const { toast } = useToast();
  const say = useSay();
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    say.mutate({ agentId, body: (prefix ? prefix + ' ' : '') + text.trim() }, {
      onSuccess: () => { setText(''); toast({ title: 'Sent', description: 'They will read it and answer.' }); onSent?.(); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };
  return (
    <div className="mt-3 rounded-lg bg-slate-950/60 p-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={placeholder} className="border-slate-700 bg-slate-900 text-slate-100" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
      <div className="mt-2 flex items-center gap-2"><Btn tone="go" onClick={send} disabled={!text.trim() || say.isPending}><Send className="mr-1 inline h-4 w-4" />{label}</Btn><span className="text-[11px] text-slate-500">Ctrl+Enter sends</span></div>
    </div>
  );
}

/** A proposal that waits for the owner: who, what, why, the evidence, and the buttons. A hire reads like a candidate interview. */
function ProposalCard({ p, agent, byId, onLater, thread }: { p: CrewProposal; agent?: CrewAgent; byId: Map<string, CrewAgent>; onLater: (until: number) => void; thread?: CrewMessage[] }) {
  const { toast } = useToast();
  const decide = useDecideProposal();
  const [mode, setMode] = useState<null | 'challenge' | 'reject'>(null);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState(false);
  const hire = p.action === 'agent.hire';
  const retire = p.action === 'agent.retire';
  const pay = p.payload as Record<string, unknown>;
  const target = retire ? [...byId.values()].find((a) => a.slug === pay.agent) : undefined;
  const ev = Object.entries(p.evidence ?? {}).slice(0, 10);
  const go = () => decide.mutate({ id: p.id, decision: 'approve' }, {
    onSuccess: (r) => (r?.error ? toast({ title: 'Approved, but it did not apply', description: r.error, variant: 'destructive' }) : toast({ title: hire ? 'Hired' : 'Approved', description: 'It is done.' })),
    onError: (e) => toast({ title: 'Could not approve', description: e.message, variant: 'destructive' }),
  });
  const no = () => decide.mutate({ id: p.id, decision: 'reject', note }, {
    onSuccess: () => toast({ title: hire ? 'Passed' : 'Not needed', description: 'They will be told.' }),
    onError: (e) => toast({ title: 'Could not reject', description: e.message, variant: 'destructive' }),
  });
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
      <Who agent={agent} kind={hire ? 'Hiring candidate' : retire ? 'Letting someone go' : 'Needs your approval'} tone={hire ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-amber-500/20 text-amber-300'} at={p.created_at}
        extra={<><span>{describeAction(p.action)}</span><RiskBadge risk={p.risk} />{p.remind_count > 0 ? <span className="text-amber-300">reminded {p.remind_count}×</span> : null}</>} />
      <p className="mt-3 text-[15px] font-semibold text-white">{p.summary}</p>
      {hire ? (
        <div className="mt-2 rounded-lg bg-fuchsia-500/10 p-3 text-sm text-slate-200">
          <p className="font-bold text-fuchsia-200">Candidate: {str(pay.name ?? '')}{pay.role ? ` · ${str(pay.role)}` : ''}</p>
          <p className="text-xs text-slate-400">{pay.replaces ? `Replaces ${str(pay.replaces)}` : pay.reports_to ? `Would report to ${str(pay.reports_to)}` : ''}</p>
        </div>
      ) : null}
      {hire && thread && thread.length ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-950/60 p-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">The interview so far</p>
          {thread.map((m) => <div key={m.id} className={cn('rounded-lg p-2 text-[13px]', m.from_agent ? 'bg-slate-800 text-slate-100' : 'ml-8 bg-sky-900/50 text-sky-50')}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[10px] text-slate-400">{m.from_agent ? (agent?.name.split(' ')[0] ?? 'Them') : 'You'} · {ago(m.created_at)}</p></div>)}
        </div>
      ) : null}
      {retire && target ? <div className="mt-2 rounded-lg bg-red-500/10 p-3 text-sm text-slate-200"><span className="font-bold text-red-200">{target.name}</span> · {target.title}{pay.reason ? <p className="mt-1 text-xs text-slate-400">{str(pay.reason)}</p> : null}</div> : null}
      {p.rationale ? <><p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Why</p><Detail text={p.rationale} /></> : null}
      {ev.length ? (
        <div className="mt-2">
          <button type="button" onClick={() => setEvidence(!evidence)} className="text-xs font-semibold text-sky-300 hover:underline">{evidence ? 'Hide' : 'Show'} the evidence ({ev.length})</button>
          {evidence ? <dl className="mt-1 grid gap-1 rounded-lg bg-slate-950/60 p-2 text-xs">{ev.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="shrink-0 font-semibold text-slate-400">{k}</dt><dd className="min-w-0 break-words text-slate-200">{str(v).slice(0, 300)}</dd></div>)}</dl> : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn tone="go" disabled={decide.isPending} onClick={go}><Check className="mr-1 inline h-4 w-4" />{hire ? 'Hire' : approveLabel(p.action)}</Btn>
        <Btn tone="stop" disabled={decide.isPending} onClick={() => setMode(mode === 'reject' ? null : 'reject')}><X className="mr-1 inline h-4 w-4" />{hire ? 'Pass' : 'Not needed'}</Btn>
        <Btn onClick={() => setMode(mode === 'challenge' ? null : 'challenge')}><MessageSquare className="mr-1 inline h-4 w-4" />{hire ? 'Ask them a question' : 'Challenge'}</Btn>
        <Later onPick={onLater} />
      </div>
      {mode === 'reject' ? (
        <div className="mt-3 rounded-lg bg-slate-950/60 p-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why not? They learn from it (optional)" className="border-slate-700 bg-slate-900 text-slate-100" />
          <div className="mt-2"><Btn tone="stop" onClick={no} disabled={decide.isPending}>{hire ? 'Confirm pass' : 'Confirm: not needed'}</Btn></div>
        </div>
      ) : null}
      {mode === 'challenge' ? <Say agentId={p.agent_id} prefix={`About your proposal "${p.summary.slice(0, 80)}":`} placeholder={hire ? 'Ask the candidate or their manager: is this really needed as a whole new agent?' : 'Push back, ask for more evidence, or change it…'} onSent={() => setMode(null)} /> : null}
    </div>
  );
}

/** A message from an agent: who, what kind, the whole text, and what you can do with it. */
function MessageCard({ m, agent, focus, onLater }: { m: CrewMessage; agent?: CrewAgent; focus: boolean; onLater?: (until: number) => void }) {
  const { toast } = useToast();
  const read = useMarkRead();
  const quickSay = useSay();
  const quick = (t: string) => quickSay.mutate({ agentId: m.from_agent!, body: t }, {
    onSuccess: () => { read.mutate([m.id]); toast({ title: 'Sent: ' + t }); },
    onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
  });
  const [reply, setReply] = useState(false);
  const q = m.kind === 'question';
  return (
    <div className={cn('rounded-xl border bg-slate-900 p-4 shadow-lg', focus ? 'border-sky-400 ring-2 ring-sky-400/40' : 'border-slate-700', m.read_at && 'opacity-80')}>
      <Who agent={agent} kind={KIND_LABEL[m.kind] ?? m.kind} tone={KIND_TONE[m.kind] ?? 'bg-slate-600/40 text-slate-200'} at={m.created_at} />
      <Detail text={m.body} className="mt-3" />
      {q && !m.read_at && m.from_agent ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick answers">
          {['Yes', 'No', 'Not now', 'Tell me more'].map((t) => (
            <button key={t} type="button" disabled={quickSay.isPending} onClick={() => quick(t)} className="rounded-full border border-sky-400/60 px-3 py-1 text-xs font-bold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50">{t}</button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {m.from_agent ? <Btn tone={q ? 'go' : 'stop'} onClick={() => setReply(!reply)}><MessageSquare className="mr-1 inline h-4 w-4" />{q ? 'Answer' : 'Reply'}</Btn> : null}
        {!m.read_at ? <Btn tone={q ? 'stop' : 'go'} disabled={read.isPending} onClick={() => read.mutate([m.id])}><Check className="mr-1 inline h-4 w-4" />{q ? 'Not needed' : 'Got it'}</Btn> : <span className="text-xs text-slate-500">Handled</span>}
        {!m.read_at && onLater ? <Later onPick={onLater} /> : null}
      </div>
      {reply && m.from_agent ? <Say agentId={m.from_agent} placeholder={q ? 'Your answer…' : 'Reply…'} label={q ? 'Send answer' : 'Send'} onSent={() => { setReply(false); if (!m.read_at) read.mutate([m.id]); }} /> : null}
    </div>
  );
}

function AgentRow({ node, depth, inbox, open, onOpen }: { node: OrgNode; depth: number; inbox: CrewMessage[]; open: string | null; onOpen: (id: string | null) => void }) {
  const a = node.agent;
  const thread = useMemo(() => inbox.filter((m) => (m.from_agent === a.id && m.to_owner) || (m.from_agent === null && m.to_agent === a.id)).sort((x, y) => x.created_at.localeCompare(y.created_at)).slice(-6), [inbox, a.id]);
  const isOpen = open === a.id;
  const runs = useCrewRuns(isOpen ? a.id : null);
  const mistakes = useCrewMistakes(isOpen ? a.id : null);
  const lastRun = runs.data?.[0];
  return (
    <>
      <div className={cn('rounded-xl border border-slate-700 bg-slate-900 p-3', depth > 0 && 'ml-6')}>
        <div className="flex items-center gap-3">
          <AvatarFace avatar={agentAvatar(a)} size={depth > 0 ? 40 : 48} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-bold text-white">{a.name}</span><span className="text-xs text-sky-300">{a.title}</span></p>
            <p className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="rounded-full bg-slate-800 px-2 py-0.5">{STATUS_LABEL[a.status] ?? a.status}</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5">{a.department}</span>
              {a.activity ? <span className="truncate">{a.activity}</span> : null}
            </p>
          </div>
          <Btn tone="stop" onClick={() => onOpen(isOpen ? null : a.id)}><MessageSquare className="mr-1 inline h-4 w-4" />Message</Btn>
        </div>
        {isOpen ? (
          <div className="mt-3 border-t border-slate-700 pt-3">
            <div className="mb-3 grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-400">Last run</p><p className="font-semibold text-white">{lastRun ? ago(lastRun.started_at) : 'none yet'}</p></div>
              <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-400">Runs on record</p><p className="font-semibold text-white">{runs.data?.length ?? 0}{(runs.data?.length ?? 0) >= 10 ? '+' : ''}</p></div>
              <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-400">Mistakes logged</p><p className={cn('font-semibold', (mistakes.data?.length ?? 0) > 0 ? 'text-amber-300' : 'text-white')}>{mistakes.data?.length ?? 0}</p></div>
            </div>
            {lastRun?.summary ? <p className="mb-3 rounded-lg bg-slate-800 p-2 text-xs text-slate-300"><span className="font-semibold text-slate-400">What they did last: </span>{lastRun.summary}</p> : null}
            {thread.length === 0 ? <p className="text-xs text-slate-500">No messages with {a.name.split(' ')[0]} yet.</p> : (
              <div className="space-y-2">{thread.map((m) => <div key={m.id} className={cn('rounded-lg p-2 text-[13px]', m.from_agent ? 'bg-slate-800 text-slate-100' : 'ml-8 bg-sky-900/50 text-sky-50')}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[10px] text-slate-400">{m.from_agent ? a.name.split(' ')[0] : 'You'} · {ago(m.created_at)}</p></div>)}</div>
            )}
            <Say agentId={a.id} placeholder={`Tell ${a.name.split(' ')[0]} what to do, or ask…`} />
          </div>
        ) : null}
      </div>
      {node.reports.map((r) => <AgentRow key={r.agent.id} node={r} depth={depth + 1} inbox={inbox} open={open} onOpen={onOpen} />)}
    </>
  );
}

/** Tell an agent something right now, without leaving the list: pick who, type, send. The CFO is picked first. */
function AskBar({ agents }: { agents: CrewAgent[] }) {
  const { toast } = useToast();
  const say = useSay();
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const target = to || agents.find((a) => a.slug === 'cfo')?.id || agents[0]?.id || '';
  const send = () => {
    if (!text.trim() || !target) return;
    say.mutate({ agentId: target, body: text.trim() }, {
      onSuccess: () => { setText(''); toast({ title: 'Sent', description: 'They will read it and answer.' }); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Tell someone something</p>
      <div className="flex flex-wrap gap-2">
        <select value={target} onChange={(e) => setTo(e.target.value)} aria-label="Who to tell" className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-white">
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name.split(' ')[0]} · {a.title}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="e.g. Check this week's income against the emails" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500" />
        <Btn tone="go" onClick={send} disabled={!text.trim() || say.isPending}><Send className="mr-1 inline h-4 w-4" />Send</Btn>
      </div>
    </div>
  );
}

const DOT: Record<string, string> = { working: 'bg-blue-500', thinking: 'bg-violet-500', idle: 'bg-emerald-500', waiting_approval: 'bg-amber-500', walking: 'bg-sky-500', meeting: 'bg-fuchsia-500' };

type Filter = 'all' | 'approvals' | 'questions' | 'alerts' | 'hiring';
const FILTERS: [Filter, string][] = [['all', 'Everything'], ['approvals', 'Approvals'], ['questions', 'Questions'], ['alerts', 'Alerts and briefings'], ['hiring', 'Hiring']];

function CommandCenter({ open, onOpenChange, focusId }: { open: boolean; onOpenChange: (o: boolean) => void; focusId: string | null }) {
  const agents = useCrewAgents();
  const inbox = useCrewInbox(true);
  const waiting = useCrewProposals('waiting');
  const [tab, setTab] = useState<'todo' | 'agents' | 'orders' | 'team' | 'handoffs'>('todo');
  const orders = useCrewOrders();
  const challenged = (orders.data ?? []).filter((o) => o.status === 'challenged').length;
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [talk, setTalk] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  useEffect(() => { if (open && focusId) { setTab('todo'); setFilter('all'); } }, [open, focusId]);

  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);
  const mail = useMemo(() => (inbox.data ?? []).filter((m) => m.to_owner && m.from_agent), [inbox.data]);
  const todoMail = useMemo(() => mail.filter((m) => !m.read_at).sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId) || Number(b.kind === 'question') - Number(a.kind === 'question') || b.created_at.localeCompare(a.created_at)), [mail, focusId]);
  const doneMail = useMemo(() => mail.filter((m) => m.read_at).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30), [mail]);
  const props = useMemo(() => [...(waiting.data ?? [])].sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk) || a.created_at.localeCompare(b.created_at)), [waiting.data]);

  const sn = useSnooze();
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [find, setFind] = useState('');
  const text = find.trim().toLowerCase();
  const hit = (...parts: (string | undefined)[]) => !text || parts.some((x) => (x ?? '').toLowerCase().includes(text));
  const snoozedCount = props.filter((p) => sn.isSnoozed(p.id)).length + todoMail.filter((m) => sn.isSnoozed(m.id)).length;
  const visible = (id: string) => showSnoozed || !sn.isSnoozed(id);
  const shownProps = props.filter((p) => visible(p.id) && hit(p.summary, p.rationale, byId.get(p.agent_id)?.name) && (filter === 'all' || (filter === 'approvals' && !p.action.startsWith('agent.')) || (filter === 'hiring' && p.action.startsWith('agent.'))));
  const shownMail = todoMail.filter((m) => visible(m.id) && hit(m.body, m.from_agent ? byId.get(m.from_agent)?.name : '') && (filter === 'all' || (filter === 'questions' && m.kind === 'question') || (filter === 'alerts' && m.kind !== 'question')));
  const readMany = useMarkRead();
  const noisy = todoMail.filter((m) => m.kind === 'brief' || m.kind === 'report' || m.kind === 'reminder');
  const counts: Record<Filter, number> = {
    all: props.length + todoMail.length,
    approvals: props.filter((p) => !p.action.startsWith('agent.')).length,
    questions: todoMail.filter((m) => m.kind === 'question').length,
    alerts: todoMail.filter((m) => m.kind !== 'question').length,
    hiring: props.filter((p) => p.action.startsWith('agent.')).length,
  };
  const total = counts.all;

  const tree = useMemo(() => buildOrgTree((agents.data ?? []).filter((a) => a.active)), [agents.data]);
  const needle = q.trim().toLowerCase();
  const matches = (n: OrgNode): boolean => !needle || [n.agent.name, n.agent.title, n.agent.department, n.agent.role, n.agent.activity].some((x) => (x ?? '').toLowerCase().includes(needle)) || n.reports.some(matches);
  const active = (agents.data ?? []).filter((a) => a.active);
  const busy = active.filter((a) => a.status === 'working' || a.status === 'thinking').length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-slate-700 bg-slate-950 p-0 text-white sm:max-w-2xl">
        <SheetHeader className="border-b border-slate-800 p-4 text-left">
          <SheetTitle className="text-white">Command Center</SheetTitle>
          <SheetDescription className="sr-only">Everything your executives need from you</SheetDescription>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {([['Waiting', total, total ? 'text-amber-300' : 'text-white'], ['Questions', counts.questions, counts.questions ? 'text-sky-300' : 'text-white'], ['Approvals', counts.approvals, counts.approvals ? 'text-amber-300' : 'text-white'], ['Working now', busy, busy ? 'text-emerald-300' : 'text-white']] as const).map(([l, v, t]) => (
              <div key={l} className="rounded-lg bg-slate-900 p-2"><p className={cn('text-xl font-bold leading-tight', t)}>{v}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{l}</p></div>
            ))}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="The team">
            {active.map((a) => (
              <button key={a.id} type="button" role="listitem" title={a.name + ' · ' + (STATUS_LABEL[a.status] ?? a.status)} onClick={() => { setTab('agents'); setTalk(a.id); }} className="relative shrink-0 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                <AvatarFace avatar={agentAvatar(a)} size={40} />
                <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-slate-950', DOT[a.status] ?? 'bg-slate-500')} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {([['todo', `To-Do (${total})`], ['agents', `Agents (${active.length})`], ['orders', challenged ? `Orders (${challenged} challenged)` : 'Orders'], ['handoffs', 'Hand-offs'], ['team', 'Team channel']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-full px-4 py-1.5 text-sm font-bold transition', tab === k ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>{label}</button>
            ))}
          </div>
          {tab === 'todo' ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FILTERS.map(([k, label]) => <button key={k} type="button" onClick={() => setFilter(k)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', filter === k ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800')}>{label} {counts[k]}</button>)}
            </div>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'todo' ? (
            <div className="space-y-3">
              <AskBar agents={active} />
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search what is waiting: a word, a name…" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500" />
                </div>
                {noisy.length > 1 ? <Btn tone="stop" disabled={readMany.isPending} onClick={() => readMany.mutate(noisy.map((m) => m.id))}>Got it on all {noisy.length} briefings and reports</Btn> : null}
              </div>
              {shownProps.length + shownMail.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">All clear. When an agent needs a decision, an answer or your eyes, it lands here with the full story and buttons.</p> : null}
              {shownProps.map((p) => <ProposalCard key={p.id} p={p} agent={byId.get(p.agent_id)} byId={byId} onLater={(until) => sn.snooze(p.id, until)} thread={p.action === 'agent.hire' ? (inbox.data ?? []).filter((m) => (m.from_agent === p.agent_id && m.to_owner) || (m.from_agent === null && m.to_agent === p.agent_id)).sort((x, y) => x.created_at.localeCompare(y.created_at)).slice(-5) : undefined} />)}
              {shownMail.map((m) => <MessageCard key={m.id} m={m} agent={m.from_agent ? byId.get(m.from_agent) : undefined} focus={m.id === focusId} onLater={(until) => sn.snooze(m.id, until)} />)}
              {snoozedCount > 0 ? <button type="button" onClick={() => setShowSnoozed(!showSnoozed)} className="text-xs font-semibold text-sky-300 hover:underline">{showSnoozed ? 'Hide' : 'Show'} the {snoozedCount} you snoozed</button> : null}
              {doneMail.length ? (
                <div className="pt-2">
                  <button type="button" onClick={() => setHistory(!history)} className="text-xs font-semibold text-sky-300 hover:underline">{history ? 'Hide' : 'Show'} what you have already handled ({doneMail.length})</button>
                  {history ? <div className="mt-2 space-y-3">{doneMail.map((m) => <MessageCard key={m.id} m={m} agent={m.from_agent ? byId.get(m.from_agent) : undefined} focus={false} />)}</div> : null}
                </div>
              ) : null}
            </div>
          ) : tab === 'orders' ? (
            <div className="rounded-xl bg-background p-3 text-foreground"><OrdersTab /></div>
          ) : tab === 'handoffs' ? (
            <HandoffsTab />
          ) : tab === 'team' ? (
            <div className="rounded-xl bg-background p-3 text-foreground"><ChannelTab /></div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, or a job like payroll, income, hiring…" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500" />
              </div>
              {tree.filter(matches).map((n) => <AgentRow key={n.agent.id} node={n} depth={0} inbox={inbox.data ?? []} open={talk} onOpen={setTalk} />)}
            </div>
          )}
        </div>
        <div className="border-t border-slate-800 p-2 text-center"><Button variant="ghost" size="sm" className="text-slate-400 hover:text-white" onClick={() => onOpenChange(false)}>Close</Button></div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The owner's Command Center: the envelope in the top bar and a standing button show how much waits for you; open it and every agent request lands
 * as a card (who, what, why, evidence, buttons), next to the directory of all agents with a chat to each. Nobody else sees it: it is only shown to
 * the owner, and the database returns nothing to anyone else. `headless` keeps the panel, the standing button and the F key working where the top
 * bar is hidden (the full-screen office in the desktop app).
 */
function Mailbox({ headless }: { headless: boolean }) {
  const attention = useCrewAttention(true);
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const count = attention.total;

  useEffect(() => {
    const h = (e: Event) => { setFocusId((e as CustomEvent<{ id: string | null }>).detail?.id ?? null); setOpen(true); };
    window.addEventListener(OPEN_MAILBOX, h);
    return () => window.removeEventListener(OPEN_MAILBOX, h);
  }, []);

  return (
    <>
      {headless ? null : (
        <button type="button" onClick={() => { setFocusId(null); setOpen(true); }} aria-label={`Command Center, ${count} waiting`} title="Command Center: what your executives need from you"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 transition hover:bg-primary/25">
          <Mail className="h-5 w-5" />
          {count > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count > 99 ? '99+' : count}</span> : null}
        </button>
      )}
      {!open && headless ? (
        <button type="button" onClick={() => { setFocusId(null); setOpen(true); }} aria-label={`Open the Command Center, ${count} waiting`}
          className={cn('fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-2xl transition hover:scale-105',
            count > 0 ? 'border-amber-300 bg-amber-400 text-slate-900 ring-4 ring-amber-400/30' : 'border-slate-600 bg-slate-900/95 text-slate-100')}>
          <Mail className="h-5 w-5" />
          {count > 0 ? <span>{count} waiting for you</span> : <span>Command Center</span>}
        </button>
      ) : null}
      <CommandCenter open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFocusId(null); }} focusId={focusId} />
    </>
  );
}

/** Only the owner gets it: the button is not even rendered for anyone else, and it makes no requests for them. */
export function CrewMailbox({ headless = false }: { headless?: boolean } = {}) {
  const me = useAuthStore((s) => s.profile);
  if (me?.role !== 'super_admin') return null;
  return <OwnerGate meId={me.id} headless={headless} />;
}

function OwnerGate({ meId, headless }: { meId: string; headless: boolean }) {
  const settings = useCrewSettings();
  if (settings.data?.owner_profile_id !== meId) return null;
  return <Mailbox headless={headless} />;
}
