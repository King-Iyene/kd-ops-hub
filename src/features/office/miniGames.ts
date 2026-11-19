/** Table tennis and table football you can really play, against the computer or a friend at the same keyboard. Pure logic, so it is unit tested; the dialog draws it. */

// ---------- table tennis ----------
export interface PongState {
  w: number; h: number;
  bx: number; by: number; vx: number; vy: number;
  /** paddle centres (left, right) */
  p1: number; p2: number;
  s1: number; s2: number;
  /** seconds to wait before the next serve */
  wait: number;
  winner: 0 | 1 | 2;
  /** how fast everything goes: 1 is normal */
  speed: number;
}
export const PONG = { padX: 28, padHalf: 44, ball: 8, winAt: 7, maxSpeed: 760 };

/** The speeds you can choose, from a gentle rally to a blur. */
export const SPEEDS = [{ id: 'slow', label: 'Slow', mult: 0.7 }, { id: 'normal', label: 'Normal', mult: 1 }, { id: 'fast', label: 'Fast', mult: 1.45 }, { id: 'insane', label: 'Insane', mult: 2 }] as const;
export const speedMult = (id: string): number => SPEEDS.find((x) => x.id === id)?.mult ?? 1;

export function newPong(speed = 1): PongState {
  return { w: 800, h: 480, bx: 400, by: 240, vx: 0, vy: 0, p1: 240, p2: 240, s1: 0, s2: 0, wait: 0.8, winner: 0, speed };
}

function serve(s: PongState, toward: 1 | -1, rand: () => number) {
  s.bx = s.w / 2; s.by = s.h / 2;
  const a = (rand() - 0.5) * 0.8;
  s.vx = Math.cos(a) * 320 * s.speed * toward; s.vy = Math.sin(a) * 320 * s.speed;
}

/** Move the ball and settle bounces and points. (Paddle positions are set by the players before each step.) */
export function stepPong(s: PongState, dt: number, rand: () => number = Math.random): void {
  if (s.winner) return;
  s.p1 = Math.min(s.h - PONG.padHalf, Math.max(PONG.padHalf, s.p1));
  s.p2 = Math.min(s.h - PONG.padHalf, Math.max(PONG.padHalf, s.p2));
  if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) serve(s, rand() < 0.5 ? 1 : -1, rand); return; }
  s.bx += s.vx * dt; s.by += s.vy * dt;
  if (s.by < PONG.ball) { s.by = PONG.ball; s.vy = Math.abs(s.vy); }
  if (s.by > s.h - PONG.ball) { s.by = s.h - PONG.ball; s.vy = -Math.abs(s.vy); }
  const hit = (px: number, py: number, dir: 1 | -1) => {
    const off = (s.by - py) / PONG.padHalf; // -1 top .. 1 bottom
    const speed = Math.min(PONG.maxSpeed * s.speed, Math.hypot(s.vx, s.vy) * 1.06);
    const ang = off * 0.95;
    s.vx = Math.cos(ang) * speed * dir; s.vy = Math.sin(ang) * speed;
    s.bx = px + dir * (PONG.ball + 3);
  };
  if (s.vx < 0 && s.bx - PONG.ball <= PONG.padX + 6 && s.bx > PONG.padX - 10 && Math.abs(s.by - s.p1) <= PONG.padHalf + PONG.ball) hit(PONG.padX + 6, s.p1, 1);
  if (s.vx > 0 && s.bx + PONG.ball >= s.w - PONG.padX - 6 && s.bx < s.w - PONG.padX + 10 && Math.abs(s.by - s.p2) <= PONG.padHalf + PONG.ball) hit(s.w - PONG.padX - 6, s.p2, -1);
  if (s.bx < -PONG.ball) { s.s2 += 1; s.wait = 0.9; s.vx = s.vy = 0; s.bx = s.w / 2; s.by = s.h / 2; }
  if (s.bx > s.w + PONG.ball) { s.s1 += 1; s.wait = 0.9; s.vx = s.vy = 0; s.bx = s.w / 2; s.by = s.h / 2; }
  if (s.s1 >= PONG.winAt) s.winner = 1;
  if (s.s2 >= PONG.winAt) s.winner = 2;
}

/** Where the computer's paddle goes: after the ball, a little late and no faster than a person could. */
export function pongAi(s: PongState, current: number, dt: number, skill = 0.75): number {
  const target = s.vx > 0 || s.wait > 0 ? s.by : s.h / 2;
  const max = 520 * skill * dt;
  const d = target - current;
  return current + Math.max(-max, Math.min(max, d));
}

// ---------- table football ----------
export interface Rod { x: number; men: number; /** which team: 1 is on the left, 2 on the right */ team: 1 | 2; /** how far the rod is slid */ y: number; /** seconds of kick left */ kick: number }
export interface FootState {
  w: number; h: number;
  bx: number; by: number; vx: number; vy: number;
  rods: Rod[];
  s1: number; s2: number;
  wait: number;
  winner: 0 | 1 | 2;
  speed: number;
}
export const FOOT = { ball: 9, man: 13, goalHalf: 70, winAt: 5, spacing: 92 };

export function newFoot(speed = 1): FootState {
  const rod = (x: number, men: number, team: 1 | 2): Rod => ({ x, men, team, y: 0, kick: 0 });
  return {
    w: 800, h: 460, bx: 400, by: 230, vx: 0, vy: 0,
    rods: [rod(60, 1, 1), rod(200, 2, 1), rod(330, 3, 1), rod(470, 3, 2), rod(600, 2, 2), rod(740, 1, 2)],
    s1: 0, s2: 0, wait: 0.8, winner: 0, speed,
  };
}

/** The y of each man on a rod. */
export function manYs(rod: Rod, h: number): number[] {
  const gap = rod.men === 1 ? 0 : rod.men === 2 ? FOOT.spacing * 1.25 : FOOT.spacing;
  const ys: number[] = [];
  for (let i = 0; i < rod.men; i++) ys.push(h / 2 + rod.y + (i - (rod.men - 1) / 2) * gap);
  return ys;
}

/** How far a rod can slide so its outer men stay on the table. */
export function rodRange(rod: Rod, h: number): number {
  const gap = rod.men === 1 ? 0 : rod.men === 2 ? FOOT.spacing * 1.25 : FOOT.spacing;
  return h / 2 - FOOT.man - 4 - ((rod.men - 1) / 2) * gap;
}

export function stepFoot(s: FootState, dt: number, rand: () => number = Math.random): void {
  if (s.winner) return;
  for (const r of s.rods) {
    const lim = rodRange(r, s.h);
    r.y = Math.min(lim, Math.max(-lim, r.y));
    if (r.kick > 0) r.kick = Math.max(0, r.kick - dt);
  }
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) { const a = (rand() - 0.5) * 1.2; const dir = rand() < 0.5 ? 1 : -1; s.vx = Math.cos(a) * 260 * s.speed * dir; s.vy = Math.sin(a) * 260 * s.speed; }
    return;
  }
  s.bx += s.vx * dt; s.by += s.vy * dt;
  const drag = Math.pow(0.55, dt);
  s.vx *= drag; s.vy *= drag;
  // the ball never quite stops dead: a small nudge keeps the game moving
  if (Math.hypot(s.vx, s.vy) < 40) { s.vx += (rand() - 0.5) * 40; s.vy += (rand() - 0.5) * 40; }
  if (s.by < FOOT.ball) { s.by = FOOT.ball; s.vy = Math.abs(s.vy); }
  if (s.by > s.h - FOOT.ball) { s.by = s.h - FOOT.ball; s.vy = -Math.abs(s.vy); }
  const inGoal = Math.abs(s.by - s.h / 2) < FOOT.goalHalf;
  if (s.bx < FOOT.ball) { if (inGoal) { s.s2 += 1; resetBall(s); } else { s.bx = FOOT.ball; s.vx = Math.abs(s.vx); } }
  if (s.bx > s.w - FOOT.ball) { if (inGoal) { s.s1 += 1; resetBall(s); } else { s.bx = s.w - FOOT.ball; s.vx = -Math.abs(s.vx); } }
  for (const r of s.rods) {
    for (const my of manYs(r, s.h)) {
      const dx = s.bx - r.x, dy = s.by - my;
      const d = Math.hypot(dx, dy);
      const min = FOOT.ball + FOOT.man;
      if (d < min && d > 0.001) {
        const nx = dx / d, ny = dy / d;
        s.bx = r.x + nx * min; s.by = my + ny * min;
        const vn = s.vx * nx + s.vy * ny;
        if (vn < 0) { s.vx -= 1.7 * vn * nx; s.vy -= 1.7 * vn * ny; }
        if (r.kick > 0) { const dir = r.team === 1 ? 1 : -1; s.vx = dir * (520 + rand() * 120) * s.speed; s.vy += (s.by - my) * 6 * s.speed; r.kick = 0; }
        const sp = Math.hypot(s.vx, s.vy);
        const cap = 900 * s.speed;
        if (sp > cap) { s.vx *= cap / sp; s.vy *= cap / sp; }
      }
    }
  }
  if (s.s1 >= FOOT.winAt) s.winner = 1;
  if (s.s2 >= FOOT.winAt) s.winner = 2;
}

function resetBall(s: FootState) { s.bx = s.w / 2; s.by = s.h / 2; s.vx = s.vy = 0; s.wait = 1; }

/** The computer's rods follow the ball (a little late) and kick when it is close. */
export function footAi(s: FootState, team: 1 | 2, dt: number, skill = 0.7): void {
  for (const r of s.rods) {
    if (r.team !== team) continue;
    const ys = manYs(r, s.h);
    // slide the man nearest the ball in line with it
    let best = ys[0], bd = Infinity;
    for (const y of ys) { const d = Math.abs(y - s.by); if (d < bd) { bd = d; best = y; } }
    const want = r.y + (s.by - best);
    const max = 330 * skill * dt;
    r.y += Math.max(-max, Math.min(max, want - r.y));
    if (Math.abs(s.bx - r.x) < 34 && Math.abs(s.by - best) < 26 && r.kick <= 0 && Math.random() < 0.18) r.kick = 0.16;
  }
}
