// Ops Agent: end-to-end behaviour of callClaude against a fake Anthropic server and a fake database.
//   deno test --allow-net --allow-env --allow-read supabase/functions/_shared/agent-claude.test.ts
// (not part of CI, which runs vitest; the pure logic is covered by src/features/ops-agent/__tests__)

import { callClaude } from './agent-claude.ts';
import type { BudgetState } from './agent-claude-core.ts';

const SECRET = 'sk-ant-test-SECRET-KEY-12345';

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(`FAIL: ${msg}`); }

interface Fake {
  db: any;
  usageRows: Record<string, unknown>[];
  state: BudgetState;
  settings: Record<string, unknown>;
}

function fakeDb(over: { state?: Partial<BudgetState>; settings?: Record<string, unknown> } = {}): Fake {
  const f: Fake = {
    usageRows: [],
    state: { level: 'ok', ai_enabled: true, spent_today_usd: 0, spent_month_usd: 0, daily_budget_usd: 5, monthly_budget_usd: 50, ...over.state },
    settings: {
      ai_enabled: true, model_fast: 'claude-haiku-5-5', model_smart: 'claude-sonnet-5-5', operating_rules: 'Due dates never move.',
      model_prices: { 'claude-haiku-5-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 }, 'claude-sonnet-5-5': { input: 3, output: 15 } },
      ...over.settings,
    },
    db: null,
  };
  f.db = {
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: f.settings, error: null }) }) }) }),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'agent_ai_budget_state') return Promise.resolve({ data: f.state, error: null });
      if (name === 'agent_log_ai_usage') { f.usageRows.push(args); return Promise.resolve({ data: 'id', error: null }); }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    },
  };
  return f;
}

type Mode = 'ok' | 'fail' | 'leak';
function startServer(mode: () => Mode) {
  const seen: { headers: Headers; body: any }[] = [];
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body = await req.json();
    seen.push({ headers: req.headers, body });
    if (mode() === 'fail') return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: 'OK' }],
      usage: { input_tokens: 1200, output_tokens: 150, cache_read_input_tokens: 0, cache_creation_input_tokens: 800 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return { url, seen, stop: () => server.shutdown() };
}

Deno.test('callClaude: gate, logging, errors and key handling', async () => {
  let mode: Mode = 'ok';
  const srv = startServer(() => mode);
  Deno.env.set('ANTHROPIC_BASE_URL', srv.url);
  Deno.env.set('ANTHROPIC_API_KEY', SECRET);
  const msgs = [{ role: 'user' as const, content: 'ping' }];

  try {
    // 1. a normal call: routed to the fast model, system prefix cached, usage and cost logged
    let f = fakeDb();
    let r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs, task: 'Reply OK.', maxTokens: 16 }, f.db);
    assert(r.ok && r.text === 'OK', 'normal call should succeed');
    assert(r.ok && r.model === 'claude-haiku-5-5', 'fast alias should use the settings model');
    const req = srv.seen[0];
    assert(req.body.model === 'claude-haiku-5-5', 'request model');
    assert(req.body.max_tokens === 16, 'max_tokens passed');
    assert(Array.isArray(req.body.system) && req.body.system.some((b: any) => b.cache_control?.type === 'ephemeral'), 'system prefix is cached');
    assert(req.body.system.some((b: any) => String(b.text).includes('Due dates never move.')), 'Operating Rules are in the system prompt');
    assert(req.body.system.at(-1).text === 'Reply OK.' && !req.body.system.at(-1).cache_control, 'per-call task is last and uncached');
    assert(f.usageRows.length === 1, 'one usage row');
    const row = f.usageRows[0];
    assert(row.p_feature === 'unit' && row.p_model === 'claude-haiku-5-5' && row.p_ok === true, 'usage row fields');
    assert(row.p_input_tokens === 1200 && row.p_output_tokens === 150 && row.p_cache_write_tokens === 800, 'usage tokens');
    // 1200*1 + 800*1.25 + 150*5 = 2950 -> $0.00295
    assert(Math.abs((row.p_cost_usd as number) - 0.00295) < 1e-9, `cost ${row.p_cost_usd}`);

    // 2. smart alias uses the smart model
    f = fakeDb();
    r = await callClaude({ alias: 'smart', feature: 'unit', messages: msgs }, f.db);
    assert(r.ok && r.model === 'claude-sonnet-5-5', 'smart alias');

    // 3. AI switched off: nothing is sent, nothing is logged
    const before = srv.seen.length;
    f = fakeDb({ state: { ai_enabled: false } });
    r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs }, f.db);
    assert(!r.ok && r.reason === 'ai_disabled', 'ai_disabled');
    assert(srv.seen.length === before && f.usageRows.length === 0, 'no request and no usage when AI is off');
    // ...but the Super Admin's test can force it
    r = await callClaude({ alias: 'fast', feature: 'test', messages: msgs, force: true }, f.db);
    assert(r.ok, 'force bypasses the AI switch');

    // 4. budget 80%: non critical paused, chat continues
    f = fakeDb({ state: { level: 'warn' } });
    r = await callClaude({ alias: 'fast', feature: 'enrichment', messages: msgs, nonCritical: true }, f.db);
    assert(!r.ok && r.reason === 'budget_warn', 'non critical paused at 80%');
    r = await callClaude({ alias: 'smart', feature: 'chat', messages: msgs }, f.db);
    assert(r.ok, 'chat continues at 80%');

    // 5. budget 100%: everything stops
    const n = srv.seen.length;
    f = fakeDb({ state: { level: 'off' } });
    r = await callClaude({ alias: 'smart', feature: 'chat', messages: msgs }, f.db);
    assert(!r.ok && r.reason === 'budget_off', 'budget off');
    r = await callClaude({ alias: 'fast', feature: 'test', messages: msgs, force: true }, f.db);
    assert(!r.ok && r.reason === 'budget_off', 'budget off beats force');
    assert(srv.seen.length === n, 'no request when the budget is spent');

    // 6. provider error: no throw, a failed usage row, and the key is not echoed
    mode = 'fail';
    f = fakeDb();
    r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs }, f.db);
    assert(!r.ok && r.reason === 'error', 'provider error is returned, not thrown');
    assert(f.usageRows.length === 1 && f.usageRows[0].p_ok === false && f.usageRows[0].p_cost_usd === 0, 'failed call is logged with zero cost');
    assert(!JSON.stringify(r).includes(SECRET) && !JSON.stringify(f.usageRows).includes(SECRET), 'the key never appears in results or logs');
    mode = 'ok';

    // 7. unpriced model: still works, cost logged as 0
    f = fakeDb({ settings: { model_fast: 'brand-new-model' } });
    r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs }, f.db);
    assert(r.ok && f.usageRows[0].p_cost_usd === 0, 'unpriced model costs 0 in the log');

    // 8. a broken database never throws
    const broken = { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }), rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
    r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs }, broken as any);
    assert(!r.ok && r.reason === 'error', 'database failure is returned as an error');

    // 9. no key: nothing is sent
    Deno.env.delete('ANTHROPIC_API_KEY');
    const m = srv.seen.length;
    f = fakeDb();
    r = await callClaude({ alias: 'fast', feature: 'unit', messages: msgs }, f.db);
    assert(!r.ok && r.reason === 'no_key' && srv.seen.length === m, 'no key, no request');
    Deno.env.set('ANTHROPIC_API_KEY', SECRET);

    // 10. the key travels only in the x-api-key header of the request to the provider
    const h = srv.seen[0].headers;
    assert(h.get('x-api-key') === SECRET || h.get('authorization') === `Bearer ${SECRET}`, 'key sent to the provider in a header');
    assert(!JSON.stringify(srv.seen[0].body).includes(SECRET), 'key is not in the request body');
    console.log('PASS: callClaude gate / logging / fallback / key handling (10 scenarios)');
  } finally {
    await srv.stop();
  }
});
