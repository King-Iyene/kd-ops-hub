import { useEffect, useRef } from 'react';
import type { AvatarStyle, Item, ItemType, MapDef, Zone } from './world/types';
import { WALK_SPEED, advance, buildSolid, extrapolate, facing, findPath, inputVelocity, zoneAt } from './world/world';
import { TILE, defaultAvatar, depth, drawFloor, drawItems, drawLighting, drawPerson, drawVignette, drawWalls, drawZoneLabels, type DrawPerson } from './world/render';
import type { PeerMotion, Who } from './useOffice';
import type { Motion } from './world/netSync';
import { statusOf } from './status';

export type EditTool = ItemType | 'erase' | 'paint' | null;

interface Props {
  map: MapDef;
  /** the office being shown (people announced in a different office are hidden) */
  spaceId: string | null;
  items: Item[];
  me: { id: string; uid: string; name: string; avatar: AvatarStyle };
  /** testing only: draw other windows of my own account too */
  showOwnTabs: boolean;
  roster: Who[];
  peers: React.MutableRefObject<Map<string, PeerMotion>>;
  /** live cameras by person id, drawn as bubbles above their heads */
  bubbles: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  /** ids of people talking now ('' is me) */
  speaking: React.MutableRefObject<Set<string>>;
  update: (m: Motion, dir: 0 | 1 | 2 | 3, now: number) => void;
  onZone: (zone: Zone | null) => void;
  /** may I walk into this meeting room? (false while it is locked and nobody has let me in) */
  canEnter: (roomId: string) => boolean;
  /** I walked into a locked door */
  onBlocked: (zone: Zone) => void;
  /** "go to" a spot: walk there (a new key means a new request) */
  jump: { key: number; x: number; y: number } | null;
  /** the person I am following (walk toward them automatically), if any */
  follow: string | null;
  /** stop following once I have reached them ("go to" a person) */
  followOnce: boolean;
  onFollowEnd: () => void;
  onPortal: (target: 'team' | 'mine') => void;
  dark: boolean;
  zoom: number;
  /** edit mode: walking is off and clicks place or remove furniture */
  editing: boolean;
  tool: EditTool;
  ghost: (tile: { x: number; y: number }) => { ok: boolean };
  onTile: (tile: { x: number; y: number }) => void;
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/** The world: draws the office and moves you with WASD or the arrow keys. All state lives in refs so the loop never re-renders React. */
export function OfficeCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const meRef = useRef({ x: props.map.spawn.x, y: props.map.spawn.y, dir: 0 as 0 | 1 | 2 | 3, vx: 0, vy: 0, sx: 0, sy: 0 });
  const keys = useRef(new Set<string>());
  const zoneId = useRef<string | null>('__none__');
  const portalCooldown = useRef(0);
  const lastJump = useRef(0);
  const drawFailed = useRef(false);
  const walkGoal = useRef<{ x: number; y: number } | null>(null);
  const route = useRef<{ x: number; y: number }[]>([]);
  const lastPlan = useRef(0);
  const autoStuck = useRef<{ t: number; d: number } | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const cam = useRef({ ox: 0, oy: 0, scale: 1 });

  // a new office: start at its entrance
  useEffect(() => {
    meRef.current = { x: props.map.spawn.x, y: props.map.spawn.y, dir: 0, vx: 0, vy: 0, sx: 0, sy: 0 };
    zoneId.current = '__none__';
    portalCooldown.current = performance.now() + 800; // do not bounce straight back through the door we just used
  }, [props.map]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(k)) {
        keys.current.add(k);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const toTile = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const { ox, oy, scale } = cam.current;
      return { x: Math.floor((e.clientX - r.left - ox) / (TILE * scale)), y: Math.floor((e.clientY - r.top - oy) / (TILE * scale)) };
    };
    const move = (e: MouseEvent) => { hover.current = toTile(e); };
    const leave = () => { hover.current = null; };
    const click = (e: MouseEvent) => { if (propsRef.current.editing) propsRef.current.onTile(toTile(e)); };
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseleave', leave);
    canvas.addEventListener('click', click);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const solid = buildSolid(p.map, p.items);
      const me = meRef.current;

      // "go to a spot": a new request sets a walking goal (the route is worked out below)
      const j = p.jump;
      if (j && j.key !== lastJump.current) { lastJump.current = j.key; walkGoal.current = { x: j.x, y: j.y }; route.current = []; }

      // walking
      if (!p.editing) {
        const k = keys.current;
        let v = inputVelocity(k.has('arrowleft') || k.has('a'), k.has('arrowright') || k.has('d'), k.has('arrowup') || k.has('w'), k.has('arrowdown') || k.has('s'));
        // automatic walking: toward a person being followed, or toward a spot. Any key press cancels.
        const pm = p.follow ? p.peers.current.get(p.follow) : undefined;
        const goal = p.follow
          ? pm ? { ...extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now()), stop: 1.5 } : null
          : walkGoal.current ? { ...walkGoal.current, stop: 0.3 } : null;
        if (goal || p.follow) {
          if (v.vx !== 0 || v.vy !== 0 || !goal) {
            // pressed a key, or the person we follow left
            walkGoal.current = null;
            route.current = [];
            if (p.follow) p.onFollowEnd();
          } else {
            const dist = Math.hypot(goal.x - me.x, goal.y - me.y);
            if (dist <= goal.stop) {
              route.current = [];
              autoStuck.current = null;
              if (!p.follow) walkGoal.current = null;
              else if (p.followOnce) p.onFollowEnd(); // "go to" a person: stop when we get there
            } else {
              if (!route.current.length || now - lastPlan.current > 500) {
                route.current = findPath(solid, me.x, me.y, goal.x, goal.y) ?? [];
                lastPlan.current = now;
              }
              while (route.current.length > 1 && Math.hypot(route.current[0].x - me.x, route.current[0].y - me.y) < 0.25) route.current.shift();
              const w = route.current[0] ?? goal;
              const dx = w.x - me.x;
              const dy = w.y - me.y;
              const d = Math.hypot(dx, dy) || 1;
              v = { vx: (dx / d) * WALK_SPEED, vy: (dy / d) * WALK_SPEED };
              // no real progress for a while: give up rather than push into a wall forever
              const st = autoStuck.current;
              if (!st || dist < st.d - 0.4) autoStuck.current = { t: now, d: dist };
              else if (now - st.t > 3000) {
                autoStuck.current = null;
                route.current = [];
                if (p.follow) p.onFollowEnd(); else walkGoal.current = null;
              }
            }
          }
        }
        me.vx = v.vx;
        me.vy = v.vy;
        const ease = 1 - Math.exp(-dt * 15);
        me.sx += (v.vx - me.sx) * ease;
        me.sy += (v.vy - me.sy) * ease;
        if (v.vx === 0 && Math.abs(me.sx) < 0.08) me.sx = 0;
        if (v.vy === 0 && Math.abs(me.sy) < 0.08) me.sy = 0;
        const np = advance(solid, me.x, me.y, me.sx, me.sy, dt);
        // a locked meeting room is a closed door: stay where we are (the page knocks for us)
        const nz = zoneAt(p.map, np.x, np.y);
        if (nz && nz.kind === 'meeting' && !p.canEnter(nz.id)) {
          const cz = zoneAt(p.map, me.x, me.y);
          if (!cz || cz.id !== nz.id) {
            np.x = me.x;
            np.y = me.y;
            p.onBlocked(nz);
            walkGoal.current = null;
            route.current = [];
          }
        }
        // if a wall stopped us completely, we are not really moving (so we send "stop", not a walk into a wall)
        const stuck = (v.vx !== 0 || v.vy !== 0) && np.x === me.x && np.y === me.y;
        me.x = np.x;
        me.y = np.y;
        me.dir = facing(v.vx, v.vy, me.dir);
        p.update({ x: me.x, y: me.y, vx: stuck ? 0 : v.vx, vy: stuck ? 0 : v.vy }, me.dir, now);
      } else {
        me.vx = 0;
        me.vy = 0;
        p.update({ x: me.x, y: me.y, vx: 0, vy: 0 }, me.dir, now);
      }

      // rooms and doors
      const z = zoneAt(p.map, me.x, me.y);
      const zid = z ? z.id : null;
      if (zid !== zoneId.current) {
        zoneId.current = zid;
        p.onZone(z);
      }
      if (z && z.kind === 'portal' && z.target && now > portalCooldown.current && !p.editing) {
        portalCooldown.current = now + 1500;
        p.onPortal(z.target);
      }

      // camera: follow me, but never show past the edges (centre the map if it is smaller than the window)
      const scale = p.zoom;
      const mapW = p.map.w * TILE * scale;
      const mapH = p.map.h * TILE * scale;
      let ox = w / 2 - me.x * TILE * scale;
      let oy = h / 2 - me.y * TILE * scale;
      ox = mapW <= w ? (w - mapW) / 2 : Math.min(0, Math.max(w - mapW, ox));
      oy = mapH <= h ? (h - mapH) / 2 : Math.min(0, Math.max(h - mapH, oy));
      cam.current = { ox, oy, scale };

      // draw
      const theme = { dark: p.dark };
      ctx.fillStyle = p.dark ? '#0b1020' : '#cbd5e1';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      try {
      drawFloor(ctx, p.map, theme, now);

      // people, with identity from the lobby; positions of others are worked out from their last message
      const who = new Map(p.roster.map((r) => [r.id, r]));
      const people: DrawPerson[] = [];
      for (const [id, pm] of p.peers.current) {
        const pos = extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now());
        const info = who.get(id);
        // only people the online list knows (so a duplicate or half-connected window is never drawn), never another window of me
        if (!info) continue;
        if (!p.showOwnTabs && info.uid === p.me.uid) continue;
        // someone who has walked into another office is not here any more (their last position is just stale)
        if (info.spaceId && info.spaceId !== p.spaceId) continue;
        people.push({
          x: pos.x, y: pos.y, dir: pm.dir, moving: (pm.vx !== 0 || pm.vy !== 0) && Date.now() - pm.at < 3000,
          name: info?.name ?? 'Someone', avatar: info?.avatar ?? defaultAvatar(id), isMe: false, bubble: p.bubbles.current.get(id), speaking: p.speaking.current.has(id), status: statusOf(info?.status)?.emoji,
        });
      }
      people.push({ x: me.x, y: me.y, dir: me.dir, moving: Math.hypot(me.sx, me.sy) > 0.25, name: p.me.name, avatar: p.me.avatar, isMe: true, bubble: p.bubbles.current.get(p.me.id), speaking: p.speaking.current.has(''), status: statusOf(who.get(p.me.id)?.status)?.emoji });

      // items and people drawn together so someone walking behind a desk is hidden by it
      const sortedItems = [...p.items].sort((a, b) => depth(a) - depth(b));
      const rugs = sortedItems.filter((i) => i.t === 'rug');
      drawItems(ctx, rugs, theme, now);
      drawWalls(ctx, p.map, theme, now);
      const rest = sortedItems.filter((i) => i.t !== 'rug');
      const sortedPeople = [...people].sort((a, b) => a.y - b.y);
      let pi = 0;
      for (const it of rest) {
        // anyone whose feet are above the middle of this piece is behind it, so they are drawn first
        while (pi < sortedPeople.length && sortedPeople[pi].y < depth(it) - 0.5) {
          drawPerson(ctx, sortedPeople[pi], now, theme);
          pi += 1;
        }
        drawItems(ctx, [it], theme, now);
      }
      for (; pi < sortedPeople.length; pi++) drawPerson(ctx, sortedPeople[pi], now, theme);

      drawLighting(ctx, p.map, p.items, theme, now);
      drawZoneLabels(ctx, p.map.zones, theme);

      // edit mode: grid, the build area and a preview of what is about to be placed
      if (p.editing) {
        const b = p.map.buildArea;
        ctx.strokeStyle = 'rgba(99,102,241,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = b.x; x <= b.x + b.w; x++) { ctx.moveTo(x * TILE, b.y * TILE); ctx.lineTo(x * TILE, (b.y + b.h) * TILE); }
        for (let y = b.y; y <= b.y + b.h; y++) { ctx.moveTo(b.x * TILE, y * TILE); ctx.lineTo((b.x + b.w) * TILE, y * TILE); }
        ctx.stroke();
        const hv = hover.current;
        if (hv && p.tool) {
          const res = p.ghost(hv);
          ctx.fillStyle = p.tool === 'erase' ? 'rgba(239,68,68,0.35)' : res.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';
          ctx.fillRect(hv.x * TILE, hv.y * TILE, TILE, TILE);
        }
      }
      } catch (err) {
        if (!drawFailed.current) { drawFailed.current = true; console.error('office draw failed', err); }
      }
      ctx.restore();
      drawVignette(ctx, w, h, p.dark);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('click', click);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none outline-none" style={{ cursor: props.editing ? 'crosshair' : 'default' }} />;
}
