import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const deleteRecording = vi.fn(() => Promise.resolve());
const row = { id: 'r1', session_id: 's1', part: 2, room_name: 'Meeting Room 2', recorder_name: 'Kelvin', started_at: '2026-11-24T14:00:00Z', duration_s: 900, size_bytes: 5_000_000, path: 'u/s1/part-002-v.webm', participants: ['Ada'], recorded_by: 'me' };

vi.mock('../data', () => ({
  useRecordings: () => ({ data: [row], isLoading: false }),
  useOfficeMutations: () => ({ deleteRecording }),
  signedRecordingUrl: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { RecordingsDialog } from '../calls/RecordingsDialog';

describe('deleting a recording', () => {
  it('asks first, names the recording, and only deletes after the red button', () => {
    render(<RecordingsDialog open onOpenChange={() => undefined} meId="me" isAdmin />);
    fireEvent.click(screen.getByLabelText('Delete this part'));
    const box = screen.getByTestId('delete-confirm');
    expect(box).toHaveTextContent('Meeting Room 2');
    expect(box).toHaveTextContent('part 2');
    expect(box).toHaveTextContent('This cannot be undone.');
    expect(deleteRecording).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete recording part'));
    expect(deleteRecording).toHaveBeenCalledTimes(1);
  });
  it('keeping it deletes nothing', () => {
    deleteRecording.mockClear();
    render(<RecordingsDialog open onOpenChange={() => undefined} meId="me" isAdmin />);
    fireEvent.click(screen.getByLabelText('Delete this part'));
    fireEvent.click(screen.getByText('Keep it'));
    expect(deleteRecording).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
  });
});
