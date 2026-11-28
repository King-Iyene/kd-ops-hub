import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliqConnection, CliqPostLogRow, CrewAgent, StandingPermission } from '../crewDb';
import { standingSentence } from '../helpers';

const henry: CrewAgent = { id: 'a-ops', slug: 'ops_head', name: 'Henry Ashford', title: 'Head of Operations', role: 'ops_head', department: 'Operations', company: 'All', reports_to: null, status: 'idle', activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#c2410c', active: true };
const channel: CliqConnection = { id: 'c-ops', name: 'Zoho Cliq Operations', kind: 'cliq', status: 'connected', config: { mode: 'api', channel: 'kdsoperations' } };
const webhook: CliqConnection = { id: 'c-hook', name: 'A webhook', kind: 'cliq', status: 'connected', config: { mode: 'webhook' } };
const perm = (over: Partial<StandingPermission> = {}): StandingPermission => ({ id: 'p1', agent_id: 'a-ops', kind: 'cliq_post', connection_id: 'c-ops', enabled: false, max_posts_per_day: 6, allowed_kinds: ['tracking_followup', 'announcement'], created_at: '2026-11-28T10:00:00Z', updated_at: '2026-11-28T10:00:00Z', ...over });
const post = (over: Partial<CliqPostLogRow>): CliqPostLogRow => ({ id: 'l1', agent_id: 'a-ops', kind: 'tracking_followup', body: '@Sam Doe please start your timer', tagged: [{ person_id: 'x', name: 'Sam Doe', tagged: true }], status: 'sent', error: null, created_at: new Date().toISOString(), sent_at: new Date().toISOString(), ...over });

const mocks = vi.hoisted(() => ({
  perms: [] as unknown[], log: [] as unknown[], conns: [] as unknown[], save: vi.fn(), kill: vi.fn(), loading: false,
}));
vi.mock('../useCrew', () => {
  const q = (data: unknown) => ({ data, isLoading: mocks.loading, isError: false });
  return {
    useStandingPermissions: () => q(mocks.perms), useCrewAgents: () => q([henry]), useCliqConnections: () => q(mocks.conns), useCliqPostLog: () => q(mocks.log),
    useSetStandingPermission: () => ({ mutate: mocks.save, isPending: false }), useStandingKillAll: () => ({ mutate: mocks.kill, isPending: false }),
  };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { StandingPermissions } from '../components/StandingPermissions';

beforeEach(() => { mocks.perms = [perm()]; mocks.log = []; mocks.conns = [channel, webhook]; mocks.save = vi.fn(); mocks.kill = vi.fn(); mocks.loading = false; });

describe('the standing-permission sentence', () => {
  it('says who may post what, where, how many a day, and that it is logged', () => {
    expect(standingSentence({ first: 'Henry', channel: 'kdsoperations', max: 6, kinds: ['tracking_followup', 'announcement'] }))
      .toBe('Henry may post tracking follow-ups and announcements in #kdsoperations, up to 6 a day. Everything Henry posts is logged below.');
    expect(standingSentence({ first: 'Henry', channel: null, max: 3, kinds: ['announcement'] })).toBe('Henry may post announcements in the channel you choose, up to 3 a day. Everything Henry posts is logged below.');
    expect(standingSentence({ first: 'Henry', channel: 'x', max: 1, kinds: [] })).toContain('may post nothing');
  });
});

describe('StandingPermissions card', () => {
  it('ships prepared but off: the sentence, the channel and the cap are shown, the permission is not allowed, and nothing can be saved yet', () => {
    render(<StandingPermissions />);
    expect(screen.getByTestId('standing-sentence').textContent).toBe('Henry may post tracking follow-ups and announcements in #kdsoperations, up to 6 a day. Everything Henry posts is logged below.');
    expect((screen.getByLabelText('Allow Henry to post in Cliq') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Off: Henry cannot post anything/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Switch everything off now/ }) as HTMLButtonElement).disabled).toBe(true);   // nothing is on
  });

  it('lists only channels that sign in with Zoho and have a channel', () => {
    render(<StandingPermissions />);
    const select = screen.getByLabelText(/^Channel/) as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toContain('Zoho Cliq Operations (#kdsoperations)');
    expect(options.join(' ')).not.toContain('A webhook');
  });

  it('switching on saves the owner\'s choice: the channel, the daily cap and the kinds', () => {
    render(<StandingPermissions />);
    fireEvent.click(screen.getByLabelText('Allow Henry to post in Cliq'));
    fireEvent.change(screen.getByLabelText(/Most posts a day/), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Announcements'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).toEqual({ agent: 'a-ops', connection: 'c-ops', enabled: true, max: 4, kinds: ['tracking_followup'] });
  });

  it('refuses a bad cap, no kind, or "on" with no channel, and says why', () => {
    mocks.perms = [perm({ connection_id: null })];
    render(<StandingPermissions />);
    fireEvent.click(screen.getByLabelText('Allow Henry to post in Cliq'));
    expect(screen.getByText('Choose the channel first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Most posts a day/), { target: { value: '25' } });
    expect(screen.getByText(/whole number from 1 to 20/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Most posts a day/), { target: { value: '0' } });
    expect(screen.getByText(/whole number from 1 to 20/)).toBeTruthy();
  });

  it('warns when the chosen connection is not connected', () => {
    mocks.conns = [{ ...channel, status: 'disconnected' }];
    render(<StandingPermissions />);
    expect(screen.getByRole('alert').textContent).toContain('shows as disconnected');
    expect(screen.getByRole('alert').textContent).toContain('Reconnect to Zoho');
  });

  it('has a kill switch that works when something is on', () => {
    mocks.perms = [perm({ enabled: true })];
    render(<StandingPermissions />);
    expect(screen.getByText(/On: they may post as set below/)).toBeTruthy();
    const kill = screen.getByRole('button', { name: /Switch everything off now/ }) as HTMLButtonElement;
    expect(kill.disabled).toBe(false);
    fireEvent.click(kill);
    expect(mocks.kill).toHaveBeenCalledTimes(1);
  });

  it('shows the log: what was posted, who was named (and who had no Cliq id), what was refused and why', () => {
    mocks.log = [
      post({ id: 'l1' }),
      post({ id: 'l2', status: 'refused', error: 'no money amounts in a post', body: 'Salaries go out', tagged: [], kind: 'announcement' }),
      post({ id: 'l3', tagged: [{ person_id: 'y', name: 'Ann Lee', tagged: false }], status: 'failed', error: 'Zoho said no' }),
    ];
    render(<StandingPermissions />);
    const list = screen.getByRole('list', { name: /Posts agents made/ });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Henry');
    expect(items[0].textContent).toContain('Posted');
    expect(items[0].textContent).toContain('Named: Sam Doe');
    expect(items[1].textContent).toContain('Refused by the rules');
    expect(items[1].textContent).toContain('no money amounts in a post');
    expect(items[2].textContent).toContain('Ann Lee (no Cliq id: plain name)');
    expect(items[2].textContent).toContain('Zoho said no');
  });

  it('stays quiet for anyone who cannot see the permissions', () => {
    mocks.loading = true;
    const { container } = render(<StandingPermissions />);
    expect(container.textContent).toBe('');
  });

  it('says so when nothing is set up and nothing was posted', () => {
    mocks.perms = [];
    render(<StandingPermissions />);
    expect(screen.getByText(/No standing permissions are set up yet/)).toBeTruthy();
    expect(screen.getByText('Nothing yet.')).toBeTruthy();
  });
});
