import { describe, expect, it } from 'vitest';
import type { CrewAgent, CrewIdea, CrewMeeting, CrewMessage, CrewNote, CrewOrder, CrewProposal } from '../../crewDb';
import {
  buildDecisions, buildLanes, changeView, computeHandoffs, findAgent, latestRunByAgent, parseCommand, pickup, questionLabel, questionState, resolveSelection, searchHq, stepIndex, weeklyDigest,
  type DecisionItem, type WakeRow,
} from '../logic';

const NOW = Date.parse('2026-11-28T12:00:00Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const agent = (id: string, name: string, slug = id, status: CrewAgent['status'] = 'idle'): CrewAgent => ({
  id, slug, name, title: 'Head', role: 'x', department: 'Finance', company: 'All', reports_to: null, status, activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#000', active: true,
});
const team = [agent('a1', 'Hale King', 'cfo'), agent('a2', 'Henry Ashford', 'ops_head'), agent('a3', 'Margaret Doyle', 'people_head'), agent('a4', 'Charles Bennett', 'finance_head')];

const msg = (o: Partial<CrewMessage> & { id: string }): CrewMessage => ({
  thread_id: 't', from_agent: null, to_agent: null, to_owner: false, kind: 'message', body: '', ref_proposal: null, ref_order: null, created_at: at(10), read_at: null, ...o,
});
const question = (id: string, from: string, minutesAgo: number, read_at: string | null = null) => msg({ id, from_agent: from, to_owner: true, kind: 'question', body: 'How many staff?', created_at: at(minutesAgo), read_at });
const ownerSays = (id: string, to: string, minutesAgo: number) => msg({ id, from_agent: null, to_agent: to, body: 'Eleven.', created_at: at(minutesAgo) });

const proposal = (id: string, risk: CrewProposal['risk'], minutesAgo: number, status: CrewProposal['status'] = 'pending'): CrewProposal => ({
  id, agent_id: 'a1', action: 'record.update', base_id: null, table_id: null, summary: `Change ${id}`, rationale: '', evidence: {}, payload: {}, risk, status, requires_approver: 'owner', endorsements: [],
  decision_note: null, result: {}, error: null, remind_count: 0, created_at: at(minutesAgo), decided_at: null, executed_at: null,
});
const order = (id: string, status: CrewOrder['status'], minutesAgo = 5): CrewOrder => ({ id, agent_id: 'a2', text: `Order ${id}`, status, challenge: status === 'challenged' ? 'Not wise' : null, owner_response: null, created_at: at(minutesAgo), responded_at: null, resolved_at: null });

describe('question state: open until the owner answered or dismissed it', () => {
  const none = new Set<string>();

  it('is open when nobody answered, even if the old inbox marked it read', () => {
    const q = question('q1', 'a1', 30, at(29));   // read_at is set: it must be ignored
    expect(questionState(q, [q], none)).toEqual({ state: 'open' });
  });

  it('is answered by the first message from the owner to that agent after the question', () => {
    const q = question('q1', 'a1', 30);
    const first = ownerSays('r1', 'a1', 20);
    const later = ownerSays('r2', 'a1', 5);
    expect(questionState(q, [later, q, first], none)).toEqual({ state: 'answered', at: first.created_at });
  });

  it('is not answered by a message to someone else, by one before it, or by the agent itself', () => {
    const q = question('q1', 'a1', 30);
    const toOther = ownerSays('r1', 'a2', 20);
    const before = ownerSays('r2', 'a1', 40);
    const fromAgent = msg({ id: 'r3', from_agent: 'a1', to_owner: true, created_at: at(10) });
    expect(questionState(q, [q, toOther, before, fromAgent], none).state).toBe('open');
  });

  it('is dismissed when the owner said "Not needed" in this browser', () => {
    const q = question('q1', 'a1', 30);
    expect(questionState(q, [q], new Set(['q1']))).toEqual({ state: 'dismissed' });
  });

  it('is honest in its labels', () => {
    const ago = (iso: string) => (iso === at(20) ? '20 min ago' : '?');
    expect(questionLabel({ state: 'open' }, ago)).toBe('Waiting for your answer');
    expect(questionLabel({ state: 'answered', at: at(20) }, ago)).toBe('You answered 20 min ago');
    expect(questionLabel({ state: 'dismissed' }, ago)).toBe('Dismissed');
  });
});

describe('the decision stack', () => {
  const base = { proposals: [] as CrewProposal[], messages: [] as CrewMessage[], orders: [] as CrewOrder[], dismissed: new Set<string>(), snoozed: {} as Record<string, number>, now: NOW };

  it('holds pending proposals, open questions and challenged orders, most urgent first', () => {
    const q = question('q1', 'a1', 50);
    const { items } = buildDecisions({
      ...base,
      proposals: [proposal('low', 'low', 90), proposal('high', 'high', 10), proposal('med', 'medium', 20), proposal('done', 'high', 5, 'executed')],
      messages: [q, ownerSays('x', 'a3', 1)],
      orders: [order('o1', 'challenged'), order('o2', 'accepted')],
    });
    expect(items.map((i) => i.id)).toEqual(['high', 'o1', 'med', 'q1', 'low']);
  });

  it('puts the oldest first within the same urgency', () => {
    const { items } = buildDecisions({ ...base, proposals: [proposal('newer', 'medium', 5), proposal('older', 'medium', 50)] });
    expect(items.map((i) => i.id)).toEqual(['older', 'newer']);
  });

  it('drops a question once it is answered or dismissed, but not just because it was read', () => {
    const answered = question('qa', 'a1', 30);
    const dismissed = question('qd', 'a2', 30);
    const read = question('qr', 'a3', 30, at(1));
    const { items } = buildDecisions({ ...base, messages: [answered, ownerSays('r', 'a1', 10), dismissed, read], dismissed: new Set(['qd']) });
    expect(items.map((i) => i.id)).toEqual(['qr']);
  });

  it('hides snoozed cards until they are asked for, and counts them', () => {
    const snoozed = { p1: NOW + 60_000, p2: NOW - 60_000 };   // p2 has woken up again
    const input = { ...base, proposals: [proposal('p1', 'high', 5), proposal('p2', 'high', 6)], snoozed };
    const hidden = buildDecisions(input);
    expect(hidden.items.map((i) => i.id)).toEqual(['p2']);
    expect(hidden.snoozedCount).toBe(1);
    expect(buildDecisions({ ...input, includeSnoozed: true }).items.map((i) => i.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('stack navigation', () => {
  it('steps forwards and backwards and wraps round the ends', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });

  it('stays on the same card when the list changes underneath', () => {
    expect(resolveSelection(['a', 'b', 'c'], 'b', 0)).toEqual({ index: 1, id: 'b' });
    expect(resolveSelection(['x', 'a', 'b', 'c'], 'b', 1)).toEqual({ index: 2, id: 'b' });   // a new card arrived above it
  });

  it('moves the next card into the same slot when the current one is decided, and clamps at the end', () => {
    expect(resolveSelection(['a', 'c'], 'b', 1)).toEqual({ index: 1, id: 'c' });
    expect(resolveSelection(['a', 'b'], 'c', 2)).toEqual({ index: 1, id: 'b' });
    expect(resolveSelection([], 'c', 2)).toEqual({ index: -1, id: null });
    expect(resolveSelection(['a'], null, 0)).toEqual({ index: 0, id: 'a' });
  });
});

describe('command bar', () => {
  it('finds an agent by first name, last name, slug or full name, and never guesses between two', () => {
    expect(findAgent(team, 'hale')?.id).toBe('a1');
    expect(findAgent(team, 'Doyle')?.id).toBe('a3');
    expect(findAgent(team, 'ops_head')?.id).toBe('a2');
    expect(findAgent(team, 'charles bennett')?.id).toBe('a4');
    expect(findAgent(team, 'marg')?.id).toBe('a3');   // a unique prefix
    expect(findAgent(team, 'ha')).toBeUndefined();   // too short, and Hale and Henry both start with it
    expect(findAgent(team, 'nobody')).toBeUndefined();
  });

  it('parses "tell <agent> <text>", with an optional colon, comma or surname', () => {
    expect(parseCommand("tell hale check this week's income", team)).toMatchObject({ type: 'tell', agent: { id: 'a1' }, text: "check this week's income" });
    expect(parseCommand('Tell Hale: be blunt', team)).toMatchObject({ type: 'tell', agent: { id: 'a1' }, text: 'be blunt' });
    expect(parseCommand('tell margaret doyle, run payroll early', team)).toMatchObject({ type: 'tell', agent: { id: 'a3' }, text: 'run payroll early' });
    expect(parseCommand('ask henry what is stuck?', team)).toMatchObject({ type: 'tell', agent: { id: 'a2' }, text: 'what is stuck?' });
  });

  it('explains an incomplete command instead of sending it', () => {
    expect(parseCommand('tell', team)).toMatchObject({ type: 'incomplete' });
    expect(parseCommand('tell hale', team)).toMatchObject({ type: 'incomplete', hint: expect.stringContaining('Hale') });
    expect(parseCommand('tell zed do it', team)).toMatchObject({ type: 'incomplete', hint: expect.stringContaining('zed') });
    expect(parseCommand('meet', team)).toMatchObject({ type: 'incomplete' });
  });

  it('parses "meet <topic>", section names, and falls back to search', () => {
    expect(parseCommand('meet cash runway for December', team)).toEqual({ type: 'meet', topic: 'cash runway for December' });
    expect(parseCommand('decisions', team)).toEqual({ type: 'go', view: 'decisions' });
    expect(parseCommand('go to memory', team)).toEqual({ type: 'go', view: 'memory' });
    expect(parseCommand('vat filing', team)).toEqual({ type: 'search', query: 'vat filing' });
    expect(parseCommand('   ', team)).toEqual({ type: 'empty' });
  });

  it('does not mistake a search for a command ("telling", "meeting notes")', () => {
    expect(parseCommand('telling tales', team)).toEqual({ type: 'search', query: 'telling tales' });
    expect(parseCommand('meetings with vendors', team).type).toBe('search');
  });

  it('searches agents, decisions and messages', () => {
    const decisions: DecisionItem[] = buildDecisions({ proposals: [proposal('p1', 'high', 5)], messages: [question('q1', 'a2', 20)], orders: [], dismissed: new Set(), snoozed: {}, now: NOW }).items;
    const r = searchHq('staff', { agents: team, decisions, messages: [question('q1', 'a2', 20)] });
    expect(r.decisions.map((d) => d.id)).toEqual(['q1']);
    expect(r.messages).toHaveLength(1);
    expect(searchHq('henry', { agents: team, decisions, messages: [] }).agents.map((a) => a.id)).toEqual(['a2']);
    expect(searchHq('', { agents: team, decisions, messages: [] }).agents).toEqual([]);
  });
});

describe('is the agent on it?', () => {
  const sent = at(2);
  const wake = (o: Partial<WakeRow>): WakeRow => ({ id: 'w', agent_id: 'a1', status: 'pending', created_at: at(1), fired_at: null, error: null, ...o });

  it('says queued while a wake is waiting, working while the agent runs, woken once it fired', () => {
    expect(pickup(team[0], [wake({})], sent)).toBe('queued');
    expect(pickup({ id: 'a1', status: 'working' }, [wake({ status: 'fired', fired_at: at(1) })], sent)).toBe('working');
    expect(pickup(team[0], [wake({ status: 'fired', fired_at: at(1) })], sent)).toBe('woken');
    expect(pickup(team[0], [wake({ status: 'failed' })], sent)).toBe('failed');
  });

  it('falls back to the agent status when the queue cannot be read, and never claims a pickup it cannot see', () => {
    expect(pickup({ id: 'a1', status: 'thinking' }, undefined, sent)).toBe('working');
    expect(pickup(team[0], undefined, sent)).toBe('idle');
    expect(pickup(team[0], [wake({ agent_id: 'a2' })], sent)).toBe('idle');
  });

  it('a paused agent is never woken', () => {
    expect(pickup(team[0], [wake({})], sent, true)).toBe('paused');
  });
});

describe('hand-offs', () => {
  const h = (id: string, from: string, to: string, kind: CrewMessage['kind'], minutesAgo: number) => msg({ id, from_agent: from, to_agent: to, kind, created_at: at(minutesAgo) });

  it('flags a hand-off nobody answered for over 30 minutes as stuck', () => {
    const list = computeHandoffs([h('m1', 'a1', 'a2', 'question', 45), h('m2', 'a1', 'a3', 'question', 10)], NOW);
    expect(list.find((x) => x.m.id === 'm1')).toMatchObject({ stuck: true, answeredAt: null });
    expect(list.find((x) => x.m.id === 'm2')).toMatchObject({ stuck: false });
  });

  it('counts the first reply back as the answer, and asks nothing for a report', () => {
    const list = computeHandoffs([h('m1', 'a1', 'a2', 'question', 45), h('m2', 'a2', 'a1', 'reply', 30), h('m3', 'a1', 'a2', 'report', 50)], NOW);
    expect(list.find((x) => x.m.id === 'm1')).toMatchObject({ stuck: false, answeredAt: at(30) });
    expect(list.find((x) => x.m.id === 'm3')).toMatchObject({ needsAnswer: false, stuck: false });
  });
});

describe('work board', () => {
  const meeting = (id: string, status: CrewMeeting['status'], needs: string[] = []): CrewMeeting => ({
    id, topic: `Meeting ${id}`, brief: '', chair_agent: 'a1', called_by: null, status, round: 1, max_rounds: 2, round_started_at: at(5), summarising_at: null, created_at: at(60), closed_at: status === 'closed' ? at(30) : null,
    minutes: status === 'closed' ? { summary: '', decisions: [], needs_owner: needs, action_items: [] } : null,
  });
  const idea = (id: string, status: CrewIdea['status']): CrewIdea => ({ id, title: `Idea ${id}`, problem: '', proposal: '', requested_by: 'a1', evidence: {}, supporters: [], departments: [], support_count: 2, status, priority: 'medium', spec: '', estimate: '', owner_note: null, created_at: at(100) });

  it('sorts everything into four lanes', () => {
    const lanes = buildLanes({
      orders: [order('given', 'given'), order('acc', 'accepted'), order('chal', 'challenged'), order('done', 'done'), order('veto', 'vetoed')],
      proposals: [proposal('pend', 'high', 5), proposal('appr', 'low', 9, 'approved'), proposal('fail', 'low', 9, 'failed'), { ...proposal('exec', 'low', 9, 'executed'), executed_at: at(20) }, proposal('rej', 'low', 9, 'rejected')],
      meetings: [meeting('live', 'open'), meeting('asks', 'closed', ['Approve?']), meeting('fine', 'closed')],
      handoffs: computeHandoffs([msg({ id: 'h1', from_agent: 'a1', to_agent: 'a2', kind: 'question', created_at: at(40), body: 'Need the list' })], NOW),
      ideas: [idea('new', 'open'), idea('ok', 'approved'), idea('bld', 'building'), idea('shp', 'shipped')], now: NOW,
    });
    const ids = (k: keyof typeof lanes) => lanes[k].map((c) => c.id).sort();
    expect(ids('planned')).toEqual(['idea:ok', 'order:given']);
    expect(ids('progress')).toEqual(['handoff:h1', 'idea:bld', 'meeting:live', 'order:acc', 'proposal:appr']);
    expect(ids('waiting')).toEqual(['idea:new', 'meeting:asks', 'order:chal', 'proposal:fail', 'proposal:pend']);
    expect(ids('done')).toEqual(['idea:shp', 'meeting:fine', 'order:done', 'proposal:exec']);
    expect(lanes.progress.find((c) => c.id === 'handoff:h1')?.alert).toBe(true);   // 40 min unanswered
  });

  it('leaves out finished work older than a week', () => {
    const old = { ...order('old', 'done'), resolved_at: at(60 * 24 * 9) };
    expect(buildLanes({ orders: [old], proposals: [], meetings: [], handoffs: [], ideas: [], now: NOW }).done).toEqual([]);
  });
});

describe('team pulse and weekly digest', () => {
  it('finds each agent\'s latest run', () => {
    const m = latestRunByAgent([{ agent_id: 'a1', started_at: at(60) }, { agent_id: 'a1', started_at: at(5) }, { agent_id: 'a2', started_at: at(90) }]);
    expect(m.get('a1')).toBe(at(5));
    expect(m.get('a2')).toBe(at(90));
  });

  it('digests this week\'s active notes per agent, most learning first', () => {
    const note = (id: string, agent_id: string, kind: string, daysAgo: number, status: CrewNote['status'] = 'active'): CrewNote => ({ id, agent_id, kind, body: id, source: 'self_review', status, confidence: 3, created_at: at(daysAgo * 1440) });
    const d = weeklyDigest([note('n1', 'a1', 'lesson', 1), note('n2', 'a2', 'rule', 2), note('n3', 'a2', 'fact', 3), note('old', 'a1', 'lesson', 10), note('gone', 'a1', 'lesson', 1, 'retired')], NOW);
    expect(d.map((e) => e.agentId)).toEqual(['a2', 'a1']);
    expect(d[0].byKind).toEqual({ rule: 1, fact: 1 });
    expect(d[1].notes.map((n) => n.id)).toEqual(['n1']);
  });
});

describe('what an approval will change', () => {
  const p = (action: string, payload: Record<string, unknown>, evidence: Record<string, unknown> = {}) => ({ action, payload, evidence });

  it('shows the new values of a create', () => {
    expect(changeView(p('app.create', { values: { name: 'Vercel Pro', amount_ngn: 30000 } }))).toEqual({ title: 'New row', rows: [{ field: 'name', before: undefined, after: 'Vercel Pro' }, { field: 'amount_ngn', before: undefined, after: '30000' }] });
  });

  it('shows before and after of an update, only for what changes, when the proposal carries the old row', () => {
    const v = changeView(p('record.update', { record_id: 'r', values: { amount: 50, vendor: 'Acme' } }, { before: { amount: 40, vendor: 'Acme' } }));
    expect(v?.rows).toEqual([{ field: 'amount', before: '40', after: '50' }]);
  });

  it('shows only the new values when no old row came with the proposal, and null for other actions', () => {
    expect(changeView(p('app.update', { record_id: 'r', values: { amount: 50 } }))?.rows).toEqual([{ field: 'amount', before: undefined, after: '50' }]);
    expect(changeView(p('draft.invoice', {}))).toBeNull();
    expect(changeView(p('advice.knowledge', {}))).toBeNull();
  });

  it('describes a soft delete', () => {
    expect(changeView(p('app.soft_delete', { record_id: 'abc' }))).toEqual({ title: 'Row moved to the trash', rows: [{ field: 'record', before: 'abc', after: undefined }] });
  });
});

describe('what happens next', () => {
  it('says what approving does for data, drafts, outside changes and the brain', async () => {
    const { nextStep, needsConfirm } = await import('../logic');
    expect(nextStep('app.update', 'Hale').approve).toMatch(/written to the data/);
    expect(nextStep('draft.payroll_run', 'Hale').approve).toMatch(/Nothing is paid/);
    expect(nextStep('external.vercel', 'Hale').approve).toMatch(/go-ahead only/i);
    expect(nextStep('advice.knowledge', 'Hale').approve).toMatch(/company brain/);
    expect(nextStep('record.update', 'Hale').reject).toContain('Hale');
    expect(needsConfirm({ risk: 'high', action: 'record.update' })).toBe(true);
    expect(needsConfirm({ risk: 'low', action: 'app.soft_delete' })).toBe(true);
    expect(needsConfirm({ risk: 'low', action: 'agent.retire' })).toBe(true);
    expect(needsConfirm({ risk: 'low', action: 'advice.finance' })).toBe(false);
  });
});
