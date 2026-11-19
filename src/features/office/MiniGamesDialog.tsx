import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FOOT, PONG, SPEEDS, footAi, manYs, newFoot, newPong, pongAi, speedMult, stepFoot, stepPong } from './miniGames';

export type MiniGame = 'tennis' | 'football';
type Mode = 'cpu' | 'two' | 'online';

/**
 * Table tennis and table football on a canvas: against the computer, two people at one keyboard, or two people at their
 * own screens. Online, the first person at the table runs the ball and sends the whole picture 30 times a second; the
 * second sends only where their paddle (or rods) are. Anyone else at the table watches.
 */
export function MiniGamesDialog({ game, roomKey, playerId, onClose }: { game: MiniGame | null; /** which table: both players use the same key */ roomKey: string; playerId: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('cpu');
  const [round, setRound] = useState(0);
  const [speed, setSpeed] = useState('normal');
  const [score, setScore] = useState<{ a: number; b: number; winner: 0 | 1 | 2 }>({ a: 0, b: 0, winner: 0 });
  const [role, setRole] = useState<'host' | 'guest' | 'watch' | 'alone'>('alone');
  const cv = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef(new Set<string>());
  const mouseY = useRef<number | null>(null);

  useEffect(() => {
    if (!game) return;
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pong = newPong(speedMult(speed));
    const foot = newFoot(speedMult(speed));
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

    // ---- playing over the network ----
    type Wire = { p2?: number; r?: { y: number; kick: boolean }[]; st?: Record<string, unknown> };
    const wire: Wire = {};
    let myRole: 'host' | 'guest' | 'watch' | 'alone' = 'alone';
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (mode === 'online' && playerId) {
      channel = supabase.channel(`office-game:${roomKey}:${game}`, { config: { presence: { key: playerId }, broadcast: { self: false } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState() as Record<string, { at?: number }[]>;
          const order = Object.entries(state).map(([id, v]) => ({ id, at: v[0]?.at ?? 0 })).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
          const idx = order.findIndex((o) => o.id === playerId);
          const next = order.length < 2 ? 'alone' : idx === 0 ? 'host' : idx === 1 ? 'guest' : 'watch';
          if (next !== myRole) { myRole = next; setRole(next); }
        })
        .on('broadcast', { event: 'in' }, ({ payload }) => {
          const p = payload as { p2?: unknown; r?: unknown } | null;
          if (!p) return;
          if (typeof p.p2 === 'number' && Number.isFinite(p.p2)) wire.p2 = p.p2;
          if (Array.isArray(p.r)) wire.r = (p.r as { y?: unknown; kick?: unknown }[]).slice(0, 3).map((x) => ({ y: typeof x.y === 'number' && Number.isFinite(x.y) ? x.y : 0, kick: x.kick === true }));
        })
        .on('broadcast', { event: 'st' }, ({ payload }) => { if (payload && typeof payload === 'object') wire.st = payload as Record<string, unknown>; })
        .subscribe((status) => { if (status === 'SUBSCRIBED') void channel!.track({ at: Date.now() }); });
    }
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

    let raf = 0, last = performance.now(), lastScore = '', lastSend = 0;
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
      const online = mode === 'online';
      const guest = online && myRole === 'guest';
      const watcher = online && (myRole === 'watch' || myRole === 'alone');
      const sendNow = online && myRole !== 'alone' && myRole !== 'watch' && now - lastSend > 33;
      if (sendNow) lastSend = now;
      if (game === 'tennis') {
        const sp = 480 * dt;
        // my paddle: the left one, or the right one when I am the guest
        const key = guest ? 'p2' : 'p1';
        if (!watcher) {
          if (mouseY.current !== null && mode !== 'two') pong[key] += Math.max(-sp * 2, Math.min(sp * 2, mouseY.current - pong[key]));
          if (k.has('w')) { pong[key] -= sp; mouseY.current = null; }
          if (k.has('s')) { pong[key] += sp; mouseY.current = null; }
        }
        if (mode === 'two') { if (k.has('arrowup')) pong.p2 -= sp; if (k.has('arrowdown')) pong.p2 += sp; }
        else if (mode === 'cpu') pong.p2 = pongAi(pong, pong.p2, dt);
        if (online && myRole === 'host') { if (wire.p2 !== undefined) pong.p2 = wire.p2; stepPong(pong, dt); }
        else if (online) {
          const st = wire.st;
          if (st) { pong.bx = num(st.bx, pong.bx); pong.by = num(st.by, pong.by); pong.vx = num(st.vx, 0); pong.vy = num(st.vy, 0); pong.p1 = num(st.p1, pong.p1); pong.s1 = num(st.s1, 0); pong.s2 = num(st.s2, 0); pong.winner = st.winner === 1 ? 1 : st.winner === 2 ? 2 : 0; if (!guest) pong.p2 = num(st.p2, pong.p2); }
        } else stepPong(pong, dt);
        if (sendNow) {
          if (myRole === 'host') void channel?.send({ type: 'broadcast', event: 'st', payload: { bx: pong.bx, by: pong.by, vx: pong.vx, vy: pong.vy, p1: pong.p1, p2: pong.p2, s1: pong.s1, s2: pong.s2, winner: pong.winner } });
          else void channel?.send({ type: 'broadcast', event: 'in', payload: { p2: pong.p2 } });
        }
        draw(ctx, 'tennis');
        const sk = `${pong.s1}-${pong.s2}-${pong.winner}`;
        if (sk !== lastScore) { lastScore = sk; setScore({ a: pong.s1, b: pong.s2, winner: pong.winner }); }
      } else {
        const sp = 300 * dt;
        const team: 1 | 2 = guest ? 2 : 1;
        const mine = foot.rods.filter((r) => r.team === team), theirs = foot.rods.filter((r) => r.team === 2);
        if (!watcher) {
          if (mouseY.current !== null && mode !== 'two') for (const r of mine) r.y += Math.max(-sp * 2, Math.min(sp * 2, mouseY.current - H / 2 - r.y));
          if (k.has('w')) { for (const r of mine) r.y -= sp; mouseY.current = null; }
          if (k.has('s')) { for (const r of mine) r.y += sp; mouseY.current = null; }
          if (k.has(' ') || k.has('d')) for (const r of mine) if (r.kick <= 0) r.kick = 0.16;
        }
        if (mode === 'two') {
          if (k.has('arrowup')) for (const r of theirs) r.y -= sp;
          if (k.has('arrowdown')) for (const r of theirs) r.y += sp;
          if (k.has('arrowleft') || k.has('enter')) for (const r of theirs) if (r.kick <= 0) r.kick = 0.16;
        } else if (mode === 'cpu') footAi(foot, 2, dt);
        if (online && myRole === 'host') {
          if (wire.r) wire.r.forEach((x, i) => { const r = theirs[i]; if (r) { r.y = x.y; if (x.kick && r.kick <= 0) r.kick = 0.16; } });
          stepFoot(foot, dt);
        } else if (online) {
          const st = wire.st as { bx?: unknown; by?: unknown; s1?: unknown; s2?: unknown; winner?: unknown; rods?: { y?: unknown; kick?: unknown }[] } | undefined;
          if (st) {
            foot.bx = num(st.bx, foot.bx); foot.by = num(st.by, foot.by); foot.s1 = num(st.s1, 0); foot.s2 = num(st.s2, 0); foot.winner = st.winner === 1 ? 1 : st.winner === 2 ? 2 : 0;
            if (Array.isArray(st.rods)) st.rods.slice(0, 6).forEach((x, i) => { const r = foot.rods[i]; if (r && !(guest && r.team === 2)) { r.y = num(x.y, r.y); r.kick = x.kick === true ? 0.1 : 0; } });
          }
          for (const r of foot.rods) if (r.kick > 0) r.kick = Math.max(0, r.kick - dt);
        } else stepFoot(foot, dt);
        if (sendNow) {
          if (myRole === 'host') void channel?.send({ type: 'broadcast', event: 'st', payload: { bx: foot.bx, by: foot.by, s1: foot.s1, s2: foot.s2, winner: foot.winner, rods: foot.rods.map((r) => ({ y: r.y, kick: r.kick > 0 })) } });
          else void channel?.send({ type: 'broadcast', event: 'in', payload: { r: theirs.map((r) => ({ y: r.y, kick: r.kick > 0 })) } });
        }
        draw(ctx, 'football');
        const sk = `${foot.s1}-${foot.s2}-${foot.winner}`;
        if (sk !== lastScore) { lastScore = sk; setScore({ a: foot.s1, b: foot.s2, winner: foot.winner }); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      canvas.removeEventListener('mousemove', move);
      k.clear();
      if (channel) void supabase.removeChannel(channel);
      setRole('alone');
    };
  }, [game, mode, round, roomKey, playerId, speed]);

  const tennis = game === 'tennis';
  const online = mode === 'online';
  const status = !online ? null : role === 'alone' ? 'Waiting for someone to join this table…' : role === 'host' ? 'Connected: you are blue (left)' : role === 'guest' ? 'Connected: you are the other side (right)' : 'Two people are playing: you are watching';
  return (
    <Dialog open={!!game} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-w-5xl w-[calc(100vw-1.5rem)]">
        <DialogHeader><DialogTitle>{tennis ? '🏓 Table tennis' : '⚽ Table football'}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="radiogroup" aria-label="Players">
            {([['cpu', 'You vs computer'], ['online', 'Play a colleague'], ['two', 'Two at one keyboard']] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setRound((r) => r + 1); }} className={`h-8 rounded-lg px-3 text-xs font-semibold ${mode === m ? 'bg-background shadow' : 'text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
          <p className="text-lg font-bold tabular-nums"><span className="text-blue-500">{score.a}</span> : <span className={tennis ? 'text-amber-500' : 'text-red-500'}>{score.b}</span></p>
          <div className="flex gap-1.5">
            {(!online || role === 'host') && <Button size="sm" variant="outline" onClick={() => setRound((r) => r + 1)}>New game</Button>}
            <Button size="sm" variant="destructive" onClick={onClose}>Leave game</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Speed</span>
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={speed === x.id} onClick={() => { setSpeed(x.id); setRound((r) => r + 1); }} className={`h-7 rounded-lg px-3 text-xs font-semibold ${speed === x.id ? 'bg-background shadow' : 'text-muted-foreground'}`}>{x.label}</button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">Esc or Leave game takes you back to the office.</span>
        </div>
        {status && <p className="text-xs font-medium text-primary">{status}. Ask a colleague to open the same table and choose "Play a colleague".</p>}
        <canvas ref={cv} className="w-full rounded-xl border border-border bg-black" style={{ aspectRatio: tennis ? '800 / 480' : '800 / 460', cursor: 'none' }} />
        {score.winner !== 0 && <p className="text-center text-sm font-semibold">{score.winner === 1 ? (mode === 'cpu' ? 'You win! 🎉' : 'Left side wins! 🎉') : (mode === 'cpu' ? 'The computer wins this time.' : 'Right side wins! 🎉')} {(!online || role === 'host') ? 'Press New game to play again.' : 'The host can start a new game.'}</p>}
        <p className="text-xs text-muted-foreground">
          {tennis
            ? 'Move your mouse up and down, or use W and S. At one keyboard: player 1 uses W and S, player 2 the up and down arrows. First to 7.'
            : 'Move your mouse, or W and S, to slide all your rods; press Space to kick. At one keyboard: player 1 uses W, S and Space; player 2 the arrows and Left arrow or Enter to kick. First to 5.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
