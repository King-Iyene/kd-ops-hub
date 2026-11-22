import { describe, expect, it } from 'vitest';
import { runCliqWatch } from '../../../../supabase/functions/_shared/agent-cliq-monitor';
import { secretName } from '../../../../supabase/functions/_shared/agent-conn-secrets';

// A small in-memory stand-in for the database client: just the calls the reader makes.
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, secrets: Record<string, string>) {
  const make = (table: string) => {
    const state: { op: 'select' | 'update' | 'upsert'; filters: [string, unknown][]; payload?: Row | Row[]; limit?: number; selected: boolean } = { op: 'select', filters: [], selected: false };
    const rows = () => (tables[table] ??= []);
    const match = (r: Row) => state.filters.every(([k, v]) => r[k] === v);
    const run = () => {
      if (state.op === 'select') return { data: rows().filter(match).slice(0, state.limit ?? 1000).map((r) => ({ ...r })), error: null };
      if (state.op === 'update') { const hit = rows().filter(match); hit.forEach((r) => Object.assign(r, state.payload)); return { data: hit.map((r) => ({ id: r.id })), error: null }; }
      const inserted: Row[] = [];
      for (const p of state.payload as Row[]) {
        if (rows().some((r) => r.connection_id === p.connection_id && r.message_id === p.message_id && r.tagged_cliq_id === p.tagged_cliq_id)) continue;
        const row = { id: `R${rows().length + 1}`, ...p }; rows().push(row); inserted.push(row);
      }
      return { data: inserted.map((r) => ({ id: r.id })), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => { state.selected = true; return q; },
      eq: (k: string, v: unknown) => { state.filters.push([k, v]); return q; },
      limit: (n: number) => { state.limit = n; return q; },
      update: (p: Row) => { state.op = 'update'; state.payload = p; return q; },
      upsert: (p: Row[]) => { state.op = 'upsert'; state.payload = p; return q; },
      maybeSingle: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return {
    from: make,
    rpc: (name: string, a: { p_name: string; p_value?: string }) => {
      if (name === 'agent_secret_get') return Promise.resolve({ data: secrets[a.p_name] ?? null });
      if (name === 'agent_secret_set') { secrets[a.p_name] = a.p_value ?? ''; return Promise.resolve({ data: null }); }
      return Promise.resolve({ data: null });
    },
  };
}

const ID = 'c1000000-0000-0000-0000-0000000000d1';
const NOW = Date.now();
const setup = (over: { watch?: Row; secrets?: Record<string, string> } = {}) => {
  const names = ['access', 'secret', 'refresh'].map((p) => secretName(ID, p as 'access'));
  const tables: Record<string, Row[]> = {
    agent_cliq_watch: [{ connection_id: ID, enabled: true, enabled_at: new Date(NOW - 3_600_000).toISOString(), checked_through: new Date(NOW - 3_600_000).toISOString(), last_run_at: null, ...over.watch }],
    agent_connections: [{ id: ID, kind: 'cliq', name: 'Cliq', config: { mode: 'api', dc: 'com', client_id: '1000.ABCDEFGH12345678', channel: 'ops_alerts' }, vault_secret_names: names }],
    agent_settings: [{ id: true, app_url: 'https://ops.kdsquares.com' }],
    agent_cliq_messages: [],
  };
  const secrets = { [names[0]]: `${NOW + 3_600_000}:access-token-123456`, [names[1]]: 'client-secret-1234', [names[2]]: 'refresh-token-1234', ...over.secrets };
  return { tables, db: fakeDb(tables, secrets) };
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const channels = { channels: [{ channel_id: 'C1', name: 'Ops', unique_name: 'ops', chat_id: 'CT_1', level: 'organization' }, { channel_id: 'C2', name: 'General', unique_name: 'general', chat_id: 'CT_2', level: 'organization' }] };
const msg = (id: string, minutesAgo: number, sender: string, text: string) => ({ id, time: NOW - minutesAgo * 60_000, type: 'text', sender: { id: sender, name: sender === '1003' ? 'Alice' : 'Bob' }, content: { text } });
const zoho = (messages: Record<string, unknown[]>, opts: { channelsStatus?: number } = {}) => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  expect((init?.headers as Record<string, string>).Authorization).toBe('Zoho-oauthtoken access-token-123456');
  expect(new URL(url).host).toBe('cliq.zoho.com');
  if (url.includes('/api/v2/channels')) return opts.channelsStatus ? json({}, opts.channelsStatus) : json(channels);
  const chat = /chats\/([^/]+)\/messages/.exec(url)?.[1] ?? '';
  return json({ data: messages[chat] ?? [] });
}) as typeof fetch;

describe('Cliq watch: one read', () => {
  it('remembers who was tagged, leaves thank-yous alone, and moves the read mark forward', async () => {
    const { tables, db } = setup();
    const [r] = await runCliqWatch(db as never, {}, zoho({ CT_1: [msg('M1', 30, '1003', 'Hi {@1001}, can you send the report?'), msg('M2', 29, '1003', 'thanks {@1002}')] }));
    expect(r).toMatchObject({ ok: true, channels: 2, scanned: 2, tracked: 2, answered: 0, failed_channels: 0 });
    const rows = tables.agent_cliq_messages;
    expect(rows.map((x) => `${x.message_id}:${x.tagged_cliq_id}:${x.status}:${x.channel_unique}`)).toEqual(['M1:1001:open:ops', 'M2:1002:no_answer_needed:ops']);
    const w = tables.agent_cliq_watch[0];
    expect(Date.parse(w.checked_through as string)).toBeGreaterThan(NOW - 5000);
    expect(w.last_error).toBeNull();
    expect((w.stats as Record<string, number>).new_tagged).toBe(2);
  });

  it('marks a tagged message answered when the tagged person posts afterwards, and does not track it twice', async () => {
    const { tables, db } = setup();
    const first = [msg('M1', 30, '1003', 'Hi {@1001}, can you send the report?')];
    await runCliqWatch(db as never, { force: true }, zoho({ CT_1: first }));
    const [r] = await runCliqWatch(db as never, { force: true }, zoho({ CT_1: [...first, msg('M3', 10, '1001', 'sent, check your mail')] }));
    expect(r.tracked).toBe(0);
    expect(r.answered).toBe(1);
    expect(tables.agent_cliq_messages).toHaveLength(1);
    expect(tables.agent_cliq_messages[0]).toMatchObject({ status: 'answered', answered_in: 'channel' });
  });

  it('ignores messages from before the watch was switched on and the agent\'s own posts', async () => {
    const { tables, db } = setup();
    const [r] = await runCliqWatch(db as never, {}, zoho({ CT_1: [msg('OLD', 120, '1003', 'Hi {@1001}, can you send it?'), msg('OWN', 5, '1003', 'Hi {@1001}, still open?⁣')] }));
    expect(r.ok).toBe(true);
    expect(tables.agent_cliq_messages).toHaveLength(0);
  });

  it('says what to do when Zoho refuses, records it, and does not move the read mark', async () => {
    const { tables, db } = setup();
    const before = tables.agent_cliq_watch[0].checked_through;
    const [r] = await runCliqWatch(db as never, {}, zoho({}, { channelsStatus: 403 }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Reconnect to Zoho');
    expect(tables.agent_cliq_watch[0].last_error).toContain('Reconnect to Zoho');
    expect(tables.agent_cliq_watch[0].checked_through).toBe(before);
    expect(tables.agent_cliq_watch[0].last_run_at).not.toBeNull();
  });

  it('does not read again within 90 minutes unless asked to', async () => {
    const { db } = setup({ watch: { last_run_at: new Date(NOW - 20 * 60_000).toISOString() } });
    const calls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { calls.push(String(u)); return json(channels); }) as typeof fetch;
    const [skipped] = await runCliqWatch(db as never, {}, f);
    expect(skipped.skipped).toBe(true);
    expect(calls).toHaveLength(0);
    const [forced] = await runCliqWatch(db as never, { force: true }, zoho({}));
    expect(forced.skipped).toBeUndefined();
  });
});
