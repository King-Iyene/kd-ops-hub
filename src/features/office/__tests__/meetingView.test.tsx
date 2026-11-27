import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MeetingView, type MeetingProps } from '../calls/MeetingView';

// a browser test environment has no real camera streams: an empty stand-in is enough for what is checked here
HTMLMediaElement.prototype.play = () => Promise.resolve();
const tile = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, stream: {}, hasVideo: false, muted: false, ...extra }) as never;

function setup(over: Partial<MeetingProps> = {}) {
  const fns = { onMutePeer: vi.fn(), onMic: vi.fn(), onCam: vi.fn(), onShare: vi.fn(), onReconnect: vi.fn(), onLeave: vi.fn(), onClose: vi.fn(), onEmote: vi.fn() };
  const props: MeetingProps = {
    me: { name: 'King Iyene' }, selfCam: null, micOn: false, camOn: false, sharing: false, speaking: new Set(), roomName: 'Boardroom',
    tiles: [tile('a', 'Faith Okoli', { micOn: false, camOn: false, conn: 'connected', quality: 'good' }), tile('b', 'Denzel Iyene', { micOn: true, conn: 'connecting' })],
    emotes: new Map(), selfId: 'me', ...fns, ...over,
  };
  render(<MeetingView {...props} />);
  return fns;
}

describe('the meeting card', () => {
  it('shows everybody by name, with who is on the microphone and who is still connecting', () => {
    setup();
    expect(screen.getByText('Boardroom')).toBeTruthy();
    expect(screen.getByText('King Iyene')).toBeTruthy();
    expect(screen.getByText('Faith Okoli')).toBeTruthy();
    expect(screen.getByText('Denzel Iyene')).toBeTruthy();
    expect(screen.getAllByTitle('Microphone is off').length).toBeGreaterThanOrEqual(2); // mine and Faith's
    expect(screen.getByText('Connecting')).toBeTruthy();
  });
  it('has the controls on the card: microphone, camera, share, reconnect, leave and back to the map', () => {
    const f = setup();
    fireEvent.click(screen.getByLabelText('Microphone is off: click to turn on'));
    fireEvent.click(screen.getByLabelText('Camera is off: click to turn on'));
    fireEvent.click(screen.getByLabelText('Share your screen, a window or a tab'));
    fireEvent.click(screen.getByLabelText(/^Reconnect/));
    fireEvent.click(screen.getByLabelText('Leave the call'));
    fireEvent.click(screen.getByLabelText('Back to the map'));
    expect(f.onMic).toHaveBeenCalledTimes(1);
    expect(f.onCam).toHaveBeenCalledTimes(1);
    expect(f.onShare).toHaveBeenCalledTimes(1);
    expect(f.onReconnect).toHaveBeenCalledTimes(1);
    expect(f.onLeave).toHaveBeenCalledTimes(1);
    expect(f.onClose).toHaveBeenCalledTimes(1);
  });
  it('shows the camera button red when the camera is off, like the microphone', () => {
    setup();
    expect(screen.getByLabelText('Camera is off: click to turn on').className).toContain('bg-red-500');
    expect(screen.getByLabelText('Microphone is off: click to turn on').className).toContain('bg-red-500');
  });
  it('sends an emoji reaction from the card, and mutes somebody for me only', () => {
    const f = setup();
    fireEvent.click(screen.getAllByLabelText(/^React /)[0]);
    expect(f.onEmote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Mute Faith Okoli'));
    expect(f.onMutePeer).toHaveBeenCalledWith('a');
  });
  it('shows an emoji somebody sent, floating on their picture', () => {
    setup({ emotes: new Map([['a', { e: '🤯', until: Date.now() + 60_000 }]]) });
    expect(screen.getByText('🤯')).toBeTruthy();
  });
  it('says who is sharing when a screen is shared', () => {
    setup({ tiles: [tile('a', 'Faith Okoli'), tile('a:screen', "Faith's screen", { screen: true, presenter: 'Faith Okoli', share: { sid: 's', pid: 'p', label: '', surface: 'monitor', audio: false } })] });
    expect(screen.getByText('Faith Okoli is sharing')).toBeTruthy();
    expect(screen.getByText(/Entire screen/)).toBeTruthy();
  });
});
