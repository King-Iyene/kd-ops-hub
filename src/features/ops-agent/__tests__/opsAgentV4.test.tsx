// Ops Agent v4 screens against a fake database and fake edge functions: the card detail sheet (recurrence, person, editable draft,
// send), the site list question, Summaries (Daily by default), Monitoring rules and the sensitive module confirmation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { table?: string; op: string; args: unknown[] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  tables: {} as Record<string, unknown>,
  detail: {} as Record<string, unknown>,
  classify: { ok: true, results: [] } as Record<string, unknown>,
  send: { ok: true, closed: true } as Record<string, unknown>,
  toasts: [] as { title?: string; description?: string }[],
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
      if (name === 'agent_team_pulse') return Promise.resolve(h.pulse ? { data: h.pulse, error: null } : { data: null, error: { message: 'not deployed' } });
      h.calls.push({ op: `rpc:${name}`, args: [args] });
      if (name === 'agent_flag_detail') {
        const id = (args as { p_flag: string }).p_flag;
        return Promise.resolve({ data: h.detail[id] ?? null, error: h.detail[id] ? null : { message: 'not_found' } });
      }
      return Promise.resolve({ data: 0, error: null });
    },
    functions: {
      invoke: (fn: string, opts: { body: { action?: string } & Record<string, unknown> }) => {
        const action = opts.body.action;
        if (!(fn === 'agent-ai' && action === 'status')) h.calls.push({ op: `invoke:${fn}${action ? `:${action}` : ''}`, args: [opts.body] });
        let data: unknown = { ok: true };
        if (fn === 'agent-ai' && action === 'status') data = { key_configured: true, key_source: 'env', ai_enabled: true, models: { fast: 'a', smart: 'b' }, budget: { level: 'ok' } };
        else if (fn === 'agent-ai' && action === 'classify_sites') data = h.classify;
        else if (fn === 'agent-connections' && action === 'send_flag') data = h.send;
        return Promise.resolve({ data, error: null });
      },
    },
  };
  return { supabase };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (t: { title?: string; description?: string }) => { h.toasts.push(t); } }) }));

import { InboxTab } from '@/features/ops-agent/tabs/InboxTab';
import { SummariesTab } from '@/features/ops-agent/tabs/SummariesTab';
import OpsAgent from '@/pages/OpsAgent';
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog';

function Probe() { const l = useLocation(); return <span data-testid="loc">{l.pathname}{l.search}</span>; }

function renderUi(ui: React.ReactNode, route = '/agent') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="/agent/*" element={<>{ui}<ConfirmDialogHost /><Probe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];
const WRITE_CALLS = ['rpc:agent_domain_set', 'rpc:agent_flag_set_status', 'rpc:agent_generate_summary', 'invoke:agent-connections:send_flag'];
const writes = () => h.calls.filter((c) => WRITE_OPS.includes(c.op) || WRITE_CALLS.includes(c.op));
const only = (op: string) => h.calls.filter((c) => c.op === op);

const baseFlag = {
  company_id: null, module: null, subject_type: 'person', subject_id: 'p1', person_id: 'p1', manager_id: null, suggested_action: null, draft_message: null,
  escalation_level: 0, occurrence_count: 3, first_seen_at: '2026-11-19T14:00:00Z', last_seen_at: '2026-11-19T15:00:00Z', status: 'open', item_type: 'flag',
};
const trackingFlag = { ...baseFlag, id: 'f1', rule_code: 'TR01', severity: 'high', title: 'Cara Obi has not tracked time today', why: 'No time has been tracked since 9:00 AM.', evidence: { tracked_minutes_today: 0 } };
const sitesFlag = {
  ...baseFlag, id: 'f2', rule_code: 'TR05', severity: 'medium', title: 'Cara Obi spent time on unlisted sites', why: 'Two sites are not on the list.',
  evidence: { sites: [{ domain: 'figmaish.io', seconds: 1500, category: 'unknown' }, { domain: 'youtube.com', seconds: 600, category: 'unproductive' }], total_seconds: 2100 },
};
const loanFlag = { ...baseFlag, id: 'f3', rule_code: 'LN01', severity: 'medium', title: '3 loan requests have waited 5 days', why: 'Count only.', person_id: null, subject_type: 'system', subject_id: 'loans', occurrence_count: 1, evidence: null };

const person = { id: 'p1', full_name: 'Cara Obi', email: 'cara@kd.test', photo_url: 'https://img.test/cara.png', job_title: 'Ops Lead', manager: { id: 'm1', full_name: 'Dayo Boss', photo_url: null } };
const detailFor = (flag: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  flag, person, today: { tracked_minutes: 0, tracking_now: false, open_tasks: 4, overdue_tasks: 1, reported_today: false, on_leave: false },
  recurrence: { window_days: 14, count_in_window: 3, label: 'The 3rd time in the last 14 days', dates: ['2026-11-12T14:00:00Z', '2026-11-05T14:00:00Z'], total: 5 },
  sites: [], timeline: [{ kind: 'created', at: '2026-11-19T14:00:00Z', actor: null, detail: null }], messages: [],
  draft: { to: 'person', recipient_name: 'Cara Obi', recipient_email: 'cara@kd.test', recipient_id: 'p1', subject: 'Time not tracked today', body: 'Hi Cara,\n\nPlease start your timer.\n\nThank you,\nKD Squares Operations' },
  ...extra,
});

const summary = (id: string, kind: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, period_kind: kind, period_start: start, period_end: end, company_id: null, auto: true, created_at: `${end}T11:00:00Z`,
  narrative: `Narrative for ${id}`, metrics: { headline: `Headline ${id}`, tracking: { expected_days: 20, tracked_days: 18, hours: 120 }, reports: { expected: 20, submitted: 15, missing: [{ person_id: 'p1', name: 'Cara Obi', days: 3 }] }, tasks: { completed: 9, overdue: 2 }, flags: { opened: 7, high: 2 }, repeat: [], sites: [{ domain: 'youtube.com', minutes: 44, people: 2 }] }, ...extra,
});

beforeEach(() => {
  h.calls.length = 0;
  h.toasts.length = 0;
  h.classify = { ok: true, results: [] };
  h.send = { ok: true, closed: true };
  h.pulse = null;
  h.detail = { f1: detailFor(trackingFlag), f2: detailFor(sitesFlag, { sites: [
    { domain: 'figmaish.io', seconds: 1500, category: 'unknown', list: null, hint: { verdict: 'unknown', reason: 'Nothing we know connects it to our work yet.' }, days_seen: 4, team_users: 1 },
    { domain: 'youtube.com', seconds: 600, category: 'unproductive', list: 'unproductive', hint: { verdict: 'personal', reason: 'A social, shopping or entertainment site.' }, days_seen: 9, team_users: 3 },
  ], draft: null }), f3: { ...detailFor(loanFlag), person: null, today: null, recurrence: null, draft: null } };
  h.tables = {
    agent_flags: [trackingFlag, sitesFlag, loanFlag],
    profiles: [{ id: 'p1', full_name: 'Cara Obi', role: 'operations', job_title: 'Ops Lead', pay_group_id: null, reporting_manager_id: 'm1', photo_url: 'https://img.test/cara.png' }],
    agent_connections: [{ id: 'c1', kind: 'slack', name: 'Ops channel', status: 'connected', config: {}, vault_secret_names: [], last_error: null, last_tested_at: null }],
    agent_rules: [
      { code: 'TK04', module_key: 'task', title: 'Task blocked', description: 'A task has been blocked for too long.', enabled: false, severity: 'medium', params: { days: 3 }, status: 'ready' },
      { code: 'TR03', module_key: 'time', title: 'Low hours', description: 'Tracked hours are well below the usual.', enabled: true, severity: 'low', params: { share: 0.5 }, status: 'ready' },
      { code: 'LN01', module_key: 'loans', title: 'Loan requests waiting', description: 'Counts loan requests waiting for a decision.', enabled: false, severity: 'medium', params: { days: 5 }, status: 'ready' },
    ],
    agent_module_catalog: [
      { key: 'task', label: 'Task', description: 'Tasks', sensitive: false, sort_order: 10 },
      { key: 'time', label: 'Time tracking', description: 'Tracked time', sensitive: false, sort_order: 20 },
      { key: 'loans', label: 'Loans', description: 'Loan requests', sensitive: true, sort_order: 90 },
      { key: 'payroll', label: 'Payroll & payslips', description: 'Salary', sensitive: true, sort_order: 100 },
    ],
    agent_module_access: [{ module_key: 'task', enabled: true }, { module_key: 'time', enabled: true }, { module_key: 'loans', enabled: false }, { module_key: 'payroll', enabled: false }],
    agent_summaries: [
      summary('d2', 'day', '2026-11-18', '2026-11-18'), summary('d1', 'day', '2026-11-17', '2026-11-17'),
      summary('w1', 'week', '2026-11-09', '2026-11-15'), summary('m1', 'month', '2026-10-01', '2026-10-30'),
    ],
    agent_settings: { id: true, operating_rules: '', escalation_window_days: 14 },
    agent_company_scope: [], companies: [],
  };
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('the card detail sheet', () => {
  it('opens on a card click and shows the person, the recurrence and the draft', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    expect(only('rpc:agent_flag_detail')).toHaveLength(0); // nothing is loaded until a card is opened
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    expect(await within(sheet).findByTestId('recurrence-banner')).toHaveTextContent('The 3rd time in the last 14 days');
    expect(within(sheet).getByTestId('recurrence-banner')).toHaveTextContent('Nov 12');
    expect(within(sheet).getByTestId('detail-person')).toHaveTextContent('Cara Obi');
    expect(within(sheet).getByTestId('detail-person')).toHaveTextContent('Dayo Boss');
    expect(within(sheet).getByTestId('today-strip')).toBeInTheDocument();
    expect((within(sheet).getByLabelText('Message') as HTMLTextAreaElement).value).toContain('Please start your timer.');
    expect((within(sheet).getByLabelText('Subject') as HTMLInputElement).value).toBe('Time not tracked today');
    expect(within(sheet).getByTestId('recipient-chip')).toHaveTextContent('to the person');
    expect(within(sheet).getByTestId('flag-handled')).toBeInTheDocument(); // the existing actions are reused
    expect(writes()).toEqual([]);
  });

  it('shows the profile photo on the card and falls back to initials when it cannot load', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    const first = within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!);
    const photo = await first.findByTestId('person-photo');
    expect(photo).toHaveAttribute('src', 'https://img.test/cara.png');
    fireEvent.error(photo);
    expect(first.queryByTestId('person-photo')).not.toBeInTheDocument();
    expect(first.getByText('CO')).toBeInTheDocument();
  });

  it('sends what was edited, after a confirmation, with no email address in the request', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    const body = (await within(sheet).findByLabelText('Message')) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'Hi Cara, are you in a meeting? Please start your timer when you are back.' } });
    fireEvent.change(within(sheet).getByLabelText('Subject'), { target: { value: 'Quick check' } });
    fireEvent.click(within(sheet).getByTestId('send-email'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Send this to Cara by email? The item will be marked handled.');
    expect(only('invoke:agent-connections:send_flag')).toHaveLength(0); // never sent without the confirmation
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(only('invoke:agent-connections:send_flag')).toHaveLength(1));
    const req = only('invoke:agent-connections:send_flag')[0].args[0] as Record<string, unknown>;
    // ticked by default: no `close` key at all (the server closes the item)
    expect(req).toEqual({ action: 'send_flag', flag_id: 'f1', channel: 'email', subject: 'Quick check', text: 'Hi Cara, are you in a meeting? Please start your timer when you are back.' });
    expect(JSON.stringify(req)).not.toMatch(/@|cara@kd\.test/);
    // success: the server marked it handled, so the person is told and the Sheet closes
    await waitFor(() => expect(h.toasts.some((t) => t.title === 'Sent to Cara. Marked handled.')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('flag-detail')).not.toBeInTheDocument());
    expect(screen.getByTestId('loc')).not.toHaveTextContent('flag=');
    expect(only('rpc:agent_flag_set_status')).toHaveLength(0); // the server does the closing, not the screen
  });

  it('does not send when the confirmation is cancelled, and Reset restores the suggestion', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    const body = (await within(sheet).findByLabelText('Message')) as HTMLTextAreaElement;
    const suggested = body.value;
    fireEvent.change(body, { target: { value: 'changed' } });
    expect(body.value).toBe('changed');
    fireEvent.click(within(sheet).getByRole('button', { name: /Reset to suggested/ }));
    expect(body.value).toBe(suggested);
    fireEvent.click(within(sheet).getByTestId('send-email'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(only('invoke:agent-connections:send_flag')).toHaveLength(0);
  });

  it('shows the refusal when the server does not send', async () => {
    h.send = { ok: false, error: 'No email address on file.' };
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findByLabelText('Message');
    fireEvent.click(within(sheet).getByTestId('send-email'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Send email' }));
    expect(await within(sheet).findByTestId('send-problem')).toHaveTextContent('No email address on file.');
    expect(within(sheet).queryByTestId('sent-note')).not.toBeInTheDocument();
  });

  it('degrades to the card text with a clear message when the detail cannot be loaded', async () => {
    h.detail = {};
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    expect(await within(sheet).findByTestId('detail-error')).toHaveTextContent('could not be loaded');
    expect(within(sheet).getByText('No time has been tracked since 9:00 AM.')).toBeInTheDocument();
  });

  it('treats a sensitive-module item as a count only: no person, no draft, no person lookup', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    const card = cards.find((c) => c.getAttribute('data-rule') === 'LN01')!;
    expect(within(card).getByTestId('count-only')).toHaveTextContent('Count only');
    expect(within(card).queryByTestId('person-photo')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findByTestId('detail-happening');
    expect(within(sheet).queryByTestId('detail-person')).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId('draft-editor')).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId('recurrence-banner')).not.toBeInTheDocument();
  });
});

describe('smart sites', () => {
  it('asks about an unlisted site, shows what Claude thinks, and writes only when a button is pressed', async () => {
    h.classify = { ok: true, results: [{ domain: 'figmaish.io', verdict: 'work', reason: 'It looks like a design tool.' }] };
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    const card = cards.find((c) => c.getAttribute('data-rule') === 'TR05')!;
    expect(within(card).getByTestId('add-to-list-chip')).toBeInTheDocument();
    expect(writes()).toEqual([]);
    expect(only('invoke:agent-ai:classify_sites')).toHaveLength(0);
    fireEvent.click(within(card).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    const sites = await within(sheet).findAllByTestId('site-card');
    expect(sites).toHaveLength(2);
    const figma = within(sheet).getAllByTestId('site-question')[0];
    expect(figma).toHaveTextContent('Is figmaish.io part of our work?');
    expect(figma).toHaveTextContent('Nothing we know connects it');
    expect(await within(sheet).findByTestId('claude-thinks')).toHaveTextContent('Claude thinks: Looks like work. It looks like a design tool.');
    // asked once, for the unknown site only
    expect(only('invoke:agent-ai:classify_sites')).toHaveLength(1);
    expect(only('invoke:agent-ai:classify_sites')[0].args[0]).toEqual({ action: 'classify_sites', domains: ['figmaish.io'] });
    expect(writes()).toEqual([]);
    fireEvent.click(within(figma).getByTestId('site-approve'));
    await waitFor(() => expect(only('rpc:agent_domain_set')).toHaveLength(1));
    expect(only('rpc:agent_domain_set')[0].args[0]).toEqual({ p_domain: 'figmaish.io', p_category: 'approved' });
  });

  it('marks a site unproductive on No, and Ignore for now changes nothing', async () => {
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR05')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findAllByTestId('site-card');
    fireEvent.click(within(within(sheet).getAllByTestId('site-question')[0]).getByTestId('site-ignore'));
    expect(writes()).toEqual([]);
    expect(within(sheet).getAllByTestId('site-question')).toHaveLength(1); // the youtube.com card still asks
    fireEvent.click(within(within(sheet).getAllByTestId('site-question')[0]).getByTestId('site-unproductive'));
    await waitFor(() => expect(only('rpc:agent_domain_set')).toHaveLength(1));
    expect(only('rpc:agent_domain_set')[0].args[0]).toEqual({ p_domain: 'youtube.com', p_category: 'unproductive' });
  });

  it('ignores a failed Claude answer silently and keeps the database hint', async () => {
    h.classify = { ok: false, error: 'budget' };
    renderUi(<InboxTab />);
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR05')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findAllByTestId('site-card');
    await waitFor(() => expect(only('invoke:agent-ai:classify_sites')).toHaveLength(1));
    expect(within(sheet).queryByTestId('claude-thinks')).not.toBeInTheDocument();
    expect(within(sheet).getAllByTestId('site-question')[0]).toHaveTextContent('Nothing we know connects it');
    expect(h.toasts).toEqual([]);
  });
});

describe('Summaries', () => {
  it('shows Daily only by default, and the Weekly and Monthly toggles reveal them (remembered)', async () => {
    renderUi(<SummariesTab />);
    await screen.findAllByTestId('summary-card');
    expect(screen.getAllByTestId('summary-card').map((c) => c.getAttribute('data-kind'))).toEqual(['day', 'day']);
    expect(screen.getByTestId('kind-day')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('kind-week')).toHaveAttribute('aria-pressed', 'false');
    // latest daily is open, the other is collapsed
    const [latest, older] = screen.getAllByTestId('summary-card');
    expect(within(latest).getByTestId('summary-tiles')).toBeInTheDocument();
    expect(within(latest).getByText('Narrative for d2')).toBeInTheDocument();
    expect(within(older).queryByTestId('summary-tiles')).not.toBeInTheDocument();
    expect(within(latest).getByText('Wednesday, Nov 18')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kind-week'));
    expect(screen.getAllByTestId('summary-card').map((c) => c.getAttribute('data-kind'))).toContain('week');
    fireEvent.click(screen.getByTestId('kind-month'));
    expect(screen.getAllByTestId('summary-card').map((c) => c.getAttribute('data-kind'))).toContain('month');
    expect(screen.getAllByTestId('summary-group').map((g) => g.getAttribute('aria-label'))).toEqual(['November 2026', 'October 2026']);
    expect(JSON.parse(window.localStorage.getItem('kd-agent-summary-kinds') ?? '{}')).toEqual({ day: true, week: true, month: true, scorecard: true });
    expect(writes()).toEqual([]);
  });

  it('expands an older summary to show the figures, missing reports and flagged sites', async () => {
    renderUi(<SummariesTab />);
    const older = (await screen.findAllByTestId('summary-card'))[1];
    fireEvent.click(within(older).getByRole('button', { expanded: false }));
    expect(within(older).getByTestId('tile-reports')).toHaveTextContent('15 of 20');
    expect(within(older).getByTestId('tile-tracking')).toHaveTextContent('18 of 20');
    expect(within(older).getByText('Missing reports')).toBeInTheDocument();
    expect(within(older).getByText('3 days')).toBeInTheDocument();
    expect(within(older).getByTestId('summary-site')).toHaveTextContent('youtube.com');
  });

  it('explains the schedule when there are none, and Generate now calls the database function', async () => {
    h.tables = { ...h.tables, agent_summaries: [] };
    renderUi(<SummariesTab />);
    expect(await screen.findByText(/Daily summary at 6:30 PM Eastern on working days; weekly on the last working day of the week; monthly on the last working day of the month; scorecard on the first working day of the week at 8:00 AM\./)).toBeInTheDocument();
    const trigger = screen.getByTestId('generate-now');
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId('generate-week'));
    await waitFor(() => expect(only('rpc:agent_generate_summary')).toHaveLength(1));
    expect(only('rpc:agent_generate_summary')[0].args[0]).toEqual({ p_kind: 'week' });
  });

  it('does not break when the browser blocks storage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    renderUi(<SummariesTab />);
    await screen.findAllByTestId('summary-card');
    expect(screen.getByTestId('kind-day')).toHaveAttribute('aria-pressed', 'true');
    spy.mockRestore();
  });
});

describe('Monitoring rules', () => {
  it('lists the rules grouped by module, and a switch updates agent_rules', async () => {
    renderUi(<OpsAgent />, '/agent/settings/rules');
    const row = await screen.findByTestId('rule-TK04');
    expect(row).toHaveTextContent('A task has been blocked for too long.');
    expect(writes()).toEqual([]);
    fireEvent.click(within(row).getByRole('switch', { name: /Task blocked/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].table).toBe('agent_rules');
    expect(writes()[0].op).toBe('update');
    expect(writes()[0].args[0]).toMatchObject({ enabled: true });
    expect(Object.keys(writes()[0].args[0] as object).sort()).toEqual(['enabled', 'updated_by']);
  });

  it('says when the module is off, links to Coverage, and still lets the rule be switched', async () => {
    renderUi(<OpsAgent />, '/agent/settings/rules');
    const note = await screen.findByTestId('module-off-loans');
    expect(note).toHaveTextContent('Module is off');
    expect(within(note).getByRole('link', { name: /switch it on in Coverage/ })).toHaveAttribute('href', '/agent/settings/coverage');
    expect(within(await screen.findByTestId('rule-LN01')).getByRole('switch')).toBeEnabled();
  });

  it('saves a changed number once, and refuses an invalid one', async () => {
    renderUi(<OpsAgent />, '/agent/settings/rules');
    const input = await screen.findByLabelText('TK04 Days');
    fireEvent.blur(input);
    expect(writes()).toEqual([]); // unchanged: no write
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.blur(input);
    expect(writes()).toEqual([]); // not a whole number
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].args[0]).toMatchObject({ params: { days: 5 } });
  });
});

describe('Coverage: sensitive modules', () => {
  it('can be switched on, but only after a confirmation', async () => {
    renderUi(<OpsAgent />, '/agent/settings/coverage');
    const row = await screen.findByTestId('module-payroll');
    const sw = within(row).getByRole('switch');
    expect(sw).toBeEnabled();
    expect(screen.getByTestId('sensitive-note')).toHaveTextContent('never shows names, amounts, bank details or documents');
    fireEvent.click(sw);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('only counts things');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(writes()).toEqual([]);
    fireEvent.click(sw);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].table).toBe('agent_module_access');
    expect(writes()[0].args[0]).toMatchObject({ module_key: 'payroll', enabled: true });
  });

  it('switches a normal module without asking', async () => {
    renderUi(<OpsAgent />, '/agent/settings/coverage');
    const row = await screen.findByTestId('module-task');
    fireEvent.click(within(row).getByRole('switch'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('v5: sending closes the item, links, deep links, escalations, dispatch banner', () => {
  const open = async (rule = 'TR01') => {
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === rule)!).getByTestId('flag-open'));
    return screen.findByTestId('flag-detail');
  };
  const sendEmail = async (sheet: HTMLElement) => {
    await within(sheet).findByLabelText('Message');
    fireEvent.click(within(sheet).getByTestId('send-email'));
    return screen.findByRole('alertdialog');
  };

  it('Mark as handled after sending is on by default and the editor says what the message contains', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    const box = await within(sheet).findByRole('checkbox', { name: 'Mark as handled after sending' });
    expect(box).toBeChecked();
    expect(within(sheet).getByTestId('draft-editor')).toHaveTextContent('The message names the exact item and includes a link to it.');
  });

  it('unticked: asks without the handled note, sends close: false, and keeps the Sheet open', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    fireEvent.click(await within(sheet).findByRole('checkbox', { name: 'Mark as handled after sending' }));
    const dialog = await sendEmail(sheet);
    expect(dialog).toHaveTextContent('Send this to Cara by email?');
    expect(dialog).not.toHaveTextContent('marked handled');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(only('invoke:agent-connections:send_flag')).toHaveLength(1));
    expect(only('invoke:agent-connections:send_flag')[0].args[0]).toMatchObject({ action: 'send_flag', flag_id: 'f1', channel: 'email', close: false });
    await waitFor(() => expect(h.toasts.some((t) => t.title === 'Sent. Kept open.')).toBe(true));
    expect(screen.getByTestId('flag-detail')).toBeInTheDocument();
    expect(within(screen.getByTestId('flag-detail')).getByTestId('sent-note')).toHaveTextContent('Sent. Kept open.');
  });

  it('says so when the message went out but the server could not close the item', async () => {
    h.send = { ok: true, closed: false };
    renderUi(<InboxTab />);
    const sheet = await open();
    fireEvent.click(within(await sendEmail(sheet)).getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(h.toasts.some((t) => /could not be marked handled/.test(t.title ?? ''))).toBe(true));
    expect(screen.getByTestId('flag-detail')).toBeInTheDocument();
  });

  it('shows a button for the item link, and none when the link is the Inbox itself', async () => {
    h.detail = { ...h.detail,
      f1: { ...(h.detail.f1 as object), link: { label: 'Open the task', path: '/task?task=abc', url: 'https://app.test/task?task=abc', person_path: '/task?task=abc', person_url: 'https://app.test/task?task=abc', inbox_url: 'https://app.test/agent/inbox?flag=f1' } },
      f2: { ...(h.detail.f2 as object), link: { label: 'Open in the Ops Agent Inbox', path: '/agent/inbox?flag=f2' } },
    };
    renderUi(<InboxTab />);
    const sheet = await open('TR01');
    const link = await within(sheet).findByTestId('open-in-kdops');
    expect(link).toHaveTextContent('Open the task');
    expect(link).toHaveAttribute('href', '/task?task=abc');
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('flag-detail')).not.toBeInTheDocument());
    const sheet2 = await open('TR05');
    await within(sheet2).findByTestId('detail-happening');
    expect(within(sheet2).queryByTestId('open-in-kdops')).not.toBeInTheDocument();
  });

  it('/agent/inbox?flag=<id> opens the Sheet, and closing removes the parameter', async () => {
    renderUi(<InboxTab />, '/agent/inbox?flag=f2');
    const sheet = await screen.findByTestId('flag-detail');
    expect(await within(sheet).findByTestId('site-review')).toBeInTheDocument();
    expect(only('rpc:agent_flag_detail')[0].args[0]).toEqual({ p_flag: 'f2' });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('flag-detail')).not.toBeInTheDocument());
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/inbox');
    expect(screen.getByTestId('loc')).not.toHaveTextContent('flag=');
  });

  it('opens an item that is not in the loaded list by fetching it through agent_flag_detail', async () => {
    h.detail = { ...h.detail, f9: detailFor({ ...trackingFlag, id: 'f9', title: 'An older handled item', status: 'handled' }) };
    renderUi(<InboxTab />, '/agent/inbox?flag=f9');
    const sheet = await screen.findByTestId('flag-detail');
    expect(await within(sheet).findByText('An older handled item')).toBeInTheDocument();
    expect(within(sheet).getByTestId('detail-status')).toHaveTextContent('Handled');
  });

  it('says plainly when a linked item cannot be found', async () => {
    renderUi(<InboxTab />, '/agent/inbox?flag=nope');
    const sheet = await screen.findByTestId('flag-detail');
    expect(await within(sheet).findByTestId('detail-error')).toBeInTheDocument();
    expect(within(sheet).getByText('This item could not be opened')).toBeInTheDocument();
  });

  describe('escalations and system items', () => {
    const es1 = { ...baseFlag, id: 'e1', rule_code: 'ES01', severity: 'high', subject_type: 'system', subject_id: 'f1', person_id: 'p1', title: 'Not attended to: Cara Obi has not tracked time today', why: 'It has been open for 2 days.', occurrence_count: 1, evidence: { flag_id: 'f1', rule: 'TR01', open_for: '2 days', original_severity: 'medium' } };
    const sy4 = { ...baseFlag, id: 's4', rule_code: 'SY04', severity: 'high', subject_type: 'system', subject_id: 'dispatch-setup', person_id: null, title: 'Automatic sending is not set up', why: 'The secret is missing.', occurrence_count: 1, evidence: null };
    beforeEach(() => {
      h.tables = { ...h.tables, agent_flags: [trackingFlag, es1, sy4] };
      h.detail = { ...h.detail, e1: detailFor(es1), s4: { ...detailFor(sy4), person: null, today: null, recurrence: null, draft: null } };
    });

    it('has Escalations and System filters with counts', async () => {
      renderUi(<InboxTab />);
      await screen.findAllByTestId('inbox-item');
      expect(screen.getByTestId('filter-escalations')).toHaveTextContent('Escalations1');
      expect(screen.getByTestId('filter-system')).toHaveTextContent('System1');
      fireEvent.click(screen.getByTestId('filter-escalations'));
      expect(screen.getAllByTestId('inbox-item').map((c) => c.getAttribute('data-rule'))).toEqual(['ES01']);
    });

    it('shows an escalation in the urgent group with no person and an Original item row', async () => {
      renderUi(<InboxTab />);
      const cards = await screen.findAllByTestId('inbox-item');
      const card = cards.find((c) => c.getAttribute('data-rule') === 'ES01')!;
      expect(within(screen.getByTestId('group-urgent')).getAllByTestId('inbox-item')).toContain(card);
      expect(within(card).queryByTestId('person-photo')).not.toBeInTheDocument();
      expect(within(card).queryByText('CO')).not.toBeInTheDocument();
      expect(within(card).getByTestId('original-item')).toHaveTextContent('open for 2 days');
    });

    it('Open original opens that item, and the Sheet for an escalation has no person block and no draft', async () => {
      renderUi(<InboxTab />);
      const cards = await screen.findAllByTestId('inbox-item');
      fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'ES01')!).getByTestId('flag-open'));
      const sheet = await screen.findByTestId('flag-detail');
      await within(sheet).findByTestId('detail-happening');
      expect(within(sheet).queryByTestId('detail-person')).not.toBeInTheDocument();
      expect(within(sheet).queryByTestId('draft-editor')).not.toBeInTheDocument();
      expect(within(sheet).queryByTestId('recurrence-banner')).not.toBeInTheDocument();
      fireEvent.click(within(sheet).getByTestId('open-original'));
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('flag=f1'));
      await waitFor(() => expect(only('rpc:agent_flag_detail').some((c) => (c.args[0] as { p_flag: string }).p_flag === 'f1')).toBe(true));
    });

    it('shows a system item without a person or a draft', async () => {
      renderUi(<InboxTab />, '/agent/inbox?flag=s4');
      const sheet = await screen.findByTestId('flag-detail');
      await within(sheet).findByTestId('detail-happening');
      expect(within(sheet).queryByTestId('detail-person')).not.toBeInTheDocument();
      expect(within(sheet).queryByTestId('draft-editor')).not.toBeInTheDocument();
    });
  });

  describe('the Connections warning', () => {
    const pulse = (ready?: boolean) => ({ as_of: '2026-11-19T12:00:00Z', tz: 'America/New_York', day: '2026-11-19', working_day: true, in_work_window: true, team_size: 5, tracking_now: 1, tracked_today: 2, reports_in: 1, reports_expected: 5, reports_due_at: '18:00', overdue_tasks: 0, open_flags: 0, high_flags: 0, last_run_at: null, last_run_ok: true, rules_active: 3, ...(ready === undefined ? {} : { dispatch_ready: ready }) });
    const conn = (events: string[]) => ({ id: 'c1', kind: 'slack', name: 'Ops channel', status: 'connected', config: { host: 'hooks.slack.com', events }, vault_secret_names: [], last_error: null, last_tested_at: null });
    const banner = 'Automatic sending cannot run yet: the database is missing the shared secret that wakes the sender. The Inbox will also show a System item with the exact steps.';

    it('warns when a connection sends automatically and the sender cannot run', async () => {
      h.pulse = pulse(false);
      h.tables = { ...h.tables, agent_connections: [conn(['flag_high'])], agent_api_keys: [] };
      renderUi(<OpsAgent />, '/agent/connections');
      expect(await screen.findByTestId('dispatch-warning')).toHaveTextContent(banner);
    });

    it('says nothing when the sender is ready, when nothing is automatic, or when the pulse call fails', async () => {
      for (const [p, events] of [[pulse(true), ['flag_high']], [pulse(false), []], [null, ['flag_high']], [pulse(), ['flag_high']]] as [Record<string, unknown> | null, string[]][]) {
        h.pulse = p;
        h.tables = { ...h.tables, agent_connections: [conn(events)], agent_api_keys: [] };
        const { unmount } = renderUi(<OpsAgent />, '/agent/connections');
        await screen.findByTestId('connection-row');
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByTestId('dispatch-warning')).not.toBeInTheDocument();
        unmount();
      }
    });
  });
});

describe('sending to a Cliq or Slack channel: CC the manager', () => {
  const CONNECTIONS = [
    { id: 'cq', kind: 'cliq', name: 'Ops Cliq', status: 'connected', config: { mode: 'api', cc_manager: true, mention_people: true }, vault_secret_names: ['a_secret', 'a_refresh'], last_error: null, last_tested_at: null },
    { id: 'sl', kind: 'slack', name: 'Ops Slack', status: 'connected', config: { mention_people: true }, vault_secret_names: ['a_url'], last_error: null, last_tested_at: null },
    { id: 'wh', kind: 'webhook', name: 'Billing hook', status: 'connected', config: {}, vault_secret_names: [], last_error: null, last_tested_at: null },
  ];
  const open = async () => {
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findByLabelText('Message');
    return sheet;
  };
  const pick = async (sheet: HTMLElement, name: RegExp) => {
    const trigger = within(sheet).getByTestId('channel-select');
    await waitFor(() => expect(trigger).toBeEnabled()); // the saved connections have loaded
    fireEvent.keyDown(trigger, { key: 'Enter' }); // opens the drop-down list from the keyboard
    fireEvent.click(await screen.findByRole('option', { name }));
  };
  const sendToChannel = async (sheet: HTMLElement) => {
    fireEvent.click(within(sheet).getByTestId('send-channel'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Send to channel' }));
    await waitFor(() => expect(only('invoke:agent-connections:send_flag')).toHaveLength(1));
    return only('invoke:agent-connections:send_flag')[0].args[0] as Record<string, unknown>;
  };

  beforeEach(() => {
    h.tables = { ...h.tables, agent_connections: CONNECTIONS };
    // jsdom has no pointer capture or scrolling, which the drop-down list asks for
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  });

  it('a Cliq API connection starts with the box ticked, says who is tagged, and sends cc_manager: true', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    expect(within(sheet).queryByTestId('cc-manager')).not.toBeInTheDocument(); // nothing picked yet
    await pick(sheet, /Ops Cliq/);
    const box = within(sheet).getByRole('checkbox', { name: 'CC Dayo Boss' });
    expect(box).toBeChecked();
    expect(within(sheet).getByTestId('cc-manager-note')).toHaveTextContent('Tags Cara and CCs their manager Dayo in the channel.');
    expect(within(sheet).getByTestId('cc-manager-note').textContent).not.toMatch(/\b(her|his|she|he)\b/i);
    const req = await sendToChannel(sheet);
    expect(req).toMatchObject({ action: 'send_flag', flag_id: 'f1', channel: 'connection', connection_id: 'cq', cc_manager: true });
  });

  it('unticking sends cc_manager: false and the note says the manager is not tagged', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    await pick(sheet, /Ops Cliq/);
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'CC Dayo Boss' }));
    expect(within(sheet).getByTestId('cc-manager-note')).toHaveTextContent('Tags Cara in the channel. Their manager is not tagged.');
    const req = await sendToChannel(sheet);
    expect(req.cc_manager).toBe(false);
  });

  it('a Slack connection CCs the manager unless it was turned off, and unticking sends false', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    await pick(sheet, /Ops Slack/);
    const box = within(sheet).getByRole('checkbox', { name: 'CC Dayo Boss' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    const req = await sendToChannel(sheet);
    expect(req).toMatchObject({ connection_id: 'sl', cc_manager: false });
  });

  it('is not offered for other connections, and an email carries no cc_manager when the draft names no manager', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    await pick(sheet, /Billing hook/);
    expect(within(sheet).queryByTestId('cc-manager')).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByTestId('send-email'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(only('invoke:agent-connections:send_flag')).toHaveLength(1));
    expect('cc_manager' in (only('invoke:agent-connections:send_flag')[0].args[0] as Record<string, unknown>)).toBe(false);
  });

  it('is hidden when the person has no manager, and no cc_manager is sent', async () => {
    h.detail = { ...h.detail, f1: detailFor(trackingFlag, { person: { ...person, manager: null } }) };
    renderUi(<InboxTab />);
    const sheet = await open();
    await pick(sheet, /Ops Cliq/);
    expect(within(sheet).queryByTestId('cc-manager')).not.toBeInTheDocument();
    const req = await sendToChannel(sheet);
    expect('cc_manager' in req).toBe(false);
  });

  it('is hidden when the message already goes to the manager', async () => {
    h.detail = { ...h.detail, f1: detailFor(trackingFlag, { draft: { to: 'manager', recipient_name: 'Dayo Boss', recipient_id: 'm1', subject: 'Cara has not tracked time', body: 'Hi Dayo,\n\nPlease check in.' } }) };
    renderUi(<InboxTab />);
    const sheet = await open();
    await pick(sheet, /Ops Cliq/);
    expect(within(sheet).queryByTestId('cc-manager')).not.toBeInTheDocument();
  });
});

describe('two drafts: the Email and the Channel message', () => {
  const MANAGER = { id: 'm1', name: 'Dayo Boss', email: 'dayo@kd.test' };
  const EMAIL = 'Hi Cara,\n\nCould you tell me what is happening?\n\nDayo Boss is copied.';
  const CHANNEL = 'Hi Cara, could you tell me what is happening?\n\n@Dayo Boss please follow up with Cara and get clarity on what is happening.';
  const draftOf = (over: Record<string, unknown> = {}) => ({ to: 'person', recipient_name: 'Cara Obi', recipient_email: 'cara@kd.test', recipient_id: 'p1', subject: 'Time not tracked today', body: EMAIL, channel_body: CHANNEL, manager: MANAGER, ...over });
  const CONNECTIONS = [{ id: 'cq', kind: 'cliq', name: 'Ops Cliq', status: 'connected', config: { mode: 'api', cc_manager: true, mention_people: true }, vault_secret_names: ['a_secret', 'a_refresh'], last_error: null, last_tested_at: null }];
  const body = (sheet: HTMLElement) => within(sheet).getByLabelText('Message') as HTMLTextAreaElement;
  const open = async () => {
    const cards = await screen.findAllByTestId('inbox-item');
    fireEvent.click(within(cards.find((c) => c.getAttribute('data-rule') === 'TR01')!).getByTestId('flag-open'));
    const sheet = await screen.findByTestId('flag-detail');
    await within(sheet).findByLabelText('Message');
    return sheet;
  };
  const sent = () => only('invoke:agent-connections:send_flag')[0].args[0] as Record<string, unknown>;
  const sendEmail = async (sheet: HTMLElement) => {
    fireEvent.click(within(sheet).getByTestId('send-email'));
    const dialog = await screen.findByRole('alertdialog');
    return dialog;
  };
  const confirmWith = async (dialog: HTMLElement, name: string) => {
    fireEvent.click(within(dialog).getByRole('button', { name }));
    await waitFor(() => expect(only('invoke:agent-connections:send_flag')).toHaveLength(1));
    return sent();
  };

  beforeEach(() => {
    h.tables = { ...h.tables, agent_connections: CONNECTIONS };
    h.detail = { ...h.detail, f1: detailFor(trackingFlag, { draft: draftOf() }) };
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  });

  it('starts on the Email tab with draft.body, accessible tabs, and the CC box ticked', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    expect(within(sheet).getByRole('tablist', { name: 'Which message to edit' })).toBeInTheDocument();
    expect(within(sheet).getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
    expect(within(sheet).getByRole('tab', { name: 'Channel message' })).toHaveAttribute('aria-selected', 'false');
    expect(body(sheet).value).toBe(EMAIL);
    expect(within(sheet).getByRole('checkbox', { name: 'CC Dayo Boss (their manager)' })).toBeChecked();
    expect(within(sheet).getByTestId('email-cc-note')).toHaveTextContent('Their manager is copied on the email.');
  });

  it('the CC box sends cc_manager: true on the email, and the confirmation mentions the CC', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    const dialog = await sendEmail(sheet);
    expect(dialog).toHaveTextContent('Send this to Cara by email, copying Dayo Boss? The item will be marked handled.');
    const req = await confirmWith(dialog, 'Send email');
    expect(req).toMatchObject({ action: 'send_flag', flag_id: 'f1', channel: 'email', cc_manager: true, text: EMAIL });
    expect('connection_id' in req).toBe(false);
    expect(JSON.stringify(req)).not.toMatch(/kd\.test/); // no address from the browser
  });

  it('unticking sends cc_manager: false, says Not copied, and drops the CC from the confirmation', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'CC Dayo Boss (their manager)' }));
    expect(within(sheet).getByTestId('email-cc-note')).toHaveTextContent('Not copied.');
    const dialog = await sendEmail(sheet);
    expect(dialog).toHaveTextContent('Send this to Cara by email? The item will be marked handled.');
    expect(await confirmWith(dialog, 'Send email')).toMatchObject({ channel: 'email', cc_manager: false });
  });

  it('the Channel tab shows channel_body, keeps its own edits, and Send to channel sends the channel text', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    fireEvent.change(body(sheet), { target: { value: 'edited email' } });
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Channel message' }));
    expect(body(sheet).value).toBe(CHANNEL);
    expect(within(sheet).getByTestId('channel-tag-note')).toHaveTextContent('Their manager is tagged at the bottom to follow up.');
    expect(within(sheet).queryByTestId('email-cc-manager')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Reset to suggested/ })).toBeDisabled(); // nothing edited on this tab
    fireEvent.change(body(sheet), { target: { value: 'edited channel' } });
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Email' }));
    expect(body(sheet).value).toBe('edited email');
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Channel message' }));
    expect(body(sheet).value).toBe('edited channel');
    // Reset acts on the active tab only
    fireEvent.click(within(sheet).getByRole('button', { name: /Reset to suggested/ }));
    expect(body(sheet).value).toBe(CHANNEL);
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Email' }));
    expect(body(sheet).value).toBe('edited email');
    // Send email from the Email tab sends the email text; sending to the channel from here sends the channel text
    const trigger = within(sheet).getByTestId('channel-select');
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ops Cliq/ }));
    expect(within(sheet).getByRole('tab', { name: 'Channel message' })).toHaveAttribute('aria-selected', 'true'); // picking a channel switches tab
    fireEvent.click(within(sheet).getByTestId('send-channel'));
    const req = await confirmWith(await screen.findByRole('alertdialog'), 'Send to channel');
    expect(req).toMatchObject({ channel: 'connection', connection_id: 'cq', text: CHANNEL, subject: 'Time not tracked today' });
  });

  it('arrow keys move between the tabs', async () => {
    renderUi(<InboxTab />);
    const sheet = await open();
    const email = within(sheet).getByRole('tab', { name: 'Email' });
    email.focus();
    fireEvent.keyDown(email, { key: 'ArrowRight' });
    expect(within(sheet).getByRole('tab', { name: 'Channel message' })).toHaveAttribute('aria-selected', 'true');
    expect(within(sheet).getByRole('tab', { name: 'Channel message' })).toHaveFocus();
  });

  it('falls back to body on the Channel tab when channel_body is missing', async () => {
    h.detail = { ...h.detail, f1: detailFor(trackingFlag, { draft: draftOf({ channel_body: undefined }) }) };
    renderUi(<InboxTab />);
    const sheet = await open();
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Channel message' }));
    expect(body(sheet).value).toBe(EMAIL);
  });

  it('hides the CC box and the tag note for a draft addressed to the manager, and sends no cc_manager', async () => {
    h.detail = { ...h.detail, f1: detailFor(trackingFlag, { draft: draftOf({ to: 'manager', recipient_name: 'Dayo Boss', recipient_id: 'm1', body: EMAIL, channel_body: EMAIL, manager: null }) }) };
    renderUi(<InboxTab />);
    const sheet = await open();
    expect(within(sheet).queryByTestId('email-cc-manager')).not.toBeInTheDocument();
    const req = await confirmWith(await sendEmail(sheet), 'Send email');
    expect('cc_manager' in req).toBe(false);
  });

  it('hides the CC box when there is no manager, or the manager has no email address', async () => {
    for (const manager of [null, { id: 'm1', name: 'Dayo Boss', email: null }]) {
      h.detail = { ...h.detail, f1: detailFor(trackingFlag, { draft: draftOf({ manager }) }) };
      const { unmount } = renderUi(<InboxTab />);
      const sheet = await open();
      expect(within(sheet).queryByTestId('email-cc-manager')).not.toBeInTheDocument();
      unmount();
    }
  });
});
