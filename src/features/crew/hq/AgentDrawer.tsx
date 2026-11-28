// An agent's profile drawer: who they are, what they may do, their messages, their memory, and how their recent runs went.
// Every long text wraps (min-w-0 and overflow-wrap), so nothing is cut off at the right edge.
import { useMemo, useState } from 'react';
import { Brain, Copy, KeyRound, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CrewAgent, CrewNote } from '../crewDb';
import { ago } from '../helpers';
import { STATUS_LABEL } from '../orgChart';
import { useCrewAgents, useCrewKnowledge, useCrewMistakes, useCrewNotes, useCrewPrivate, useCrewRuns, useIssueToken, useRetireNote, useRevokeTokens } from '../useCrew';
import { useHqActions } from './actions';
import { useAgentAccess, useSelfReviews } from './hooks';
import { actionLabel, PICKUP_LABEL, pickup } from './logic';
import { PauseToggle } from '../components/PauseToggle';
import { usePausedIds } from './pause';
import { PickupChip } from './Receipts';
import { Btn, Chip, EmptyState, Eyebrow, Face, LoadingRows, Prose, StatusLine } from './ui';
import type { HqData } from './useHq';
import { useWakeQueue } from './hooks';

type Tab = 'overview' | 'messages' | 'memory' | 'activity';
const TABS: { key: Tab; label: string }[] = [{ key: 'overview', label: 'Overview' }, { key: 'messages', label: 'Messages' }, { key: 'memory', label: 'Memory' }, { key: 'activity', label: 'Activity' }];
const NOTE_KINDS: { key: string; label: string; teach: string }[] = [
  { key: 'rule', label: 'Rules', teach: 'a standing rule' }, { key: 'lesson', label: 'Lessons', teach: 'a lesson' }, { key: 'fact', label: 'Facts', teach: 'a fact about the company' },
  { key: 'preference', label: 'Preferences', teach: 'one of my preferences' }, { key: 'mistake', label: 'Mistakes noted', teach: 'a mistake to avoid' },
];
const SOURCE_LABEL: Record<string, string> = { proposal_outcome: 'from a decision', owner_feedback: 'from you', self_review: 'self-review', order_veto: 'from an order', ci_result: 'from a build', other: 'other' };
const human = (s: string) => { const t = s.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

function Overview({ agent }: { agent: CrewAgent }) {
  const priv = useCrewPrivate();
  const access = useAgentAccess();
  const agents = useCrewAgents();
  const { toast } = useToast();
  const issue = useIssueToken();
  const revoke = useRevokeTokens();
  const [token, setToken] = useState<string | null>(null);
  const p = priv.data?.find((x) => x.agent_id === agent.id);
  const a = access.data?.find((x) => x.agent_id === agent.id);
  const boss = agents.data?.find((x) => x.id === agent.reports_to);
  const reports = (agents.data ?? []).filter((x) => x.reports_to === agent.id);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast({ title: 'Copied' }); } catch { toast({ title: 'Could not copy: select it by hand', variant: 'destructive' }); } };
  return (
    <div className="space-y-5">
      <PauseToggle agentId={agent.id} name={agent.name} />
      <section className="space-y-2">
        <Eyebrow>Role</Eyebrow>
        <p className="text-sm [overflow-wrap:anywhere]">{agent.title} · {agent.department}{agent.company && agent.company !== 'All' ? ` · ${agent.company}` : ''}</p>
        {p?.persona ? <Prose text={p.persona} lines={5} /> : priv.isLoading ? <LoadingRows rows={1} /> : null}
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Reports to {boss ? <Chip>{boss.name.split(' ')[0]}</Chip> : <Chip tone="signal">You</Chip>}{reports.length ? <>· Leads {reports.map((r) => <Chip key={r.id}>{r.name.split(' ')[0]}</Chip>)}</> : null}</p>
      </section>
      {p ? (
        <section className="grid grid-cols-2 gap-2 text-sm">
          <div className="min-w-0 rounded-xl bg-muted/60 p-3"><Eyebrow>Model</Eyebrow><p className="mt-1 font-semibold [overflow-wrap:anywhere]">{p.model}</p>{p.advisor_model ? <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">advisor {p.advisor_model}</p> : null}</div>
          <div className="min-w-0 rounded-xl bg-muted/60 p-3"><Eyebrow>Limits</Eyebrow><p className="mt-1 font-semibold">{p.max_runs_per_day === null ? 'No run limit' : `${p.max_runs_per_day} runs/day`}</p><p className="text-xs text-muted-foreground">{p.max_pending} proposals waiting at most</p></div>
        </section>
      ) : null}
      {p ? (
        <section className="space-y-2">
          <Eyebrow>May propose</Eyebrow>
          <ul className="flex flex-wrap gap-1.5">{p.allowed_actions.map((x) => <li key={x}><Chip tone="signal" title={x}>{actionLabel(x)}</Chip></li>)}{p.allowed_actions.length === 0 ? <li className="text-xs text-muted-foreground">Nothing: advice only.</li> : null}</ul>
          <Eyebrow className="pt-1">May read</Eyebrow>
          <ul className="flex flex-wrap gap-1.5">
            {(a?.allowed_sources ?? []).map((s) => <li key={s}><Chip>{human(s)}</Chip></li>)}
            {a && (a.allowed_read_bases.length + a.allowed_write_bases.length) > 0 ? <li><Chip>{a.allowed_read_bases.length + a.allowed_write_bases.length} record bases{a.allowed_write_bases.length ? `, ${a.allowed_write_bases.length} writable` : ''}</Chip></li> : null}
            {a && !(a.allowed_sources ?? []).length && !(a.allowed_read_bases.length + a.allowed_write_bases.length) ? <li className="text-xs text-muted-foreground">No company data beyond the brain and its own inbox.</li> : null}
            {!a && access.isLoading ? <li className="text-xs text-muted-foreground">Loading…</li> : null}
          </ul>
          <details className="pt-1 text-sm"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Instructions this agent follows</summary>
            <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs [overflow-wrap:anywhere]">{p.instructions}</p>
          </details>
        </section>
      ) : null}
      <section className="rounded-xl border border-dashed border-border p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><KeyRound className="h-3.5 w-3.5" aria-hidden />Access token for this agent&apos;s routine</p>
        <p className="mt-1 text-xs text-muted-foreground">Lets the agent&apos;s scheduled session reach the gateway: read what it may read, put proposals in your queue. Shown once.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn tone="soft" disabled={issue.isPending} onClick={() => issue.mutate({ slug: agent.slug, label: 'routine' }, { onSuccess: (t) => setToken(t), onError: (e) => toast({ title: 'No token', description: e.message, variant: 'destructive' }) })}>Make a token</Btn>
          <Btn disabled={revoke.isPending} onClick={() => revoke.mutate(agent.slug, { onSuccess: (n) => { setToken(null); toast({ title: n > 0 ? `Cancelled ${n} token${n === 1 ? '' : 's'}` : 'No active tokens' }); }, onError: (e) => toast({ title: 'Not cancelled', description: e.message, variant: 'destructive' }) })}>Cancel all tokens</Btn>
        </div>
        {token ? <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted p-2"><code className="min-w-0 flex-1 break-all text-xs">{token}</code><Btn onClick={() => void copy(token)} aria-label="Copy token"><Copy className="h-4 w-4" /></Btn></div> : null}
      </section>
    </div>
  );
}

function Messages({ agent, data, paused }: { agent: CrewAgent; data: HqData; paused: boolean }) {
  const actions = useHqActions(data.agents);
  const wakes = useWakeQueue();
  const [text, setText] = useState('');
  const first = agent.name.split(' ')[0];
  const thread = useMemo(() => data.messages.filter((m) => (m.from_agent === agent.id && m.to_owner) || (m.from_agent === null && m.to_agent === agent.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-30), [data.messages, agent.id]);
  const lastMine = [...thread].reverse().find((m) => m.from_agent === null);
  const send = () => { if (text.trim()) actions.send(agent.id, text.trim(), 'message', () => setText('')); };
  return (
    <div className="space-y-3">
      {thread.length === 0 ? <EmptyState title={`Nothing with ${first} yet`}>Say what you need: they answer, and push back if you are wrong.</EmptyState> : (
        <ol className="space-y-2" aria-label={`Messages with ${first}`}>
          {thread.map((m) => (
            <li key={m.id} className={cn('max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm', m.from_agent === null ? 'ml-auto bg-[hsl(var(--hq-signal)/0.13)]' : 'bg-muted')}>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{m.from_agent === null ? 'You' : first} · {ago(m.created_at)}{m.kind !== 'message' && m.from_agent ? ` · ${m.kind}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="rounded-2xl bg-muted/50 p-2">
        {paused ? <p className="mb-2 px-1 text-xs font-semibold text-[hsl(var(--hq-warn))]" role="status">{PICKUP_LABEL.paused}</p> : null}
        <Textarea aria-label={`Message ${first}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`Tell ${first} what to do, or ask…`} className="bg-background" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
        <div className="mt-2 flex flex-wrap items-center gap-2"><Btn tone="go" onClick={send} disabled={!text.trim() || actions.sending}><Send className="h-4 w-4" />Send</Btn><span className="text-[11px] text-muted-foreground">Ctrl+Enter sends</span>
          {lastMine && pickup(agent, wakes.data, lastMine.created_at, paused) !== 'idle' ? <PickupChip agent={agent} sentAt={lastMine.created_at} paused={paused} /> : null}
        </div>
      </div>
    </div>
  );
}

function NoteRow({ n, onRetire }: { n: CrewNote; onRetire: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <li className="flex items-start gap-2 rounded-xl bg-muted/60 p-2.5 text-sm">
      <div className="min-w-0 flex-1"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{SOURCE_LABEL[n.source] ?? n.source} · {ago(n.created_at)} · confidence {n.confidence}/5</p></div>
      {sure ? <span className="flex shrink-0 gap-1"><Btn tone="danger" className="min-h-8 px-2 py-1 text-xs" onClick={onRetire}>Retire</Btn><Btn className="min-h-8 px-2 py-1 text-xs" onClick={() => setSure(false)}>Keep</Btn></span>
        : <Btn className="min-h-8 shrink-0 px-2 py-1 text-xs" onClick={() => setSure(true)} aria-label="Retire this note">Retire</Btn>}
    </li>
  );
}

function Memory({ agent, data }: { agent: CrewAgent; data: HqData }) {
  const notes = useCrewNotes(agent.id);
  const brain = useCrewKnowledge();
  const reviews = useSelfReviews();
  const retire = useRetireNote();
  const actions = useHqActions(data.agents);
  const { toast } = useToast();
  const [kind, setKind] = useState('rule');
  const [text, setText] = useState('');
  const first = agent.name.split(' ')[0];
  const grouped = NOTE_KINDS.map((k) => ({ ...k, list: (notes.data ?? []).filter((n) => n.kind === k.key) })).filter((g) => g.list.length);
  const lastReview = (reviews.data ?? []).find((r) => r.agent_id === agent.id);
  const teach = () => {
    const k = NOTE_KINDS.find((x) => x.key === kind)!;
    actions.send(agent.id, `Please remember this as ${k.teach} and write it into your notes: ${text.trim()}`, 'note', () => setText(''));
  };
  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Brain className="h-4 w-4" aria-hidden />Last self-review: {lastReview ? <Chip tone="ok">{ago(lastReview.fired_at ?? lastReview.created_at)}</Chip> : <Chip>none on record</Chip>}</p>
      {notes.isLoading ? <LoadingRows rows={2} /> : null}
      {notes.error ? <p role="alert" className="text-sm text-[hsl(var(--hq-risk))]">{notes.error.message}</p> : null}
      {!notes.isLoading && grouped.length === 0 ? <EmptyState title={`${first} has not written anything down yet`}>They record a lesson after a rejection, a challenge or a failure, and after their weekly self-review.</EmptyState> : null}
      {grouped.map((g) => (
        <section key={g.key} className="space-y-2"><Eyebrow>{g.label} ({g.list.length})</Eyebrow>
          <ul className="space-y-1.5">{g.list.slice(0, 20).map((n) => <NoteRow key={n.id} n={n} onRetire={() => retire.mutate(n.id, { onSuccess: () => toast({ title: 'Note retired', description: `${first} no longer reads it.` }), onError: (e) => toast({ title: 'Not retired', description: e.message, variant: 'destructive' }) })} />)}</ul>
        </section>
      ))}
      <section className="rounded-2xl border border-border p-3">
        <Eyebrow>Teach {first} something</Eyebrow>
        <p className="mt-1 text-xs text-muted-foreground">Sent to {first} as a message asking them to write it into their notes; it shows above once they have.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What kind of note" className="h-10 rounded-lg border border-input bg-background px-2 text-sm">{NOTE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label.replace(/s$/, '').replace('Mistakes noted', 'Mistake')}</option>)}</select>
          <Textarea aria-label={`A note for ${first}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="For example: payroll runs on the 25th, not the 28th" className="min-h-10 flex-1 bg-background" />
          <Btn tone="go" disabled={text.trim().length < 3 || actions.sending} onClick={teach}>Send</Btn>
        </div>
      </section>
      <section className="space-y-2"><Eyebrow>Company brain: what {first} reads first</Eyebrow>
        {brain.isLoading ? <LoadingRows rows={1} /> : (brain.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">The brain is empty.</p> : (
          <ul className="flex flex-wrap gap-1.5">{(brain.data ?? []).map((k) => <li key={k.topic}><Chip title={`Updated ${ago(k.updated_at)}`}>{k.topic}</Chip></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function Activity({ agent }: { agent: CrewAgent }) {
  const runs = useCrewRuns(agent.id);
  const mistakes = useCrewMistakes(agent.id);
  return (
    <div className="space-y-5">
      <section className="space-y-2"><Eyebrow>Recent runs</Eyebrow>
        {runs.isLoading ? <LoadingRows rows={2} /> : (runs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">It has not run yet.</p> : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {(runs.data ?? []).map((r) => (
              <li key={r.id} className="relative">
                <span className="hq-dot absolute -left-[21px] top-1.5" data-tone={r.ok === false ? 'risk' : r.ok ? 'ok' : 'signal'} aria-hidden />
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Chip tone={r.ok === false ? 'risk' : r.ok ? 'ok' : 'signal'}>{r.ok === false ? 'failed' : r.ok ? 'ok' : 'open'}</Chip>{r.kind} · {ago(r.started_at)}</p>
                {r.summary ? <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{r.summary}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="space-y-2"><Eyebrow>Mistakes logged ({mistakes.data?.length ?? 0})</Eyebrow>
        {mistakes.isLoading ? <LoadingRows rows={1} /> : (mistakes.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None logged.</p> : (
          <ul className="space-y-1.5">{(mistakes.data ?? []).map((m) => <li key={m.id} className="rounded-xl bg-[hsl(var(--hq-warn)/0.1)] p-2.5 text-sm"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.note}</p><p className="mt-1 text-[11px] text-muted-foreground">{m.kind} · {ago(m.created_at)}</p></li>)}</ul>
        )}
      </section>
    </div>
  );
}

export function AgentDrawer({ agentId, data, onClose, initialTab = 'overview' }: { agentId: string | null; data: HqData; onClose: () => void; initialTab?: Tab }) {
  const agent = agentId ? data.byId.get(agentId) : undefined;
  const pausedIds = usePausedIds();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [forId, setForId] = useState<string | null>(null);
  if (agentId !== forId) { setForId(agentId); setTab(initialTab); }   // a new agent opens on the first tab
  const paused = !!agent && pausedIds.has(agent.id);
  return (
    <Sheet open={!!agent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {agent ? (
          <>
            <SheetHeader className="space-y-3 border-b border-border p-5 text-left">
              <div className="flex items-center gap-4 pr-8">
                <Face agent={agent} size={56} paused={paused} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl [overflow-wrap:anywhere]">{agent.name}</SheetTitle>
                  <SheetDescription className="[overflow-wrap:anywhere]">{agent.title}</SheetDescription>
                  <StatusLine agent={agent} paused={paused} />
                </div>
              </div>
              {paused ? <Chip tone="warn" className="self-start">Paused: never woken; messages wait until resumed</Chip> : agent.status === 'offline' ? <Chip className="self-start">{STATUS_LABEL.offline}</Chip> : null}
              <div className="-mb-1 flex gap-1 overflow-x-auto" role="tablist" aria-label="Profile sections">
                {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn('hq-focus shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold transition', tab === t.key ? 'bg-[hsl(var(--hq-signal)/0.13)] text-[hsl(var(--hq-signal-ink))]' : 'text-muted-foreground hover:bg-muted')}>{t.label}</button>)}
              </div>
            </SheetHeader>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5" role="tabpanel">
              {tab === 'overview' ? <Overview agent={agent} /> : null}
              {tab === 'messages' ? <Messages agent={agent} data={data} paused={paused} /> : null}
              {tab === 'memory' ? <Memory agent={agent} data={data} /> : null}
              {tab === 'activity' ? <Activity agent={agent} /> : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
