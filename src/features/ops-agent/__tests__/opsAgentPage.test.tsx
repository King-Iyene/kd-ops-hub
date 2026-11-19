// The Ops Agent screens, rendered against a fake database and fake edge functions. Checks what each role sees, that Admin
// controls are switched off, that saves send only what changed, that secrets are write only, that chat and connections
// work end to end, and that opening a screen never writes anything.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { table?: string; op: string; args: unknown[] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  scope: { role: 'super_admin', access: true, configure: true, companies: null, modules: null } as Record<string, unknown>,
  status: { key_configured: true, key_source: 'env', ai_enabled: true, models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' }, budget: { level: 'ok' } } as Record<string, unknown>,
  budget: { level: 'ok', ai_enabled: true, spent_today_usd: 0.5, spent_month_usd: 2, daily_budget_usd: 5, monthly_budget_usd: 50 } as Record<string, unknown>,
  setKey: { ok: true } as Record<string, unknown>,
  chat: { ok: true, thread_id: 't-new', reply: 'Tola Staff has not reported today.', tools_used: ['daily_reports'], title: 'Who has not reported' } as Record<string, unknown>,
  save: { ok: true, id: 'conn-new' } as Record<string, unknown>,
  test: { ok: true } as Record<string, unknown>,
  tables: {} as Record<string, unknown>,
  pulse: null as Record<string, unknown> | null,
  toasts: [] as { title?: string; description?: string }[],
  check: { created: 2, resolved: 1, errors: 0 } as Record<string, unknown>,
  channels: [] as { name: string; handlers: ((payload: unknown) => void)[]; subscribed: boolean; removed: boolean }[],
}));

const SETTINGS = {
  id: true, mode: 'observe', ai_enabled: true, model_fast: 'claude-haiku-5-5', model_smart: 'claude-sonnet-5-5',
  model_prices: { 'claude-haiku-5-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 }, 'claude-sonnet-5-5': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
  monthly_ai_budget_usd: 50, daily_ai_budget_usd: 5, timezone: 'America/New_York', report_deadline: '18:00:00', default_working_days: [1, 2, 3, 4, 5],
  default_work_start: '09:00:00', default_work_end: '17:00:00', default_country_code: 'NG', report_table_id: 't1', hr_contact_id: null,
  hide_own_flags: true, leadership_flags_super_admin_only: true, readonly_query_enabled: true, escalation_window_days: 14,
  operating_rules: '# Rules', updated_at: '2026-11-19T00:00:00Z',
};

const BASE_TABLES: Record<string, unknown> = {
  agent_settings: SETTINGS,
  agent_company_scope: [{ company_id: 'c1', enabled: true }],
  agent_module_catalog: [
    { key: 'task', label: 'Task', description: 'Tasks', sensitive: false, sort_order: 10 },
    { key: 'payroll', label: 'Payroll & payslips', description: 'Salary', sensitive: true, sort_order: 100 },
  ],
  agent_module_access: [{ module_key: 'task', enabled: true }, { module_key: 'payroll', enabled: false }],
  agent_person_profile: [], agent_admin_scope: [], agent_flags: [], agent_summaries: [], agent_memory: [], agent_connections: [], agent_api_keys: [],
  agent_chat_threads: [], agent_chat_messages: [], agent_ai_usage: [], agent_audit_log: [], agent_domain_list: [],
  companies: [{ id: 'c1', name: 'KD Squares Ltd', short_code: 'KDS', is_active: true }, { id: 'c2', name: 'NDI Ltd', short_code: 'NDI', is_active: true }],
  profiles: [
    { id: 'p1', full_name: 'Ada Obi', role: 'operations', job_title: 'Ops Lead', pay_group_id: 'g1', reporting_manager_id: null },
    { id: 'p2', full_name: 'Bayo Admin', role: 'admin', job_title: null, pay_group_id: 'g1', reporting_manager_id: null },
    { id: 'p3', full_name: 'Femi Field', role: 'field_staff', job_title: 'Field Agent', pay_group_id: 'g1', reporting_manager_id: null },
    { id: 'p4', full_name: 'Nkem NDI', role: 'operations', job_title: 'Analyst', pay_group_id: 'g-ndi', reporting_manager_id: null },
    { id: 'p5', full_name: 'Zed NoGroup', role: 'operations', job_title: null, pay_group_id: null, reporting_manager_id: null },
  ],
  tm_tables: [{ id: 't1', name: 'Report' }],
  pay_groups: [{ id: 'g1', company_id: 'c1' }, { id: 'g-ndi', company_id: 'c2' }],
};

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
    channel: (name: string) => {
      const ch = { name, handlers: [] as ((payload: unknown) => void)[], subscribed: false, removed: false };
      h.channels.push(ch);
      const api = {
        on: (_type: string, _filter: unknown, cb: (payload: unknown) => void) => { ch.handlers.push(cb); return api; },
        subscribe: () => { ch.subscribed = true; return api; },
        __ch: ch,
      };
      return api;
    },
    removeChannel: (api: { __ch: { removed: boolean } }) => { api.__ch.removed = true; return Promise.resolve('ok'); },
    rpc: (name: string, args?: unknown) => {
      if (name === 'agent_my_scope') return Promise.resolve({ data: h.scope, error: null });
      if (name === 'agent_ai_budget_state') return Promise.resolve({ data: h.budget, error: null });
      if (name === 'agent_team_pulse') return Promise.resolve(h.pulse ? { data: h.pulse, error: null } : { data: null, error: { message: 'function agent_team_pulse() does not exist' } });
      h.calls.push({ op: `rpc:${name}`, args: [args] });
      const data = name === 'agent_check_now' ? h.check
        : name === 'agent_suggest_person_profiles' ? { written: 2, kept_manual: 0, skipped_no_company: 1 }
        : name === 'agent_api_key_create' ? { id: 'k1', key: 'kdagent_FRESHKEY123', prefix: 'kdagent_FRES' } : 0;
      return Promise.resolve({ data, error: null });
    },
    functions: {
      invoke: (fn: string, opts: { body: { action?: string } & Record<string, unknown> }) => {
        const action = opts.body.action;
        if (!(fn === 'agent-ai' && action === 'status')) h.calls.push({ op: `invoke:${fn}${action ? `:${action}` : ''}`, args: [opts.body] });
        let data: unknown = { ok: true };
        if (fn === 'agent-ai' && action === 'status') data = h.status;
        else if (fn === 'agent-ai' && action === 'test') data = { ok: true, model: 'claude-haiku-5-5', text: 'OK', cost_usd: 0.00002 };
        else if (fn === 'agent-ai' && action === 'set_key') data = h.setKey;
        else if (fn === 'agent-chat') data = h.chat;
        else if (fn === 'agent-connections' && action === 'save') data = h.save;
        else if (fn === 'agent-connections' && action === 'test') data = h.test;
        return Promise.resolve({ data, error: null });
      },
    },
  };
  return { supabase };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (t: { title?: string; description?: string }) => { h.toasts.push(t); } }) }));

import OpsAgent from '@/pages/OpsAgent';
import { OpsAgentSidebarNav } from '@/components/OpsAgentSidebarNav';

function renderAt(route = '/agent', ui: React.ReactNode = <OpsAgent />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="/agent/*" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const writes = () => h.calls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.op) || c.op.startsWith('rpc:') || c.op.startsWith('invoke:'));
const only = (op: string) => h.calls.filter((c) => c.op === op);

beforeEach(() => {
  h.calls.length = 0;
  h.scope = { role: 'super_admin', access: true, configure: true, companies: null, modules: null };
  h.status = { key_configured: true, key_source: 'env', ai_enabled: true, models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' }, budget: { level: 'ok' } };
  h.budget = { level: 'ok', ai_enabled: true, spent_today_usd: 0.5, spent_month_usd: 2, daily_budget_usd: 5, monthly_budget_usd: 50 };
  h.setKey = { ok: true };
  h.chat = { ok: true, thread_id: 't-new', reply: 'Tola Staff has not reported today.', tools_used: ['daily_reports'], title: 'Who has not reported' };
  h.save = { ok: true, id: 'conn-new' };
  h.test = { ok: true };
  h.tables = { ...BASE_TABLES };
  h.pulse = null;
  h.channels.length = 0;
  h.toasts.length = 0;
});

describe('sidebar sections', () => {
  it('lists every section for a Super Admin, with the open Inbox count', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [{ id: 'f1', status: 'open', severity: 'high', title: 'x', last_seen_at: '2026-11-19T00:00:00Z' }, { id: 'f2', status: 'snoozed', severity: 'low', title: 'y', last_seen_at: '2026-11-19T00:00:00Z' }] };
    renderAt('/agent', <OpsAgentSidebarNav />);
    const nav = await screen.findByTestId('agent-sidebar-nav');
    await waitFor(() => expect(within(nav).getByRole('link', { name: /Connections/ })).toBeInTheDocument());
    for (const label of ['Inbox', 'Chat', 'Summaries', 'Memory', 'Connections', 'Settings']) expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Inbox/ })).toHaveTextContent('1'); // snoozed items are not counted
    expect(within(nav).getByRole('link', { name: /Chat/ })).toHaveAttribute('href', '/agent/chat');
  });

  it('hides Connections from an Admin', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    renderAt('/agent', <OpsAgentSidebarNav />);
    const nav = await screen.findByTestId('agent-sidebar-nav');
    expect(within(nav).getByRole('link', { name: /Settings/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Connections/ })).not.toBeInTheDocument();
  });

  it('has no tab bar on the page itself', async () => {
    renderAt('/agent/settings');
    await screen.findByTestId('agent-settings');
    expect(screen.queryByTestId('agent-tab-settings')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('Ops Agent screens', () => {
  it('opens on the Inbox, with an honest empty state, and an unknown section falls back to it', async () => {
    renderAt('/agent/nonsense');
    expect(await screen.findByText('Nothing needs attention')).toBeInTheDocument();
  });

  it('has no Mode and no AI switch anywhere in Settings', async () => {
    renderAt('/agent/settings');
    await screen.findByTestId('agent-settings');
    expect(screen.queryByText('Observe')).not.toBeInTheDocument();
    expect(screen.queryByText('Enforce')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'AI features' })).not.toBeInTheDocument();
  });

  it('never writes anything just by opening any section', async () => {
    const routes = ['/agent', '/agent/chat', '/agent/summaries', '/agent/memory', '/agent/connections', '/agent/settings',
      '/agent/settings/claude', '/agent/settings/team', '/agent/settings/calendar', '/agent/settings/coverage', '/agent/settings/rules', '/agent/settings/sites', '/agent/settings/changes'];
    for (const route of routes) {
      h.calls.length = 0;
      const { unmount } = renderAt(route);
      await waitFor(() => expect(screen.getByTestId('ops-agent')).toBeInTheDocument());
      if (route === '/agent/settings' || route === '/agent/settings/claude') await screen.findByTestId('ai-meter');
      if (route === '/agent/settings/sites') await screen.findByTestId('domain-count');
      if (route === '/agent/settings/team') await screen.findByTestId('team-note');
      if (route === '/agent/connections') await screen.findByTestId('agent-connections');
      await new Promise((r) => setTimeout(r, 30));
      expect(writes(), `opening ${route}`).toEqual([]);
      unmount();
    }
  });

  it('makes Settings read only for an Admin and turns Connections away', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    for (const [route, absent] of [
      ['/agent/settings/claude', () => { expect(screen.queryByLabelText('Claude API key')).not.toBeInTheDocument(); expect(screen.queryByTestId('ai-test-fast')).not.toBeInTheDocument(); }],
      ['/agent/settings/team', () => expect(screen.queryByTestId('fill-groups')).not.toBeInTheDocument()],
      ['/agent/settings/coverage', () => expect(screen.queryByText('Admin access')).not.toBeInTheDocument()],
      ['/agent/settings/rules', () => expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()],
    ] as [string, () => void][]) {
      const { unmount } = renderAt(route);
      await screen.findByTestId('agent-settings');
      expect(screen.getByRole('note')).toHaveTextContent('read only');
      if (route.endsWith('rules')) fireEvent.change(await screen.findByLabelText('Operating Rules'), { target: { value: 'changed' } });
      absent();
      unmount();
    }
    renderAt('/agent/connections');
    expect(await screen.findByText(/managed by a Super Admin/)).toBeInTheDocument();
    expect(screen.queryByTestId('agent-connections')).not.toBeInTheDocument();
  });

  it('turns away a person the database says has no access', async () => {
    h.scope = { role: 'operations', access: false };
    renderAt('/agent');
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have access');
  });

  it('only enables Save once something changed, and sends only the changed field', async () => {
    renderAt('/agent/settings/rules');
    const rules = await screen.findByLabelText('Operating Rules');
    const saveButtons = () => screen.queryAllByRole('button', { name: /^Save$/ });
    expect(saveButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.change(rules, { target: { value: '# Rules\n- new line' } });
    const save = await waitFor(() => {
      const enabled = saveButtons().filter((b) => !(b as HTMLButtonElement).disabled);
      expect(enabled).toHaveLength(1);
      return enabled[0];
    });
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const patch = writes()[0].args[0] as Record<string, unknown>;
    expect(writes()[0].table).toBe('agent_settings');
    expect(Object.keys(patch).filter((k) => k !== 'updated_by')).toEqual(['operating_rules']);
  });

  it('shows a sensitive module as locked and refuses to let it be switched', async () => {
    renderAt('/agent/settings/coverage');
    const row = await screen.findByTestId('module-payroll');
    expect(within(row).getByText(/locked off/i)).toBeInTheDocument();
    expect(within(row).getByRole('switch')).toBeDisabled();
    expect(within(await screen.findByTestId('module-task')).getByRole('switch')).toBeEnabled();
  });

  it('warns when the Claude key is missing and when the budget is spent', async () => {
    h.status = { ...h.status, key_configured: false, key_source: null };
    h.budget = { ...h.budget, level: 'off', spent_today_usd: 5.2 };
    renderAt('/agent');
    const banners = await screen.findByTestId('agent-banners');
    await waitFor(() => expect(banners).toHaveTextContent('Claude is not connected'));
    expect(banners).toHaveTextContent('budget is spent');
  });

  it('runs the AI test only when pressed and reports the result', async () => {
    renderAt('/agent/settings');
    const btn = await screen.findByTestId('ai-test-fast');
    expect(writes()).toEqual([]);
    fireEvent.click(btn);
    expect(await screen.findByTestId('ai-test-result')).toHaveTextContent('Connected');
    expect(only('invoke:agent-ai:test')).toHaveLength(1);
  });

  it('fills groups through the database function when asked, not before', async () => {
    renderAt('/agent/settings/team');
    fireEvent.click(await screen.findByTestId('fill-groups'));
    await waitFor(() => expect(writes().some((c) => c.op === 'rpc:agent_suggest_person_profiles')).toBe(true));
  });
});

describe('the Claude key is write only', () => {
  it('sends the key once, clears the box at once, and never puts it on the page', async () => {
    h.status = { ...h.status, key_configured: false, key_source: null };
    const { container } = renderAt('/agent/settings');
    const box = await screen.findByLabelText('Claude API key');
    expect((box as HTMLInputElement).type).toBe('password');
    fireEvent.change(box, { target: { value: 'sk-ant-api03-SUPERSECRETVALUE1234567890' } });
    fireEvent.click(screen.getByTestId('key-save'));
    await waitFor(() => expect(only('invoke:agent-ai:set_key')).toHaveLength(1));
    expect((only('invoke:agent-ai:set_key')[0].args[0] as { key: string }).key).toBe('sk-ant-api03-SUPERSECRETVALUE1234567890');
    await waitFor(() => expect((screen.getByLabelText('Claude API key') as HTMLInputElement).value).toBe(''));
    expect(container.innerHTML).not.toContain('SUPERSECRETVALUE');
  });

  it('shows why a key was refused and still clears the box', async () => {
    h.setKey = { ok: false, reason: 'rejected', error: 'This key is not tied to a workspace, so it cannot send messages.' };
    const { container } = renderAt('/agent/settings');
    const box = await screen.findByLabelText('Claude API key');
    fireEvent.change(box, { target: { value: 'sk-ant-usr-NOTAWORKINGKEY12345678' } });
    fireEvent.click(screen.getByTestId('key-save'));
    expect(await screen.findByTestId('key-problem')).toHaveTextContent('not tied to a workspace');
    expect((screen.getByLabelText('Claude API key') as HTMLInputElement).value).toBe('');
    expect(container.innerHTML).not.toContain('NOTAWORKINGKEY');
  });

  it('says only "Set" and where it is kept', async () => {
    h.status = { ...h.status, key_configured: true, key_source: 'vault' };
    renderAt('/agent/settings');
    const status = await screen.findByTestId('ai-status');
    await waitFor(() => expect(status).toHaveTextContent('Set'));
    expect(status).toHaveTextContent('kept encrypted');
    expect(screen.getByRole('button', { name: 'Remove saved key' })).toBeInTheDocument();
  });
});

describe('Chat', () => {
  it('answers a suggested question, shows what it looked at, and keeps the conversation', async () => {
    renderAt('/agent/chat');
    const suggestion = (await screen.findAllByTestId('chat-suggestion'))[0];
    fireEvent.click(suggestion);
    const call = await waitFor(() => { const c = only('invoke:agent-chat'); expect(c).toHaveLength(1); return c[0]; });
    expect((call.args[0] as { message: string }).message).toBe('Who has not sent the daily report today?');
    expect((call.args[0] as { thread_id?: string }).thread_id).toBeUndefined();
    const box = await screen.findByTestId('chat-messages');
    await waitFor(() => expect(box).toHaveTextContent('Tola Staff has not reported today.'));
    expect(box).toHaveTextContent('Looked at: daily reports');
    expect(box).toHaveTextContent('Who has not sent the daily report today?');
  });

  it('sends a typed question with Enter and continues the same thread', async () => {
    renderAt('/agent/chat');
    const input = await screen.findByLabelText('Your question');
    fireEvent.change(input, { target: { value: 'Which tasks are overdue?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(only('invoke:agent-chat')).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('chat-messages')).toHaveTextContent('Tola Staff'));
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'And who is on leave?' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(only('invoke:agent-chat')).toHaveLength(2));
    expect((only('invoke:agent-chat')[1].args[0] as { thread_id: string }).thread_id).toBe('t-new');
  });

  it('does not send an empty question', async () => {
    renderAt('/agent/chat');
    expect(await screen.findByTestId('chat-send')).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Your question'), { key: 'Enter' });
    expect(only('invoke:agent-chat')).toHaveLength(0);
  });

  it('tells the person plainly when chat cannot answer', async () => {
    h.chat = { ok: false, reason: 'no_key', thread_id: 't-new', message: 'Chat needs the Claude key. A Super Admin adds it in Ops Agent, Settings.' };
    renderAt('/agent/chat');
    fireEvent.click((await screen.findAllByTestId('chat-suggestion'))[0]);
    expect(await screen.findByTestId('chat-error')).toHaveTextContent('Chat needs the Claude key');
  });
});

describe('Connections', () => {
  it('starts empty, then adds a Slack connection without ever echoing its address', async () => {
    renderAt('/agent/connections');
    expect(await screen.findByText('No connections yet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    const save = within(dialog).getByTestId('connection-save');
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops channel' } });
    const url = within(dialog).getByLabelText('Slack incoming webhook address') as HTMLInputElement;
    expect(url.type).toBe('password');
    fireEvent.change(url, { target: { value: 'https://hooks.slack.com/services/T000/B000/SECRETXYZ' } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    expect(only('invoke:agent-connections:save')[0].args[0]).toMatchObject({ action: 'save', kind: 'slack', name: 'Ops channel', url: 'https://hooks.slack.com/services/T000/B000/SECRETXYZ' });
    // nothing is sent by adding
    expect(only('invoke:agent-connections:test')).toHaveLength(0);
  });

  it('shows the dialog error when the server refuses an address', async () => {
    h.save = { ok: false, error: 'Internal addresses are not allowed.' };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.change(within(dialog).getByLabelText('Slack incoming webhook address'), { target: { value: 'https://localhost/x' } });
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    expect(await within(dialog).findByTestId('connection-error')).toHaveTextContent('Internal addresses');
  });

  it('lists connections, tests one only when pressed, and shows a failure plainly', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [
      { id: 'c-1', kind: 'slack', name: 'Ops channel', status: 'connected', config: { host: 'hooks.slack.com' }, vault_secret_names: ['agent_conn_x_url'], last_error: null, last_tested_at: '2026-11-19T10:00:00Z' },
      { id: 'c-2', kind: 'webhook', name: 'Billing hook', status: 'error', config: { url: 'https://billing.example.com/hook' }, vault_secret_names: [], last_error: 'The receiver refused the credentials (HTTP 401).', last_tested_at: null },
    ] };
    renderAt('/agent/connections');
    const rows = await screen.findAllByTestId('connection-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('hooks.slack.com');
    expect(rows[1]).toHaveTextContent('billing.example.com');
    expect(rows[1]).toHaveTextContent('refused the credentials');
    expect(only('invoke:agent-connections:test')).toHaveLength(0);
    fireEvent.click(within(rows[0]).getByTestId('connection-test'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(1));
    expect(only('invoke:agent-connections:test')[0].args[0]).toMatchObject({ action: 'test', id: 'c-1' });
  });

  it('editing a connection shows saved secrets as saved, never as a value', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [
      { id: 'c-1', kind: 'slack', name: 'Ops channel', status: 'connected', config: { host: 'hooks.slack.com' }, vault_secret_names: ['agent_conn_x_url'], last_error: null, last_tested_at: null },
    ] };
    const { container } = renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ops channel' }));
    const dialog = await screen.findByTestId('connection-dialog');
    const url = within(dialog).getByLabelText('Slack incoming webhook address') as HTMLInputElement;
    expect(url.value).toBe('');
    expect(url.placeholder).toContain('saved');
    expect(container.ownerDocument.body.innerHTML).not.toContain('SECRET');
    // saving with the address blank keeps the saved one: the request carries no url
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops channel 2' } });
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const body = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(body.id).toBe('c-1');
    expect(body.url).toBeUndefined();
  });

  it('creates an API key, shows it once, and lists only its prefix afterwards', async () => {
    h.tables = { ...BASE_TABLES, agent_api_keys: [{ id: 'k0', name: 'Old key', key_prefix: 'kdagent_OLD0', scopes: ['flags:read'], rate_limit_per_min: 60, created_at: '2026-11-01T00:00:00Z', last_used_at: null, revoked_at: null }] };
    renderAt('/agent/connections');
    expect(await screen.findByTestId('inbound-endpoint')).toHaveTextContent('/functions/v1/agent-inbound');
    expect(await screen.findByTestId('api-keys')).toHaveTextContent('kdagent_OLD0…');
    fireEvent.click(screen.getByTestId('key-new'));
    const dialog = await screen.findByTestId('key-dialog');
    fireEvent.change(within(dialog).getByLabelText('Key name'), { target: { value: 'Billing system' } });
    fireEvent.click(within(dialog).getByTestId('key-create'));
    expect(await within(dialog).findByTestId('key-fresh')).toHaveTextContent('kdagent_FRESHKEY123');
    expect(only('rpc:agent_api_key_create')[0].args[0]).toEqual({ p_name: 'Billing system', p_scopes: ['flags:read', 'flags:write'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'I have copied it' }));
    await waitFor(() => expect(screen.queryByTestId('key-dialog')).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('kdagent_FRESHKEY123');
  });
});

describe('Inbox', () => {
  const item = { id: 'f1', company_id: null, module: null, rule_code: 'HUMAN_ACTION', severity: 'medium', subject_type: 'system', subject_id: 's', person_id: null, manager_id: null, title: 'Delete the task Kemi overdue', why: 'Asked in chat', suggested_action: null, draft_message: null, escalation_level: 1, occurrence_count: 1, first_seen_at: '2026-11-19T10:00:00Z', last_seen_at: '2026-11-19T10:00:00Z', status: 'open', item_type: 'human_action' };

  it('shows a human-action item and handles it through the database function', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [item] };
    renderAt('/agent');
    const card = await screen.findByTestId('inbox-item');
    expect(card).toHaveTextContent('Human action required');
    expect(card).toHaveTextContent('Delete the task Kemi overdue');
    fireEvent.click(within(card).getByTestId('flag-handled'));
    await waitFor(() => expect(only('rpc:agent_flag_set_status')).toHaveLength(1));
    expect(only('rpc:agent_flag_set_status')[0].args[0]).toMatchObject({ p_id: 'f1', p_status: 'handled' });
  });

  it('hides snoozed items until asked and can reopen them', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [{ ...item, id: 'f2', status: 'snoozed', title: 'Snoozed thing' }] };
    renderAt('/agent');
    await screen.findByText(/Nothing open/);
    expect(screen.queryByText('Snoozed thing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show 1 snoozed/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Reopen/ }));
    await waitFor(() => expect(only('rpc:agent_flag_set_status')[0].args[0]).toMatchObject({ p_id: 'f2', p_status: 'open' }));
  });
});

// ── The redesigned screens ─────────────────────────────────────────────────────────────────────────

const PULSE = {
  as_of: '2026-11-19T18:07:00Z', tz: 'America/New_York', day: '2026-11-19', working_day: true, in_work_window: true, team_size: 14, tracking_now: 9, tracked_today: 12,
  reports_in: 11, reports_expected: 14, reports_due_at: '18:00', overdue_tasks: 3, open_flags: 5, high_flags: 2, last_run_at: '', last_run_ok: true, rules_active: 8,
};
const mkFlag = (o: Record<string, unknown>) => ({
  id: 'x', company_id: null, module: null, rule_code: 'INBOUND', severity: 'medium', subject_type: 'person', subject_id: 'p1', person_id: 'p1', manager_id: null, title: 'T', why: '', suggested_action: null,
  draft_message: null, escalation_level: 1, occurrence_count: 1, first_seen_at: '2026-11-19T15:00:00Z', last_seen_at: '2026-11-19T18:00:00Z', status: 'open', item_type: 'flag', evidence: null, ...o,
});
const LIVE_FLAGS = [
  mkFlag({ id: 'a', rule_code: 'TR05', severity: 'high', title: 'Unexpected sites', why: 'Spent 37 minutes on sites outside the list.', evidence: { sites: [{ domain: 'youtube.com', seconds: 740, category: 'unproductive' }, { domain: 'weirdsite.io', seconds: 300, category: 'unknown' }, { domain: 'https://www.facebook.com/some/page?id=1', seconds: 1180, category: 'unproductive' }], total_seconds: 2220 } }),
  mkFlag({ id: 'b', rule_code: 'TR01', severity: 'critical', person_id: 'p2', title: 'Not tracking time', evidence: { tracked_minutes_today: 0, last_tracked_at: null, window: '09:00–17:00 EST' } }),
  mkFlag({ id: 'c', rule_code: 'RP01', severity: 'medium', title: 'Daily report missing', evidence: { day: '2026-11-19', deadline: '18:00 EST' } }),
  mkFlag({ id: 'd', rule_code: 'TK13', severity: 'low', title: 'Ready for review', evidence: { task_title: 'Q4 budget', by_name: 'Ada Obi', to: 'in_review' } }),
  mkFlag({ id: 'e', rule_code: 'TK01', severity: 'medium', title: 'Overdue task', evidence: { task_title: 'Send invoices', due_date: '2026-11-12', days_overdue: 7, assignee_name: 'Ada Obi' } }),
];

describe('Settings sections', () => {
  it('shows one section at a time, chosen by the address, and falls back to the first', async () => {
    const { unmount } = renderAt('/agent/settings/calendar');
    const root = await screen.findByTestId('agent-settings');
    expect(root).toHaveAttribute('data-section', 'calendar');
    expect(screen.getByLabelText('Report deadline')).toBeInTheDocument();
    expect(screen.queryByLabelText('Operating Rules')).not.toBeInTheDocument();
    expect(screen.queryByTestId('key-box')).not.toBeInTheDocument();
    unmount();
    renderAt('/agent/settings/not-a-section');
    expect(await screen.findByTestId('agent-settings')).toHaveAttribute('data-section', 'claude');
  });

  it('lists the seven sections in a rail with their own addresses and moves between them', async () => {
    renderAt('/agent/settings/claude');
    const rail = await screen.findByTestId('settings-rail');
    for (const l of [/Claude & budget/, /Team/, /Calendar & reports/, /Coverage/, /Operating rules/, /Sites & apps/, /Change log/]) expect(within(rail).getByRole('link', { name: l })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /Operating rules/ })).toHaveAttribute('href', '/agent/settings/rules');
    expect(within(rail).getByRole('link', { name: /Claude & budget/ })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(rail).getByRole('link', { name: /Operating rules/ }));
    expect(await screen.findByLabelText('Operating Rules')).toBeInTheDocument();
    expect(screen.getByTestId('agent-settings')).toHaveAttribute('data-section', 'rules');
    expect(within(screen.getByTestId('settings-rail')).getByRole('link', { name: /Operating rules/ })).toHaveAttribute('aria-current', 'page');
  });

  it('gives each section a header, and a status summary where it helps', async () => {
    const { unmount } = renderAt('/agent/settings/claude');
    expect(await screen.findByRole('heading', { name: 'Claude & budget' })).toBeInTheDocument();
    const meter = await screen.findByTestId('ai-meter');
    expect(meter).toHaveTextContent('Key working');
    expect(within(meter).getByRole('img', { name: /of today's budget used/ })).toBeInTheDocument();
    unmount();
    renderAt('/agent/settings/calendar');
    expect(await screen.findByRole('heading', { name: 'Calendar & reports' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Calendar summary')).toHaveTextContent('6:00 PM');
  });

  it('keeps Admin access in Coverage for a Super Admin', async () => {
    renderAt('/agent/settings/coverage');
    expect(await screen.findByText('Admin access')).toBeInTheDocument();
    expect(await screen.findByTestId('module-task')).toBeInTheDocument();
  });

  it('shows the Save bar only while there are unsaved edits', async () => {
    renderAt('/agent/settings/rules');
    const rules = await screen.findByLabelText('Operating Rules');
    expect(screen.queryByTestId('save-bar')).not.toBeInTheDocument();
    fireEvent.change(rules, { target: { value: '# Rules\nmore' } });
    expect(await screen.findByTestId('save-bar')).toHaveTextContent('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByTestId('save-bar')).not.toBeInTheDocument());
  });
});

describe('Settings > Team', () => {
  it('lists only the KD Squares team: active people in a KD Squares pay group who are not Field Agents', async () => {
    renderAt('/agent/settings/team');
    const rows = await screen.findAllByTestId('agent-person');
    const text = rows.map((r) => r.textContent ?? '').join('|');
    expect(rows).toHaveLength(2);
    expect(text).toContain('Ada Obi');
    expect(text).toContain('Bayo Admin');
    expect(screen.queryByText('Femi Field')).not.toBeInTheDocument(); // Field Agent
    expect(screen.queryByText('Nkem NDI')).not.toBeInTheDocument(); // another company
    expect(screen.queryByText('Zed NoGroup')).not.toBeInTheDocument(); // no pay group, so no company
    expect(screen.getByTestId('team-note')).toHaveTextContent('KD Squares team, Field Agents excluded · 2 people');
  });
});

describe('Inbox, live monitoring', () => {
  const withFlags = (flags: unknown[] = LIVE_FLAGS, lastRun = new Date(Date.now() - 40_000).toISOString()) => {
    h.tables = { ...BASE_TABLES, agent_flags: flags };
    h.pulse = { ...PULSE, last_run_at: lastRun };
  };

  it('shows the team pulse tiles from agent_team_pulse', async () => {
    withFlags();
    renderAt('/agent');
    const tiles = await screen.findByTestId('team-pulse');
    expect(within(tiles).getByTestId('pulse-tracking')).toHaveTextContent('9of 14');
    expect(within(tiles).getByTestId('pulse-reports')).toHaveTextContent('11of 14');
    expect(within(tiles).getByTestId('pulse-reports')).toHaveTextContent('Due 6:00 PM EST');
    expect(within(tiles).getByTestId('pulse-overdue')).toHaveTextContent('3');
    expect(within(tiles).getByTestId('pulse-flags')).toHaveTextContent('5');
    expect(within(tiles).getByTestId('pulse-flags')).toHaveTextContent('2 high or critical');
  });

  it('shows a green monitoring pill when the last check is fresh, amber with the clock time when it is old', async () => {
    withFlags();
    const { unmount } = renderAt('/agent');
    const status = await screen.findByTestId('monitor-status');
    expect(within(status).getByText(/Monitoring · last check \d+s ago/)).toHaveAttribute('data-tone', 'good');
    expect(status).toHaveTextContent('14 people watched');
    unmount();
    withFlags(LIVE_FLAGS, '2026-11-19T17:50:00Z');
    renderAt('/agent');
    const old = await screen.findByTestId('monitor-status');
    const pill = await within(old).findByText(/Last check .* · 12:50 PM EST/);
    expect(pill).toHaveAttribute('data-tone', 'warn');
  });

  it('hides the pulse quietly when the database function is not there yet', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: LIVE_FLAGS };
    h.pulse = null; // the rpc errors
    renderAt('/agent');
    expect(await screen.findAllByTestId('inbox-item')).toHaveLength(5);
    await waitFor(() => expect(screen.queryByTestId('team-pulse')).not.toBeInTheDocument());
    expect(screen.queryByTestId('monitor-status')).not.toBeInTheDocument();
  });

  it('groups items into Needs attention now and Everything else, most severe first', async () => {
    withFlags();
    renderAt('/agent');
    const urgent = await screen.findByTestId('group-urgent');
    const rest = screen.getByTestId('group-rest');
    expect(urgent).toHaveTextContent('Needs attention now');
    expect(within(urgent).getAllByTestId('inbox-item').map((i) => i.getAttribute('data-rule'))).toEqual(['TR01', 'TR05']);
    expect(rest).toHaveTextContent('Everything else');
    expect(within(rest).getAllByTestId('inbox-item')).toHaveLength(3);
  });

  it('filters by type with counts, derived from the rule code', async () => {
    withFlags();
    renderAt('/agent');
    await screen.findAllByTestId('inbox-item');
    expect(screen.getByTestId('filter-all')).toHaveTextContent('5');
    expect(screen.getByTestId('filter-not_tracking')).toHaveTextContent('Not tracking1');
    expect(screen.getByTestId('filter-sites')).toHaveTextContent('Sites1');
    expect(screen.getByTestId('filter-reports')).toHaveTextContent('Reports1');
    expect(screen.getByTestId('filter-tasks')).toHaveTextContent('Tasks2');
    expect(screen.getByTestId('filter-other')).toHaveTextContent('Other0');
    fireEvent.click(screen.getByTestId('filter-tasks'));
    expect(screen.getAllByTestId('inbox-item').map((i) => i.getAttribute('data-rule')).sort()).toEqual(['TK01', 'TK13']);
    fireEvent.click(screen.getByTestId('filter-other'));
    expect(screen.getByTestId('filter-empty')).toHaveTextContent('Nothing open in Other');
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getAllByTestId('inbox-item')).toHaveLength(5);
  });

  it('puts a person, a relative time with the Eastern time on hover, and per-rule evidence on each item', async () => {
    withFlags();
    renderAt('/agent');
    const items = await screen.findAllByTestId('inbox-item');
    const byRule = (c: string) => items.find((i) => i.getAttribute('data-rule') === c)!;
    const tr01 = byRule('TR01');
    expect(tr01).toHaveTextContent('Bayo Admin');
    expect(tr01).toHaveTextContent('Tracked today0m');
    expect(tr01).toHaveTextContent('Not yet today');
    expect(tr01).toHaveTextContent('09:00–17:00 EST');
    expect(tr01.querySelector('time')!.getAttribute('title')).toBe('Nov 19, 1:00 PM EST');
    expect(byRule('RP01')).toHaveTextContent('Report forNov 19');
    expect(byRule('TK01')).toHaveTextContent('Was dueNov 12');
    expect(byRule('TK01')).toHaveTextContent('Overdue7 days');
    expect(byRule('TK13')).toHaveTextContent('Q4 budget');
  });

  it('gives Ready for review a calm look, not an alarm', async () => {
    withFlags();
    renderAt('/agent');
    const calm = (await screen.findAllByTestId('inbox-item')).find((i) => i.getAttribute('data-rule') === 'TK13')!;
    expect(calm).toHaveAttribute('data-calm', 'true');
    expect(calm).toHaveTextContent('Ready for review');
    expect(calm.querySelector('.bg-destructive, .bg-orange-500, .bg-warning')).toBeNull();
  });

  it('renders each visited site as a favicon chip with its time, and never shows a full address', async () => {
    withFlags();
    renderAt('/agent');
    const items = await screen.findAllByTestId('inbox-item');
    const sites = items.find((i) => i.getAttribute('data-rule') === 'TR05')!;
    const chips = within(sites).getAllByTestId('site-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['facebook.com20m', 'youtube.com12m', 'weirdsite.io5m']);
    expect(sites).toHaveTextContent('3 sites');
    expect(sites).toHaveTextContent('37m in total');
    const imgs = Array.from(sites.querySelectorAll('[data-testid="site-chip"] img')) as HTMLImageElement[];
    expect(imgs).toHaveLength(3);
    expect(imgs.map((i) => i.getAttribute('src'))).toContain('https://www.google.com/s2/favicons?domain=youtube.com&sz=64');
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(img.getAttribute('alt')).toBe('');
    }
    expect(sites.innerHTML).not.toContain('some/page');
    expect(sites.innerHTML).not.toContain('https://www.facebook.com');
    const ring = (d: string) => chips.find((c) => c.textContent?.startsWith(d))!.querySelector('[data-testid="site-icon"]')!.getAttribute('data-category');
    expect(ring('youtube.com')).toBe('unproductive');
    expect(ring('weirdsite.io')).toBe('unknown');
  });

  it('falls back to a coloured letter tile when a favicon cannot load', async () => {
    withFlags();
    renderAt('/agent');
    const items = await screen.findAllByTestId('inbox-item');
    const sites = items.find((i) => i.getAttribute('data-rule') === 'TR05')!;
    const chip = within(sites).getAllByTestId('site-chip').find((c) => c.textContent?.startsWith('weirdsite.io'))!;
    expect(within(chip).queryByTestId('site-icon-fallback')).not.toBeInTheDocument();
    fireEvent.error(chip.querySelector('img')!);
    const tile = await within(chip).findByTestId('site-icon-fallback');
    expect(tile).toHaveTextContent('w');
    expect(chip.querySelector('img')).toBeNull();
  });

  it('collapses the sites to the favicon stack and expands them again', async () => {
    withFlags();
    renderAt('/agent');
    const sites = (await screen.findAllByTestId('inbox-item')).find((i) => i.getAttribute('data-rule') === 'TR05')!;
    const toggle = within(sites).getByRole('button', { name: /3 sites/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(within(sites).queryAllByTestId('site-chip')).toHaveLength(0);
    fireEvent.click(toggle);
    expect(within(sites).getAllByTestId('site-chip')).toHaveLength(3);
  });

  it('still handles an item through the database function', async () => {
    withFlags([LIVE_FLAGS[1]]);
    renderAt('/agent');
    fireEvent.click(await screen.findByTestId('flag-handled'));
    await waitFor(() => expect(only('rpc:agent_flag_set_status')[0]?.args[0]).toMatchObject({ p_id: 'b', p_status: 'handled' }));
  });
});

describe('Check now', () => {
  it('runs the monitor only when pressed, then refreshes and says what it found', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [] };
    h.pulse = { ...PULSE, last_run_at: new Date().toISOString() };
    renderAt('/agent');
    const btn = await screen.findByTestId('check-now');
    await screen.findByTestId('team-pulse');
    expect(only('rpc:agent_check_now')).toHaveLength(0);
    h.tables = { ...BASE_TABLES, agent_flags: [mkFlag({ id: 'fresh', severity: 'medium', title: 'Found by the check' })] };
    fireEvent.click(btn);
    await waitFor(() => expect(only('rpc:agent_check_now')).toHaveLength(1));
    await waitFor(() => expect(h.toasts.some((t) => t.title === 'Checked: 2 new, 1 cleared')).toBe(true));
    expect(await screen.findByText('Found by the check')).toBeInTheDocument();
  });

  it('is there for an Admin too, and still there when the pulse is unavailable', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    h.tables = { ...BASE_TABLES, agent_flags: [] };
    h.pulse = null;
    renderAt('/agent');
    expect(await screen.findByTestId('check-now')).toBeEnabled();
  });
});

describe('Time zone', () => {
  it('is fixed to Eastern time, with no picker', async () => {
    renderAt('/agent/settings/calendar');
    expect(await screen.findByTestId('cal-tz')).toHaveTextContent('Eastern Time (EST/EDT)');
    expect(screen.queryByRole('combobox', { name: /time zone/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Report deadline')).toBeEnabled();
    expect(screen.getByLabelText('Work day starts')).toBeEnabled();
  });
});

describe('Realtime flags', () => {
  it('subscribes to agent_flags once, toasts a new high flag, and unsubscribes on unmount', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [] };
    const { unmount } = renderAt('/agent');
    await screen.findByText('Nothing needs attention');
    expect(h.channels).toHaveLength(1);
    const ch = h.channels[0];
    expect(ch.subscribed).toBe(true);
    expect(ch.removed).toBe(false);
    expect(ch.handlers).toHaveLength(1);

    ch.handlers[0]({ eventType: 'INSERT', new: mkFlag({ id: 'n1', severity: 'high', status: 'open', title: 'Unexpected sites' }), old: {} });
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]).toMatchObject({ title: 'New high-priority flag', description: 'Unexpected sites' });

    ch.handlers[0]({ eventType: 'INSERT', new: mkFlag({ id: 'n2', severity: 'low', status: 'open' }), old: {} }); // not urgent
    ch.handlers[0]({ eventType: 'UPDATE', new: mkFlag({ id: 'n1', severity: 'high', status: 'open' }), old: { status: 'open' } }); // already open
    ch.handlers[0]({ eventType: 'UPDATE', new: mkFlag({ id: 'n3', severity: 'critical', status: 'handled' }), old: { status: 'open' } }); // not open any more
    ch.handlers[0]({ eventType: 'UPDATE', new: mkFlag({ id: 'n4', severity: 'critical', status: 'open' }), old: {} }); // old row not sent: cannot tell, stay quiet
    expect(h.toasts).toHaveLength(1);

    unmount();
    expect(ch.removed).toBe(true);
  });

  it('refreshes the Inbox when a flag changes', async () => {
    h.tables = { ...BASE_TABLES, agent_flags: [] };
    renderAt('/agent');
    await screen.findByText('Nothing needs attention');
    h.tables = { ...BASE_TABLES, agent_flags: [mkFlag({ id: 'late', severity: 'medium', title: 'Arrived while open' })] };
    h.channels[0].handlers[0]({ eventType: 'INSERT', new: mkFlag({ id: 'late', severity: 'medium' }), old: {} });
    expect(await screen.findByText('Arrived while open')).toBeInTheDocument();
  });
});

describe('Chat, redesigned', () => {
  it('opens with a greeting by Eastern time and four suggestion cards', async () => {
    renderAt('/agent/chat');
    expect(await screen.findByTestId('chat-greeting')).toHaveTextContent(/^(Good morning|Good afternoon|Good evening|Working late)/);
    expect(screen.getAllByTestId('chat-suggestion')).toHaveLength(4);
    expect(screen.getByLabelText('Your question')).toBeInTheDocument();
  });

  it('keeps Shift+Enter for a new line and Enter for sending', async () => {
    renderAt('/agent/chat');
    const input = (await screen.findByLabelText('Your question')) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(only('invoke:agent-chat')).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(only('invoke:agent-chat')).toHaveLength(1));
  });

  it('renders the answer as light markdown, with chips for what it looked at and a copy button', async () => {
    h.chat = { ok: true, thread_id: 't-new', reply: 'Two people have not reported:\n- **Tola Staff** (manager: Ada)\n- Bayo Obi\n\nUse `Hours` for more.', tools_used: ['daily_reports', 'people'], title: 'x' };
    renderAt('/agent/chat');
    fireEvent.click((await screen.findAllByTestId('chat-suggestion'))[0]);
    const box = await screen.findByTestId('chat-messages');
    await waitFor(() => expect(box.querySelectorAll('li')).toHaveLength(2));
    expect(box.querySelector('strong')).toHaveTextContent('Tola Staff');
    expect(box.querySelector('code')).toHaveTextContent('Hours');
    expect(box).not.toHaveTextContent('**');
    expect(screen.getByTestId('chat-looked-at')).toHaveTextContent('Looked at: daily reportspeople');
    expect(screen.getByTestId('chat-copy')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-typing')).not.toBeInTheDocument();
  });

  it('shows a typing indicator while the agent works, and offers Try again after an error', async () => {
    h.chat = { ok: false, reason: 'no_key', message: 'Chat needs the Claude key. A Super Admin adds it in Ops Agent, Settings.' };
    renderAt('/agent/chat');
    fireEvent.click((await screen.findAllByTestId('chat-suggestion'))[0]);
    const err = await screen.findByTestId('chat-error');
    expect(err).toHaveTextContent('Chat needs the Claude key');
    fireEvent.click(within(err).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(only('invoke:agent-chat')).toHaveLength(2));
  });
});
