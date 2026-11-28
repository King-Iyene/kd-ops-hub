import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CrewAgent, CrewMessage } from '../../crewDb';
import type { HqActions } from '../actions';
import { CommandBar } from '../CommandBar';

const agent = (id: string, slug: string, name: string): CrewAgent => ({ id, slug, name, title: 'Head', role: slug, department: 'Finance', company: 'All', reports_to: null, status: 'idle', activity: '', last_seen_at: null, office_x: null, office_y: null, color: '#000', active: true });
const team = [agent('a1', 'cfo', 'Hale King'), agent('a2', 'ops_head', 'Henry Ashford')];

function setup() {
  const send = vi.fn();
  const onNavigate = vi.fn();
  const onOpenAgent = vi.fn();
  render(<CommandBar agents={team} decisions={[]} messages={[] as CrewMessage[]} actions={{ send } as unknown as HqActions} onNavigate={onNavigate} onOpenAgent={onOpenAgent} />);
  const box = screen.getByRole('combobox') as HTMLInputElement;
  return { send, onNavigate, onOpenAgent, box };
}
const type = (box: HTMLInputElement, v: string) => { fireEvent.focus(box); fireEvent.change(box, { target: { value: v } }); };

describe('command bar', () => {
  it('Ctrl+K and "/" focus it', () => {
    const { box } = setup();
    expect(document.activeElement).not.toBe(box);
    act(() => { fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true }); });
    expect(document.activeElement).toBe(box);
    box.blur();
    act(() => { fireEvent.keyDown(document.body, { key: '/' }); });
    expect(document.activeElement).toBe(box);
  });

  it('"tell hale …" previews the message and Enter sends it to that agent', () => {
    const { box, send } = setup();
    type(box, "tell hale check this week's income");
    expect(screen.getByRole('option').textContent).toContain("Tell Hale: check this week's income");
    expect(send).not.toHaveBeenCalled();   // nothing is sent until Enter
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0].slice(0, 2)).toEqual(['a1', "check this week's income"]);
  });

  it('says so when it does not know who to tell, and sends nothing', () => {
    const { box, send } = setup();
    type(box, 'tell zed do it');
    expect(screen.getByRole('status').textContent).toContain('zed');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('"meet <topic>" opens the meeting form with the topic filled in', () => {
    const { box, onNavigate } = setup();
    type(box, 'meet cash runway');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('meetings', { sub: 'meetings', topic: 'cash runway' });
  });

  it('finds an agent by name and opens the profile', () => {
    const { box, onOpenAgent } = setup();
    type(box, 'henry');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onOpenAgent.mock.calls[0][0].id).toBe('a2');
  });
});
