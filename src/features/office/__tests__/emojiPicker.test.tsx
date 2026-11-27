import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmojiPicker } from '../EmojiPicker';

function setup() {
  const onClose = vi.fn();
  const onPick = vi.fn();
  render(
    <div>
      <button type="button" data-emoji-toggle>open emoji</button>
      <button type="button">somewhere else</button>
      <EmojiPicker quick={['👍', '👏', '❤️', '🎉']} freq={{}} onPick={onPick} onQuick={() => undefined} onClose={onClose} />
    </div>,
  );
  return { onClose, onPick };
}

describe('the emoji picker closes when you are done', () => {
  it('closes on a click anywhere outside it', () => {
    const { onClose } = setup();
    fireEvent.pointerDown(screen.getByText('somewhere else'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('stays open for a click inside it, and leaves the button that opens it to close it itself', () => {
    const { onClose } = setup();
    fireEvent.pointerDown(screen.getByLabelText('Search emoji'));
    fireEvent.pointerDown(screen.getByText('open emoji'));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('closes after an emoji is picked', () => {
    const { onClose, onPick } = setup();
    fireEvent.click(screen.getAllByText('👍')[0]);
    expect(onPick).toHaveBeenCalledWith('👍');
    expect(onClose).toHaveBeenCalled();
  });
});
