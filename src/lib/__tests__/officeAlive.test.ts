import { beforeEach, describe, expect, it } from 'vitest';
import { OFFICE_ALIVE_MS, idleAction, markOfficeAlive, officeIsOpen } from '../officeAlive';

const MIN = 60_000;

describe('the Office keeps people signed in', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* fine */ } });

  it('is open right after the Office page marks itself, and stops counting after a short while', () => {
    expect(officeIsOpen(1_000)).toBe(false);
    markOfficeAlive(1_000);
    expect(officeIsOpen(1_000 + 15_000)).toBe(true);
    expect(officeIsOpen(1_000 + OFFICE_ALIVE_MS - 1)).toBe(true);
    expect(officeIsOpen(1_000 + OFFICE_ALIVE_MS + 1)).toBe(false);
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
});
