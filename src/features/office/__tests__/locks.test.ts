import { describe, expect, it } from 'vitest';
import { canEnter, lockedRooms, occupants, parseDoor, pruneAdmitted, shouldTakeOver, type LockWho } from '../calls/locks';

const w = (id: string, zone: string | null, locked = false, spaceId: string | null = 's1'): LockWho => ({ id, spaceId, zone, locked });
const rooms = new Set(['r1', 'r2']);

describe('lockedRooms', () => {
  it('lists rooms whose holder is standing in them', () => {
    expect([...lockedRooms([w('a', 'r1', true), w('b', 'r2')], 's1', rooms)]).toEqual(['r1']);
  });
  it('ignores a lock flag from someone who is not in a meeting room, or in another office', () => {
    expect(lockedRooms([w('a', null, true), w('b', 'lounge', true), w('c', 'r1', true, 's2')], 's1', rooms).size).toBe(0);
  });
});

describe('canEnter', () => {
  it('lets anyone into an unlocked room', () => expect(canEnter('r1', new Set(), new Set())).toBe(true));
  it('blocks a locked room unless admitted', () => {
    expect(canEnter('r1', new Set(['r1']), new Set())).toBe(false);
    expect(canEnter('r1', new Set(['r1']), new Set(['r1']))).toBe(true);
  });
});

describe('occupants', () => {
  it('counts people in the room in this office only', () => {
    expect(occupants([w('a', 'r1'), w('b', 'r1'), w('c', 'r2'), w('d', 'r1', false, 's2')], 's1', 'r1').sort()).toEqual(['a', 'b']);
  });
});

describe('shouldTakeOver', () => {
  it('hands the lock to the lowest id still inside when the holder walked out', () => {
    expect(shouldTakeOver(true, false, ['b', 'c'], 'b', false)).toBe(true);
    expect(shouldTakeOver(true, false, ['b', 'c'], 'c', false)).toBe(false);
  });
  it('does nothing after an intentional unlock, an empty room, or when it was never locked', () => {
    expect(shouldTakeOver(true, false, ['b'], 'b', true)).toBe(false);
    expect(shouldTakeOver(true, false, [], 'b', false)).toBe(false);
    expect(shouldTakeOver(false, false, ['b'], 'b', false)).toBe(false);
    expect(shouldTakeOver(true, true, ['b'], 'b', false)).toBe(false);
  });
});

describe('pruneAdmitted', () => {
  it('forgets admissions for rooms that are no longer locked', () => {
    expect([...pruneAdmitted(new Set(['r1', 'r2']), new Set(['r2']))]).toEqual(['r2']);
  });
});

describe('parseDoor', () => {
  it('accepts valid messages and trims names', () => {
    expect(parseDoor({ k: 'knock', f: 'a', n: 'x'.repeat(100), r: 'r1' })?.n?.length).toBe(60);
    expect(parseDoor({ k: 'let', f: 'a', t: 'b', r: 'r1' })?.t).toBe('b');
  });
  it('rejects bad input', () => {
    expect(parseDoor({ k: 'open', f: 'a', r: 'r1' })).toBeNull();
    expect(parseDoor({ k: 'knock', f: 1, r: 'r1' })).toBeNull();
    expect(parseDoor({ k: 'knock', f: 'a' })).toBeNull();
    expect(parseDoor(null)).toBeNull();
  });
});
