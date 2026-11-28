// One decision, whole: who asks, what, why, the evidence, the exact before and after, the risk, and what happens next. Used large in the stack, and
// compact on Today and in the quick inbox, with the same buttons and words.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock, MessageSquare, Send, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CrewAgent, CrewMessage, CrewOrder, CrewProposal } from '../crewDb';
import { ago } from '../helpers';
import { AppChangeView, useAppPreview } from '../components/AppChangeView';
import type { HqActions } from './actions';
import { useHotkeys } from './hotkeys';
import { actionLabel, approveText, changeView, needsConfirm, nextStep, questionLabel, tomorrowAt8, type DecisionItem, type QuestionState } from './logic';
import { riskTone } from './tones';
import { Btn, Chip, Eyebrow, Face, HqCard, Kbd, Prose } from './ui';

const compactSize = 40;
const QUICK = ['Yes', 'No', 'Not now', 'Tell me more'];
const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

interface Common { byId: Map<string, CrewAgent>; actions: HqActions; paused: ReadonlySet<string>; compact?: boolean; /** this card owns the single-key shortcuts */ hotkeys?: boolean; stateOf: (q: CrewMessage) => QuestionState; onOpen?: () => void }

function Who({ agent, paused, chips, at }: { agent?: CrewAgent; paused: boolean; chips: React.ReactNode; at: string }) {
  return (
    <div className="flex items-center gap-3">
      {agent ? <Face agent={agent} size={compactSize} paused={paused} /> : <span className="h-12 w-12 shrink-0 rounded-full bg-muted" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-base font-bold">{agent?.name.split(' ')[0] ?? 'An executive'}</span><span className="min-w-0 truncate text-xs text-muted-foreground">{agent?.title ?? ''}</span></p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5">{chips}<span className="text-xs text-muted-foreground">{ago(at)}</span></p>
      </div>
    </div>
  );
}

function Hint({ k, children, show }: { k: string; children: React.ReactNode; show?: boolean }) {
  return <span className="inline-flex items-center gap-1.5">{children}{show ? <span className="hidden md:inline-flex"><Kbd>{k}</Kbd></span> : null}</span>;
}

function SnoozeRow({ onPick, onCancel, hotkeys }: { onPick: (until: number, label: string) => void; onCancel: () => void; hotkeys?: boolean }) {
  const hour = () => onPick(Date.now() + 3600_000, 'in 1 hour');
  const morning = () => onPick(tomorrowAt8(), 'tomorrow 8am');
  useHotkeys({ '1': hour, '2': morning, escape: onCancel }, !!hotkeys);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted p-1.5 text-sm" role="group" aria-label="Snooze until">
      <Btn tone="soft" className="min-h-8 px-3 py-1" onClick={hour}><Hint k="1" show={!!hotkeys}>1 hour</Hint></Btn>
      <Btn tone="soft" className="min-h-8 px-3 py-1" onClick={morning}><Hint k="2" show={!!hotkeys}>Tomorrow 8am</Hint></Btn>
      <Btn className="min-h-8 px-3 py-1" onClick={onCancel}>Cancel</Btn>
    </div>
  );
}


function Reply({ label, placeholder, submit, busy, onSend, onCancel, autoFocus = true }: { label: string; placeholder: string; submit: string; busy: boolean; onSend: (text: string) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const go = () => { if (text.trim()) onSend(text); };
  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-2">
      <Textarea ref={ref} aria-label={label} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={placeholder} className="bg-background" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } if (e.key === 'Escape') onCancel?.(); }} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn tone="go" onClick={go} disabled={!text.trim() || busy}><Send className="h-4 w-4" />{submit}</Btn>
        {onCancel ? <Btn onClick={onCancel}>Cancel</Btn> : null}
        <span className="text-[11px] text-muted-foreground">Ctrl+Enter sends</span>
      </div>
    </div>
  );
}

// ── a proposal ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ProposalBody({ p, agent, byId, actions, paused, compact, hotkeys, onOpen }: { p: CrewProposal; agent?: CrewAgent } & Common) {
  const [mode, setMode] = useState<null | 'reject' | 'challenge' | 'snooze'>(null);
  const [armed, setArmed] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [reason, setReason] = useState('');
  const hire = p.action === 'agent.hire';
  const retire = p.action === 'agent.retire';
  const pay = p.payload as Record<string, unknown>;
  const target = retire ? [...byId.values()].find((a) => a.slug === pay.agent) : undefined;
  const ev = Object.entries(p.evidence ?? {}).slice(0, 12);
  const change = changeView(p);
  const appPreview = useAppPreview(p);   // app.* waiting proposals: the live "now vs proposed" table; if it is unavailable the table below is the fallback
  const showApp = p.action.startsWith('app.') && !compact && !appPreview.isError;
  const who = agent?.name.split(' ')[0] ?? 'The agent';
  const next = nextStep(p.action, who);
  const confirm = needsConfirm(p);

  const approve = () => {
    if (confirm && !armed) { setArmed(true); return; }
    setArmed(false);
    actions.approve(p);
  };
  const toggle = (m: 'reject' | 'challenge' | 'snooze') => { setArmed(false); setMode((cur) => (cur === m ? null : m)); };
  useHotkeys({ a: approve, r: () => toggle('reject'), c: () => toggle('challenge'), s: () => toggle('snooze'), escape: () => { setMode(null); setArmed(false); } }, !!hotkeys);

  const label = hire ? 'Hire' : approveText(p.action);
  return (
    <HqCard risk={p.risk} glow={!compact} className={cn('p-4 md:p-5', !compact && 'hq-rise')} data-testid="decision-card">
      <Who agent={agent} paused={!!agent && paused.has(agent.id)} at={p.created_at}
        chips={<><Chip tone={hire ? 'meet' : 'signal'}>{hire ? 'Hiring candidate' : retire ? 'Letting someone go' : 'Needs your approval'}</Chip><Chip>{actionLabel(p.action)}</Chip><Chip tone={riskTone(p.risk)}>{p.risk} risk</Chip>{p.remind_count > 0 ? <Chip tone="warn">reminded {p.remind_count}×</Chip> : null}</>} />
      <h3 className={cn('mt-3 font-bold leading-snug [overflow-wrap:anywhere]', compact ? 'text-[15px]' : 'text-xl tracking-tight')}>
        {onOpen ? <button type="button" onClick={onOpen} className="hq-focus rounded text-left hover:underline">{p.summary}</button> : p.summary}
      </h3>

      {hire ? <div className="mt-3 rounded-xl bg-[hsl(var(--hq-meet)/0.1)] p-3 text-sm"><p className="font-bold">Candidate: {str(pay.name ?? '')}{pay.role ? ` · ${str(pay.role)}` : ''}</p><p className="text-xs text-muted-foreground">{pay.replaces ? `Replaces ${str(pay.replaces)}` : pay.reports_to ? `Would report to ${str(pay.reports_to)}` : ''}</p></div> : null}
      {retire && target ? <div className="mt-3 rounded-xl bg-[hsl(var(--hq-risk)/0.09)] p-3 text-sm"><span className="font-bold">{target.name}</span> · {target.title}{pay.reason ? <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{str(pay.reason)}</p> : null}</div> : null}

      {p.rationale ? <div className="mt-4"><Eyebrow>Why</Eyebrow><Prose text={p.rationale} lines={compact ? 3 : 6} className="mt-1" /></div> : null}

      {showApp ? <AppChangeView proposal={p} /> : null}
      {change && !compact && !showApp ? (
        <div className="mt-4">
          <Eyebrow>{change.title}: before and after</Eyebrow>
          <div className="mt-1 overflow-hidden rounded-xl border border-border text-sm" role="table" aria-label="Exact change">
            <div role="row" className="hidden grid-cols-[minmax(0,9rem)_1fr_1fr] gap-3 bg-muted/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span role="columnheader">Field</span><span role="columnheader">Before</span><span role="columnheader">After</span></div>
            {change.rows.length === 0 ? <p className="px-3 py-2 text-muted-foreground">Nothing visible changes.</p> : change.rows.map((r) => (
              <div key={r.field} role="row" className="grid gap-x-3 gap-y-0.5 border-t border-border px-3 py-2 first:border-t-0 sm:grid-cols-[minmax(0,9rem)_1fr_1fr]">
                <span role="cell" className="font-mono text-xs font-semibold text-muted-foreground [overflow-wrap:anywhere]">{r.field}</span>
                <span role="cell" className="min-w-0 text-[hsl(var(--hq-risk))] [overflow-wrap:anywhere] sm:line-through sm:decoration-[hsl(var(--hq-risk)/0.5)]">{r.before === undefined ? <span className="text-muted-foreground no-underline">not shown</span> : r.before || <span className="text-muted-foreground">empty</span>}</span>
                <span role="cell" className="min-w-0 font-semibold text-[hsl(var(--hq-ok))] [overflow-wrap:anywhere]">{r.after === undefined ? <span className="text-muted-foreground">removed</span> : r.after || <span className="text-muted-foreground">empty</span>}</span>
              </div>
            ))}
          </div>
          {change.rows.some((r) => r.before === undefined) && p.action.endsWith('update') ? <p className="mt-1 text-xs text-muted-foreground">The proposal did not carry the old values, so only the new ones are shown.</p> : null}
        </div>
      ) : null}

      {p.endorsements?.length && !compact ? (
        <ul className="mt-3 space-y-1 text-xs">{p.endorsements.map((e, i) => <li key={i} className={e.stance === 'oppose' ? 'text-[hsl(var(--hq-risk))]' : 'text-[hsl(var(--hq-ok))]'}>{[...byId.values()].find((a) => a.id === e.agent)?.name ?? 'A colleague'} {e.stance === 'oppose' ? 'advises against' : 'supports'}{e.note ? `: ${e.note}` : ''}</li>)}</ul>
      ) : null}

      {ev.length && !compact ? (
        <div className="mt-3">
          <button type="button" onClick={() => setEvidence(!evidence)} aria-expanded={evidence} className="hq-focus rounded text-xs font-semibold text-[hsl(var(--hq-signal-ink))] hover:underline">{evidence ? 'Hide' : 'Show'} the evidence ({ev.length})</button>
          {evidence ? <dl className="mt-1 grid gap-1 rounded-xl bg-muted/60 p-3 text-xs">{ev.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="shrink-0 font-semibold text-muted-foreground">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{str(v).slice(0, 400)}</dd></div>)}</dl> : null}
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-4 grid gap-2 rounded-xl bg-muted/50 p-3 text-xs sm:grid-cols-2">
          <p><span className="font-bold text-[hsl(var(--hq-ok))]">If you approve: </span>{next.approve}</p>
          <p><span className="font-bold text-muted-foreground">If you reject: </span>{next.reject}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Decide">
        <Btn tone="go" disabled={actions.deciding} onClick={approve}><Check className="h-4 w-4" />{armed ? `Press again to confirm: ${label}` : <Hint k="A" show={!!hotkeys}>{label}</Hint>}</Btn>
        <Btn tone="soft" disabled={actions.deciding} aria-pressed={mode === 'reject'} onClick={() => toggle('reject')}><X className="h-4 w-4" /><Hint k="R" show={!!hotkeys}>{hire ? 'Pass' : 'Reject'}</Hint></Btn>
        <Btn aria-pressed={mode === 'challenge'} onClick={() => toggle('challenge')}><MessageSquare className="h-4 w-4" /><Hint k="C" show={!!hotkeys}>{hire ? 'Ask a question' : 'Challenge'}</Hint></Btn>
        <Btn aria-pressed={mode === 'snooze'} onClick={() => toggle('snooze')}><Clock className="h-4 w-4" /><Hint k="S" show={!!hotkeys}>Snooze</Hint></Btn>
        {armed ? <span className="text-xs font-semibold text-[hsl(var(--hq-warn))]" role="status">This is hard to undo.</span> : null}
      </div>
      {mode === 'reject' ? (
        <div className="mt-3 rounded-xl bg-muted/60 p-2">
          <Textarea autoFocus aria-label="Why not" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why not? They learn from it (optional)" className="bg-background" onKeyDown={(e) => { if (e.key === 'Escape') setMode(null); }} />
          <div className="mt-2 flex gap-2"><Btn tone="danger" disabled={actions.deciding} onClick={() => { actions.reject(p, reason); setMode(null); }}>{hire ? 'Confirm pass' : 'Confirm: reject'}</Btn><Btn onClick={() => setMode(null)}>Cancel</Btn></div>
        </div>
      ) : null}
      {mode === 'challenge' ? <Reply label={`Challenge ${who}`} placeholder="Push back, ask for more evidence, or change it…" submit="Send challenge" busy={actions.sending} onCancel={() => setMode(null)} onSend={(t) => actions.challenge(p, t, () => setMode(null))} /> : null}
      {mode === 'snooze' ? <div className="mt-3"><SnoozeRow hotkeys={hotkeys} onCancel={() => setMode(null)} onPick={(until, label2) => { actions.snoozeItem(p.id, until, label2); setMode(null); }} /></div> : null}
    </HqCard>
  );
}

// ── a question ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function QuestionBody({ m, agent, actions, paused, compact, hotkeys, stateOf }: { m: CrewMessage; agent?: CrewAgent } & Common) {
  const [mode, setMode] = useState<null | 'answer' | 'snooze'>(null);
  const state = stateOf(m);
  const who = agent?.name.split(' ')[0] ?? 'They';
  const isPaused = !!agent && paused.has(agent.id);
  const toggle = (x: 'answer' | 'snooze') => setMode((cur) => (cur === x ? null : x));
  useHotkeys({ a: () => setMode('answer'), c: () => setMode('answer'), r: () => actions.dismissQuestion(m), s: () => toggle('snooze'), escape: () => setMode(null) }, !!hotkeys);
  return (
    <HqCard risk="none" glow={!compact} className={cn('p-4 md:p-5', !compact && 'hq-rise')} data-testid="decision-card">
      <Who agent={agent} paused={isPaused} at={m.created_at} chips={<><Chip tone="signal">Question for you</Chip><Chip tone={state.state === 'open' ? 'warn' : 'ok'}>{questionLabel(state, ago)}</Chip></>} />
      <Prose text={m.body} lines={compact ? 4 : 10} className={cn('mt-3', !compact && '[&_p]:text-base')} />
      {isPaused ? <p className="mt-2 text-xs text-muted-foreground">{who} is paused: an answer waits and is read when they are resumed.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick answers">
        {QUICK.map((t) => <button key={t} type="button" disabled={actions.sending} onClick={() => actions.answer(m, t)} className="hq-focus rounded-full border border-[hsl(var(--hq-signal)/0.45)] px-3.5 py-1.5 text-sm font-bold text-[hsl(var(--hq-signal-ink))] transition hover:bg-[hsl(var(--hq-signal)/0.12)] disabled:opacity-50">{t}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Handle this question">
        <Btn tone="go" aria-pressed={mode === 'answer'} onClick={() => toggle('answer')}><MessageSquare className="h-4 w-4" /><Hint k="A" show={!!hotkeys}>Answer</Hint></Btn>
        <Btn tone="soft" onClick={() => actions.dismissQuestion(m)}><X className="h-4 w-4" /><Hint k="R" show={!!hotkeys}>Not needed</Hint></Btn>
        <Btn aria-pressed={mode === 'snooze'} onClick={() => toggle('snooze')}><Clock className="h-4 w-4" /><Hint k="S" show={!!hotkeys}>Snooze</Hint></Btn>
      </div>
      {mode === 'answer' ? <Reply label={`Answer ${who}`} placeholder="Your answer…" submit="Send answer" busy={actions.sending} onCancel={() => setMode(null)} onSend={(t) => actions.answer(m, t, () => setMode(null))} /> : null}
      {mode === 'snooze' ? <div className="mt-3"><SnoozeRow hotkeys={hotkeys} onCancel={() => setMode(null)} onPick={(until, label) => { actions.snoozeItem(m.id, until, label); setMode(null); }} /></div> : null}
    </HqCard>
  );
}

// ── a challenged order ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function OrderBody({ o, agent, actions, paused, compact }: { o: CrewOrder; agent?: CrewAgent } & Common) {
  const [note, setNote] = useState('');
  const who = agent?.name.split(' ')[0] ?? 'They';
  return (
    <HqCard risk="high" glow={!compact} className={cn('p-4 md:p-5', !compact && 'hq-rise')} data-testid="decision-card">
      <Who agent={agent} paused={!!agent && paused.has(agent.id)} at={o.responded_at ?? o.created_at} chips={<><Chip tone="risk">Order challenged</Chip></>} />
      <div className="mt-3"><Eyebrow>Your order</Eyebrow><Prose text={o.text} lines={3} className="mt-1" /></div>
      <div className="mt-3 rounded-xl bg-[hsl(var(--hq-risk)/0.08)] p-3"><Eyebrow>{who} pushes back</Eyebrow><Prose text={o.challenge ?? ''} lines={compact ? 3 : 8} className="mt-1" /></div>
      <Textarea aria-label="Your answer" className="mt-3 bg-background" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your answer (optional). They write the outcome down and learn from it." />
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn tone="soft" disabled={actions.busy} onClick={() => actions.resolveOrder(o, 'accept_challenge', note)}>They are right: drop it</Btn>
        <Btn tone="danger" disabled={actions.busy} onClick={() => actions.resolveOrder(o, 'veto', note)}>Veto</Btn>
        <Btn tone="go" disabled={actions.busy} onClick={() => actions.resolveOrder(o, 'insist', note)}>Do it anyway</Btn>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Single-key shortcuts do not apply to orders: each of these is a deliberate click.</p>
    </HqCard>
  );
}

export function DecisionCard({ item, ...c }: { item: DecisionItem } & Common) {
  if (item.kind === 'proposal') return <ProposalBody p={item.proposal} agent={c.byId.get(item.proposal.agent_id)} {...c} />;
  if (item.kind === 'question') return <QuestionBody m={item.message} agent={item.message.from_agent ? c.byId.get(item.message.from_agent) : undefined} {...c} />;
  return <OrderBody o={item.order} agent={c.byId.get(item.order.agent_id)} {...c} />;
}

/** One line per decision, for list mode and the compact lists. */
export function DecisionRow({ item, byId, selected, onSelect }: { item: DecisionItem; byId: Map<string, CrewAgent>; selected?: boolean; onSelect: () => void }) {
  const agentId = item.kind === 'proposal' ? item.proposal.agent_id : item.kind === 'question' ? item.message.from_agent : item.order.agent_id;
  const agent = agentId ? byId.get(agentId) : undefined;
  const title = item.kind === 'proposal' ? item.proposal.summary : item.kind === 'question' ? item.message.body : item.order.text;
  const chip = item.kind === 'proposal' ? <Chip tone={riskTone(item.proposal.risk)}>{item.proposal.risk} risk</Chip> : item.kind === 'question' ? <Chip tone="signal">Question</Chip> : <Chip tone="risk">Challenged</Chip>;
  return (
    <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined} className={cn('hq-focus hq-interactive flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left', selected ? 'border-[hsl(var(--hq-signal))] ring-1 ring-[hsl(var(--hq-signal)/0.4)]' : 'border-border')}>
      {agent ? <Face agent={agent} size={32} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-muted" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere]">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{agent?.name.split(' ')[0]} · {ago(item.at)}{chip}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

