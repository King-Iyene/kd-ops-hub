import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CrewAgent, CrewMessage } from '../crewDb';

const agent = (id: string, slug: string, name: string, title: string): CrewAgent => ({ id, slug, name, title, role: 'cfo', department: 'Executive', company: 'All', reports_to: null, status: 'idle', activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#6366f1', active: true });
const team = [agent('a1', 'cfo', 'Hale King', 'CFO'), agent('a2', 'controller', 'Roland Ashby', 'Controller')];
const line = (id: string, over: Partial<CrewMessage>): CrewMessage => ({ id, thread_id: 't', from_agent: null, to_agent: 'a1', to_owner: false, kind: 'message', body: '', ref_proposal: null, ref_order: null, created_at: '2026-11-28T10:00:00Z', read_at: null, viewer_chat: true, from_profile: 'p1', to_profile: null, ...over });

const state = vi.hoisted(() => ({ owner: false, thread: { messages: [] as unknown[], waiting: false }, rows: [] as unknown[], say: vi.fn() }));
vi.mock('../useCrew', () => {
  const q = (data: unknown) => ({ data, isLoading: false, isError: false });
  return {
    useIsCrewOwner: () => q(state.owner), useCrewAgents: () => q(team), useVisitorThread: () => q(state.thread), useVisitorConversations: () => q(state.rows),
    usePeopleNames: () => q([{ id: 'p1', full_name: 'Ada Okoye' }]), useVisitorSay: () => ({ mutate: state.say, isPending: false }),
  };
});
vi.mock('@/features/office/AvatarFace', () => ({ AvatarFace: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { CrewVisitorPanel } from '../components/CrewVisitorPanel';

describe('CrewVisitorPanel', () => {
  it('for a visitor: the plain note, the team, and a chat that can only ask', () => {
    state.owner = false; state.thread = { messages: [{ id: 'l1', mine: true, body: 'How is cash?', at: '2026-11-28T10:00:00Z' }, { id: 'l2', mine: false, body: 'Ask the owner for details.', at: '2026-11-28T10:01:00Z' }], waiting: false };
    render(<CrewVisitorPanel open onOpenChange={() => {}} />);
    expect(screen.getByText('You can ask questions. Only the owner can give orders or approve anything.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Hale King/ }));
    expect(screen.getByRole('log', { name: /Conversation with Hale King/ }).textContent).toContain('Ask the owner for details.');
    fireEvent.change(screen.getByLabelText(/Your question for Hale King/), { target: { value: 'What is the runway?' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/ }));
    expect(state.say).toHaveBeenCalledWith({ agentId: 'a1', body: 'What is the runway?' }, expect.anything());
    expect(screen.queryByText(/approve this/i)).toBeNull();
  });

  it('for the owner: every conversation, labelled with who asked whom, read-only', () => {
    state.owner = true;
    state.rows = [line('r2', { from_agent: 'a1', to_agent: null, from_profile: null, to_profile: 'p1', body: 'Cash is fine.', created_at: '2026-11-28T10:01:00Z' }), line('r1', { body: 'How is cash?' })];
    render(<CrewVisitorPanel open onOpenChange={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Conversations with your team' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ada Okoye and Hale/ }));
    expect(screen.getByText('Ada Okoye asked Hale:', { exact: false })).toBeTruthy();
    expect(screen.getByText('Hale answered Ada Okoye:', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
