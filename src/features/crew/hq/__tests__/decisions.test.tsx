import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrewAgent, CrewMessage, CrewProposal } from '../../crewDb';

const NOW = Date.now();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const agent = (id: string, slug: string, name: string): CrewAgent => ({ id, slug, name, title: 'Head of ' + slug, role: slug, department: 'Finance', company: 'All', reports_to: null, status: 'idle', activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#6366f1', active: true });
const team = [agent('a1', 'cfo', 'Hale King'), agent('a2', 'ops_head', 'Henry Ashford')];
const proposal = (id: string, risk: CrewProposal['risk'], minutesAgo: number, action = 'advice.finance'): CrewProposal => ({
  id, agent_id: 'a1', action, base_id: null, table_id: null, summary: `Summary ${id}`, rationale: 'Because it matters.', evidence: {}, payload: {}, risk, status: 'pending', requires_approver: 'owner', endorsements: [],
  decision_note: null, result: {}, error: null, remind_count: 0, created_at: at(minutesAgo), decided_at: null, executed_at: null,
});
const msg = (o: Partial<CrewMessage> & { id: string }): CrewMessage => ({ thread_id: 't', from_agent: null, to_agent: null, to_owner: false, kind: 'message', body: '', ref_proposal: null, ref_order: null, created_at: at(10), read_at: null, ...o });

const state = vi.hoisted(() => ({ proposals: [] as unknown[], messages: [] as unknown[], decide: vi.fn(), say: vi.fn() }));
vi.mock('../../useCrew', () => {
  const q = (data: unknown) => ({ data, isLoading: false, error: null });
  return {
    useCrewAgents: () => q(team), useCrewInbox: () => q(state.messages), useCrewProposals: () => q(state.proposals), useCrewOrders: () => q([]),
    useDecideProposal: () => ({ mutate: state.decide, isPending: false }), useSay: () => ({ mutate: state.say, isPending: false }), useMarkRead: () => ({ mutate: vi.fn(), isPending: false }),
    useResolveOrder: () => ({ mutate: vi.fn(), isPending: false }), useGiveOrder: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock('../hooks', () => ({ useWakeQueue: () => ({ data: undefined }) }));
vi.mock('@/features/office/AvatarFace', () => ({ AvatarFace: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../components/ApprovalsTab', () => ({ ApprovalsTab: () => null }));

import { DecisionsView } from '../DecisionsView';
import { dismissedStore, snoozeStore } from '../store';

beforeEach(() => {
  state.proposals = []; state.messages = []; state.decide.mockReset(); state.say.mockReset();
  localStorage.clear(); dismissedStore.reset(); snoozeStore.reset();
});

const press = (key: string) => act(() => { fireEvent.keyDown(document.body, { key }); });

describe('the decision stack on screen', () => {
  it('shows one decision at a time, most urgent first, with "3 of N" progress, and J / K move through it', () => {
    state.proposals = [proposal('low', 'low', 5), proposal('high', 'high', 9), proposal('mid', 'medium', 7)];
    render(<DecisionsView />);
    expect(screen.getByText('Decision 1 of 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Summary high' })).toBeTruthy();
    press('j');
    expect(screen.getByText('Decision 2 of 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Summary mid' })).toBeTruthy();
    press('j'); press('j');   // wraps round to the first
    expect(screen.getByText('Decision 1 of 3')).toBeTruthy();
    press('k');   // and back to the last
    expect(screen.getByText('Decision 3 of 3')).toBeTruthy();
    expect((screen.getByRole('progressbar') as HTMLElement).getAttribute('aria-valuenow')).toBe('3');
  });

  it('A approves a low-risk decision at once; a high-risk one asks for a second press', () => {
    state.proposals = [proposal('safe', 'low', 5), proposal('risky', 'high', 9)];
    render(<DecisionsView />);
    // the stack starts on the high-risk one
    press('a');
    expect(state.decide).not.toHaveBeenCalled();
    expect(screen.getByText(/Press again to confirm/)).toBeTruthy();
    press('a');
    expect(state.decide).toHaveBeenCalledTimes(1);
    expect(state.decide.mock.calls[0][0]).toEqual({ id: 'risky', decision: 'approve' });
    press('j');
    press('a');
    expect(state.decide).toHaveBeenCalledTimes(2);
    expect(state.decide.mock.calls[1][0]).toEqual({ id: 'safe', decision: 'approve' });
  });

  it('? opens the shortcut help and R opens the reject box', () => {
    state.proposals = [proposal('p', 'low', 5)];
    render(<DecisionsView />);
    press('r');
    expect(screen.getByLabelText('Why not')).toBeTruthy();
    press('?');
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('list mode lists every decision, and picking one opens it in the stack', () => {
    state.proposals = [proposal('one', 'high', 9), proposal('two', 'low', 5)];
    render(<DecisionsView />);
    fireEvent.click(screen.getByRole('button', { name: /List/ }));
    expect(screen.getByRole('list', { name: 'Decisions waiting' }).querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(screen.getByText('Summary two'));
    expect(screen.getByText('Decision 2 of 2')).toBeTruthy();
  });

  it('is calm when nothing waits', () => {
    render(<DecisionsView />);
    expect(screen.getByText('Nothing waiting for you')).toBeTruthy();
  });
});

describe('questions are honest about being answered', () => {
  const asked = (read_at: string | null) => msg({ id: 'q1', from_agent: 'a1', to_owner: true, kind: 'question', body: 'How many staff do you have?', created_at: at(60), read_at });

  it('a question the old inbox auto-marked read still says it is waiting for the owner, never "Handled"', () => {
    state.messages = [asked(at(59))];
    render(<DecisionsView />);
    expect(screen.getAllByText('Waiting for your answer').length).toBeGreaterThan(0);
    expect(screen.queryByText('Handled')).toBeNull();
  });

  it('leaves the stack once the owner has written to that agent after it, and says when he answered', () => {
    state.messages = [asked(null), msg({ id: 'r1', from_agent: null, to_agent: 'a1', body: 'Eleven.', created_at: at(30) })];
    render(<DecisionsView />);
    expect(screen.getByText('Nothing waiting for you')).toBeTruthy();
    fireEvent.click(screen.getByText(/Questions you have dealt with/));
    expect(screen.getByText(/You answered/)).toBeTruthy();
  });

  it('a quick-answer chip sends the answer to the asking agent', () => {
    state.messages = [asked(null)];
    render(<DecisionsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Tell me more' }));
    expect(state.say.mock.calls[0][0]).toEqual({ agentId: 'a1', body: 'Tell me more' });
  });

  it('"Not needed" dismisses it in this browser: it leaves the stack and shows as Dismissed', () => {
    state.messages = [asked(null)];
    render(<DecisionsView />);
    fireEvent.click(screen.getByRole('button', { name: /Not needed/ }));
    expect(JSON.parse(localStorage.getItem('crew-dismissed-questions') ?? '[]')).toEqual(['q1']);
    expect(screen.getByText('Nothing waiting for you')).toBeTruthy();
    fireEvent.click(screen.getByText(/Questions you have dealt with/));
    expect(screen.getByText('Dismissed')).toBeTruthy();
  });
});
