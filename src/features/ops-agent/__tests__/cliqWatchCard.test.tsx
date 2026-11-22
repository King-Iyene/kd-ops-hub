import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliqWatchCard } from '../tabs/CliqWatchCard';

const h = vi.hoisted(() => ({
  status: [] as unknown[], set: vi.fn(), check: vi.fn(), toast: vi.fn(),
}));
vi.mock('@/queries/useOpsAgent', () => ({
  useCliqWatchStatus: () => ({ data: h.status }),
  useSetCliqWatch: () => ({ mutate: h.set, isPending: false }),
  useCliqWatchCheck: () => ({ mutate: h.check, isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

const row = (o: Record<string, unknown> = {}) => ({ connection_id: 'c1', enabled: true, last_run_at: '2026-11-18T15:07:00Z', last_ok_at: '2026-11-18T15:07:00Z', last_error: null, waiting: 3, answered_7d: 9, stats: { channels: 12, scanned_messages: 340, new_tagged: 5 }, ...o });

describe('Cliq watch card', () => {
  beforeEach(() => { h.status = []; h.set.mockReset(); h.check.mockReset(); h.toast.mockReset(); });

  it('is off to begin with, and writes nothing when it is shown', () => {
    render(<CliqWatchCard connectionId="c1" authorized />);
    expect(screen.getByTestId('cliq-watch-switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('cliq-watch-status')).not.toBeInTheDocument();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.check).not.toHaveBeenCalled();
  });

  it('switches on from the switch only, for this connection', () => {
    render(<CliqWatchCard connectionId="c1" authorized />);
    fireEvent.click(screen.getByTestId('cliq-watch-switch'));
    expect(h.set).toHaveBeenCalledTimes(1);
    expect(h.set.mock.calls[0][0]).toEqual({ id: 'c1', enabled: true });
  });

  it('cannot be switched on before Zoho is connected, and says why', () => {
    render(<CliqWatchCard connectionId="c1" authorized={false} />);
    expect(screen.getByTestId('cliq-watch-switch')).toBeDisabled();
    expect(screen.getByTestId('cliq-watch-needs-zoho')).toHaveTextContent('Reconnect to Zoho');
  });

  it('shows the last read in Eastern time, what is waiting, and the last problem', () => {
    h.status = [row({ last_error: 'Zoho did not allow reading messages.' })];
    render(<CliqWatchCard connectionId="c1" authorized />);
    const status = screen.getByTestId('cliq-watch-status');
    expect(status).toHaveTextContent('10:07 AM');
    expect(status).toHaveTextContent('3 waiting for an answer, 9 answered in the last 7 days');
    expect(status).toHaveTextContent('12 channels, 340 messages read, 5 new tagged messages');
    expect(screen.getByTestId('cliq-watch-error')).toHaveTextContent('Zoho did not allow reading messages.');
  });

  it('Check now reads Cliq once', () => {
    h.status = [row()];
    render(<CliqWatchCard connectionId="c1" authorized />);
    fireEvent.click(screen.getByTestId('cliq-watch-check'));
    expect(h.check).toHaveBeenCalledTimes(1);
    expect(h.check.mock.calls[0][0]).toBe('c1');
  });
});
