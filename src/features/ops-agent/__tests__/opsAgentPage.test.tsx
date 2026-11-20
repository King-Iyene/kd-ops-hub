// The Ops Agent screens, rendered against a fake database and fake edge functions. Checks what each role sees, that Admin
// controls are switched off, that saves send only what changed, that secrets are write only, that chat and connections
// work end to end, and that opening a screen never writes anything.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  oauthStart: { ok: true, url: 'https://accounts.zoho.com/oauth/v2/auth?client_id=1000.ABCDEF&state=xyz' } as Record<string, unknown>,
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
  operating_rules: '# Rules', app_url: 'https://ops.example.com', updated_at: '2026-11-19T00:00:00Z',
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
    { id: 'p1', full_name: 'Ada Obi', role: 'operations', job_title: 'Ops Lead', pay_group_id: 'g1', reporting_manager_id: null, email: 'ada.obi@kd.test' },
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
        else if (fn === 'agent-connections' && action === 'oauth_start') data = h.oauthStart;
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
  h.oauthStart = { ok: true, url: 'https://accounts.zoho.com/oauth/v2/auth?client_id=1000.ABCDEF&state=xyz' };
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
    for (const label of ['Inbox', 'Chat', 'Summaries', 'Connections', 'Settings']) expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Memory/ })).not.toBeInTheDocument(); // Memory moved into Settings
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
    const routes = ['/agent', '/agent/chat', '/agent/summaries', '/agent/connections', '/agent/settings',
      '/agent/settings/claude', '/agent/settings/team', '/agent/settings/calendar', '/agent/settings/coverage', '/agent/settings/rules', '/agent/settings/brief', '/agent/settings/memory', '/agent/settings/sites', '/agent/settings/changes'];
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
      ['/agent/settings/brief', () => expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()],
    ] as [string, () => void][]) {
      const { unmount } = renderAt(route);
      await screen.findByTestId('agent-settings');
      expect(screen.getByRole('note')).toHaveTextContent('read only');
      if (route.endsWith('brief')) fireEvent.change(await screen.findByLabelText('Operating Rules'), { target: { value: 'changed' } });
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
    renderAt('/agent/settings/brief');
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

  it('shows a sensitive module as switchable (the confirmation is covered in opsAgentV4.test.tsx)', async () => {
    renderAt('/agent/settings/coverage');
    const row = await screen.findByTestId('module-payroll');
    expect(within(row).getByText(/counts only/i)).toBeInTheDocument();
    expect(within(row).getByRole('switch')).toBeEnabled();
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
  it('starts empty, then connects Slack in two steps without ever echoing its address', async () => {
    renderAt('/agent/connections');
    expect(await screen.findByText('No connections yet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    // step 1: the tool grid, "Any other tool (API)" last
    const grid = within(dialog).getByTestId('tool-picker');
    const tools = within(grid).getAllByRole('button');
    expect(tools.length).toBeGreaterThan(10);
    expect(tools[tools.length - 1]).toHaveTextContent('Any other tool (API)');
    fireEvent.click(within(grid).getByTestId('tool-slack'));
    // step 2: how to connect, then only the fields Slack needs
    expect(within(dialog).getByTestId('setup-steps')).toHaveTextContent('Incoming Webhooks');
    const save = within(dialog).getByTestId('connection-save');
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops channel' } });
    const url = within(dialog).getByLabelText('Slack webhook address') as HTMLInputElement;
    expect(url.type).toBe('password');
    expect(within(dialog).queryByLabelText('Bot token')).not.toBeInTheDocument();
    fireEvent.change(url, { target: { value: 'https://hooks.slack.com/services/T000/B000/SECRETXYZ' } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const sent = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ action: 'save', kind: 'slack', preset: 'slack', name: 'Ops channel', url: 'https://hooks.slack.com/services/T000/B000/SECRETXYZ', events: ['flag_high', 'summary_day'] });
    // the address is cleared from the box once saved, and nothing is sent by saving
    await waitFor(() => expect((within(dialog).getByLabelText('Slack webhook address') as HTMLInputElement).value).toBe(''));
    expect(document.body.innerHTML).not.toContain('SECRETXYZ');
    expect(only('invoke:agent-connections:test')).toHaveLength(0);
    // Send test uses the saved connection
    fireEvent.click(within(dialog).getByTestId('connection-send-test'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(1));
    expect(only('invoke:agent-connections:test')[0].args[0]).toMatchObject({ action: 'test', id: 'conn-new' });
  });

  it('shows the dialog error when the server refuses an address', async () => {
    h.save = { ok: false, error: 'Internal addresses are not allowed.' };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId('tool-slack'));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.change(within(dialog).getByLabelText('Slack webhook address'), { target: { value: 'https://localhost/x' } });
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
    expect(within(dialog).queryByTestId('tool-picker')).not.toBeInTheDocument(); // editing opens step 2 with the tool fixed
    const url = within(dialog).getByLabelText('Slack webhook address') as HTMLInputElement;
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

  it('sends the preset fields and the chosen automatic events for Telegram, with the token write only', async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.change(within(dialog).getByLabelText('Search tools'), { target: { value: 'tele' } });
    expect(within(dialog).getAllByRole('button', { name: /Telegram|Message a chat/ })).toHaveLength(1);
    expect(within(dialog).queryByTestId('tool-slack')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('tool-telegram'));
    expect(within(dialog).getByTestId('setup-steps')).toHaveTextContent('BotFather');
    expect((within(dialog).getByLabelText('Bot token') as HTMLInputElement).type).toBe('password');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops Telegram' } });
    fireEvent.change(within(dialog).getByLabelText('Bot token'), { target: { value: '123:TOPSECRETTOKEN' } });
    fireEvent.change(within(dialog).getByLabelText('Chat id'), { target: { value: '-1001' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'New high-priority items' })); // off
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Weekly summary' })); // on
    // with no flag events left the severity choice goes away
    expect(within(dialog).queryByLabelText('Lowest severity to send')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const sent = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ kind: 'telegram', preset: 'telegram', name: 'Ops Telegram', token: '123:TOPSECRETTOKEN', chat_id: '-1001', events: ['summary_day', 'summary_week'] });
    expect(sent.min_severity).toBeUndefined();
    expect(sent.url).toBeUndefined();
    await waitFor(() => expect((within(dialog).getByLabelText('Bot token') as HTMLInputElement).value).toBe(''));
    expect(document.body.innerHTML).not.toContain('TOPSECRETTOKEN');
    expect(within(dialog).getByLabelText('Bot token')).toHaveProperty('placeholder', expect.stringContaining('saved'));
  });

  it('sends a minimum severity for flag events', async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId('tool-email'));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops mail' } });
    fireEvent.change(within(dialog).getByLabelText('Send to'), { target: { value: 'ops@example.com' } });
    expect(within(dialog).getByTestId('setup-steps')).toHaveTextContent('Emails go out through KD Ops');
    expect(within(dialog).getByLabelText('Lowest severity to send')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    expect(only('invoke:agent-connections:save')[0].args[0]).toMatchObject({ kind: 'email', preset: 'email', to: 'ops@example.com', events: ['flag_high', 'summary_day'] });
  });

  it('an API tool shows the method, how the token is sent, extra headers and a live body preview', async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId('tool-notion'));
    expect(within(dialog).getByTestId('setup-steps')).toHaveTextContent('internal integration');
    expect(within(dialog).getByLabelText('Method')).toBeInTheDocument();
    expect(within(dialog).getByText('How is the token sent?')).toBeInTheDocument();
    // the preset's extra header is prefilled
    expect(within(dialog).getAllByTestId('header-row')).toHaveLength(1);
    expect((within(dialog).getByLabelText('Header 1 name') as HTMLInputElement).value).toBe('Notion-Version');
    // the preview substitutes the sample values
    const preview = within(dialog).getByTestId('body-preview');
    expect(preview).toHaveTextContent('Cara Obi has not tracked time today');
    expect(preview.textContent).not.toContain('{{title}}');
    fireEvent.change(within(dialog).getByLabelText('Body template'), { target: { value: '{"a":"{{title}}","b":"{{nope}}"}' } });
    expect(within(dialog).getByTestId('body-preview')).toHaveTextContent('{"a":"Cara Obi has not tracked time today","b":"{{nope}}"}');
    expect(within(dialog).getByText(/\{\{nope\}\} is not a known variable/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('variable-legend')).toHaveTextContent('{{severity}}');
    // fill and save: the API fields travel with the preset id
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Notion log' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'https://api.notion.com/v1/pages' } });
    fireEvent.change(within(dialog).getByLabelText('Integration secret'), { target: { value: 'secret_NOTIONTOKEN' } });
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const sent = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      kind: 'api', preset: 'notion', url: 'https://api.notion.com/v1/pages', token: 'secret_NOTIONTOKEN', method: 'POST', auth_type: 'bearer', content_type: 'json',
      extra_headers: { 'Notion-Version': '2022-06-28' }, body_template: '{"a":"{{title}}","b":"{{nope}}"}',
    });
    await waitFor(() => expect(document.body.innerHTML).not.toContain('secret_NOTIONTOKEN'));
  });

  it('shows each connection as a card with its tool, what it sends, and pending or failed deliveries', async () => {
    h.tables = { ...BASE_TABLES,
      agent_connections: [{ id: 'c-1', kind: 'telegram', name: 'Ops Telegram', status: 'connected', config: { preset: 'telegram', events: ['flag_high', 'summary_day'], min_severity: 'high' }, vault_secret_names: ['x_token'], last_error: null, last_tested_at: null }],
      agent_outbox: [
        { id: 'o1', connection_id: 'c-1', kind: 'flag', ref_id: 'f1', status: 'pending', attempts: 0, error: null, created_at: '2026-11-19T10:00:00Z', sent_at: null },
        { id: 'o2', connection_id: 'c-1', kind: 'summary', ref_id: 's1', status: 'failed', attempts: 3, error: 'HTTP 500', created_at: '2026-11-19T09:00:00Z', sent_at: null },
        { id: 'o3', connection_id: 'c-1', kind: 'flag', ref_id: 'f0', status: 'sent', attempts: 1, error: null, created_at: '2026-11-18T09:00:00Z', sent_at: '2026-11-18T09:00:05Z' },
      ] };
    renderAt('/agent/connections');
    const card = await screen.findByTestId('connection-row');
    expect(card).toHaveAttribute('data-preset', 'telegram');
    expect(card).toHaveTextContent('Telegram');
    expect(within(card).getByTestId('connection-events')).toHaveTextContent('High-priority items');
    expect(within(card).getByTestId('connection-events')).toHaveTextContent('Daily summary');
    expect(within(card).getByTestId('connection-events')).toHaveTextContent('High and above');
    await waitFor(() => expect(within(card).getByTestId('connection-outbox')).toHaveTextContent('1 pending, 1 failed deliveries'));
    expect(card).toHaveTextContent('Last sent');
  });

  it('still shows the card when the delivery table cannot be read', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [{ id: 'c-1', kind: 'slack', name: 'Ops channel', status: 'connected', config: { host: 'hooks.slack.com' }, vault_secret_names: [], last_error: null, last_tested_at: null }] };
    renderAt('/agent/connections');
    const card = await screen.findByTestId('connection-row');
    expect(within(card).queryByTestId('connection-outbox')).not.toBeInTheDocument();
    expect(within(card).getByTestId('connection-events')).toHaveTextContent('Sends nothing automatically');
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

  it('lists the nine sections in a rail with their own addresses and moves between them', async () => {
    renderAt('/agent/settings/claude');
    const rail = await screen.findByTestId('settings-rail');
    for (const l of [/Claude & budget/, /Team/, /Calendar & reports/, /Coverage/, /Monitoring rules/, /Operating rules/, /Memory/, /Sites & apps/, /Change log/]) expect(within(rail).getByRole('link', { name: l })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /Monitoring rules/ })).toHaveAttribute('href', '/agent/settings/rules');
    expect(within(rail).getByRole('link', { name: /Operating rules/ })).toHaveAttribute('href', '/agent/settings/brief');
    expect(within(rail).getByRole('link', { name: /Claude & budget/ })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(rail).getByRole('link', { name: /Operating rules/ }));
    expect(await screen.findByLabelText('Operating Rules')).toBeInTheDocument();
    expect(screen.getByTestId('agent-settings')).toHaveAttribute('data-section', 'brief');
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
    renderAt('/agent/settings/brief');
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

describe('Connections: tagging people in Cliq and Slack', () => {
  const openTool = async (tool: string) => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId(`tool-${tool}`));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ops channel' } });
    fireEvent.change(within(dialog).getByLabelText(tool === 'cliq' ? 'Cliq webhook address' : 'Slack webhook address'), { target: { value: `https://example.com/${tool}/SECRET` } });
    return dialog;
  };

  it('Cliq: tagging is on by default, the default format is shown, and an unchanged format is left out of the save', async () => {
    const dialog = await openTool('cliq');
    expect(within(dialog).getByRole('checkbox', { name: 'Tag the person in each message' })).toBeChecked();
    expect((within(dialog).getByLabelText('Tag format') as HTMLInputElement).value).toBe('{@%s}');
    expect(within(dialog).getByTestId('tag-advanced')).toHaveTextContent('If tags show up as plain text in Cliq, change this and send a test.');
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const sent = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ kind: 'cliq', mention_people: true });
    expect('mention_template' in sent).toBe(false);
  });

  it('Slack: the default format is <@%s>; unticking sends mention_people false', async () => {
    const dialog = await openTool('slack');
    expect((within(dialog).getByLabelText('Tag format') as HTMLInputElement).value).toBe('<@%s>');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Tag the person in each message' }));
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    const sent = only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>;
    expect(sent.mention_people).toBe(false);
    expect('mention_template' in sent).toBe(false);
  });

  it('sends a changed format, and refuses one without %s or over 40 characters', async () => {
    const dialog = await openTool('cliq');
    const format = within(dialog).getByLabelText('Tag format');
    fireEvent.change(format, { target: { value: '@{%s}' } });
    fireEvent.change(format, { target: { value: 'no placeholder' } });
    expect(within(dialog).getByTestId('tag-format-error')).toHaveTextContent('must contain %s');
    expect(within(dialog).getByTestId('connection-save')).toBeDisabled();
    fireEvent.change(format, { target: { value: `${'x'.repeat(41)}%s` } });
    expect(within(dialog).getByTestId('tag-format-error')).toHaveTextContent('at most 40');
    expect(within(dialog).getByTestId('connection-save')).toBeDisabled();
    fireEvent.change(format, { target: { value: '@{%s}' } });
    expect(within(dialog).queryByTestId('tag-format-error')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    expect(only('invoke:agent-connections:save')[0].args[0]).toMatchObject({ mention_people: true, mention_template: '@{%s}' });
  });

  it('other tools have no tagging options', async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId('tool-discord'));
    expect(within(dialog).queryByTestId('tag-people')).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('connection-send-test-tag')).not.toBeInTheDocument();
  });

  it('Send test and tag me sends tag_me: true and shows the message; a refusal is shown', async () => {
    const dialog = await openTool('cliq');
    expect(within(dialog).getByTestId('connection-send-test-tag')).toBeDisabled(); // save first
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(within(dialog).getByTestId('connection-send-test-tag')).toBeEnabled());
    fireEvent.click(within(dialog).getByTestId('connection-send-test-tag'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(1));
    expect(only('invoke:agent-connections:test')[0].args[0]).toEqual({ action: 'test', id: 'conn-new', tag_me: true });
    expect(await within(dialog).findByTestId('connection-note')).toHaveTextContent('If your name is highlighted in the channel, tagging works.');
    expect(h.toasts.some((t) => /tagging works/.test(t.title ?? ''))).toBe(true);
    // the plain test button does not tag
    fireEvent.click(within(dialog).getByTestId('connection-send-test'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(2));
    expect(only('invoke:agent-connections:test')[1].args[0]).toEqual({ action: 'test', id: 'conn-new' });
    // a refusal from the server is shown as it is
    h.test = { ok: false, error: 'There is no Cliq or Slack id or email on your profile to tag. Add yours in Settings, People.' };
    fireEvent.click(within(dialog).getByTestId('connection-send-test-tag'));
    expect(await within(dialog).findByText(/no Cliq or Slack id or email on your profile/)).toBeInTheDocument();
  });

  it('editing shows the saved tagging values, and the card has a Tags people chip and a tag-me button', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [
      { id: 'c-1', kind: 'cliq', name: 'Cliq ops', status: 'connected', config: { host: 'cliq.zoho.com', preset: 'cliq', mention_people: true, mention_template: '@{%s}' }, vault_secret_names: ['x_url'], last_error: null, last_tested_at: null },
      { id: 'c-2', kind: 'slack', name: 'Slack quiet', status: 'connected', config: { host: 'hooks.slack.com', preset: 'slack', mention_people: false }, vault_secret_names: ['x_url'], last_error: null, last_tested_at: null },
      { id: 'c-3', kind: 'webhook', name: 'Hook', status: 'connected', config: { url: 'https://x.example.com/h' }, vault_secret_names: [], last_error: null, last_tested_at: null },
    ] };
    renderAt('/agent/connections');
    const rows = await screen.findAllByTestId('connection-row');
    expect(within(rows[0]).getByTestId('tags-people-chip')).toHaveTextContent('Tags people');
    expect(within(rows[1]).queryByTestId('tags-people-chip')).not.toBeInTheDocument(); // switched off
    expect(within(rows[2]).queryByTestId('tags-people-chip')).not.toBeInTheDocument();
    expect(within(rows[2]).queryByTestId('connection-test-tag')).not.toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByTestId('connection-test-tag'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(1));
    expect(only('invoke:agent-connections:test')[0].args[0]).toEqual({ action: 'test', id: 'c-1', tag_me: true });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Slack quiet' }));
    const dialog = await screen.findByTestId('connection-dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'Tag the person in each message' })).not.toBeChecked();
    cleanup();
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Cliq ops' }));
    const d2 = await screen.findByTestId('connection-dialog');
    expect((within(d2).getByLabelText('Tag format') as HTMLInputElement).value).toBe('@{%s}');
    // going back to the default clears the saved custom one
    fireEvent.change(within(d2).getByLabelText('Tag format'), { target: { value: '{@%s}' } });
    fireEvent.click(within(d2).getByTestId('connection-save'));
    await waitFor(() => expect(only('invoke:agent-connections:save')).toHaveLength(1));
    expect((only('invoke:agent-connections:save')[0].args[0] as Record<string, unknown>).mention_template).toBe('');
  });
});

describe('Settings > People: Cliq and Slack ids', () => {
  const person = async () => (await screen.findAllByTestId('agent-person'))[0];

  it('explains how tags work and shows what will be used for each person', async () => {
    h.tables = { ...BASE_TABLES, agent_identity_map: [{ person_id: 'p2', cliq_user_id: '9988776', slack_user_id: null, email: null, matched_by: 'manual' }] };
    renderAt('/agent/settings/team');
    const rows = await screen.findAllByTestId('agent-person');
    expect(screen.getByTestId('tag-note')).toHaveTextContent("Tags use the Cliq user id when you save one, otherwise the person's email. The email must match the one they use in Zoho Cliq.");
    expect(within(rows[0]).getByTestId('tag-status')).toHaveTextContent('Tagged by email (ada.obi@…)');
    expect(within(rows[1]).getByTestId('tag-status')).toHaveTextContent('Tagged by Cliq id');
    expect((within(rows[1]).getByLabelText('Bayo Admin Cliq user id') as HTMLInputElement).value).toBe('9988776');
    h.tables = { ...BASE_TABLES };
  });

  it('says a person cannot be tagged when there is no id and no email', async () => {
    renderAt('/agent/settings/team');
    const rows = await screen.findAllByTestId('agent-person');
    expect(within(rows[1]).getByTestId('tag-status')).toHaveTextContent('Cannot be tagged (no email)');
  });

  it('writes nothing until Save, then upserts only that person with the right payload', async () => {
    renderAt('/agent/settings/team');
    const row = await person();
    const input = within(row).getByLabelText('Ada Obi Cliq user id');
    fireEvent.blur(input);
    expect(writes()).toEqual([]);
    fireEvent.change(input, { target: { value: '  5551234  ' } });
    expect(within(row).getByTestId('tag-status')).toHaveTextContent('Tagged by Cliq id');
    fireEvent.blur(input);
    expect(writes()).toEqual([]); // typing and leaving the box saves nothing
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ table: 'agent_identity_map', op: 'upsert' });
    expect(writes()[0].args[0]).toEqual({ person_id: 'p1', cliq_user_id: '5551234', slack_user_id: null, matched_by: 'manual' });
    expect(writes()[0].args[1]).toEqual({ onConflict: 'person_id' });
  });

  it('keeps the Slack id in More, validates ids, and writes nothing when the change is undone', async () => {
    renderAt('/agent/settings/team');
    const row = await person();
    expect(within(row).queryByLabelText('Slack user id')).not.toBeInTheDocument(); // collapsed
    fireEvent.click(within(row).getByRole('button', { name: 'More' }));
    const slack = within(row).getByLabelText('Slack user id');
    fireEvent.change(slack, { target: { value: 'bad id!' } });
    expect(within(row).getByText(/Use 2 to 120 letters/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(slack, { target: { value: 'U0123ABC' } });
    expect(within(row).getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.change(slack, { target: { value: '' } }); // back to what is saved
    expect(within(row).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.change(slack, { target: { value: 'U0123ABC' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toEqual({ person_id: 'p1', cliq_user_id: null, slack_user_id: 'U0123ABC', matched_by: 'manual' });
  });

  it('is read only for someone who cannot configure', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    renderAt('/agent/settings/team');
    const row = await person();
    expect(within(row).getByLabelText('Ada Obi Cliq user id')).toBeDisabled();
  });
});

describe('Connections: Zoho Cliq through the API', () => {
  const SECRETS = ['SECRET-CLIENT-VALUE', 'GRANT-CODE-VALUE', 'REFRESH-TOKEN-VALUE'];
  const openApi = async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    fireEvent.click(within(dialog).getByTestId('tool-cliq-api'));
    return dialog;
  };
  const type = (dialog: HTMLElement, label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  /** The four things the guide asks for. The name is already filled in. */
  const fillFour = (dialog: HTMLElement) => {
    type(dialog, 'Client ID', '1000.ABCDEF');
    type(dialog, 'Client secret', SECRETS[0]);
    type(dialog, 'Channel unique name', 'ops_alerts');
  };
  // Zoho's consent screen is a full page navigation; jsdom cannot do one, so the address is replaced by a recorder.
  const assign = vi.fn();
  const realLocation = window.location;
  beforeAll(() => { Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } }); });
  afterAll(() => { Object.defineProperty(window, 'location', { configurable: true, value: realLocation }); });
  const saves = () => only('invoke:agent-connections:save').map((c) => c.args[0] as Record<string, unknown>);
  beforeEach(() => {
    assign.mockClear();
    // jsdom has no pointer capture or scrolling, which the drop-down list asks for
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  });

  it('the picker offers both ways, API first, and the webhook one keeps working as before', async () => {
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByTestId('connection-add'));
    const dialog = await screen.findByTestId('connection-dialog');
    const api = within(dialog).getByTestId('tool-cliq-api');
    const hook = within(dialog).getByTestId('tool-cliq');
    expect(api).toHaveTextContent('Zoho Cliq (API, recommended)');
    expect(hook).toHaveTextContent('Zoho Cliq (webhook address)');
    expect(api.compareDocumentPosition(hook) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getAllByTestId('logo-cliq')).toHaveLength(2); // both ways use the Zoho logo
    fireEvent.click(hook);
    expect(within(dialog).getByLabelText('Cliq webhook address')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Client ID')).not.toBeInTheDocument();
  });

  it('explains the Zoho steps in plain words and shows only the API fields', async () => {
    const dialog = await openApi();
    const steps = within(dialog).getByTestId('setup-steps');
    expect(steps).toHaveTextContent('https://api-console.zoho.com');
    expect(steps).toHaveTextContent('Server-based Applications');
    expect(steps).toHaveTextContent('Authorized Redirect URI');
    expect(steps).toHaveTextContent('ZohoCliq.Webhooks.CREATE');
    expect(steps).toHaveTextContent('Connect to Zoho');
    expect(steps).not.toHaveTextContent('Self Client');
    expect(steps.querySelectorAll('li')).toHaveLength(5);
    for (const l of ['Data center', 'Client ID', 'Client secret', 'Channel unique name']) expect(within(dialog).getByLabelText(l)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Cliq webhook address')).not.toBeInTheDocument();
    for (const l of ['Client secret', 'Grant code', 'Refresh token (optional)']) expect((within(dialog).getByLabelText(l) as HTMLInputElement).type).toBe('password');
    expect((within(dialog).getByLabelText('Client ID') as HTMLInputElement).type).toBe('text');
    expect(within(dialog).getByRole('checkbox', { name: "CC the person's manager" })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Tag the person in each message' })).toBeChecked();
  });

  it('shows the Homepage URL and Redirect URI built from the site address, each with a Copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const dialog = await openApi();
    const block = within(dialog).getByTestId('zoho-paste-block');
    expect(block).toHaveTextContent('Paste these into Zoho');
    await waitFor(() => expect((within(block).getByLabelText('Homepage URL') as HTMLInputElement).value).toBe('https://ops.example.com'));
    const redirect = within(block).getByLabelText('Authorized Redirect URI') as HTMLInputElement;
    expect(redirect.value).toBe('https://ops.example.com/agent/oauth/zoho');
    expect(redirect.readOnly).toBe(true);
    fireEvent.click(within(block).getByRole('button', { name: 'Copy Authorized Redirect URI' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://ops.example.com/agent/oauth/zoho'));
    expect(await within(block).findByText('Copied')).toBeInTheDocument();
    // the grant code and refresh token live under a collapsed "advanced" section
    const advanced = within(dialog).getByTestId('cliq-advanced');
    expect(advanced).toHaveTextContent('Other ways to connect (advanced)');
    expect(advanced).not.toHaveAttribute('open');
    expect(within(advanced).getByLabelText('Grant code')).toBeInTheDocument();
  });

  it('falls back to the browser address when no site address is saved, and tells the person to select the text if copying is blocked', async () => {
    h.tables = { ...BASE_TABLES, agent_settings: { ...SETTINGS, app_url: undefined } };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = vi.fn().mockReturnValue(false);
    const dialog = await openApi();
    const redirect = (await within(dialog).findByLabelText('Authorized Redirect URI')) as HTMLInputElement;
    await waitFor(() => expect(redirect.value).toBe(`${realLocation.origin}/agent/oauth/zoho`));
    expect((within(dialog).getByLabelText('Homepage URL') as HTMLInputElement).value).toBe(realLocation.origin);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy Homepage URL' }));
    expect(await within(dialog).findByText(/did not allow copying/)).toBeInTheDocument();
  });

  it('needs only a client id, client secret and a valid channel name (no grant code or refresh token)', async () => {
    const dialog = await openApi();
    const save = within(dialog).getByTestId('connection-save');
    expect(save).toBeDisabled();
    type(dialog, 'Client ID', '1000.ABCDEF');
    type(dialog, 'Channel unique name', 'Ops Alerts');
    expect(within(dialog).getByTestId('channel-error')).toBeInTheDocument();
    type(dialog, 'Channel unique name', 'ops_alerts');
    expect(within(dialog).queryByTestId('channel-error')).not.toBeInTheDocument();
    expect(save).toBeDisabled(); // no client secret yet
    type(dialog, 'Client secret', SECRETS[0]);
    expect(save).toBeEnabled(); // the four fields are enough
    expect(within(dialog).queryByTestId('credential-needed')).not.toBeInTheDocument();
  });

  it('saves with only the four fields: mode api, no grant code, no refresh token, secret sent on that one call only', async () => {
    const dialog = await openApi();
    fillFour(dialog);
    // pick another data center from the list
    const dc = within(dialog).getByLabelText('Data center');
    fireEvent.keyDown(dc, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Europe (.eu)' }));
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]).toEqual({
      action: 'save', kind: 'cliq', preset: 'cliq-api', name: 'Zoho Cliq', mode: 'api', dc: 'eu', client_id: '1000.ABCDEF', channel: 'ops_alerts',
      client_secret: SECRETS[0], cc_manager: true, mention_people: true, events: ['flag_high', 'summary_day'],
    });
    expect('grant_code' in saves()[0]).toBe(false);
    expect('refresh_token' in saves()[0]).toBe(false);
    expect(saves()[0].url).toBeUndefined();
    // nothing typed stays on the screen, and the secret box says "saved"
    await waitFor(() => expect((within(dialog).getByLabelText('Client secret') as HTMLInputElement).value).toBe(''));
    for (const s of SECRETS) expect(document.body.innerHTML).not.toContain(s);
    expect(within(dialog).getByLabelText('Client secret')).toHaveProperty('placeholder', expect.stringContaining('saved'));
    expect(await within(dialog).findByTestId('connection-note')).toHaveTextContent('Now press Connect to Zoho');
    // the test buttons work on the saved connection
    fireEvent.click(within(dialog).getByTestId('connection-send-test-tag'));
    await waitFor(() => expect(only('invoke:agent-connections:test')).toHaveLength(1));
    expect(only('invoke:agent-connections:test')[0].args[0]).toEqual({ action: 'test', id: 'conn-new', tag_me: true });
    // no secret appears in any other request
    const others = h.calls.filter((c) => c.op !== 'invoke:agent-connections:save').map((c) => JSON.stringify(c.args));
    for (const s of SECRETS) expect(others.join('')).not.toContain(s);
    // saving again without typing anything sends no secrets
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(saves()[1]).toMatchObject({ id: 'conn-new', mode: 'api' });
    for (const k of ['client_secret', 'grant_code', 'refresh_token']) expect(saves()[1][k], k).toBeUndefined();
  });

  it('Connect to Zoho is disabled until the connection is saved, then calls oauth_start with the redirect address and goes to Zoho', async () => {
    const dialog = await openApi();
    const connect = within(dialog).getByTestId('zoho-connect');
    expect(connect).toBeDisabled();
    expect(connect).toHaveTextContent('Save first');
    fillFour(dialog);
    expect(connect).toBeDisabled();
    expect(within(dialog).queryByTestId('zoho-status')).not.toBeInTheDocument(); // nothing exists yet
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(within(dialog).getByTestId('zoho-connect')).toBeEnabled());
    expect(within(dialog).getByTestId('zoho-connect')).toHaveTextContent('Connect to Zoho');
    // the checklist appears: secret and channel done, not yet authorized, no test yet
    const status = within(dialog).getByTestId('zoho-status');
    expect(within(status).getByTestId('zoho-status-client')).toHaveAttribute('data-done', 'true');
    expect(within(status).getByTestId('zoho-status-authorized')).toHaveAttribute('data-done', 'false');
    expect(within(status).getByTestId('zoho-status-channel')).toHaveAttribute('data-done', 'true');
    expect(within(status).getByTestId('zoho-status-tested')).toHaveAttribute('data-done', 'false');
    // an unsaved edit turns it back into "Save first"
    type(dialog, 'Channel unique name', 'ops_two');
    expect(within(dialog).getByTestId('zoho-connect')).toBeDisabled();
    expect(within(dialog).getByTestId('zoho-connect')).toHaveTextContent('Save first');
    type(dialog, 'Channel unique name', 'ops_alerts'); // changed back: nothing unsaved
    await waitFor(() => expect(within(dialog).getByTestId('zoho-connect')).toBeEnabled());
    fireEvent.click(within(dialog).getByTestId('zoho-connect'));
    await waitFor(() => expect(only('invoke:agent-connections:oauth_start')).toHaveLength(1));
    expect(only('invoke:agent-connections:oauth_start')[0].args[0]).toEqual({ action: 'oauth_start', id: 'conn-new', redirect_uri: 'https://ops.example.com/agent/oauth/zoho' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.zoho.com/oauth/v2/auth?client_id=1000.ABCDEF&state=xyz'));
  });

  it('shows the server message when the Zoho sign-in cannot start, and stays on the page', async () => {
    h.oauthStart = { ok: false, error: 'The Client ID is not valid for this data center.' };
    const dialog = await openApi();
    fillFour(dialog);
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(within(dialog).getByTestId('zoho-connect')).toBeEnabled());
    fireEvent.click(within(dialog).getByTestId('zoho-connect'));
    expect(await within(dialog).findByTestId('connection-error')).toHaveTextContent('not valid for this data center');
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the server refusal on save and keeps what was typed', async () => {
    h.save = { ok: false, error: 'That Client ID looks wrong.' };
    const dialog = await openApi();
    fillFour(dialog);
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    expect(await within(dialog).findByTestId('connection-error')).toHaveTextContent('looks wrong');
    expect((within(dialog).getByLabelText('Client secret') as HTMLInputElement).value).toBe(SECRETS[0]);
    expect(within(dialog).getByTestId('connection-send-test-tag')).toBeDisabled(); // nothing saved, so nothing to test
    expect(within(dialog).getByTestId('zoho-connect')).toBeDisabled();
  });

  it('the advanced section still sends a pasted refresh token or grant code', async () => {
    const dialog = await openApi();
    fillFour(dialog);
    type(dialog, 'Refresh token (optional)', SECRETS[2]);
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]).toMatchObject({ mode: 'api', dc: 'com', refresh_token: SECRETS[2], client_secret: SECRETS[0] });
    expect(saves()[0].grant_code).toBeUndefined();
    // a refresh token was saved, so the dialog counts as authorized
    expect(within(dialog).getByTestId('zoho-status-authorized')).toHaveAttribute('data-done', 'true');
    expect(within(dialog).getByTestId('zoho-connect')).toHaveTextContent('Reconnect');
  });

  const API_ROW = { id: 'c-api', kind: 'cliq', name: 'Ops via API', status: 'connected', config: { mode: 'api', preset: 'cliq-api', dc: 'in', client_id: '1000.ABCDEF', channel: 'ops_alerts', cc_manager: true, mention_people: true, events: ['flag_high'] }, vault_secret_names: ['agent_conn_x_secret', 'agent_conn_x_refresh'], last_error: null, last_tested_at: null };
  const HOOK_ROW = { id: 'c-hook', kind: 'cliq', name: 'Ops via webhook', status: 'connected', config: { host: 'cliq.zoho.com', preset: 'cliq', mention_people: true }, vault_secret_names: ['agent_conn_y_url'], last_error: null, last_tested_at: null };

  it('editing shows saved secrets as saved, and blank secret boxes send none', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [API_ROW] };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ops via API' }));
    const dialog = await screen.findByTestId('connection-dialog');
    expect((within(dialog).getByLabelText('Client ID') as HTMLInputElement).value).toBe('1000.ABCDEF');
    expect((within(dialog).getByLabelText('Channel unique name') as HTMLInputElement).value).toBe('ops_alerts');
    expect(within(dialog).getByLabelText('Data center')).toHaveTextContent('India (.in)');
    for (const l of ['Client secret', 'Refresh token (optional)']) {
      const box = within(dialog).getByLabelText(l) as HTMLInputElement;
      expect(box.value).toBe('');
      expect(box.placeholder).toContain('saved');
    }
    expect(within(dialog).getByLabelText('Grant code')).toBeInTheDocument(); // optional, under "advanced"
    // already authorized: the main button reconnects and the checklist shows the ticks
    expect(within(dialog).getByTestId('zoho-connect')).toHaveTextContent('Reconnect to Zoho');
    expect(within(dialog).getByTestId('zoho-connect')).toBeEnabled();
    expect(within(dialog).getByTestId('zoho-status-client')).toHaveAttribute('data-done', 'true');
    expect(within(dialog).getByTestId('zoho-status-authorized')).toHaveAttribute('data-done', 'true');
    expect(within(dialog).getByTestId('zoho-status-channel')).toHaveAttribute('data-done', 'true');
    expect(within(dialog).getByRole('checkbox', { name: "CC the person's manager" })).toBeChecked();
    const save = within(dialog).getByTestId('connection-save');
    expect(save).toBeEnabled();
    type(dialog, 'Channel unique name', 'ops_two');
    expect(within(dialog).getByTestId('zoho-connect')).toBeDisabled(); // unsaved change
    fireEvent.click(save);
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]).toMatchObject({ id: 'c-api', mode: 'api', dc: 'in', client_id: '1000.ABCDEF', channel: 'ops_two', cc_manager: true });
    for (const k of ['client_secret', 'grant_code', 'refresh_token', 'url']) expect(saves()[0][k], k).toBeUndefined();
  });

  it('a new grant code can still be pasted on edit under advanced to connect again', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [API_ROW] };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ops via API' }));
    const dialog = await screen.findByTestId('connection-dialog');
    type(dialog, 'Grant code', SECRETS[1]);
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0].grant_code).toBe(SECRETS[1]);
    expect(saves()[0].client_secret).toBeUndefined();
  });

  it('the cards say whether a Cliq connection uses the API or a webhook', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [API_ROW, HOOK_ROW] };
    renderAt('/agent/connections');
    const rows = await screen.findAllByTestId('connection-row');
    expect(within(rows[0]).getByTestId('connection-mode')).toHaveTextContent('API');
    expect(rows[0]).toHaveTextContent('#ops_alerts');
    expect(rows[0]).toHaveTextContent('cliq.zoho.in');
    expect(within(rows[0]).getByTestId('cc-manager-chip')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('connection-test-tag')).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('connection-mode')).toHaveTextContent('Webhook');
    expect(within(rows[1]).queryByTestId('cc-manager-chip')).not.toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('cliq.zoho.com');
  });

  it('a Cliq API card without a refresh token says "Needs Zoho sign-in" and its button opens the dialog; an authorized one says "Connected to Zoho"', async () => {
    const WAITING = { ...API_ROW, id: 'c-wait', name: 'Waiting for Zoho', status: 'disconnected', vault_secret_names: ['agent_conn_z_secret'] };
    h.tables = { ...BASE_TABLES, agent_connections: [WAITING, API_ROW, HOOK_ROW] };
    renderAt('/agent/connections');
    const rows = await screen.findAllByTestId('connection-row');
    expect(within(rows[0]).getByTestId('zoho-chip')).toHaveTextContent('Needs Zoho sign-in');
    expect(within(rows[0]).queryByTestId('connection-test')).not.toBeInTheDocument(); // a test cannot work before the sign-in
    expect(within(rows[1]).getByTestId('zoho-chip')).toHaveTextContent('Connected to Zoho');
    expect(within(rows[1]).queryByTestId('connection-zoho-connect')).not.toBeInTheDocument();
    expect(within(rows[2]).queryByTestId('zoho-chip')).not.toBeInTheDocument(); // the webhook way has no Zoho sign-in
    fireEvent.click(within(rows[0]).getByTestId('connection-zoho-connect'));
    const dialog = await screen.findByTestId('connection-dialog');
    expect(dialog).toHaveTextContent('Edit Waiting for Zoho');
    expect(within(dialog).getByTestId('zoho-connect')).toHaveTextContent('Connect to Zoho');
    expect(within(dialog).getByTestId('zoho-connect')).toBeEnabled();
    expect(within(dialog).getByTestId('zoho-status-authorized')).toHaveAttribute('data-done', 'false');
    fireEvent.click(within(dialog).getByTestId('zoho-connect'));
    await waitFor(() => expect(only('invoke:agent-connections:oauth_start')[0]?.args[0]).toEqual({ action: 'oauth_start', id: 'c-wait', redirect_uri: 'https://ops.example.com/agent/oauth/zoho' }));
  });

  it('ticks "Test message sent" for a connection that was tested and works', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [{ ...API_ROW, last_tested_at: '2026-11-19T10:00:00Z' }] };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ops via API' }));
    const dialog = await screen.findByTestId('connection-dialog');
    expect(within(dialog).getByTestId('zoho-status-tested')).toHaveAttribute('data-done', 'true');
  });

  it('a webhook Cliq connection can also CC the manager, but only sends it when changed', async () => {
    h.tables = { ...BASE_TABLES, agent_connections: [HOOK_ROW] };
    renderAt('/agent/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Ops via webhook' }));
    const dialog = await screen.findByTestId('connection-dialog');
    expect(within(dialog).getByLabelText('Cliq webhook address')).toBeInTheDocument();
    const cc = within(dialog).getByRole('checkbox', { name: "CC the person's manager" });
    expect(cc).not.toBeChecked();
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0].cc_manager).toBeUndefined();
    expect(saves()[0].mode).toBeUndefined();
    fireEvent.click(cc);
    fireEvent.click(within(dialog).getByTestId('connection-save'));
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(saves()[1].cc_manager).toBe(true);
  });
});
