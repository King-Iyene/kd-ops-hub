import { beforeEach, describe, expect, it } from 'vitest';
import {
  OFFICE_ALIVE_MS, OFFICE_SESSION_MS, idleAction, justWoke, markOfficeAlive, monthlyLimitReached, officeIsOpen, setOfficeHere,
} from '../officeAlive';

const MIN = 60_000;

describe('the Office keeps people signed in', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* fine */ } });

  it('is open right after the Office page marks itself, and stops counting after a while', () => {
    expect(officeIsOpen(1_000)).toBe(false);
    markOfficeAlive(1_000);
    expect(officeIsOpen(1_000 + 15_000)).toBe(true);
    expect(officeIsOpen(1_000 + OFFICE_ALIVE_MS - 1)).toBe(true);
    expect(officeIsOpen(1_000 + OFFICE_ALIVE_MS + 1)).toBe(false);
  });

  it('a hidden tab whose timer only ticks once a minute still counts as open', () => {
    markOfficeAlive(1_000);
    expect(officeIsOpen(1_000 + 2 * MIN)).toBe(true);
  });

  it('an Office page open in this very window counts as open however stale the heartbeat is', () => {
    markOfficeAlive(1_000);
    setOfficeHere(true);
    expect(officeIsOpen(1_000 + 10 * 60 * MIN)).toBe(true);
    setOfficeHere(false);
    expect(officeIsOpen(1_000 + 10 * 60 * MIN)).toBe(false);
  });

  it('with the Office closed, idle people are warned and then signed out as before', () => {
    expect(idleAction(10 * MIN, 30 * MIN, MIN, false, false)).toBe('none');
    expect(idleAction(29.5 * MIN, 30 * MIN, MIN, false, false)).toBe('warn');
    expect(idleAction(29.5 * MIN, 30 * MIN, MIN, true, false)).toBe('none'); // warned once only
    expect(idleAction(30 * MIN, 30 * MIN, MIN, true, false)).toBe('signout');
  });

  it('with the Office open nobody is signed out or warned, however long they are idle, and the idle clock restarts', () => {
    expect(idleAction(31 * MIN, 30 * MIN, MIN, false, true)).toBe('restart');
    expect(idleAction(5 * 60 * MIN, 30 * MIN, MIN, true, true)).toBe('restart');
  });

  it('notices when the computer has been asleep', () => {
    expect(justWoke(10_000, 10_000)).toBe(false);
    expect(justWoke(25_000, 10_000)).toBe(false); // a busy page
    expect(justWoke(3 * 60 * MIN, 10_000)).toBe(true);
  });

  it('signs you in again once a month, never before, and never on an unknown date', () => {
    const now = Date.parse('2026-11-21T00:00:00Z');
    expect(monthlyLimitReached(new Date(now - 29 * 24 * 60 * MIN).toISOString(), now)).toBe(false);
    expect(monthlyLimitReached(new Date(now - OFFICE_SESSION_MS).toISOString(), now)).toBe(true);
    expect(monthlyLimitReached(undefined, now)).toBe(false);
    expect(monthlyLimitReached('not a date', now)).toBe(false);
  });
});
