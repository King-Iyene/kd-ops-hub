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
  companies: [{ id: 'c1', name: 'KD Squares Ltd', short_code: 'KDS', is_active: true }],
  profiles: [
    { id: 'p1', full_name: 'Ada Obi', role: 'operations', job_title: 'Ops Lead', pay_group_id: 'g1', reporting_manager_id: null },
    { id: 'p2', full_name: 'Bayo Admin', role: 'admin', job_title: null, pay_group_id: 'g1', reporting_manager_id: null },
  ],
  tm_tables: [{ id: 't1', name: 'Report' }],
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
    rpc: (name: string, args?: unknown) => {
      if (name === 'agent_my_scope') return Promise.resolve({ data: h.scope, error: null });
      if (name === 'agent_ai_budget_state') return Promise.resolve({ data: h.budget, error: null });
      h.calls.push({ op: `rpc:${name}`, args: [args] });
      const data = name === 'agent_suggest_person_profiles' ? { written: 2, kept_manual: 0, skipped_no_company: 1 }
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
    for (const route of ['/agent', '/agent/chat', '/agent/summaries', '/agent/memory', '/agent/connections', '/agent/settings']) {
      h.calls.length = 0;
      const { unmount } = renderAt(route);
      await waitFor(() => expect(screen.getByTestId('ops-agent')).toBeInTheDocument());
      if (route === '/agent/settings') { await screen.findByTestId('ai-meter'); await screen.findByTestId('domain-count'); }
      if (route === '/agent/connections') await screen.findByTestId('agent-connections');
      await new Promise((r) => setTimeout(r, 30));
      expect(writes(), `opening ${route}`).toEqual([]);
      unmount();
    }
  });

  it('makes Settings read only for an Admin and turns Connections away', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    const { unmount } = renderAt('/agent/settings');
    await screen.findByTestId('agent-settings');
    expect(screen.getByRole('note')).toHaveTextContent('read only');
    expect(screen.queryByLabelText('Claude API key')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('fill-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-test-fast')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin access')).not.toBeInTheDocument();
    unmount();
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
    renderAt('/agent/settings');
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
    renderAt('/agent/settings');
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
    renderAt('/agent/settings');
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
