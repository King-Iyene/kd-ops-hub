import { describe, expect, it } from 'vitest';
import { FOOT, PONG, footAi, manYs, newFoot, newPong, pongAi, rodRange, stepFoot, stepPong } from '../miniGames';
import { tally, type PollRow, type VoteRow } from '../useBoards';

const noRand = () => 0.5;

describe('table tennis', () => {
  it('serves after a short wait and the ball moves', () => {
    const s = newPong();
    for (let i = 0; i < 100; i++) stepPong(s, 0.016, noRand);
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(100);
  });
  it('bounces off a paddle and speeds up a little', () => {
    const s = newPong();
    s.wait = 0; s.bx = PONG.padX + 14; s.by = 240; s.vx = -300; s.vy = 0; s.p1 = 240;
    stepPong(s, 0.016, noRand);
    expect(s.vx).toBeGreaterThan(0);
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(300);
  });
  it('scores a point when the ball gets past a paddle, and the game ends at seven', () => {
    const s = newPong();
    s.wait = 0; s.bx = 5; s.by = 40; s.vx = -300; s.vy = 0; s.p1 = 400;
    for (let i = 0; i < 20; i++) stepPong(s, 0.016, noRand);
    expect(s.s2).toBe(1);
    s.s1 = PONG.winAt - 1; s.wait = 0; s.bx = s.w + 20; s.vx = 300;
    stepPong(s, 0.016, noRand);
    expect(s.winner).toBe(1);
  });
  it('the computer paddle follows the ball but not faster than a person could', () => {
    const s = newPong();
    s.vx = 300; s.by = 400; s.wait = 0;
    const next = pongAi(s, 100, 0.016);
    expect(next).toBeGreaterThan(100);
    expect(next - 100).toBeLessThan(10);
  });
});

describe('table football', () => {
  it('keeps every man on the table', () => {
    const s = newFoot();
    for (const r of s.rods) {
      r.y = 9999; stepFoot(s, 0.016, noRand);
      for (const y of manYs(r, s.h)) { expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(s.h); }
      expect(Math.abs(r.y)).toBeLessThanOrEqual(rodRange(r, s.h) + 0.001);
      r.y = 0;
    }
  });
  it('a kick sends the ball towards the other goal', () => {
    const s = newFoot();
    s.wait = 0;
    const rod = s.rods.find((r) => r.team === 1 && r.men === 3)!;
    const my = manYs(rod, s.h)[1];
    s.bx = rod.x + FOOT.ball + FOOT.man - 2; s.by = my; s.vx = 0; s.vy = 0;
    rod.kick = 0.16;
    stepFoot(s, 0.016, noRand);
    expect(s.vx).toBeGreaterThan(300);
  });
  it('scores when the ball goes in a goal mouth, and a miss bounces back', () => {
    const s = newFoot();
    s.wait = 0; s.bx = 12; s.by = s.h / 2; s.vx = -500; s.vy = 0;
    for (const r of s.rods) r.y = r.men === 1 ? rodRange(r, s.h) : 0;
    stepFoot(s, 0.05, noRand);
    expect(s.s2 + s.s1).toBeGreaterThanOrEqual(1);
    const m = newFoot();
    m.wait = 0; m.bx = 12; m.by = 40; m.vx = -500; m.vy = 0;
    stepFoot(m, 0.05, noRand);
    expect(m.vx).toBeGreaterThan(0);
  });
  it('the computer slides a man towards the ball', () => {
    const s = newFoot();
    s.by = 80; s.bx = 400;
    footAi(s, 2, 0.1);
    const rod = s.rods.find((r) => r.team === 2 && r.men === 3)!;
    expect(rod.y).toBeLessThan(0);
  });
});

describe('polls', () => {
  const poll: PollRow = { id: 'p1', space_id: 's', question: 'Lunch?', options: ['Jollof', 'Pizza', 'Salad'], created_by: 'a', closed: false, created_at: '' };
  const votes: VoteRow[] = [{ poll_id: 'p1', user_id: 'a', option: 0 }, { poll_id: 'p1', user_id: 'b', option: 1 }, { poll_id: 'p1', user_id: 'c', option: 0 }, { poll_id: 'other', user_id: 'a', option: 2 }, { poll_id: 'p1', user_id: 'd', option: 9 }];
  it('counts votes per choice, ignores other polls and impossible choices, and finds mine', () => {
    const t = tally(poll, votes, 'b');
    expect(t.counts).toEqual([2, 1, 0]);
    expect(t.total).toBe(3);
    expect(t.mine).toBe(1);
    expect(tally(poll, votes).mine).toBeNull();
  });
});
