import { describe, expect, it } from 'vitest';
import { isLive, upcoming, whenText, type EventRow } from '../useOfficeLife';
import { WHEEL } from '../ReactionWheel';
import { isEmoji } from '../emoji';

const ev = (id: string, startMin: number, endMin: number, now: number): EventRow => ({ id, space_id: 's', title: id, details: null, zone: null, created_by: null, starts_at: new Date(now + startMin * 60000).toISOString(), ends_at: new Date(now + endMin * 60000).toISOString() });

describe('events', () => {
  const now = Date.UTC(2026, 10, 18, 10, 0, 0);
  it('lists what has not finished, soonest first, and drops what is over', () => {
    const list = upcoming([ev('later', 120, 150, now), ev('over', -90, -30, now), ev('now', -10, 20, now), ev('soon', 30, 60, now)], now);
    expect(list.map((e) => e.id)).toEqual(['now', 'soon', 'later']);
  });
  it('knows which one is on right now', () => {
    expect(isLive(ev('a', -5, 5, now), now)).toBe(true);
    expect(isLive(ev('b', 5, 15, now), now)).toBe(false);
    expect(isLive(ev('c', -30, -1, now), now)).toBe(false);
  });
  it('words a time as today, tomorrow or a date', () => {
    const base = new Date(2026, 10, 18, 9, 0, 0);
    expect(whenText(new Date(2026, 10, 18, 14, 30).toISOString(), base)).toMatch(/^Today /);
    expect(whenText(new Date(2026, 10, 19, 9, 0).toISOString(), base)).toMatch(/^Tomorrow /);
    expect(whenText(new Date(2026, 10, 25, 9, 0).toISOString(), base)).not.toMatch(/^(Today|Tomorrow)/);
  });
});

describe('reaction wheel', () => {
  it('has eight reactions and every one is a real emoji the other side will accept', () => {
    expect(WHEEL).toHaveLength(8);
    for (const e of WHEEL) expect(isEmoji(e), e).toBe(true);
    expect(new Set(WHEEL).size).toBe(8);
  });
});
