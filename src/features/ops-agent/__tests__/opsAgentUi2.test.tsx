// Ops Agent round 2: Memory in Settings, chat "Remember this?", the 6:30 PM summary look-ahead and API body templates,
// against a fake database and fake edge functions.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { table?: string; op: string; args: unknown[] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  tables: {} as Record<string, unknown>,
  chat: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => {
  const WRITES = ['insert', 'update', 'upsert', 'delete'];
  const builder = (table: string) => {
    let single = false;
    const b: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const data = h.tables[table] ?? [];
          const result = { data: single && Array.isArray(data) ? data[0] ?? null : data, error: null, count: Array.isArray(data) ? 3 : null };
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
        }
        return (...args: unknown[]) => {
          if (WRITES.includes(prop)) h.calls.push({ table, op: prop, args });
          if (prop === 'single' || prop === 'maybeSingle') single = true;
          return b;
        };
      },
    });
    return b;
  };
  const supabase = {
    from: (table: string) => builder(table),
    channel: () => { const api = { on: () => api, subscribe: () => api }; return api; },
    removeChannel: () => Promise.resolve('ok'),
    rpc: (name: string, args?: unknown) => {
      if (name === 'agent_my_scope') return Promise.resolve({ data: { role: 'super_admin', access: true, configure: true, companies: null, modules: null }, error: null });
      if (name === 'agent_ai_budget_state') return Promise.resolve({ data: { level: 'ok', ai_enabled: true, spent_today_usd: 0, spent_month_usd: 0, daily_budget_usd: 5, monthly_budget_usd: 50 }, error: null });
      if (name === 'agent_team_pulse') return Promise.resolve({ data: null, error: { message: 'not deployed' } });
      h.calls.push({ op: `rpc:${name}`, args: [args] });
      return Promise.resolve({ data: 0, error: null });
    },
    functions: {
      invoke: (fn: string, opts: { body: { action?: string } }) => {
        const action = opts.body.action;
        if (!(fn === 'agent-ai' && action === 'status')) h.calls.push({ op: `invoke:${fn}${action ? `:${action}` : ''}`, args: [opts.body] });
        let data: unknown = { ok: true };
        if (fn === 'agent-ai' && action === 'status') data = { key_configured: true, key_source: 'env', ai_enabled: true, models: { fast: 'a', smart: 'b' }, budget: { level: 'ok' } };
        else if (fn === 'agent-chat') data = h.chat;
        return Promise.resolve({ data, error: null });
      },
    },
  };
  return { supabase };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => undefined }) }));

import OpsAgent from '@/pages/OpsAgent';
import { SummariesTab } from '@/features/ops-agent/tabs/SummariesTab';
import { ChatTab } from '@/features/ops-agent/tabs/ChatTab';
import { renderTemplate, unknownVariables } from '@/features/ops-agent/connectionTemplate';

function renderUi(ui: React.ReactNode, route = '/agent') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="/agent/*" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];
const writes = () => h.calls.filter((c) => WRITE_OPS.includes(c.op));

const daily = (id: string, end: string, extra: Record<string, unknown>) => ({
  id, period_kind: 'day', period_start: end, period_end: end, company_id: null, auto: true, created_at: `${end}T22:30:00Z`, narrative: `Narrative ${id}`,
  metrics: { headline: `Headline ${id}`, tracking: { expected_days: 20, tracked_days: 18, hours: 120 }, reports: { expected: 20, submitted: 15 }, tasks: { completed: 9, overdue: 2 }, flags: { opened: 7, high: 2 }, ...extra },
});

beforeEach(() => {
  h.calls.length = 0;
  h.chat = { ok: true, thread_id: 't1', reply: 'Noted.', tools_used: [] };
  h.tables = {
    agent_settings: { id: true, operating_rules: '', escalation_window_days: 14 },
    agent_company_scope: [], companies: [], agent_summaries: [], agent_memory: [], agent_chat_threads: [], agent_chat_messages: [], profiles: [], agent_rules: [],
  };
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('Summaries: the 6:30 PM look-ahead', () => {
  it('reads `tomorrow` on new rows and `today` on old ones', async () => {
    h.tables = { ...h.tables, agent_summaries: [daily('d2', '2026-11-18', { tomorrow: { due_tomorrow: 3, on_leave: 1 } }), daily('d1', '2026-11-17', { today: { due_today: 2, on_leave: 0 } })] };
    renderUi(<SummariesTab />);
    const [latest, old] = await screen.findAllByTestId('summary-card');
    expect(within(latest).getByTestId('summary-outlook')).toHaveTextContent('Tomorrow');
    expect(within(latest).getByTestId('summary-outlook')).toHaveTextContent('3 tasks are due');
    expect(within(latest).getByTestId('summary-outlook')).toHaveTextContent('1 person is on leave');
    fireEvent.click(within(old).getByRole('button', { expanded: false }));
    expect(within(old).getByTestId('summary-outlook')).toHaveTextContent('Today');
    expect(within(old).getByTestId('summary-outlook')).toHaveTextContent('2 tasks are due');
  });
});

describe('Memory in Settings', () => {
  const mem = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, type: 'preference', content: `Memory ${id}`, detail: null, scope: 'global', scope_ref: null, source: 'chat', source_thread: null, status, created_at: '2026-11-18T15:00:00Z', ...extra });

  it('is a Settings section, and the old /agent/memory address goes there', async () => {
    renderUi(<OpsAgent />, '/agent/memory');
    expect(await screen.findByTestId('agent-memory')).toBeInTheDocument();
    expect(screen.getByTestId('agent-settings')).toHaveAttribute('data-section', 'memory');
    expect(within(screen.getByTestId('settings-rail')).getByRole('link', { name: /Memory/ })).toHaveAttribute('href', '/agent/settings/memory');
  });

  it('splits memories into Active, Waiting and Archived and shows type, detail, scope, source and date', async () => {
    h.tables = { ...h.tables, agent_memory: [
      mem('a1', 'active', { type: 'fact', detail: 'Applies to month end only.' }),
      mem('w1', 'proposed', { type: 'exemption', scope: 'person', scope_ref: 'Cara Obi', detail: 'Part time on Fridays.' }),
      mem('x1', 'archived'),
    ] };
    renderUi(<OpsAgent />, '/agent/settings/memory');
    expect(await screen.findAllByTestId('memory-row')).toHaveLength(1);
    expect(screen.getByTestId('memory-tab-active')).toHaveTextContent('1');
    expect(screen.getByTestId('memory-detail')).toHaveTextContent('Applies to month end only.');
    fireEvent.click(screen.getByTestId('memory-tab-proposed'));
    const row = screen.getByTestId('memory-row');
    expect(row).toHaveTextContent('exemption');
    expect(row).toHaveTextContent('person: Cara Obi');
    expect(row).toHaveTextContent('Chat');
    expect(row).toHaveTextContent('Nov 18, 2026');
    expect(row).toHaveTextContent('Part time on Fridays.');
    expect(writes()).toEqual([]);
    fireEvent.click(within(row).getByTestId('memory-approve'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ table: 'agent_memory', op: 'update' });
    expect(writes()[0].args[0]).toMatchObject({ status: 'active' });
    fireEvent.click(screen.getByTestId('memory-tab-archived'));
    expect(screen.getAllByTestId('memory-row')).toHaveLength(1);
  });

  it('rejects, archives, edits text and detail, and adds by hand', async () => {
    h.tables = { ...h.tables, agent_memory: [mem('a1', 'active', { detail: 'old detail' }), mem('w1', 'proposed')] };
    renderUi(<OpsAgent />, '/agent/settings/memory');
    await screen.findAllByTestId('memory-row');
    fireEvent.click(within(screen.getByTestId('memory-row')).getByTestId('memory-archive'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ status: 'archived' });
    fireEvent.click(screen.getByTestId('memory-tab-proposed'));
    fireEvent.click(within(screen.getByTestId('memory-row')).getByTestId('memory-reject'));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1].args[0]).toMatchObject({ status: 'rejected' });
    fireEvent.click(screen.getByTestId('memory-tab-active'));
    fireEvent.click(within(screen.getByTestId('memory-row')).getByTestId('memory-edit'));
    const dialog = await screen.findByTestId('memory-dialog');
    fireEvent.change(within(dialog).getByLabelText('Memory'), { target: { value: 'New text' } });
    fireEvent.change(within(dialog).getByLabelText('Detail (optional)'), { target: { value: 'New detail' } });
    fireEvent.click(within(dialog).getByTestId('memory-save'));
    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[2].args[0]).toEqual({ content: 'New text', detail: 'New detail' });
    await waitFor(() => expect(screen.queryByTestId('memory-dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('memory-add'));
    const add = await screen.findByTestId('memory-dialog');
    expect(within(add).getByTestId('memory-save')).toBeDisabled();
    fireEvent.change(within(add).getByLabelText('Memory'), { target: { value: 'Month end reports are due a day later' } });
    fireEvent.click(within(add).getByTestId('memory-save'));
    await waitFor(() => expect(writes()).toHaveLength(4));
    expect(writes()[3]).toMatchObject({ table: 'agent_memory', op: 'insert' });
    expect(writes()[3].args[0]).toMatchObject({ type: 'fact', content: 'Month end reports are due a day later', scope: 'global', scope_ref: null, source: 'manual', status: 'active' });
  });
});

describe('Chat asks "Remember this?"', () => {
  const suggestion = { id: 'm1', type: 'exemption', content: 'Cara is exempt from the Friday report', detail: 'She works part time', scope: 'person', scope_ref: 'Cara Obi' };
  const ask = async () => {
    renderUi(<ChatTab />, '/agent/chat');
    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'Cara is part time on Fridays' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    return screen.findByTestId('memory-suggestion');
  };

  it('shows a card under the answer, and Yes marks the memory active', async () => {
    h.chat = { ok: true, thread_id: 't1', reply: 'Noted.', tools_used: [], memory_suggestions: [suggestion] };
    const card = await ask();
    expect(card).toHaveTextContent('Remember this?');
    expect(card).toHaveTextContent('Cara is exempt from the Friday report');
    expect(card).toHaveTextContent('She works part time');
    expect(writes()).toEqual([]); // nothing is written until a button is pressed
    fireEvent.click(within(card).getByTestId('memory-yes'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ table: 'agent_memory', op: 'update' });
    expect(writes()[0].args[0]).toMatchObject({ status: 'active' });
    expect(Object.keys(writes()[0].args[0] as object)).toContain('approved_by');
    expect(await within(card).findByTestId('memory-saved')).toHaveTextContent('Saved to memory');
    expect(within(card).getByRole('link', { name: /Settings, Memory/ })).toHaveAttribute('href', '/agent/settings/memory');
    expect(within(card).queryByTestId('memory-yes')).not.toBeInTheDocument();
  });

  it('No marks it rejected and says it was not saved', async () => {
    h.chat = { ok: true, thread_id: 't1', reply: 'Noted.', tools_used: [], memory_suggestions: [suggestion] };
    const card = await ask();
    fireEvent.click(within(card).getByTestId('memory-no'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ status: 'rejected' });
    expect(await within(card).findByTestId('memory-not-saved')).toHaveTextContent('Not saved');
  });

  it('shows no card when the answer carries no suggestion', async () => {
    renderUi(<ChatTab />, '/agent/chat');
    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await screen.findByText('Noted.');
    expect(screen.queryByTestId('memory-suggestion')).not.toBeInTheDocument();
  });

  it("loads the thread's pending suggestions when it is reopened, without writing", async () => {
    h.tables = { ...h.tables,
      agent_chat_threads: [{ id: 't1', title: 'Earlier chat', updated_at: '2026-11-18T10:00:00Z' }],
      agent_chat_messages: [
        { id: 'u1', thread_id: 't1', role: 'user', content: 'Cara is part time', tool_calls: null, created_at: '2026-11-18T10:00:00Z' },
        { id: 'a1', thread_id: 't1', role: 'assistant', content: 'Noted.', tool_calls: [], created_at: '2026-11-18T10:00:05Z' },
      ],
      agent_memory: [{ id: 'm9', type: 'preference', content: 'Prefers reports before noon', detail: null, scope: 'global', scope_ref: null, source: 'chat', source_thread: 't1', status: 'proposed', created_at: '2026-11-18T10:00:06Z' }] };
    renderUi(<ChatTab />, '/agent/chat');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Earlier chat' }))[0]);
    const card = await screen.findByTestId('memory-suggestion');
    expect(card).toHaveTextContent('Prefers reports before noon');
    expect(writes()).toEqual([]);
  });
});

describe('API body templates', () => {
  it('fills the variables with sample values, escaped for the content type', () => {
    expect(renderTemplate('{"t":"{{title}}","s":"{{severity}}"}', 'json')).toBe('{"t":"Cara Obi has not tracked time today","s":"high"}');
    expect(renderTemplate('{"x":"{{text}}"}', 'json', { text: 'say "hi"' })).toBe('{"x":"say \\"hi\\""}');
    expect(renderTemplate('Body={{title}}', 'form', { title: 'a b&c' })).toBe('Body=a%20b%26c');
    expect(renderTemplate('{{ title }} / {{nope}}', 'text', { title: 'T' })).toBe('T / {{nope}}');
    expect(unknownVariables('{{title}} {{nope}} {{nope}} {{other}}')).toEqual(['nope', 'other']);
  });
});
