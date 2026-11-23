import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { deleteTitle, useDeleteConfirm } from '../DeleteConfirm';

function Harness({ onConfirm, permanent }: { onConfirm: () => void; permanent?: boolean }) {
  const { ask, dialog } = useDeleteConfirm();
  return (
    <>
      <button onClick={() => ask({ what: 'checklist', name: 'Launch', consequence: 'The checklist and its 4 items are deleted from this task.', permanent, onConfirm })}>trash</button>
      {dialog}
    </>
  );
}

describe('delete confirmation', () => {
  it('names the thing in the title', () => {
    expect(deleteTitle({ what: 'checklist', name: 'Launch' })).toBe('Delete checklist "Launch"?');
    expect(deleteTitle({ what: 'comment' })).toBe('Delete comment?');
  });

  it('deletes nothing until it is confirmed, and says what goes with it', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('trash'));
    const box = screen.getByTestId('delete-confirm');
    expect(box).toHaveTextContent('Delete checklist "Launch"?');
    expect(box).toHaveTextContent('The checklist and its 4 items are deleted from this task. This cannot be undone.');
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete checklist'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
  });

  it('keeping it does nothing', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('trash'));
    fireEvent.click(screen.getByText('Keep it'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
  });

  it('only says it cannot be undone when that is true', () => {
    render(<Harness onConfirm={() => undefined} permanent={false} />);
    fireEvent.click(screen.getByText('trash'));
    expect(screen.getByTestId('delete-confirm')).not.toHaveTextContent('cannot be undone');
  });

  it('works inside an open task window without closing it', () => {
    const onConfirm = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Task</DialogTitle>
          <Harness onConfirm={onConfirm} />
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText('trash'));
    const del = screen.getByText('Delete checklist');
    fireEvent.pointerDown(del);
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Task')).toBeInTheDocument(); // the task window is still open
  });
});
