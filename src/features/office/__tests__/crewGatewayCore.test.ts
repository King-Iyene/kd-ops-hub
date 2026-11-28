import { describe, expect, it } from 'vitest';
import { GatewayError, OPS, bearer, describeDbError, makeLimiter, plan } from '../../../../supabase/functions/_shared/crew-gateway-core';

const AGENT = '11111111-1111-4111-8111-111111111111';
const TABLE = '22222222-2222-4222-8222-222222222222';
const known: Record<string, string> = { cfo: '33333333-3333-4333-8333-333333333333', [AGENT]: AGENT };
const lookup = async (slug: string) => known[slug] ?? null;
const run = (op: unknown, a: Record<string, unknown> = {}) => plan(op, { op, ...a }, AGENT, lookup);

describe('crew gateway: what an agent can ask for', () => {
  it('has no operation that writes a record, deletes, pays or deploys', () => {
    for (const op of OPS) expect(op).not.toMatch(/delete|execute|pay|deploy|write|decide|issue_token|^approve/);
  });

  it('lets a manager log a mistake and see the team counts, and propose letting someone go and a replacement', async () => {
    expect(await run('mistake', { agent: 'cfo', kind: 'wrong_numbers', note: 'Posted 10x the amount' })).toMatchObject({ fn: 'crew_report_mistake', args: { p_agent: AGENT, p_target: known.cfo, p_kind: 'wrong_numbers' } });
    await expect(run('mistake', { agent: 'nobody_here', note: 'x' })).rejects.toThrow('no agent called');
    await expect(run('mistake', { agent: 'cfo', kind: 'failed_proposal', note: 'x' })).rejects.toThrow('kind must be one of');
    await expect(run('mistake', { agent: 'cfo; drop', note: 'x' })).rejects.toThrow('slug');
    await expect(run('mistake', { agent: 'cfo' })).rejects.toThrow('note is required');
    expect(await run('mistakes')).toMatchObject({ fn: 'crew_team_mistakes', args: { p_agent: AGENT } });
    expect(await run('propose', { action: 'agent.retire', summary: 'Let the controller go', payload: { agent: 'controller', reason: 'x' } })).toMatchObject({ args: { p_action: 'agent.retire' } });
    expect(await run('propose', { action: 'agent.hire', summary: 'Hire a controller', payload: { name: 'Roland Ashby', replaces: 'controller' } })).toMatchObject({ args: { p_action: 'agent.hire' } });
    await expect(run('propose', { action: 'agent.promote', summary: 'x' })).rejects.toThrow('unknown action');
  });

  it('refuses an unknown operation with 404', async () => {
    await expect(run('execute_sql')).rejects.toMatchObject({ status: 404 });
    await expect(run(undefined)).rejects.toBeInstanceOf(GatewayError);
  });

  it('always acts as the authenticated agent, never as an id the request names', async () => {
    const p = await run('propose', { action: 'advice.finance', summary: 'x', p_agent: 'someone-else', agent_id: TABLE });
    expect(p).toMatchObject({ fn: 'crew_propose', args: { p_agent: AGENT } });
    const r = await run('inbox', { p_agent: TABLE });
    expect(r).toMatchObject({ args: { p_agent: AGENT } });
  });

  it('propose: only known actions, bounded text, a valid risk', async () => {
    await expect(run('propose', { action: 'record.hard_delete', summary: 'x' })).rejects.toThrow('unknown action');
    expect(await run('propose', { action: 'draft.filing', summary: 'Draft the VAT return' })).toMatchObject({ args: { p_action: 'draft.filing' } });
    expect(await run('propose', { action: 'drive.create', summary: 'Save the duplicate-check sheet' })).toMatchObject({ args: { p_action: 'drive.create' } });
    await expect(run('propose', { action: 'drive.share', summary: 'x' })).rejects.toThrow('unknown action');
    await expect(run('propose', { action: 'draft.payment_now', summary: 'x' })).rejects.toThrow('unknown action');
    await expect(run('propose', { action: 'external.production_deploy', summary: 'x' })).rejects.toThrow('unknown action');
    await expect(run('propose', { action: 'advice.finance' })).rejects.toThrow('summary is required');
    await expect(run('propose', { action: 'advice.finance', summary: 'x'.repeat(401) })).rejects.toThrow('too long');
    await expect(run('propose', { action: 'advice.finance', summary: 'x', risk: 'none' })).rejects.toThrow('risk must be');
    await expect(run('propose', { action: 'record.create', summary: 'x', table_id: 'not-an-id' })).rejects.toThrow('must be an id');
    const ok = await run('propose', { action: 'record.create', summary: 'Add income', table_id: TABLE, payload: { values: { Client: 'A' } }, ledger_key: 'raenest:1', risk: 'low' });
    expect(ok).toMatchObject({ fn: 'crew_propose', args: { p_action: 'record.create', p_table: TABLE, p_risk: 'low', p_ledger_key: 'raenest:1' } });
  });

  it('propose: payload must be an object and not huge', async () => {
    await expect(run('propose', { action: 'advice.finance', summary: 'x', payload: 'text' })).rejects.toThrow('must be an object');
    await expect(run('propose', { action: 'advice.finance', summary: 'x', payload: { big: 'y'.repeat(70_000) } })).rejects.toThrow('too big');
  });

  it('app changes: a source (never a table), values by column name, soft delete only, no permanent delete', async () => {
    const create = await run('propose', { action: 'app.create', source: 'subscriptions', summary: 'Add Vercel Pro', payload: { values: { name: 'Vercel Pro', amount_ngn: 30000 } }, ledger_key: 'sub:vercel-pro:monthly' });
    expect(create).toMatchObject({ fn: 'crew_propose', args: { p_action: 'app.create', p_table: null, p_payload: { source: 'subscriptions', values: { name: 'Vercel Pro', amount_ngn: 30000 } }, p_ledger_key: 'sub:vercel-pro:monthly' } });
    // the top-level source wins over a source smuggled inside the payload
    expect(await run('propose', { action: 'app.update', source: 'vendors', summary: 'x', payload: { source: 'payroll_runs', record_id: TABLE, values: { notes: 'a' } } })).toMatchObject({ args: { p_payload: { source: 'vendors', record_id: TABLE } } });
    expect(await run('propose', { action: 'app.soft_delete', source: 'clients', summary: 'x', payload: { record_id: TABLE } })).toMatchObject({ args: { p_action: 'app.soft_delete' } });
    await expect(run('propose', { action: 'app.create', summary: 'x', payload: { values: { name: 'a' } } })).rejects.toThrow('source is required');
    await expect(run('propose', { action: 'app.create', source: 'subscriptions; drop table x', summary: 'x' })).rejects.toThrow('source must be');
    await expect(run('propose', { action: 'app.create', source: 'subscriptions', summary: 'x', table_id: TABLE })).rejects.toThrow('not a table_id');
    await expect(run('propose', { action: 'app.delete', source: 'subscriptions', summary: 'x' })).rejects.toThrow('unknown action');
    await expect(run('propose', { action: 'app.hard_delete', source: 'subscriptions', summary: 'x' })).rejects.toThrow('unknown action');
    await expect(run('propose', { action: 'app.create', source: 'subscriptions', summary: 'x', payload: 'text' })).rejects.toThrow('must be an object');
    // an agent cannot pretend to be another one
    expect(await run('propose', { action: 'app.create', source: 'clients', summary: 'x', p_agent: 'someone-else', payload: { values: { name: 'a' } } })).toMatchObject({ args: { p_agent: AGENT } });
  });

  it('app_schema: lists the writable sources, or the columns of one', async () => {
    expect(await run('app_schema')).toEqual({ fn: 'crew_app_schema', args: { p_agent: AGENT, p_source: null } });
    expect(await run('app_schema', { source: 'subscriptions', p_agent: 'someone-else' })).toEqual({ fn: 'crew_app_schema', args: { p_agent: AGENT, p_source: 'subscriptions' } });
    await expect(run('app_schema', { source: 'x'.repeat(41) })).rejects.toThrow('too long');
  });

  it('read: validates filters and caps the page size', async () => {
    const p = await run('read', { table_id: TABLE, limit: 99999, filters: [{ field: 'Date Paid', op: 'gte', value: '2026-11-01' }] });
    expect(p).toMatchObject({ fn: 'crew_read_records', args: { p_limit: 500, p_filters: [{ field: 'Date Paid', op: 'gte', value: '2026-11-01' }] } });
    await expect(run('read', { table_id: TABLE, filters: [{ field: 'x', op: 'drop table' }] })).rejects.toThrow('op must be');
    await expect(run('read', { table_id: TABLE, filters: 'nope' })).rejects.toThrow('filters must be');
    await expect(run('read', {})).rejects.toThrow('table_id is required');
  });

  it('message: to the owner by default, to a colleague by slug, never to itself or a stranger', async () => {
    expect(await run('message', { body: 'hello' })).toMatchObject({ fn: 'crew_post_message', args: { p_to_agent: null, p_kind: 'message' } });
    expect(await run('message', { to: 'owner', body: 'hello' })).toMatchObject({ args: { p_to_agent: null } });
    expect(await run('message', { to: 'cfo', body: 'hi', kind: 'challenge' })).toMatchObject({ args: { p_to_agent: known.cfo, p_kind: 'challenge' } });
    await expect(run('message', { to: 'nobody', body: 'hi' })).rejects.toThrow('no agent called');
    await expect(run('message', { to: AGENT, body: 'hi' })).rejects.toThrow(); // not a slug
    await expect(run('message', { to: 'cfo; drop table', body: 'hi' })).rejects.toThrow('slug');
    await expect(run('message', { body: '' })).rejects.toThrow('required');
    await expect(run('message', { body: 'x', kind: 'god_mode' })).rejects.toThrow('kind must be');
    expect(await run('message', { body: 'Send the Relentless invoice today', kind: 'reminder' })).toMatchObject({ args: { p_kind: 'reminder' } });
  });

  it('notes, runs, orders, endorsements', async () => {
    expect(await run('note', { body: 'Never record Raenest NGN funding as income' })).toMatchObject({ fn: 'crew_add_note', args: { p_kind: 'lesson', p_source: 'self_review', p_confidence: 3 } });
    expect(await run('note', { body: 'x y z', confidence: 99 })).toMatchObject({ args: { p_confidence: 5 } });
    await expect(run('note', { body: 'x y z', kind: 'permission' })).rejects.toThrow('kind must be');
    expect(await run('begin_run', {})).toMatchObject({ fn: 'crew_begin_run', args: { p_kind: 'routine' } });
    expect(await run('log_run', { summary: 'done', ok: false })).toMatchObject({ fn: 'crew_log_run', args: { p_ok: false } });
    await expect(run('respond_order', { order_id: TABLE, stance: 'challenge' })).rejects.toThrow('text is required');
    expect(await run('respond_order', { order_id: TABLE, stance: 'accept' })).toMatchObject({ args: { p_stance: 'accept', p_text: null } });
    expect(await run('endorse', { proposal_id: TABLE, stance: 'oppose', note: 'cash is short' })).toMatchObject({ fn: 'crew_endorse', args: { p_stance: 'oppose' } });
    await expect(run('endorse', { proposal_id: TABLE, stance: 'approve' })).rejects.toThrow('stance must be');
    expect(await run('knowledge', { topic: 'clients' })).toMatchObject({ fn: 'crew_get_knowledge', args: { p_topic: 'clients' } });
  });

  it('ideas: file, support, list and (Engineering only, enforced in the database) triage', async () => {
    expect(await run('ideas')).toMatchObject({ fn: 'crew_idea_list', args: { p_agent: AGENT, p_status: null } });
    expect(await run('ideas', { status: 'approved' })).toMatchObject({ args: { p_status: 'approved' } });
    await expect(run('ideas', { status: 'everything' })).rejects.toThrow('status must be');
    expect(await run('idea', { title: 'Daily huddle reminder', problem: 'Someone must remember to announce the huddle every morning.', proposal: 'A reminder at 9am' })).toMatchObject({ fn: 'crew_idea_submit', args: { p_agent: AGENT, p_title: 'Daily huddle reminder' } });
    await expect(run('idea', { title: 'x'.repeat(161), problem: 'long enough problem text' })).rejects.toThrow('too long');
    await expect(run('idea', { problem: 'a problem without a title' })).rejects.toThrow('title is required');
    expect(await run('idea_support', { idea_id: TABLE, note: 'Finance needs this too' })).toMatchObject({ fn: 'crew_idea_support', args: { p_idea: TABLE } });
    await expect(run('idea_support', { idea_id: 'nope' })).rejects.toThrow('must be an id');
    expect(await run('idea_triage', { idea_id: TABLE, priority: 'high', estimate: '2 days', merge_into: AGENT })).toMatchObject({ fn: 'crew_idea_triage', args: { p_priority: 'high', p_estimate: '2 days', p_merge_into: AGENT } });
    await expect(run('idea_triage', { idea_id: TABLE, priority: 'urgent' })).rejects.toThrow('priority must be');
  });

  it('app data: sources, a bounded read of one source, and a brief list of tables', async () => {
    expect(await run('sources')).toMatchObject({ fn: 'crew_list_sources', args: { p_agent: AGENT } });
    expect(await run('app', { source: 'expenses', filters: [{ field: 'status', op: 'eq', value: 'pending' }], select: ['id', 'amount_ngn'], limit: 99999, order_field: 'date' })).toMatchObject({ fn: 'crew_read_app', args: { p_source: 'expenses', p_limit: 500, p_select: ['id', 'amount_ngn'], p_order_field: 'date', p_desc: true } });
    await expect(run('app', {})).rejects.toThrow('source is required');
    await expect(run('app', { source: 'expenses', select: ['id; drop table x'] })).rejects.toThrow('list of column names');
    await expect(run('app', { source: 'expenses', select: [] })).rejects.toThrow('list of column names');
    await expect(run('app', { source: 'expenses', filters: [{ field: 'x', op: 'sql' }] })).rejects.toThrow('op must be');
    expect(await run('tables')).toMatchObject({ fn: 'crew_list_tables', args: { p_search: null, p_table: null } });
    expect(await run('tables', { search: 'income', table_id: TABLE })).toMatchObject({ args: { p_search: 'income', p_table: TABLE } });
    await expect(run('tables', { table_id: 'nope' })).rejects.toThrow('must be an id');
  });

  it('heartbeat: status from the fixed list, numbers only', async () => {
    expect(await run('heartbeat', { status: 'walking', activity: 'to the owner', x: 10, y: 4.5 })).toMatchObject({ fn: 'crew_heartbeat', args: { p_status: 'walking', p_x: 10, p_y: 4.5 } });
    await expect(run('heartbeat', { status: 'sleeping' })).rejects.toThrow('status must be');
    await expect(run('heartbeat', { status: 'idle', x: 'left' })).rejects.toThrow('x must be a number');
  });

  it('plain reads of the agent\'s own rows', async () => {
    expect(await run('whoami')).toEqual({ read: 'whoami' });
    expect(await run('proposals', { status: 'rejected', limit: 5 })).toEqual({ read: 'proposals', status: 'rejected', limit: 5 });
    await expect(run('proposals', { status: 'weird' })).rejects.toThrow('status must be');
  });
});

describe('crew gateway: meetings', () => {
  const MEETING = '44444444-4444-4444-8444-444444444444';

  it('reads a meeting thread as the authenticated agent only', async () => {
    expect(await run('meeting', { meeting_id: MEETING, p_agent: TABLE })).toEqual({ fn: 'crew_meeting_thread', args: { p_agent: AGENT, p_meeting: MEETING } });
    await expect(run('meeting')).rejects.toThrow('meeting_id is required');
    await expect(run('meeting', { meeting_id: 'not-an-id' })).rejects.toThrow('must be an id');
  });

  it('posts one contribution: body required, at most 1200 characters', async () => {
    expect(await run('meeting_post', { meeting_id: MEETING, body: 'Cash is tight: two months left.' })).toEqual({
      fn: 'crew_meeting_post', args: { p_agent: AGENT, p_meeting: MEETING, p_body: 'Cash is tight: two months left.', p_minutes: null },
    });
    await expect(run('meeting_post', { meeting_id: MEETING })).rejects.toThrow('body is required');
    await expect(run('meeting_post', { meeting_id: MEETING, body: '   ' })).rejects.toThrow('body is required');
    await expect(run('meeting_post', { meeting_id: MEETING, body: 'x'.repeat(1201) })).rejects.toThrow('too long');
    expect(await run('meeting_post', { meeting_id: MEETING, body: 'x'.repeat(1200) })).toMatchObject({ args: { p_minutes: null } });
    await expect(run('meeting_post', { body: 'hello' })).rejects.toThrow('meeting_id is required');
  });

  it('minutes: a summary, short lists and action items with slugs; the body becomes optional', async () => {
    const minutes = { summary: 'Runway is two months.', decisions: ['Chase receivables'], needs_owner: ['Approve a bridge loan?'], action_items: [{ agent: 'cfo', task: 'Draft the loan note' }] };
    expect(await run('meeting_post', { meeting_id: MEETING, minutes })).toEqual({
      fn: 'crew_meeting_post', args: { p_agent: AGENT, p_meeting: MEETING, p_body: '', p_minutes: minutes },
    });
    expect(await run('meeting_post', { meeting_id: MEETING, minutes: { summary: 'Short.' } })).toMatchObject({ args: { p_minutes: { summary: 'Short.', decisions: [], needs_owner: [], action_items: [] } } });
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: 'text' })).rejects.toThrow('minutes must be an object');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { decisions: ['x'] } })).rejects.toThrow('summary is required');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 'x'.repeat(1501) } })).rejects.toThrow('too long');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', decisions: Array(11).fill('d') } })).rejects.toThrow('at most 10');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', needs_owner: ['y'.repeat(301)] } })).rejects.toThrow('300 characters');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', decisions: [1] } })).rejects.toThrow('300 characters');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', action_items: [{ agent: 'CFO; drop', task: 'x' }] } })).rejects.toThrow('agent (a slug)');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', action_items: [{ agent: 'cfo' }] } })).rejects.toThrow('task is required');
    await expect(run('meeting_post', { meeting_id: MEETING, minutes: { summary: 's', action_items: Array(11).fill({ agent: 'cfo', task: 't' }) } })).rejects.toThrow('at most 10');
  });
});

describe('crew gateway: visitors (people the owner let in, who are not the owner)', () => {
  const PERSON = '55555555-5555-4555-8555-555555555555';

  it('reads visitor questions as the authenticated agent only; they are not in the inbox', async () => {
    expect(await run('visitor_questions', { p_agent: TABLE })).toEqual({ fn: 'crew_viewer_questions', args: { p_agent: AGENT } });
    expect(await run('inbox')).toMatchObject({ fn: 'crew_inbox' });
  });

  it('message with to_profile is a short reply for that person only, never for the owner or a colleague', async () => {
    expect(await run('message', { to_profile: PERSON, body: 'Cash is fine; ask the owner for details.', kind: 'alert' })).toEqual({
      fn: 'crew_post_message',
      args: { p_agent: AGENT, p_to_agent: null, p_body: 'Cash is fine; ask the owner for details.', p_kind: 'reply', p_ref_proposal: null, p_ref_order: null, p_to_profile: PERSON },
    });
    expect(await run('message', { to_profile: PERSON.toUpperCase(), body: 'ok' })).toMatchObject({ args: { p_to_profile: PERSON } });
    await expect(run('message', { to_profile: 'not-an-id', body: 'x' })).rejects.toThrow('must be an id');
    await expect(run('message', { to_profile: PERSON, to: 'cfo', body: 'x' })).rejects.toThrow('cannot be combined');
    await expect(run('message', { to_profile: PERSON, to: 'owner', body: 'x' })).rejects.toThrow('cannot be combined');
    await expect(run('message', { to_profile: PERSON, body: 'x', ref_proposal: TABLE })).rejects.toThrow('cannot refer to a proposal');
    await expect(run('message', { to_profile: PERSON, body: 'x', ref_order: TABLE })).rejects.toThrow('cannot refer to an order');
    await expect(run('message', { to_profile: PERSON })).rejects.toThrow('body is required');
    await expect(run('message', { to_profile: PERSON, body: 'x'.repeat(2001) })).rejects.toThrow('too long');
  });

  it('a message without to_profile works as before (to the owner by default)', async () => {
    expect(await run('message', { body: 'hello' })).toMatchObject({ args: { p_to_agent: null, p_kind: 'message' } });
    expect(((await run('message', { body: 'hello' })) as { args: Record<string, unknown> }).args).not.toHaveProperty('p_to_profile');
  });
});

describe('crew gateway: errors, limits, tokens', () => {
  it('shows the agent only our own refusals', () => {
    expect(describeDbError({ code: 'P0001', message: 'this agent may not write to that base' })).toEqual({ status: 400, message: 'this agent may not write to that base' });
    expect(describeDbError({ code: '23505', message: 'duplicate: "x" was already handled' }).status).toBe(409);
    expect(describeDbError({ code: '23505', message: 'duplicate key value violates unique constraint "crew_ledger_pkey"' }).message).toBe('duplicate: that was already recorded');
    const hidden = describeDbError({ code: 'XX000', message: 'relation "secret" does not exist' });
    expect(hidden.status).toBe(500);
    expect(hidden.message).not.toContain('secret');
  });

  it('limits one agent without affecting another', () => {
    let t = 0;
    const ok = makeLimiter(3, () => t);
    expect([ok('a'), ok('a'), ok('a'), ok('a'), ok('b')]).toEqual([true, true, true, false, true]);
    t = 61_000;
    expect(ok('a')).toBe(true);
  });

  it('accepts only a well-formed agent token', () => {
    const good = 'crew_' + 'a1'.repeat(24);
    expect(bearer(`Bearer ${good}`)).toBe(good);
    for (const bad of [null, '', good, `Bearer ${good}x`, 'Bearer crew_short', `bearer ${good}`, `Bearer sbp_${'a1'.repeat(24)}`]) expect(bearer(bad as string | null)).toBeNull();
  });
});
