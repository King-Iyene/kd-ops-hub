import { describe, expect, it } from 'vitest';
import { CORRECTION_MS, pack, shouldSend, unpack, type SentMotion } from '../world/netSync';

const still = { x: 5, y: 5, vx: 0, vy: 0 };
const right = { x: 5, y: 5, vx: 4.5, vy: 0 };
const down = { x: 5, y: 5, vx: 0, vy: 4.5 };

describe('shouldSend: the traffic budget', () => {
  it('sends once when you first arrive', () => expect(shouldSend(null, still, 0)).toBe('first'));
  it('sends nothing while you stand still, however long', () => {
    const prev: SentMotion = { ...still, at: 0 };
    for (const t of [1000, 10_000, 600_000]) expect(shouldSend(prev, still, t)).toBeNull();
  });
  it('sends when you start walking', () => expect(shouldSend({ ...still, at: 0 }, right, 100)).toBe('change'));
  it('sends when you turn', () => expect(shouldSend({ ...right, at: 0 }, down, 100)).toBe('change'));
  it('sends when you stop', () => expect(shouldSend({ ...right, at: 0 }, still, 100)).toBe('stop'));
  it('is quiet during a steady walk and corrects once every few seconds', () => {
    const prev: SentMotion = { ...right, at: 0 };
    expect(shouldSend(prev, right, CORRECTION_MS - 1)).toBeNull();
    expect(shouldSend(prev, right, CORRECTION_MS)).toBe('correct');
  });
  it('a speed change in the same direction is not a new message', () => {
    expect(shouldSend({ ...right, at: 0 }, { ...right, vx: 3 }, 500)).toBeNull();
  });

  it('a whole busy day stays tiny: 25 people, 30 walks each, about 4 messages per walk', () => {
    // simulate: each walk = start, one turn, stop = 3 messages; count over a work day
    const perWalk = [still, right, down, still].reduce<{ prev: SentMotion | null; n: number }>((acc, cur, i) => {
      const reason = shouldSend(acc.prev, cur, i * 700);
      return { prev: reason ? { ...cur, at: i * 700 } : acc.prev, n: acc.n + (reason ? 1 : 0) };
    }, { prev: { ...still, at: 0 }, n: 0 }).n;
    expect(perWalk).toBeLessThanOrEqual(4);
    const sendsPerMonth = 25 * 30 * (perWalk + 1) * 22;
    const deliveries = sendsPerMonth * 24; // everyone in one room hears everything (worst case)
    expect(deliveries).toBeLessThan(5_000_000); // Supabase Pro includes 5 million messages a month
  });
});

describe('wire format', () => {
  it('round-trips a message', () => {
    const msg = pack('abc', { x: 3.14159, y: 7.777, vx: 4.5, vy: 0 }, 2);
    expect(msg).toEqual({ i: 'abc', x: 3.14, y: 7.78, vx: 4.5, vy: 0, d: 2 });
    expect(unpack(msg)).toEqual({ id: 'abc', x: 3.14, y: 7.78, vx: 4.5, vy: 0, dir: 2 });
  });
  it('rejects junk from the network', () => {
    expect(unpack(null)).toBeNull();
    expect(unpack('hello')).toBeNull();
    expect(unpack({})).toBeNull();
    expect(unpack({ i: 1, x: 1, y: 1, vx: 0, vy: 0 })).toBeNull();
    expect(unpack({ i: 'a', x: NaN, y: 1, vx: 0, vy: 0 })).toBeNull();
    expect(unpack({ i: 'a', x: 1, y: 1, vx: 999, vy: 0 })).toBeNull(); // teleport-speed
    expect(unpack({ i: 'a', x: 9999, y: 1, vx: 0, vy: 0 })).toBeNull(); // far outside the map
    expect(unpack({ i: 'x'.repeat(200), x: 1, y: 1, vx: 0, vy: 0 })).toBeNull();
  });
  it('an out-of-range direction becomes 0', () => {
    expect(unpack({ i: 'a', x: 1, y: 1, vx: 0, vy: 0, d: 9 })?.dir).toBe(0);
  });
});
