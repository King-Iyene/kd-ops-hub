import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FOOT, PONG, footAi, manYs, newFoot, newPong, pongAi, stepFoot, stepPong } from './miniGames';

export type MiniGame = 'tennis' | 'football';
type Mode = 'cpu' | 'two';

/** Table tennis and table football on a canvas: against the computer, or two people at one keyboard. */
export function MiniGamesDialog({ game, onClose }: { game: MiniGame | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('cpu');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<{ a: number; b: number; winner: 0 | 1 | 2 }>({ a: 0, b: 0, winner: 0 });
  const cv = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef(new Set<string>());
  const mouseY = useRef<number | null>(null);

  useEffect(() => {
    if (!game) return;
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pong = newPong();
    const foot = newFoot();
    const W = game === 'tennis' ? pong.w : foot.w, H = game === 'tennis' ? pong.h : foot.h;
    canvas.width = W; canvas.height = H;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(k)) { keys.current.add(k); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const move = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); mouseY.current = ((e.clientY - r.top) / r.height) * H; };
    canvas.addEventListener('mousemove', move);
    let raf = 0, last = performance.now(), lastScore = '';
    const k = keys.current;
    const draw = (c: CanvasRenderingContext2D, g: MiniGame) => {
      if (g === 'tennis') {
        const g2 = c.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, '#1d4ed8'); g2.addColorStop(1, '#1e3a8a');
        c.fillStyle = g2; c.fillRect(0, 0, W, H);
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 4; c.strokeRect(10, 10, W - 20, H - 20);
        c.setLineDash([12, 14]); c.beginPath(); c.moveTo(W / 2, 12); c.lineTo(W / 2, H - 12); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#f8fafc';
        c.beginPath(); c.roundRect(PONG.padX - 6, pong.p1 - PONG.padHalf, 12, PONG.padHalf * 2, 6); c.fill();
        c.fillStyle = '#fbbf24';
        c.beginPath(); c.roundRect(W - PONG.padX - 6, pong.p2 - PONG.padHalf, 12, PONG.padHalf * 2, 6); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(pong.bx + 3, pong.by + 4, PONG.ball, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fb923c'; c.beginPath(); c.arc(pong.bx, pong.by, PONG.ball, 0, Math.PI * 2); c.fill();
        return;
      }
      c.fillStyle = '#2f9e44'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'; c.fillRect(i * (W / 10), 0, W / 10, H); }
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.strokeRect(6, 6, W - 12, H - 12);
      c.beginPath(); c.moveTo(W / 2, 6); c.lineTo(W / 2, H - 6); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, 54, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#111827'; c.fillRect(0, H / 2 - FOOT.goalHalf, 8, FOOT.goalHalf * 2); c.fillRect(W - 8, H / 2 - FOOT.goalHalf, 8, FOOT.goalHalf * 2);
      for (const r of foot.rods) {
        c.strokeStyle = '#d1d5db'; c.lineWidth = 5; c.beginPath(); c.moveTo(r.x, 0); c.lineTo(r.x, H); c.stroke();
        for (const my of manYs(r, H)) {
          const lean = r.kick > 0 ? (r.team === 1 ? 7 : -7) : 0;
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(r.x + lean + 3, my + 4, FOOT.man, FOOT.man * 0.8, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = r.team === 1 ? '#3b82f6' : '#ef4444'; c.beginPath(); c.arc(r.x + lean, my, FOOT.man, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(r.x + lean, my - 3, 5, 0, Math.PI * 2); c.fill();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(foot.bx + 3, foot.by + 4, FOOT.ball, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(foot.bx, foot.by, FOOT.ball, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = 1.5; c.stroke();
    };
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (game === 'tennis') {
        const sp = 480 * dt;
        if (mouseY.current !== null && mode === 'cpu') pong.p1 += Math.max(-sp * 2, Math.min(sp * 2, mouseY.current - pong.p1));
        if (k.has('w')) { pong.p1 -= sp; mouseY.current = null; }
        if (k.has('s')) { pong.p1 += sp; mouseY.current = null; }
        if (mode === 'two') { if (k.has('arrowup')) pong.p2 -= sp; if (k.has('arrowdown')) pong.p2 += sp; } else pong.p2 = pongAi(pong, pong.p2, dt);
        stepPong(pong, dt);
        draw(ctx, 'tennis');
        const key = `${pong.s1}-${pong.s2}-${pong.winner}`;
        if (key !== lastScore) { lastScore = key; setScore({ a: pong.s1, b: pong.s2, winner: pong.winner }); }
      } else {
        const sp = 300 * dt;
        const mine = foot.rods.filter((r) => r.team === 1), theirs = foot.rods.filter((r) => r.team === 2);
        if (mouseY.current !== null && mode === 'cpu') for (const r of mine) r.y += Math.max(-sp * 2, Math.min(sp * 2, mouseY.current - H / 2 - r.y));
        if (k.has('w')) { for (const r of mine) r.y -= sp; mouseY.current = null; }
        if (k.has('s')) { for (const r of mine) r.y += sp; mouseY.current = null; }
        if (k.has(' ') || k.has('d')) for (const r of mine) if (r.kick <= 0) r.kick = 0.16;
        if (mode === 'two') {
          if (k.has('arrowup')) for (const r of theirs) r.y -= sp;
          if (k.has('arrowdown')) for (const r of theirs) r.y += sp;
          if (k.has('arrowleft') || k.has('enter')) for (const r of theirs) if (r.kick <= 0) r.kick = 0.16;
        } else footAi(foot, 2, dt);
        stepFoot(foot, dt);
        draw(ctx, 'football');
        const key = `${foot.s1}-${foot.s2}-${foot.winner}`;
        if (key !== lastScore) { lastScore = key; setScore({ a: foot.s1, b: foot.s2, winner: foot.winner }); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); canvas.removeEventListener('mousemove', move); k.clear(); };
  }, [game, mode, round]);

  const tennis = game === 'tennis';
  return (
    <Dialog open={!!game} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-w-3xl">
        <DialogHeader><DialogTitle>{tennis ? '🏓 Table tennis' : '⚽ Table football'}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="radiogroup" aria-label="Players">
            {([['cpu', 'You vs computer'], ['two', 'Two players']] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setRound((r) => r + 1); }} className={`h-8 rounded-lg px-3 text-xs font-semibold ${mode === m ? 'bg-background shadow' : 'text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
          <p className="text-lg font-bold tabular-nums"><span className="text-blue-500">{score.a}</span> : <span className={tennis ? 'text-amber-500' : 'text-red-500'}>{score.b}</span></p>
          <Button size="sm" variant="outline" onClick={() => setRound((r) => r + 1)}>New game</Button>
        </div>
        <canvas ref={cv} className="w-full rounded-xl border border-border bg-black" style={{ aspectRatio: tennis ? '800 / 480' : '800 / 460', cursor: 'none' }} />
        {score.winner !== 0 && <p className="text-center text-sm font-semibold">{score.winner === 1 ? (mode === 'cpu' ? 'You win! 🎉' : 'Player 1 wins! 🎉') : (mode === 'cpu' ? 'The computer wins this time.' : 'Player 2 wins! 🎉')} Press New game to play again.</p>}
        <p className="text-xs text-muted-foreground">
          {tennis
            ? 'Move your mouse up and down, or use W and S. Two players: player 1 uses W and S, player 2 uses the up and down arrows. First to 7.'
            : 'Move your mouse, or W and S, to slide all your rods; press Space to kick. Two players: player 1 uses W, S and Space; player 2 uses the arrows and Left arrow or Enter to kick. First to 5.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
