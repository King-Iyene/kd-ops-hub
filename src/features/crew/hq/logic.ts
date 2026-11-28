// Crew HQ: the pure rules behind the screens (no React, no network), so they can be tested on their own.
import { approveLabel, describeAction } from '../orgChart';
import type { CrewAgent, CrewIdea, CrewMeeting, CrewMessage, CrewNote, CrewOrder, CrewProposal, CrewRun } from '../crewDb';

export const MIN = 60_000;
export const STUCK_AFTER_MS = 30 * MIN;
const ms = (iso: string) => Date.parse(iso);

// ── Views and the command bar ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const VIEWS = ['today', 'decisions', 'work', 'agents', 'meetings', 'memory', 'settings'] as const;
export type HqView = (typeof VIEWS)[number];
export type Navigate = (v: HqView, opts?: { sub?: string; focus?: string; topic?: string }) => void;
export const isView = (v: string | null | undefined): v is HqView => !!v && (VIEWS as readonly string[]).includes(v);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finds one agent from what the owner typed: first name, last name, slug or full name; failing that, a first name that starts with it (3+ letters)
 * when exactly one agent matches. Never guesses between two people.
 */
export function findAgent(agents: Pick<CrewAgent, 'id' | 'name' | 'slug'>[], token: string): (typeof agents)[number] | undefined {
  const t = norm(token);
  if (!t) return undefined;
  const exact = agents.filter((a) => {
    const parts = norm(a.name).split(' ');
    return norm(a.name) === t || parts[0] === t || parts[parts.length - 1] === t || norm(a.slug.replace(/_/g, ' ')) === t;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  if (t.length < 3) return undefined;
  const prefix = agents.filter((a) => norm(a.name).split(' ')[0].startsWith(t));
  return prefix.length === 1 ? prefix[0] : undefined;
}

export type Command =
  | { type: 'empty' }
  | { type: 'tell'; agent: Pick<CrewAgent, 'id' | 'name' | 'slug'>; text: string }
  | { type: 'incomplete'; hint: string }
  | { type: 'meet'; topic: string }
  | { type: 'go'; view: HqView }
  | { type: 'search'; query: string };

/**
 * What the command bar understands:
 *   tell <agent> <text>   (also "ask") sends a message;  meet <topic>   opens the meeting form;  a section name goes there;  anything else searches.
 */
export function parseCommand(input: string, agents: Pick<CrewAgent, 'id' | 'name' | 'slug'>[]): Command {
  const raw = input.trim();
  if (!raw) return { type: 'empty' };
  const verb = /^(tell|ask)\b\s*(.*)$/is.exec(raw);
  if (verb) {
    const rest = verb[2].trim();
    if (!rest) return { type: 'incomplete', hint: `${verb[1].toLowerCase()} who? For example: ${verb[1].toLowerCase()} hale check this week's income` };
    const words = rest.split(/\s+/);
    // "tell hale king ...", "tell hale: ...", "tell hale, ..."
    for (const n of [2, 1]) {
      if (words.length < n) continue;
      const token = words.slice(0, n).join(' ').replace(/[:,]+$/, '');
      const agent = findAgent(agents, token);
      if (!agent) continue;
      const text = words.slice(n).join(' ').replace(/^[:,]\s*/, '').trim();
      return text ? { type: 'tell', agent, text } : { type: 'incomplete', hint: `What should ${agent.name.split(' ')[0]} be told?` };
    }
    const first = words[0].replace(/[:,]+$/, '');
    return { type: 'incomplete', hint: `No one on the team matches "${first}".` };
  }
  const meet = /^meet(?:ing)?\b\s*(.*)$/is.exec(raw);
  if (meet) {
    const topic = meet[1].trim();
    return topic ? { type: 'meet', topic } : { type: 'incomplete', hint: 'meet what? For example: meet cash runway for December' };
  }
  const go = /^(?:go(?: to)?|open)\s+(\w+)$/i.exec(raw) ?? /^(\w+)$/.exec(raw);
  if (go && isView(go[1].toLowerCase())) return { type: 'go', view: go[1].toLowerCase() as HqView };
  return { type: 'search', query: raw };
}

// ── Questions: open until the owner answered that agent, or dismissed it ─────────────────────────────────────────────────────────────────────
export type QuestionState = { state: 'open' } | { state: 'answered'; at: string } | { state: 'dismissed' };

/**
 * A question is open until the owner has written to that agent AFTER it (the first such message counts as the answer) or has dismissed it
 * ("Not needed", kept in this browser). `read_at` is ignored on purpose: the old inbox marked questions read on sight, which made an unanswered
 * question look handled.
 */
export function questionState(q: Pick<CrewMessage, 'id' | 'from_agent' | 'created_at'>, all: CrewMessage[], dismissed: ReadonlySet<string>): QuestionState {
  const asked = ms(q.created_at);
  let first: CrewMessage | undefined;
  for (const m of all) {
    if (m.from_agent !== null || m.to_agent !== q.from_agent || ms(m.created_at) <= asked) continue;
    if (!first || ms(m.created_at) < ms(first.created_at)) first = m;
  }
  if (first) return { state: 'answered', at: first.created_at };
  if (dismissed.has(q.id)) return { state: 'dismissed' };
  return { state: 'open' };
}

export const isQuestion = (m: CrewMessage) => m.kind === 'question' && m.to_owner && m.from_agent !== null;

export function questionLabel(s: QuestionState, ago: (iso: string) => string): string {
  return s.state === 'open' ? 'Waiting for your answer' : s.state === 'answered' ? `You answered ${ago(s.at)}` : 'Dismissed';
}

// ── The decision stack ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type DecisionItem =
  | { kind: 'proposal'; id: string; at: string; rank: number; proposal: CrewProposal }
  | { kind: 'question'; id: string; at: string; rank: number; message: CrewMessage }
  | { kind: 'order'; id: string; at: string; rank: number; order: CrewOrder };

/** Lower comes first: high-risk changes, then an agent blocked by a challenge, then medium risk, then questions, then low risk. */
export const proposalRank = (risk: string) => (risk === 'high' ? 0 : risk === 'medium' ? 2 : 4);
const ORDER_RANK = 1;
const QUESTION_RANK = 3;

export interface BuildInput {
  proposals: CrewProposal[];
  messages: CrewMessage[];
  orders: CrewOrder[];
  dismissed: ReadonlySet<string>;
  snoozed: Record<string, number>;
  now: number;
  includeSnoozed?: boolean;
}

export function buildDecisions(i: BuildInput): { items: DecisionItem[]; snoozedCount: number } {
  const all: DecisionItem[] = [];
  for (const p of i.proposals) if (p.status === 'pending') all.push({ kind: 'proposal', id: p.id, at: p.created_at, rank: proposalRank(p.risk), proposal: p });
  for (const m of i.messages) if (isQuestion(m) && questionState(m, i.messages, i.dismissed).state === 'open') all.push({ kind: 'question', id: m.id, at: m.created_at, rank: QUESTION_RANK, message: m });
  for (const o of i.orders) if (o.status === 'challenged') all.push({ kind: 'order', id: o.id, at: o.responded_at ?? o.created_at, rank: ORDER_RANK, order: o });
  const asleep = (id: string) => (i.snoozed[id] ?? 0) > i.now;
  const items = all.filter((x) => i.includeSnoozed || !asleep(x.id)).sort((a, b) => a.rank - b.rank || ms(a.at) - ms(b.at));
  return { items, snoozedCount: all.filter((x) => asleep(x.id)).length };
}

/** Next or previous position in the stack, wrapping round the ends. -1 when the stack is empty. */
export function stepIndex(index: number, dir: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  return (((index + dir) % length) + length) % length;
}

/**
 * Keeps the owner on the same card when the list changes underneath him (a refetch, a new item): the card is followed by id. When it is gone
 * (just decided, snoozed) the next card slides into the same position; past the end, the last one.
 */
export function resolveSelection(ids: string[], selectedId: string | null, lastIndex: number): { index: number; id: string | null } {
  if (ids.length === 0) return { index: -1, id: null };
  const at = selectedId ? ids.indexOf(selectedId) : -1;
  if (at >= 0) return { index: at, id: ids[at] };
  const index = Math.min(Math.max(lastIndex, 0), ids.length - 1);
  return { index, id: ids[index] };
}

export function tomorrowAt8(from = new Date()): number {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

// ── After the owner answers: is the agent on it? ─────────────────────────────────────────────────────────────────────────────────────────────
export interface WakeRow { id: string; agent_id: string; status: 'pending' | 'fired' | 'failed' | 'skipped'; created_at: string; fired_at: string | null; error: string | null }
export type Pickup = 'paused' | 'queued' | 'working' | 'woken' | 'failed' | 'idle';

/**
 * Where an agent is after being written to at `sentAt`. Uses the wake queue when the owner can read it (`wakes` given), otherwise only the agent's
 * own status. A paused agent is never woken: its message waits until it is resumed.
 */
export function pickup(agent: Pick<CrewAgent, 'id' | 'status'>, wakes: WakeRow[] | undefined, sentAt: string, paused = false): Pickup {
  if (paused) return 'paused';
  const mine = (wakes ?? []).filter((w) => w.agent_id === agent.id).sort((a, b) => ms(b.created_at) - ms(a.created_at));
  const since = ms(sentAt) - 5_000;
  if (mine.some((w) => w.status === 'pending')) return 'queued';   // a pending wake is outstanding by definition (a second request merges into it)
  if (agent.status === 'working' || agent.status === 'thinking') return 'working';
  const fired = mine.find((w) => w.status === 'fired' && w.fired_at && ms(w.fired_at) >= since);
  if (fired) return 'woken';
  if (mine.some((w) => w.status === 'failed' && ms(w.created_at) >= since)) return 'failed';
  return 'idle';
}

export const PICKUP_LABEL: Record<Pickup, string> = {
  paused: 'Paused: will read it when resumed', queued: 'Queued: waking up', working: 'Working on it', woken: 'Woken: has your message', failed: 'Could not be woken: it will read it on its next run', idle: 'Not running right now: reads it on its next run',
};

// ── Hand-offs between agents ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Handoff { m: CrewMessage; answeredAt: string | null; needsAnswer: boolean; stuck: boolean }

/** A reply or a plain report asks nothing back; anything else waits until the other agent writes back. Stuck = unanswered for over 30 minutes. */
export function computeHandoffs(channel: CrewMessage[], now: number): Handoff[] {
  const msgs = channel.filter((m) => m.from_agent && m.to_agent);
  return msgs.map((m) => {
    const needsAnswer = m.kind !== 'report' && m.kind !== 'reply';
    let answered: string | null = null;
    for (const x of msgs) {
      if (x.from_agent === m.to_agent && x.to_agent === m.from_agent && ms(x.created_at) > ms(m.created_at) && (!answered || ms(x.created_at) < ms(answered))) answered = x.created_at;
    }
    return { m, answeredAt: answered, needsAnswer, stuck: needsAnswer && !answered && now - ms(m.created_at) > STUCK_AFTER_MS };
  }).sort((a, b) => ms(b.m.created_at) - ms(a.m.created_at));
}

// ── The work board ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type LaneKey = 'planned' | 'progress' | 'waiting' | 'done';
export const LANES: { key: LaneKey; label: string; hint: string }[] = [
  { key: 'planned', label: 'Planned', hint: 'Given or approved, not started' },
  { key: 'progress', label: 'In progress', hint: 'The team is on it' },
  { key: 'waiting', label: 'Waiting for you', hint: 'Needs your decision' },
  { key: 'done', label: 'Done', hint: 'Finished in the last 7 days' },
];

export type WorkKind = 'order' | 'proposal' | 'meeting' | 'handoff' | 'idea';
export interface WorkCard { id: string; lane: LaneKey; kind: WorkKind; title: string; agentId: string | null; at: string; badge?: string; alert?: boolean; ref: string }

const WEEK = 7 * 24 * 60 * MIN;

export function buildLanes(i: { orders: CrewOrder[]; proposals: CrewProposal[]; meetings: CrewMeeting[]; handoffs: Handoff[]; ideas: CrewIdea[]; now: number }): Record<LaneKey, WorkCard[]> {
  const out: Record<LaneKey, WorkCard[]> = { planned: [], progress: [], waiting: [], done: [] };
  const recent = (iso: string | null | undefined) => !!iso && i.now - ms(iso) < WEEK;
  for (const o of i.orders) {
    const base = { kind: 'order' as const, title: o.text, agentId: o.agent_id, ref: o.id };
    if (o.status === 'given') out.planned.push({ ...base, id: `order:${o.id}`, lane: 'planned', at: o.created_at, badge: 'Order given' });
    else if (o.status === 'accepted') out.progress.push({ ...base, id: `order:${o.id}`, lane: 'progress', at: o.responded_at ?? o.created_at, badge: 'Order accepted' });
    else if (o.status === 'challenged') out.waiting.push({ ...base, id: `order:${o.id}`, lane: 'waiting', at: o.responded_at ?? o.created_at, badge: 'Challenged', alert: true });
    else if (o.status === 'done' && recent(o.resolved_at ?? o.created_at)) out.done.push({ ...base, id: `order:${o.id}`, lane: 'done', at: o.resolved_at ?? o.created_at, badge: 'Order done' });
  }
  for (const p of i.proposals) {
    const base = { kind: 'proposal' as const, title: p.summary, agentId: p.agent_id, ref: p.id };
    if (p.status === 'pending') out.waiting.push({ ...base, id: `proposal:${p.id}`, lane: 'waiting', at: p.created_at, badge: `${p.risk} risk`, alert: p.risk === 'high' });
    else if (p.status === 'approved') out.progress.push({ ...base, id: `proposal:${p.id}`, lane: 'progress', at: p.decided_at ?? p.created_at, badge: 'Approved: carrying out' });
    else if (p.status === 'failed') out.waiting.push({ ...base, id: `proposal:${p.id}`, lane: 'waiting', at: p.decided_at ?? p.created_at, badge: 'Failed to apply', alert: true });
    else if (p.status === 'executed' && recent(p.executed_at ?? p.decided_at)) out.done.push({ ...base, id: `proposal:${p.id}`, lane: 'done', at: p.executed_at ?? p.decided_at ?? p.created_at, badge: 'Applied' });
  }
  for (const m of i.meetings) {
    const base = { kind: 'meeting' as const, title: m.topic, agentId: m.chair_agent, ref: m.id };
    if (m.status !== 'closed') out.progress.push({ ...base, id: `meeting:${m.id}`, lane: 'progress', at: m.created_at, badge: m.status === 'open' ? `Live, round ${m.round}` : 'Writing minutes' });
    else if (recent(m.closed_at ?? m.created_at)) {
      const asks = m.minutes?.needs_owner?.length ?? 0;
      out[asks ? 'waiting' : 'done'].push({ ...base, id: `meeting:${m.id}`, lane: asks ? 'waiting' : 'done', at: m.closed_at ?? m.created_at, badge: asks ? `${asks} for you in the minutes` : 'Minutes ready' });
    }
  }
  for (const h of i.handoffs) {
    if (h.needsAnswer && !h.answeredAt) out.progress.push({ id: `handoff:${h.m.id}`, lane: 'progress', kind: 'handoff', title: h.m.body, agentId: h.m.to_agent, at: h.m.created_at, badge: h.stuck ? 'Hand-off stuck' : 'Hand-off waiting', alert: h.stuck, ref: h.m.id });
  }
  for (const d of i.ideas) {
    const base = { kind: 'idea' as const, title: d.title, agentId: d.requested_by, ref: d.id };
    if (d.status === 'open' || d.status === 'triaged') out.waiting.push({ ...base, id: `idea:${d.id}`, lane: 'waiting', at: d.created_at, badge: `Idea, ${d.support_count} need it` });
    else if (d.status === 'approved') out.planned.push({ ...base, id: `idea:${d.id}`, lane: 'planned', at: d.created_at, badge: 'Idea approved' });
    else if (d.status === 'building') out.progress.push({ ...base, id: `idea:${d.id}`, lane: 'progress', at: d.created_at, badge: 'Being built' });
    else if (d.status === 'shipped' && recent(d.created_at)) out.done.push({ ...base, id: `idea:${d.id}`, lane: 'done', at: d.created_at, badge: 'Shipped' });
  }
  const newest = (a: WorkCard, b: WorkCard) => ms(b.at) - ms(a.at);
  out.planned.sort(newest); out.progress.sort(newest); out.done.sort(newest);
  out.waiting.sort((a, b) => Number(!!b.alert) - Number(!!a.alert) || ms(a.at) - ms(b.at));
  return out;
}

// ── The team pulse and the weekly digest ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function latestRunByAgent(runs: Pick<CrewRun, 'agent_id' | 'started_at'>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of runs) if (!m.has(r.agent_id) || ms(r.started_at) > ms(m.get(r.agent_id)!)) m.set(r.agent_id, r.started_at);
  return m;
}

export const isBusy = (a: Pick<CrewAgent, 'status'>) => a.status === 'working' || a.status === 'thinking' || a.status === 'meeting';

export interface DigestEntry { agentId: string; notes: CrewNote[]; byKind: Record<string, number> }

/** What each agent wrote down in the last 7 days, the agents that learned most first. */
export function weeklyDigest(notes: CrewNote[], now: number): DigestEntry[] {
  const by = new Map<string, CrewNote[]>();
  for (const n of notes) {
    if (now - ms(n.created_at) > WEEK || n.status !== 'active') continue;
    by.set(n.agent_id, [...(by.get(n.agent_id) ?? []), n]);
  }
  return [...by.entries()].map(([agentId, list]) => {
    const byKind: Record<string, number> = {};
    for (const n of list) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    return { agentId, notes: list.sort((a, b) => ms(b.created_at) - ms(a.created_at)), byKind };
  }).sort((a, b) => b.notes.length - a.notes.length);
}

// ── What an approval will change (before and after) ──────────────────────────────────────────────────────────────────────────────────────────
export interface ChangeRow { field: string; before?: string; after?: string }
export interface ChangeView { title: string; rows: ChangeRow[] }

const show = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The exact before and after for a change to data (`record.*` and `app.*`). The "before" comes from what the proposal itself carries (its
 * evidence or payload); nothing is looked up, so when it is not there only the new values are shown. Other actions return null.
 */
export function changeView(p: Pick<CrewProposal, 'action' | 'payload' | 'evidence'>): ChangeView | null {
  const kind = p.action.startsWith('record.') ? 'record' : p.action.startsWith('app.') ? 'app' : null;
  if (!kind) return null;
  const op = p.action.slice(kind.length + 1);
  const pay = p.payload ?? {};
  const ev = p.evidence ?? {};
  const after = isObj(pay.after) ? pay.after : isObj(pay.values) ? pay.values : {};
  const before = [pay.before, ev.before, ev.current, ev.old, ev.current_values].find(isObj) ?? null;
  const title = op === 'create' ? 'New row' : op === 'soft_delete' ? 'Row moved to the trash' : 'Row changed';
  if (op === 'soft_delete') {
    const rows = before ? Object.keys(before).map((k) => ({ field: k, before: show(before[k]), after: undefined })) : [{ field: 'record', before: show(pay.record_id) || 'the row', after: undefined }];
    return { title, rows };
  }
  const keys = [...new Set([...Object.keys(after), ...(before && op === 'update' ? Object.keys(before).filter((k) => k in after) : [])])];
  const rows = keys.map((k) => ({ field: k, before: before && op === 'update' ? show(before[k]) : undefined, after: show(after[k]) }))
    .filter((r) => op !== 'update' || r.before === undefined || r.before !== r.after);
  return { title, rows };
}

/** One-line search over agents, decisions and messages for the command bar. */
export function searchHq(q: string, i: { agents: CrewAgent[]; decisions: DecisionItem[]; messages: CrewMessage[] }, limit = 5) {
  const needle = q.trim().toLowerCase();
  if (!needle) return { agents: [], decisions: [], messages: [] };
  const has = (...p: (string | null | undefined)[]) => p.some((x) => (x ?? '').toLowerCase().includes(needle));
  const name = (id: string | null) => i.agents.find((a) => a.id === id)?.name;
  return {
    agents: i.agents.filter((a) => has(a.name, a.title, a.department, a.role, a.activity)).slice(0, limit),
    decisions: i.decisions.filter((d) => (d.kind === 'proposal' ? has(d.proposal.summary, d.proposal.rationale, d.proposal.action, name(d.proposal.agent_id)) : d.kind === 'question' ? has(d.message.body, name(d.message.from_agent)) : has(d.order.text, d.order.challenge, name(d.order.agent_id)))).slice(0, limit),
    messages: i.messages.filter((m) => has(m.body, name(m.from_agent), name(m.to_agent))).slice(0, limit),
  };
}

// ── What happens next ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One plain sentence on what approving and rejecting a proposal will do, so the owner is never guessing. */
export function nextStep(action: string, who: string): { approve: string; reject: string } {
  const reject = `${who} is told it was not needed and, if you give a reason, writes it down so it does not repeat it.`;
  if (action.startsWith('record.') || action.startsWith('app.')) return { approve: 'The change is written to the data right away, exactly as shown above. A delete only hides the row.', reject };
  if (action.startsWith('draft.')) return { approve: `${who} prepares the draft with its own tools. Nothing is paid, sent or filed until you do that yourself.`, reject };
  if (action.startsWith('external.')) return { approve: 'A go-ahead only: nothing is changed outside the app until you (or Claude) carry it out and mark it done.', reject };
  if (action.startsWith('drive.')) return { approve: `${who} makes the change in Google Drive as described.`, reject };
  if (action === 'advice.knowledge') return { approve: 'The company brain is updated, so every agent reads the new text from now on.', reject };
  if (action === 'agent.hire') return { approve: 'The new team member is hired and starts at their desk.', reject: 'The candidate is passed over and told.' };
  if (action === 'agent.retire') return { approve: 'The team member is let go; their notes stay on record.', reject };
  if (action.startsWith('advice.')) return { approve: 'The advice is accepted and recorded; nothing else changes.', reject };
  return { approve: 'Your go-ahead is recorded and the agent carries on.', reject };
}

/** Approving these takes a second press: they are hard to take back. */
export const needsConfirm = (p: Pick<CrewProposal, 'risk' | 'action'>) => p.risk === 'high' || p.action.endsWith('soft_delete') || p.action.startsWith('agent.');

// ── Labels (app.* is the newer "change the app's own data" family; the shared labels only know record.*) ──────────────────────────────────────
const APP_LABEL: Record<string, string> = { 'app.create': 'Add a row to the app data', 'app.update': 'Change a row in the app data', 'app.soft_delete': 'Move a row to the trash' };
export const actionLabel = (action: string): string => APP_LABEL[action] ?? describeAction(action);
export const approveText = (action: string): string => (action.startsWith('app.') ? 'Approve and apply' : approveLabel(action));
