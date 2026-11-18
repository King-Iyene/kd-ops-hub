import { useEffect, useRef } from 'react';
import type { AvatarStyle, Item, ItemType, MapDef, Zone } from './world/types';
import { advance, buildSolid, extrapolate, facing, inputVelocity, zoneAt } from './world/world';
import { TILE, defaultAvatar, depth, drawFloor, drawItems, drawPerson, drawWalls, drawZoneLabels, type DrawPerson } from './world/render';
import type { PeerMotion, Who } from './useOffice';
import type { Motion } from './world/netSync';

export type EditTool = ItemType | 'erase' | null;

interface Props {
  map: MapDef;
  items: Item[];
  me: { id: string; name: string; avatar: AvatarStyle };
  roster: Who[];
  peers: React.MutableRefObject<Map<string, PeerMotion>>;
  update: (m: Motion, dir: 0 | 1 | 2 | 3, now: number) => void;
  onZone: (zone: Zone | null) => void;
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
  const meRef = useRef({ x: props.map.spawn.x, y: props.map.spawn.y, dir: 0 as 0 | 1 | 2 | 3, vx: 0, vy: 0 });
  const keys = useRef(new Set<string>());
  const zoneId = useRef<string | null>('__none__');
  const portalCooldown = useRef(0);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const cam = useRef({ ox: 0, oy: 0, scale: 1 });

  // a new office: start at its entrance
  useEffect(() => {
    meRef.current = { x: props.map.spawn.x, y: props.map.spawn.y, dir: 0, vx: 0, vy: 0 };
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

      // walking
      if (!p.editing) {
        const k = keys.current;
        const v = inputVelocity(k.has('arrowleft') || k.has('a'), k.has('arrowright') || k.has('d'), k.has('arrowup') || k.has('w'), k.has('arrowdown') || k.has('s'));
        me.vx = v.vx;
        me.vy = v.vy;
        const np = advance(solid, me.x, me.y, v.vx, v.vy, dt);
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
      drawFloor(ctx, p.map, theme);

      // people, with identity from the lobby; positions of others are worked out from their last message
      const who = new Map(p.roster.map((r) => [r.id, r]));
      const people: DrawPerson[] = [];
      for (const [id, pm] of p.peers.current) {
        const pos = extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now());
        const info = who.get(id);
        people.push({
          x: pos.x, y: pos.y, dir: pm.dir, moving: (pm.vx !== 0 || pm.vy !== 0) && Date.now() - pm.at < 3000,
          name: info?.name ?? 'Someone', avatar: info?.avatar ?? defaultAvatar(id), isMe: false,
        });
      }
      people.push({ x: me.x, y: me.y, dir: me.dir, moving: me.vx !== 0 || me.vy !== 0, name: p.me.name, avatar: p.me.avatar, isMe: true });

      // items and people drawn together so someone walking behind a desk is hidden by it
      const sortedItems = [...p.items].sort((a, b) => depth(a) - depth(b));
      const rugs = sortedItems.filter((i) => i.t === 'rug');
      drawItems(ctx, rugs, theme);
      drawWalls(ctx, p.map, theme);
      const rest = sortedItems.filter((i) => i.t !== 'rug');
      const sortedPeople = [...people].sort((a, b) => a.y - b.y);
      let pi = 0;
      for (const it of rest) {
        // anyone whose feet are above the middle of this piece is behind it, so they are drawn first
        while (pi < sortedPeople.length && sortedPeople[pi].y < depth(it) - 0.5) {
          drawPerson(ctx, sortedPeople[pi], now, theme);
          pi += 1;
        }
        drawItems(ctx, [it], theme);
      }
      for (; pi < sortedPeople.length; pi++) drawPerson(ctx, sortedPeople[pi], now, theme);

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
      ctx.restore();
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
