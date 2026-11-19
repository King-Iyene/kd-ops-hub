// The Ops Agent screen, rendered against a fake database. Checks what each role sees, that Admin controls are
// switched off, that a mode change saves only that field, and that opening the screen never writes anything.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { table?: string; op: string; args: unknown[] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  scope: { role: 'super_admin', access: true, configure: true, companies: null, modules: null } as Record<string, unknown>,
  status: { key_configured: true, ai_enabled: false, mode: 'observe', models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' }, budget: { level: 'ok' } } as Record<string, unknown>,
  budget: { level: 'ok', ai_enabled: false, spent_today_usd: 0.5, spent_month_usd: 2, daily_budget_usd: 5, monthly_budget_usd: 50 } as Record<string, unknown>,
}));

const SETTINGS = {
  id: true, mode: 'observe', ai_enabled: false, model_fast: 'claude-haiku-5-5', model_smart: 'claude-sonnet-5-5',
  model_prices: { 'claude-haiku-5-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 }, 'claude-sonnet-5-5': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
  monthly_ai_budget_usd: 50, daily_ai_budget_usd: 5, timezone: 'America/New_York', report_deadline: '18:00:00', default_working_days: [1, 2, 3, 4, 5],
  default_work_start: '09:00:00', default_work_end: '17:00:00', default_country_code: 'NG', report_table_id: 't1', hr_contact_id: null,
  hide_own_flags: true, leadership_flags_super_admin_only: true, readonly_query_enabled: true, escalation_window_days: 14,
  operating_rules: '# Rules', updated_at: '2026-11-19T00:00:00Z',
};

const TABLES: Record<string, unknown> = {
  agent_settings: SETTINGS,
  agent_company_scope: [{ company_id: 'c1', enabled: true }],
  agent_module_catalog: [
    { key: 'task', label: 'Task', description: 'Tasks', sensitive: false, sort_order: 10 },
    { key: 'payroll', label: 'Payroll & payslips', description: 'Salary', sensitive: true, sort_order: 100 },
  ],
  agent_module_access: [{ module_key: 'task', enabled: true }, { module_key: 'payroll', enabled: false }],
  agent_person_profile: [], agent_admin_scope: [], agent_flags: [], agent_summaries: [], agent_memory: [], agent_connections: [],
  agent_ai_usage: [], agent_audit_log: [], agent_domain_list: [],
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
    let op = 'select';
    let single = false;
    const b: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const data = TABLES[table] ?? [];
          const result = { data: single && Array.isArray(data) ? data[0] ?? null : data, error: null, count: Array.isArray(data) ? 3 : null };
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
        }
        return (...args: unknown[]) => {
          if (WRITES.includes(prop)) { op = prop; h.calls.push({ table, op, args }); }
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
      return Promise.resolve({ data: name === 'agent_suggest_person_profiles' ? { written: 2, kept_manual: 0, skipped_no_company: 1 } : 0, error: null });
    },
    functions: { invoke: (_n: string, opts: { body: { action: string } }) => {
      if (opts.body.action === 'test') h.calls.push({ op: 'invoke:test', args: [opts] });
      return Promise.resolve({ data: opts.body.action === 'status' ? h.status : { ok: true, model: 'claude-haiku-5-5', text: 'OK', cost_usd: 0.00002 }, error: null });
    } },
  };
  return { supabase };
});

import OpsAgent from '@/pages/OpsAgent';

function renderPage(route = '/agent') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}><OpsAgent /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const writes = () => h.calls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.op) || c.op.startsWith('rpc:') || c.op === 'invoke:test');
const openTab = (key: string) => fireEvent.mouseDown(screen.getByTestId(`agent-tab-${key}`), { button: 0 });

beforeEach(() => {
  h.calls.length = 0;
  h.scope = { role: 'super_admin', access: true, configure: true, companies: null, modules: null };
  h.status = { key_configured: true, ai_enabled: false, mode: 'observe', models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' }, budget: { level: 'ok' } };
  h.budget = { level: 'ok', ai_enabled: false, spent_today_usd: 0.5, spent_month_usd: 2, daily_budget_usd: 5, monthly_budget_usd: 50 };
});

describe('Ops Agent screen', () => {
  it('shows a Super Admin all six tabs and an honest empty Inbox', async () => {
    renderPage();
    await screen.findByTestId('agent-tab-settings');
    for (const k of ['inbox', 'summaries', 'chat', 'memory', 'connections', 'settings']) expect(screen.getByTestId(`agent-tab-${k}`)).toBeInTheDocument();
    expect(await screen.findByText('Nothing needs attention')).toBeInTheDocument();
  });

  it('never writes anything just by opening the screen or its Settings tab', async () => {
    renderPage('/agent?tab=settings');
    await screen.findByTestId('agent-settings');
    await screen.findByTestId('ai-meter');
    await screen.findByTestId('domain-count');
    expect(writes()).toEqual([]);
  });

  it('hides Connections from an Admin and makes every Settings control read only', async () => {
    h.scope = { role: 'admin', access: true, configure: false, companies: null, modules: null };
    renderPage('/agent?tab=settings');
    await screen.findByTestId('agent-settings');
    expect(screen.queryByTestId('agent-tab-connections')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('read only');
    for (const m of ['observe', 'remind', 'enforce']) expect(screen.getByTestId(`mode-${m}`)).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'AI features' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('fill-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-test-fast')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin access')).not.toBeInTheDocument();
  });

  it('turns an Admin away when the database says they have no access', async () => {
    h.scope = { role: 'operations', access: false };
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have access');
    expect(screen.queryByTestId('agent-tab-settings')).not.toBeInTheDocument();
  });

  it('saves a mode change as that one field only', async () => {
    renderPage('/agent?tab=settings');
    fireEvent.click(await screen.findByTestId('mode-remind'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0];
    expect(w.table).toBe('agent_settings');
    expect(w.op).toBe('update');
    const patch = w.args[0] as Record<string, unknown>;
    expect(Object.keys(patch).filter((k) => k !== 'updated_by')).toEqual(['mode']);
    expect(patch.mode).toBe('remind');
  });

  it('only enables Save once something changed, and sends only the changed field', async () => {
    renderPage('/agent?tab=settings');
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
    expect(Object.keys(patch).filter((k) => k !== 'updated_by')).toEqual(['operating_rules']);
  });

  it('shows the locked state of a sensitive module and refuses to let it be switched', async () => {
    renderPage('/agent?tab=settings');
    const row = await screen.findByTestId('module-payroll');
    expect(within(row).getByText(/locked off/i)).toBeInTheDocument();
    expect(within(row).getByRole('switch')).toBeDisabled();
    expect(within(await screen.findByTestId('module-task')).getByRole('switch')).toBeEnabled();
  });

  it('warns when the Claude key is missing and when the budget is spent', async () => {
    h.status = { ...h.status, key_configured: false };
    h.budget = { ...h.budget, level: 'off', spent_today_usd: 5.2 };
    renderPage();
    const banners = await screen.findByTestId('agent-banners');
    await waitFor(() => expect(banners).toHaveTextContent('Claude key is not set'));
    expect(banners).toHaveTextContent('budget is spent');
  });

  it('runs the AI test only when the button is pressed and reports the result', async () => {
    renderPage('/agent?tab=settings');
    const btn = await screen.findByTestId('ai-test-fast');
    expect(writes()).toEqual([]);
    fireEvent.click(btn);
    expect(await screen.findByTestId('ai-test-result')).toHaveTextContent('Connected');
    expect(writes().filter((c) => c.op === 'invoke:test')).toHaveLength(1);
  });

  it('fills groups through the database function when asked, not before', async () => {
    renderPage('/agent?tab=settings');
    fireEvent.click(await screen.findByTestId('fill-groups'));
    await waitFor(() => expect(writes().some((c) => c.op === 'rpc:agent_suggest_person_profiles')).toBe(true));
  });

  it('can switch tabs', async () => {
    renderPage();
    await screen.findByTestId('agent-tab-chat');
    openTab('chat');
    expect(await screen.findByText('Chat is not available yet')).toBeInTheDocument();
    openTab('memory');
    expect(await screen.findByText('Nothing remembered yet')).toBeInTheDocument();
  });
});
