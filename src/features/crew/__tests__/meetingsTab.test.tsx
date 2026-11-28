import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CrewAgent, CrewMeeting, CrewMessage } from '../crewDb';

const agent = (id: string, slug: string, name: string, title: string): CrewAgent => ({ id, slug, name, title, role: 'cfo', department: 'Executive', company: 'All', reports_to: null, status: 'idle', activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#6366f1', active: true });
const team = [agent('a1', 'cfo', 'Hale King', 'CFO'), agent('a2', 'controller', 'Roland Ashby', 'Controller'), agent('a3', 'ops_head', 'Ada Okoye', 'Head of Operations')];
const base = { brief: 'Salaries are due on the 28th', chair_agent: 'a1', called_by: null, round: 1, max_rounds: 2, round_started_at: '2026-11-28T10:00:00Z', summarising_at: null, created_at: '2026-11-28T10:00:00Z', closed_at: null, minutes: null };
const open: CrewMeeting = { ...base, id: 'm-open', topic: 'Cash runway', status: 'open' };
const closed: CrewMeeting = { ...base, id: 'm-closed', topic: 'Vendor review', status: 'closed', closed_at: '2026-11-28T10:20:00Z',
  minutes: { summary: 'Keep two vendors.', decisions: ['Drop the third vendor'], needs_owner: ['Approve the new contract?'], action_items: [{ agent: 'controller', task: 'Cancel the third subscription' }] } };
const line = (id: string, from: string | null, body: string): CrewMessage => ({ id, thread_id: 'm-open', from_agent: from, to_agent: null, to_owner: false, kind: 'message', body, ref_proposal: null, ref_order: null, created_at: '2026-11-28T10:01:00Z', read_at: null, meeting_id: 'm-open', meeting_round: 1 });

const mocks = vi.hoisted(() => ({ meetings: [] as unknown[], lines: [] as unknown[], members: [] as unknown[] }));
vi.mock('../useCrew', () => {
  const q = (data: unknown) => ({ data, isLoading: false, isError: false });
  const mut = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useCrewAgents: () => q(team), useCrewMeetings: () => q(mocks.meetings), useCrewMeetingLines: () => q(mocks.lines), useCrewMeetingMembers: () => q(mocks.members),
    useCallMeeting: mut, useMeetingSay: mut, useMeetingEnd: mut,
  };
});
vi.mock('@/features/office/AvatarFace', () => ({ AvatarFace: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { MeetingsTab } from '../components/MeetingsTab';

describe('MeetingsTab', () => {
  it('shows the call form with the CFO ticked as chair and the call button off until two are picked', () => {
    mocks.meetings = []; mocks.lines = []; mocks.members = [];
    render(<MeetingsTab />);
    expect(screen.getByRole('heading', { name: /call a meeting/i })).toBeTruthy();
    expect((screen.getByLabelText(/Hale King/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('button', { name: 'Call meeting' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/No meetings yet/)).toBeTruthy();
  });

  it('shows a live meeting: the transcript, who it is waiting for, and the speak and end controls', () => {
    mocks.meetings = [closed, open];
    mocks.lines = [line('l1', 'a2', 'We have two months of cash.'), line('l2', null, 'Be blunt about the tax bill.')];
    mocks.members = [{ meeting_id: 'm-open', agent_id: 'a1', spoke_round: 0 }, { meeting_id: 'm-open', agent_id: 'a2', spoke_round: 1 }];
    render(<MeetingsTab />);
    const list = screen.getByRole('list', { name: 'Meetings' });
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Cash runway');   // running first
    expect(screen.getByRole('log', { name: /transcript/i }).textContent).toContain('We have two months of cash.');
    expect(screen.getByText('Waiting for:').parentElement?.textContent).toContain('Hale');
    expect(screen.getByLabelText('Speak in the meeting')).toBeTruthy();
    expect(screen.getByRole('button', { name: /End meeting/ })).toBeTruthy();
  });

  it('shows the minutes of a closed meeting, with what needs the owner and the action items per agent', () => {
    mocks.meetings = [closed]; mocks.lines = []; mocks.members = [];
    render(<MeetingsTab />);
    const minutes = screen.getByRole('region', { name: 'Minutes' });
    expect(minutes.textContent).toContain('Keep two vendors.');
    expect(minutes.textContent).toContain('Drop the third vendor');
    expect(minutes.textContent).toContain('Needs your decision');
    expect(minutes.textContent).toContain('To-Do tab');
    expect(minutes.textContent).toContain('Roland Ashby');
    expect(minutes.textContent).toContain('Cancel the third subscription');
    expect(screen.queryByLabelText('Speak in the meeting')).toBeNull();
  });
});
