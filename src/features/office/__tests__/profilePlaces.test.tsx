import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultAvatar } from '../world/render';
import { ProfileDialog } from '../ProfileDialog';
import { PersonCard } from '../PersonCard';
import { PlaceRow, SpaceRow } from '../SidebarParts';
import { presenceInfo } from '../presenceState';

afterEach(cleanup);
const av = defaultAvatar('kelvin');

describe('profile card', () => {
  const acts = (run = vi.fn()) => [
    { key: 'wave', label: 'Wave', icon: <i />, primary: true, run },
    { key: 'msg', label: 'Message', icon: <i />, run: vi.fn() },
    { key: 'go', label: 'Go to', icon: <i />, run: vi.fn(), off: 'Not here' },
  ];

  it('shows the name, role, status and where they are; the main action is the wide one', () => {
    const run = vi.fn();
    render(<ProfileDialog x={400} y={200} onClose={() => undefined} name="Kelvin Sampson" avatar={av} online presence={presenceInfo(true, null, 'Busy')} status="Busy" where="In KD Squares Office" role="Finance" actions={acts(run)} />);
    expect(screen.getByText('Kelvin Sampson')).toBeTruthy();
    expect(screen.getByText('Finance')).toBeTruthy();
    expect(screen.getByText('Busy')).toBeTruthy();
    expect(screen.getByText('In KD Squares Office')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Wave/ }));
    expect(run).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: /Go to/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says plainly when somebody is away and does not claim a place', () => {
    render(<ProfileDialog x={10} y={10} onClose={() => undefined} name="Nina Okari" avatar={av} online={false} presence={presenceInfo(false, null)} status={null} where="In somewhere" actions={[]} />);
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.getByText(/Not in the office right now/)).toBeTruthy();
    expect(screen.queryByText('In somewhere')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ProfileDialog x={10} y={10} onClose={onClose} name="A" avatar={av} online status={null} where={null} actions={[]} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('hover card', () => {
  it('an unclaimed office has no face and says so; the buttons still work', () => {
    const run = vi.fn();
    render(<PersonCard x={300} y={300} name="Office 4" avatar={null} online={false} status={null} sub="Free to claim" actions={[{ key: 'claim', label: 'Claim this office', icon: <i />, primary: true, run }]} onEnter={() => undefined} onLeave={() => undefined} />);
    expect(screen.getByText('Free to claim')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Claim this office' }));
    expect(run).toHaveBeenCalled();
  });
});

describe('places in the sidebar', () => {
  it('a room says who is in it, or that it is empty, or locked', () => {
    const open = vi.fn();
    const { rerender } = render(<PlaceRow name="Boardroom" kind="meeting" people={[]} locked={false} onOpen={open} />);
    expect(screen.getByText('Empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(open).toHaveBeenCalled();
    rerender(<PlaceRow name="Boardroom" kind="meeting" people={[{ id: '1', name: 'Kelvin', avatar: av }]} locked={false} onOpen={open} />);
    expect(screen.getByText('Kelvin is in')).toBeTruthy();
    rerender(<PlaceRow name="Boardroom" kind="meeting" people={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: 'P' + n, avatar: av }))} locked onOpen={open} />);
    expect(screen.getByText('5 people in')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByLabelText('Locked')).toBeTruthy();
  });

  it('a locked empty room is called locked', () => {
    render(<PlaceRow name="Vault" kind="lounge" people={[]} locked onOpen={() => undefined} />);
    expect(screen.getByText('Locked', { selector: 'span.block' })).toBeTruthy();
  });

  it('the space you are in is marked and the others can be switched to', () => {
    const go = vi.fn();
    const { rerender } = render(<SpaceRow name="KD Squares" current onOpen={go} />);
    expect(screen.getByText('You are here')).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
    rerender(<SpaceRow name="Finance" current={false} onOpen={go} />);
    fireEvent.click(screen.getByRole('button'));
    expect(go).toHaveBeenCalledTimes(1);
  });
});
