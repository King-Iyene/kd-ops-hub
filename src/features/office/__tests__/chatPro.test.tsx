import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { groupReactions, type ChatMsg } from '../chat';

vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } } }));

import { ChatDialog } from '../ChatDialog';

describe('reactions grouped for display', () => {
  it('counts each emoji once per person and marks mine', () => {
    const g = groupReactions([
      { message_id: 'm', user_id: 'a', emoji: '👍' }, { message_id: 'm', user_id: 'b', emoji: '👍' }, { message_id: 'm', user_id: 'a', emoji: '👍' },
      { message_id: 'm', user_id: 'me', emoji: '🎉' },
    ], 'me');
    expect(g).toEqual([{ emoji: '👍', count: 2, mine: false, users: ['a', 'b'] }, { emoji: '🎉', count: 1, mine: true, users: ['me'] }]);
    expect(groupReactions([], 'me')).toEqual([]);
  });
});

const msg = (id: string, sender: string, body: string): ChatMsg => ({ id, space_id: 's', sender_id: sender, to_id: null, body, img: null, kind: 'text', mentions: [], created_at: new Date().toISOString() });
const people = [{ id: 'kelvin', name: 'Kelvin Sampson', avatar: {} as never, online: true }, { id: 'nina', name: 'Nina Okari', avatar: {} as never, online: false }];

function setup(o: { isAdmin: boolean; onDelete?: (id: string) => Promise<boolean> }) {
  const onReact = vi.fn();
  const onDelete = o.onDelete ?? vi.fn(async () => true);
  render(
    <ChatDialog open onClose={() => undefined} meId="me" spaceName="KD Squares Office" people={people} conv="all" onConv={() => undefined}
      msgs={[msg('1', 'me', 'Hey, I am alive'), msg('2', 'kelvin', 'Not for long')]} unread={{}} isAdmin={o.isAdmin} loading={false} onRead={() => undefined}
      onSend={async () => true} onDelete={onDelete} onReact={onReact} reactions={{ '2': [{ message_id: '2', user_id: 'nina', emoji: '🔥' }, { message_id: '2', user_id: 'me', emoji: '🔥' }] }} />,
  );
  return { onReact, onDelete };
}

describe('the chat window', () => {
  it('asks before deleting, shows the message, and only deletes when confirmed', async () => {
    const { onDelete } = setup({ isAdmin: false });
    fireEvent.click(screen.getAllByLabelText('Delete message')[0]); // my own message
    expect(await screen.findByText('Delete this message?')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Keep it'));
    await waitFor(() => expect(screen.queryByText('Delete this message?')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByLabelText('Delete message')[0]);
    fireEvent.click(await screen.findByText('Delete for everyone'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('1'));
  });
  it('lets a member delete only their own messages, but an admin delete anybody\'s', () => {
    setup({ isAdmin: false });
    expect(screen.getAllByLabelText('Delete message')).toHaveLength(1); // only mine
    cleanup();
    setup({ isAdmin: true });
    expect(screen.getAllByLabelText('Delete message')).toHaveLength(2);
  });
  it('says whose message an admin is about to delete', async () => {
    setup({ isAdmin: true });
    fireEvent.click(screen.getAllByLabelText('Delete message')[1]);
    expect(await screen.findByText(/Kelvin Sampson's message/)).toBeTruthy();
  });
  it('reacts with one tap, and toggles a reaction chip', () => {
    const { onReact } = setup({ isAdmin: false });
    fireEvent.click(screen.getAllByLabelText('React 👍')[0]);
    expect(onReact).toHaveBeenCalledWith('1', '👍');
    fireEvent.click(screen.getByTitle(/reacted 🔥/));
    expect(onReact).toHaveBeenCalledWith('2', '🔥');
    expect(screen.getByTitle(/You, Nina Okari reacted|Nina Okari, You reacted/)).toBeTruthy();
  });
  it('has an emoji button beside the box and no GIF button', () => {
    setup({ isAdmin: false });
    expect(screen.getByLabelText('Emoji')).toBeTruthy();
    expect(screen.queryByLabelText('GIF')).toBeNull();
  });
});
