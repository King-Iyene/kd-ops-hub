// "Send new entries to other tools": the Connections button and dialog on a Table page, against a fake database and fake edge function.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { table?: string; op: string; args: unknown[]; eq: unknown[][] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  tables: {} as Record<string, unknown>,
  confirm: vi.fn(async () => true),
  testResult: { ok: true } as { ok: boolean; error?: string },
}));

vi.mock('@/lib/supabase', () => {
  const WRITES = ['insert', 'update', 'upsert', 'delete'];
  const builder = (table: string) => {
    let write: Call | null = null;
    const b: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const result = { data: write ? null : h.tables[table] ?? [], error: null };
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
        }
        return (...args: unknown[]) => {
          if (WRITES.includes(prop)) { write = { table, op: prop, args, eq: [] }; h.calls.push(write); }
          else if (prop === 'eq' && write) write.eq.push(args);
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
    functions: {
      invoke: (fn: string, opts: { body: { action?: string } }) => {
        h.calls.push({ op: `invoke:${fn}:${opts.body.action}`, args: [opts.body], eq: [] });
        return Promise.resolve({ data: h.testResult, error: null });
      },
    },
  };
  return { supabase };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => undefined }) }));
vi.mock('@/hooks/use-confirm', () => ({ confirm: h.confirm }));

import { useAuthStore, type UserRole } from '@/store/authStore';
import { TableConnectionsButton } from '../table/ConnectionsDialog';
import {
  channelProblem, describeDelivery, insertAtCursor, plainError,
} from '../table/tableConnections';
import { groupDeliveries, type RecordDelivery } from '@/queries/useTableConnections';
import type { TableField } from '@/queries/useTaskModule';

// Radix switches inside a <form> measure a hidden input; jsdom has no ResizeObserver.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const TABLE = 'tbl-1';
const field = (id: string, name: string, position: number): TableField => ({ id, table_id: TABLE, name, type: 'text', config: {}, position, created_at: '2026-01-01' });
const FIELDS = [field('f1', 'Full name', 0), field('f2', 'What did you do today?', 1)];

const slack = { id: 'c-slack', kind: 'slack', name: 'Team Slack', status: 'connected', config: {}, vault_secret_names: [], last_error: null, last_tested_at: null };
const cliqApi = { id: 'c-cliq', kind: 'cliq', name: 'KD Cliq', status: 'connected', config: { mode: 'api', channel: 'general_updates', dc: 'com' }, vault_secret_names: [], last_error: null, last_tested_at: null };
const cliqHook = { id: 'c-cliq-hook', kind: 'cliq', name: 'Cliq webhook', status: 'connected', config: { mode: 'webhook' }, vault_secret_names: [], last_error: null, last_tested_at: null };

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', table_id: TABLE, connection_id: 'c-slack', name: 'Send to Team Slack', enabled: true, template: null, channel: null,
  tag_person: true, cc_manager: true, created_by: 'u-1', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', last_sent_at: null, ...over,
});

function setRole(role: UserRole | null) {
  useAuthStore.setState({ profile: role ? ({ id: 'u-1', email: 'a@b.c', full_name: 'Ada', role } as never) : null, viewAsRole: null } as never);
}
function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TableConnectionsButton tableId={TABLE} tableName="Reports" fields={FIELDS} /></MemoryRouter>
    </QueryClientProvider>,
  );
}
async function openDialog() {
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: /connections/i }));
  await screen.findByText('Send new entries to other tools');
}
const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];
const writes = () => h.calls.filter((c) => WRITE_OPS.includes(c.op));
const invokes = () => h.calls.filter((c) => c.op.startsWith('invoke:'));

beforeEach(() => {
  h.calls.length = 0;
  h.tables = { tm_table_connections: [], agent_connections: [slack, cliqApi, cliqHook], agent_outbox: [] };
  h.confirm.mockClear();
  h.confirm.mockResolvedValue(true);
  h.testResult = { ok: true };
  setRole('super_admin');
});

describe('who sees the Connections button', () => {
  it('shows for a super admin', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /connections/i })).toBeTruthy();
  });
  it.each(['admin', 'finance', 'operations', 'field_staff'] as UserRole[])('is hidden for %s', (role) => {
    setRole(role);
    renderButton();
    expect(screen.queryByRole('button', { name: /connections/i })).toBeNull();
  });
  it('is hidden when a super admin is viewing as an admin', () => {
    setRole('super_admin');
    useAuthStore.setState({ viewAsRole: 'admin' } as never);
    renderButton();
    expect(screen.queryByRole('button', { name: /connections/i })).toBeNull();
  });
});

describe('the dialog', () => {
  it('explains itself, lists the rules and writes nothing just by opening', async () => {
    h.tables.tm_table_connections = [rule({ last_sent_at: new Date(Date.now() - 5 * 60_000).toISOString() })];
    await openDialog();
    expect(screen.getByText(/KD Ops sends it to the tools you choose, within a few seconds/)).toBeTruthy();
    const row = await screen.findByText('Send to Team Slack');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).getByText('Team Slack')).toBeTruthy();
    expect(within(li).getByTestId('logo-slack')).toBeTruthy();
    expect(within(li).getByRole('switch', { name: /enabled for send to team slack/i }).getAttribute('aria-checked')).toBe('true');
    expect(within(li).getByTestId('rule-status').textContent).toBe('Last sent 5m ago');
    for (const b of ['Edit', 'Send test', 'Delete']) expect(within(li).getByRole('button', { name: new RegExp(b, 'i') })).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(invokes()).toHaveLength(0);
  });

  it('shows the last error in plain words', async () => {
    h.tables.tm_table_connections = [rule()];
    h.tables.agent_outbox = [
      { id: 'o2', rule_id: 'r-1', status: 'failed', attempts: 3, error: 'HTTP 401 invalid_token', created_at: '2026-11-02T00:00:00Z', sent_at: null },
      { id: 'o1', rule_id: 'r-1', status: 'sent', attempts: 1, error: null, created_at: '2026-11-01T00:00:00Z', sent_at: '2026-11-01T00:00:01Z' },
    ];
    await openDialog();
    await waitFor(() => expect(screen.getByTestId('rule-status').textContent).toMatch(/refused the sign-in/));
  });

  it('says so when no connection has been set up yet', async () => {
    await openDialog();
    expect(await screen.findByTestId('no-table-connections')).toBeTruthy();
  });

  it('asks to connect a tool first, with a link, when Agent has none', async () => {
    h.tables.agent_connections = [];
    await openDialog();
    await waitFor(() => expect((screen.getByRole('button', { name: /add connection/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /add connection/i }));
    const msg = await screen.findByTestId('no-tools');
    expect(msg.textContent).toContain('Connect a tool first in Agent, Connections');
    expect(within(msg).getByRole('link').getAttribute('href')).toBe('/agent/connections');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('adding a connection', () => {
  async function openForm() {
    await openDialog();
    await waitFor(() => expect((screen.getByRole('button', { name: /add connection/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /add connection/i }));
    await screen.findByRole('radiogroup', { name: 'Tool' });
  }

  it('keeps Save disabled until a tool is chosen, then inserts the right row', async () => {
    await openForm();
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /team slack/i }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Send to Team Slack');
    expect(save.disabled).toBe(false);
    expect(screen.getByText('Leave empty to send every answer. Click a name below to add it to the message.')).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0];
    expect(w.table).toBe('tm_table_connections');
    expect(w.op).toBe('insert');
    expect(w.args[0]).toEqual({
      table_id: TABLE, enabled: true, created_by: 'u-1', connection_id: 'c-slack', name: 'Send to Team Slack',
      template: null, channel: null, tag_person: true, cc_manager: true,
    });
  });

  it('inserts chips at the cursor and saves the message and switches', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('radio', { name: /team slack/i }));
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'New entry from  today' } });
    box.setSelectionRange(15, 15);
    fireEvent.click(screen.getByRole('button', { name: 'Full name' }));
    expect(box.value).toBe('New entry from {{Full name}} today');
    box.setSelectionRange(box.value.length, box.value.length);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(box.value).toBe('New entry from {{Full name}} today{{link}}');
    for (const l of ['Table', 'Submitted at', 'What did you do today?']) expect(screen.getByRole('button', { name: l })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reports to Slack' } });
    fireEvent.click(screen.getByRole('switch', { name: 'CC their manager' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ name: 'Reports to Slack', template: 'New entry from {{Full name}} today{{link}}', tag_person: true, cc_manager: false });
  });

  it('only offers the channel override for a Cliq API connection and validates it', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('radio', { name: /team slack/i }));
    expect(screen.queryByLabelText('Channel')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /cliq webhook/i }));
    expect(screen.queryByLabelText('Channel')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /kd cliq/i }));
    const channel = screen.getByLabelText('Channel') as HTMLInputElement;
    expect(channel.placeholder).toBe('general_updates');
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    fireEvent.change(channel, { target: { value: 'Daily Reports!' } });
    expect(screen.getByRole('alert').textContent).toMatch(/lowercase letters, digits and underscores/);
    expect(save.disabled).toBe(true);
    fireEvent.change(channel, { target: { value: 'daily_reports_2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ connection_id: 'c-cliq', channel: 'daily_reports_2' });
  });

  it('does not save a channel for a tool that cannot use one', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('radio', { name: /kd cliq/i }));
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('radio', { name: /team slack/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ connection_id: 'c-slack', channel: null });
  });
});

describe('changing, testing and deleting a connection', () => {
  beforeEach(() => { h.tables.tm_table_connections = [rule()]; });

  it('toggling Enabled updates only that rule', async () => {
    await openDialog();
    const sw = await screen.findByRole('switch', { name: /enabled for send to team slack/i });
    expect(writes()).toHaveLength(0);
    fireEvent.click(sw);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ table: 'tm_table_connections', op: 'update', eq: [['id', 'r-1']] });
    expect(writes()[0].args[0]).toMatchObject({ enabled: false });
  });

  it('Send test calls record_test with the rule id', async () => {
    await openDialog();
    fireEvent.click(await screen.findByRole('button', { name: /send test for send to team slack/i }));
    await waitFor(() => expect(invokes()).toHaveLength(1));
    expect(invokes()[0].op).toBe('invoke:agent-connections:record_test');
    expect(invokes()[0].args[0]).toEqual({ action: 'record_test', rule_id: 'r-1' });
    expect(writes()).toHaveLength(0);
  });

  it('Delete asks first, and only deletes after a yes', async () => {
    h.confirm.mockResolvedValueOnce(false);
    await openDialog();
    const del = await screen.findByRole('button', { name: /delete send to team slack/i });
    fireEvent.click(del);
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(writes()).toHaveLength(0);
    fireEvent.click(del);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ table: 'tm_table_connections', op: 'delete', eq: [['id', 'r-1']] });
  });

  it('Edit opens the saved values and updates the same row', async () => {
    h.tables.tm_table_connections = [rule({ template: 'Hi {{Full name}}', tag_person: false, cc_manager: false })];
    await openDialog();
    fireEvent.click(await screen.findByRole('button', { name: /edit send to team slack/i }));
    expect((await screen.findByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hi {{Full name}}');
    expect(screen.getByRole('radio', { name: /team slack/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Tag the person in the entry' }).getAttribute('aria-checked')).toBe('false');
    expect((screen.getByRole('switch', { name: 'CC their manager' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ op: 'update', eq: [['id', 'r-1']] });
    expect(writes()[0].args[0]).toMatchObject({ template: null, tag_person: false, cc_manager: false });
  });
});

describe('helpers', () => {
  it('channel names are lowercase letters, digits and underscores', () => {
    expect(channelProblem('')).toBeNull();
    expect(channelProblem('  ')).toBeNull();
    expect(channelProblem('daily_reports_2')).toBeNull();
    for (const bad of ['Daily', 'daily-reports', 'daily reports', '#daily', 'daily!']) expect(channelProblem(bad), bad).toBeTruthy();
  });
  it('inserts text at the cursor or over a selection', () => {
    expect(insertAtCursor('ab', 1, 1, '{{x}}')).toEqual({ text: 'a{{x}}b', caret: 6 });
    expect(insertAtCursor('abcd', 1, 3, 'X')).toEqual({ text: 'aXd', caret: 2 });
    expect(insertAtCursor('ab', null, null, 'X')).toEqual({ text: 'abX', caret: 3 });
  });
  it('describes the latest deliveries', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const d = (status: RecordDelivery['status'], over: Partial<RecordDelivery> = {}): RecordDelivery => ({ id: status, rule_id: 'r', status, attempts: 1, error: null, created_at: '2026-11-20T11:00:00Z', sent_at: null, ...over });
    expect(describeDelivery({ last_sent_at: null }, [], now)).toEqual({ tone: 'none', text: 'Nothing sent yet' });
    expect(describeDelivery({ last_sent_at: '2026-11-20T11:55:00Z' }, [d('sent')], now)).toEqual({ tone: 'ok', text: 'Last sent 5m ago' });
    expect(describeDelivery({ last_sent_at: null }, [d('failed', { error: 'timeout' })], now).tone).toBe('error');
    expect(describeDelivery({ last_sent_at: null }, [d('pending')], now).tone).toBe('pending');
    expect(plainError(null)).toMatch(/did not accept/);
  });
  it('keeps the latest 5 deliveries per rule', () => {
    const rows = Array.from({ length: 8 }, (_, i): RecordDelivery => ({ id: `o${i}`, rule_id: 'r1', status: 'sent', attempts: 1, error: null, created_at: `2026-11-0${i + 1}T00:00:00Z`, sent_at: null }));
    const g = groupDeliveries([...rows, { ...rows[0], id: 'x', rule_id: 'r2' }]);
    expect(g.r1.map((r) => r.id)).toEqual(['o7', 'o6', 'o5', 'o4', 'o3']);
    expect(g.r2).toHaveLength(1);
  });
});
