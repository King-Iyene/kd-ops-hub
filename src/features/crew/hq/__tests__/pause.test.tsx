import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrewAgent } from '../../crewDb';
import type { HqData } from '../useHq';

const agent = (id: string, slug: string, name: string, status: CrewAgent['status'] = 'idle'): CrewAgent => ({ id, slug, name, title: 'Head of ' + slug, role: slug, department: 'Marketing', company: 'All', reports_to: null, status, activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#6366f1', active: true });
const team = [agent('a1', 'cfo', 'Hale King', 'working'), agent('a2', 'marketing_head', 'Charlotte Reeves')];

vi.mock('../../components/PauseToggle', () => ({
  usePausedAgents: () => ({ data: [{ id: 'a1', paused: false }, { id: 'a2', paused: true }] }),
  PauseToggle: ({ agentId }: { agentId: string }) => <div data-testid="pause-toggle">{agentId}</div>,
}));
vi.mock('../hooks', () => ({ useLatestRuns: () => ({ byAgent: new Map() }), useWakeQueue: () => ({ data: undefined }), useAgentAccess: () => ({ data: [] }), useSelfReviews: () => ({ data: [] }), useWeeklyNotes: () => ({ data: [] }) }));
vi.mock('../../useCrew', () => {
  const q = (data: unknown) => ({ data, isLoading: false, error: null });
  const mut = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useCrewAgents: () => q(team), useCrewPrivate: () => q([]), useCrewKnowledge: () => q([]), useCrewMistakes: () => q([]), useCrewNotes: () => q([]), useCrewRuns: () => q([]),
    useIssueToken: mut, useRevokeTokens: mut, useRetireNote: mut, useDecideProposal: mut, useSay: mut, useMarkRead: mut, useResolveOrder: mut, useGiveOrder: mut,
  };
});
vi.mock('@/features/office/AvatarFace', () => ({ AvatarFace: ({ dim }: { dim?: boolean }) => <span data-testid="face" data-dim={String(!!dim)} /> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AgentDrawer } from '../AgentDrawer';
import { AgentsView } from '../AgentsView';
import { ShortcutHint } from '../TodayView';
import { hintStore } from '../store';

const data = {
  loading: false, error: null, agents: team, byId: new Map(team.map((a) => [a.id, a])), messages: [], items: [], snoozedCount: 0, proposalsWaiting: 0, questionsOpen: 0, ordersChallenged: 0, updates: [], closedQuestions: [], stateOf: () => ({ state: 'open' }),
} as unknown as HqData;

beforeEach(() => { localStorage.clear(); hintStore.reset(); });

describe('a paused agent looks paused', () => {
  it('the card dims the face, says Paused, and says a message waits until resumed', () => {
    render(<AgentsView data={data} onOpen={vi.fn()} />);
    const cards = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Charlotte Reeves') && li.querySelector('[data-testid="face"]'));
    const card = cards[cards.length - 1];
    expect(card.querySelector('[data-testid="face"]')?.getAttribute('data-dim')).toBe('true');
    expect(card.querySelector('[data-status="paused"]')).toBeTruthy();
    expect(card.textContent).toContain('Paused');
    expect(card.textContent).toContain('Paused: will read messages when resumed');
    // the agent that is not paused is untouched
    const hale = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Hale King') && li.querySelector('[data-testid="face"]')).pop()!;
    expect(hale.querySelector('[data-testid="face"]')?.getAttribute('data-dim')).toBe('false');
    expect(hale.textContent).not.toContain('Paused');
  });

  it('the profile drawer shows the Paused chip and the pause toggle; its Messages tab says it will read the message when resumed', () => {
    render(<AgentDrawer agentId="a2" data={data} onClose={vi.fn()} />);
    expect(screen.getByText(/Paused: never woken/)).toBeTruthy();
    expect(screen.getByTestId('pause-toggle').textContent).toBe('a2');
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByRole('status').textContent).toBe('Paused: will read it when resumed');
  });

  it('an agent that is not paused shows no such line', () => {
    render(<AgentDrawer agentId="a1" data={data} onClose={vi.fn()} initialTab="messages" />);
    expect(screen.queryByText(/will read it when resumed/)).toBeNull();
  });
});

describe('the first-run keyboard hint', () => {
  it('shows once, and stays dismissed in this browser', () => {
    const { unmount } = render(<ShortcutHint onShow={vi.fn()} />);
    expect(screen.getByText(/you can run this from the keyboard/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the tip' }));
    expect(screen.queryByText(/you can run this from the keyboard/)).toBeNull();
    expect(localStorage.getItem('crew-hq-hint-dismissed')).toBe('true');
    unmount();
    hintStore.reset();
    render(<ShortcutHint onShow={vi.fn()} />);
    expect(screen.queryByText(/you can run this from the keyboard/)).toBeNull();
  });

  it('"Show me the decisions" dismisses it and opens Decisions', () => {
    const onShow = vi.fn();
    render(<ShortcutHint onShow={onShow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show me the decisions' }));
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
