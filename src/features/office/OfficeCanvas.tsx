import { useEffect, useRef } from 'react';
import type { AvatarStyle, Item, ItemType, MapDef, Zone } from './world/types';
import { INTERACTIVE, ITEM_DEFS, isRoom, itemSize, nearestInteractive, WALK_SPEED, advance, buildSolid, extrapolate, facing, findPath, inputVelocity, zoneAt } from './world/world';
import { TILE, defaultAvatar, depth, drawBall, drawFloor, drawItems, officePets, drawLighting, drawPerson, drawVignette, drawWalls, drawZoneLabels, type DrawPerson } from './world/render';
import type { PeerMotion, Who } from './useOffice';
import type { Motion } from './world/netSync';
import { statusOf } from './status';
import { drawGroundWeather, drawSky } from './world/skyfx';
import { lightning, rainLevel, seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { ambient } from './ambient';
import { applyPetCmd, initPet, petBus, petRegistry, stepPet, type PetState } from './world/pets';

import type { EditTool } from './EditorPanel';
export type { EditTool };

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
  /** a click (not a drag) on the map outside edit mode */
  onMapClick: (tile: { x: number; y: number }) => void;
  /** the pointer rests on someone (null when it leaves them) */
  onHoverPerson: (h: { personId: string; isMe: boolean; cx: number; cy: number; near: boolean } | null) => void;
  /** right-click: where, which tile, and the person under the pointer (if any) */
  onContext: (c: { cx: number; cy: number; wx: number; wy: number; personId: string | null; isMe: boolean }) => void;
  /** while editing, the rectangle that can be changed (an owner may only change their own office) */
  editArea: { x: number; y: number; w: number; h: number } | null;
  /** a counter: when it changes the view returns to my avatar */
  recenter: number;
  /** size of the video bubbles over people (1 is normal) */
  bubbleScale: number;
  /** ambient sound (water, fire, footsteps) on or off */
  sound: boolean;
  /** the hour (auto follows Lagos time) and the season (auto follows the Nigerian calendar) */
  timeMode: TimeMode;
  seasonMode: SeasonMode;
  /** the thing you are standing next to that you can press F on (null when none) */
  onNear: (item: Item | null) => void;
  /** F pressed (or the thing clicked): open it */
  onInteract: (item: Item) => void;
  /** emoji reactions floating over people, by person id */
  emotes: React.MutableRefObject<Map<string, { e: string; until: number }>>;
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
  const zoomShown = useRef(props.zoom);
  /** how far the view has been dragged away from following me, in pixels */
  const pan = useRef({ x: 0, y: 0 });
  useEffect(() => { pan.current = { x: 0, y: 0 }; }, [props.recenter]);
  const drawFailed = useRef(false);
  const walkGoal = useRef<{ x: number; y: number } | null>(null);
  const route = useRef<{ x: number; y: number }[]>([]);
  const lastPlan = useRef(0);
  const autoStuck = useRef<{ t: number; d: number } | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const cam = useRef({ ox: 0, oy: 0, scale: 1 });

  useEffect(() => {
    ambient.setEnabled(props.sound);
  }, [props.sound]);
  useEffect(() => () => ambient.stop(), []);

  // a new office: start at its entrance, except when you open or refresh the page, then you are back where you last stood
  const nearRef = useRef<Item | null>(null);
  const petFx = useRef<{ x: number; y: number; born: number; e: string }[]>([]);
  const lastBolt = useRef(-1);
  const firstEnter = useRef(true);
  const lastSaved = useRef(0);
  useEffect(() => {
    let start = { x: props.map.spawn.x, y: props.map.spawn.y };
    if (firstEnter.current) {
      try {
        const saved = JSON.parse(localStorage.getItem('kd:office:pos:' + props.spaceId) ?? 'null') as { x: number; y: number; t: number } | null;
        if (saved && Date.now() - saved.t < 7 * 24 * 3600_000 && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          const solid = buildSolid(props.map, props.items);
          const cx = Math.floor(saved.x);
          const cy = Math.floor(saved.y);
          if (cy >= 0 && cy < solid.length && cx >= 0 && cx < (solid[0]?.length ?? 0) && !solid[cy][cx]) start = { x: saved.x, y: saved.y };
        }
      } catch { /* start at the entrance */ }
    }
    firstEnter.current = false;
    meRef.current = { x: start.x, y: start.y, dir: 0, vx: 0, vy: 0, sx: 0, sy: 0 };
    zoneId.current = '__none__';
    portalCooldown.current = performance.now() + 800; // do not bounce straight back through the door we just used
  }, [props.spaceId]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      ambient.resume();
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && nearRef.current && !propsRef.current.editing) { e.preventDefault(); propsRef.current.onInteract(nearRef.current); return; }
      if (k === 'shift') { keys.current.add('shift'); return; }
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
    const drag = { down: false, moved: false, sx: 0, sy: 0, px: 0, py: 0 };
    const painting = () => { const t = propsRef.current.tool; return propsRef.current.editing && (t === 'wall' || t === 'unwall' || t === 'floor'); };
    let lastPaint = '';
    const hoverId = { current: null as string | null };
    const personAt = (e: MouseEvent) => {
      const p = propsRef.current;
      const r = canvas.getBoundingClientRect();
      const { ox, oy, scale } = cam.current;
      const wx = (e.clientX - r.left - ox) / (TILE * scale);
      const wy = (e.clientY - r.top - oy) / (TILE * scale);
      const solid = buildSolid(p.map, p.items);
      const who = new Map(p.roster.map((q) => [q.id, q]));
      const m = meRef.current;
      let best: { id: string; isMe: boolean; d: number; x: number; y: number } | null = null;
      const consider = (id: string, isMe: boolean, x: number, y: number) => {
        const dx = wx - x;
        const dy = wy - (y - 0.6);
        if (Math.abs(dx) > 0.6 || dy < -1 || dy > 0.9) return;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { id, isMe, d, x, y };
      };
      for (const [id, pm] of p.peers.current) {
        const info = who.get(id);
        if (!info || (!p.showOwnTabs && info.uid === p.me.uid) || (info.spaceId && info.spaceId !== p.spaceId)) continue;
        const pos = extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now());
        consider(id, false, pos.x, pos.y);
      }
      consider(p.me.id, true, m.x, m.y);
      const hit = best as { id: string; isMe: boolean; x: number; y: number } | null;
      return hit ? { id: hit.id, isMe: hit.isMe, near: Math.hypot(hit.x - m.x, hit.y - m.y) <= 8, headX: r.left + ox + hit.x * TILE * scale, headY: r.top + oy + (hit.y - 1.6) * TILE * scale } : null;
    };
    const move = (e: MouseEvent) => {
      if (!propsRef.current.editing && !drag.down) {
        const h = personAt(e);
        const id = h ? h.id : null;
        if (id !== hoverId.current) {
          hoverId.current = id;
          propsRef.current.onHoverPerson(h ? { personId: h.id, isMe: h.isMe, cx: h.headX, cy: h.headY, near: h.near } : null);
        }
      }
      hover.current = toTile(e);
      if (!drag.down) return;
      if (painting()) {
        const t = toTile(e);
        const key = `${t.x},${t.y}`;
        if (key !== lastPaint) { lastPaint = key; propsRef.current.onTile(t); }
        return;
      }
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved && !propsRef.current.editing) pan.current = { x: drag.px + dx, y: drag.py + dy };
    };
    const down = (e: MouseEvent) => {
      ambient.resume();
      if (e.button !== 0) return;
      drag.down = true;
      drag.moved = false;
      drag.sx = e.clientX;
      drag.sy = e.clientY;
      drag.px = pan.current.x;
      drag.py = pan.current.y;
      if (painting()) { const t = toTile(e); lastPaint = `${t.x},${t.y}`; propsRef.current.onTile(t); }
    };
    const petAt = (e: MouseEvent): PetState | null => {
      const r = canvas.getBoundingClientRect();
      const { ox, oy, scale } = cam.current;
      const wx = (e.clientX - r.left - ox) / (TILE * scale);
      const wy = (e.clientY - r.top - oy) / (TILE * scale);
      let best: PetState | null = null;
      let bd = 0.75;
      for (const pet of petRegistry.values()) {
        const d = Math.hypot(wx - pet.x, wy - (pet.y - 0.3));
        if (d < bd) { best = pet; bd = d; }
      }
      return best;
    };
    const up = (e: MouseEvent) => {
      if (!drag.down) return;
      drag.down = false;
      if (drag.moved || painting()) return;
      if (!propsRef.current.editing) {
        const pet = petAt(e);
        if (pet) { petBus.queue.push({ kind: pet.mode === 'follow' ? 'stay' : 'call', id: pet.id }); return; }
      }
      if (propsRef.current.editing) propsRef.current.onTile(toTile(e));
      else propsRef.current.onMapClick(toTile(e));
    };
    const dbl = () => { pan.current = { x: 0, y: 0 }; };
    const ctxMenu = (e: MouseEvent) => {
      e.preventDefault();
      const p = propsRef.current;
      if (p.editing) return;
      const r = canvas.getBoundingClientRect();
      const { ox, oy, scale } = cam.current;
      const wx = (e.clientX - r.left - ox) / (TILE * scale);
      const wy = (e.clientY - r.top - oy) / (TILE * scale);
      const solid = buildSolid(p.map, p.items);
      const who = new Map(p.roster.map((q) => [q.id, q]));
      let best: { id: string; isMe: boolean; d: number } | null = null;
      const consider = (id: string, isMe: boolean, x: number, y: number) => {
        const dx = wx - x;
        const dy = wy - (y - 0.6);
        if (Math.abs(dx) > 0.6 || dy < -1 || dy > 0.9) return;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { id, isMe, d };
      };
      for (const [id, pm] of p.peers.current) {
        const info = who.get(id);
        if (!info || (!p.showOwnTabs && info.uid === p.me.uid) || (info.spaceId && info.spaceId !== p.spaceId)) continue;
        const pos = extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now());
        consider(id, false, pos.x, pos.y);
      }
      const m = meRef.current;
      consider(p.me.id, true, m.x, m.y);
      const hit = best as { id: string; isMe: boolean } | null;
      const pet = petAt(e);
      p.onContext({ cx: e.clientX, cy: e.clientY, wx, wy, personId: pet ? 'pet:' + pet.id : hit ? hit.id : null, isMe: !pet && !!hit && hit.isMe });
    };
    const leave = () => { hover.current = null; drag.down = false; if (hoverId.current) { hoverId.current = null; propsRef.current.onHoverPerson(null); } };
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseleave', leave);
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('dblclick', dbl);
    canvas.addEventListener('contextmenu', ctxMenu);

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
        if (nz && isRoom(nz) && !p.canEnter(nz.id)) {
          const cz = zoneAt(p.map, me.x, me.y);
          if (!cz || cz.id !== nz.id) {
            np.x = me.x;
            np.y = me.y;
            p.onBlocked(nz);
            walkGoal.current = null;
            route.current = [];
          }
        }
        // people are solid: you cannot walk through someone (hold Shift to slip through them)
        if (!k.has('shift') && (np.x !== me.x || np.y !== me.y)) {
          const who = new Map(p.roster.map((q) => [q.id, q]));
          const bodies: { x: number; y: number }[] = [];
          for (const [id, pm] of p.peers.current) {
            const info = who.get(id);
            if (!info || info.uid === p.me.uid || (info.spaceId && info.spaceId !== p.spaceId)) continue;
            bodies.push(extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now()));
          }
          const R = 0.8;
          const blockedAt = (x: number, y: number) => bodies.some((q) => {
            const dn = Math.hypot(x - q.x, y - q.y);
            return dn < R && dn < Math.hypot(me.x - q.x, me.y - q.y);
          });
          if (blockedAt(np.x, np.y)) {
            if (!blockedAt(np.x, me.y)) np.y = me.y;
            else if (!blockedAt(me.x, np.y)) np.x = me.x;
            else { np.x = me.x; np.y = me.y; }
          }
        }
        // if a wall stopped us completely, we are not really moving (so we send "stop", not a walk into a wall)
        const stuck = (v.vx !== 0 || v.vy !== 0) && np.x === me.x && np.y === me.y;
        me.x = np.x;
        me.y = np.y;
        me.dir = facing(v.vx, v.vy, me.dir);
        ambient.update({ x: me.x, y: me.y }, p.items, Math.hypot(me.sx, me.sy) > 0.25, now);
        if (now - lastSaved.current > 1500) {
          lastSaved.current = now;
          try { localStorage.setItem('kd:office:pos:' + p.spaceId, JSON.stringify({ x: me.x, y: me.y, t: Date.now() })); } catch { /* fine */ }
        }
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
      // the zoom glides to its new value instead of jumping
      zoomShown.current += (p.zoom - zoomShown.current) * (1 - Math.exp(-dt * 9));
      const scale = zoomShown.current;
      const mapW = p.map.w * TILE * scale;
      const mapH = p.map.h * TILE * scale;
      // follow me, plus however far the view was dragged, with a few tiles of room past every edge (so the rooms along the edge can be seen)
      const pad = TILE * scale * 4;
      let ox = w / 2 - me.x * TILE * scale + pan.current.x;
      let oy = h / 2 - me.y * TILE * scale + pan.current.y;
      ox = mapW + 2 * pad <= w ? (w - mapW) / 2 : Math.min(pad, Math.max(w - mapW - pad, ox));
      oy = mapH + 2 * pad <= h ? (h - mapH) / 2 : Math.min(pad, Math.max(h - mapH - pad, oy));
      cam.current = { ox, oy, scale };

      // draw
      // the office pets: each one wanders, follows, fetches and reacts to you
      {
        const living = new Set<string>();
        for (const it of p.items) {
          if (it.t !== 'dog' && it.t !== 'cat') continue;
          living.add(it.id);
          if (!petRegistry.has(it.id)) petRegistry.set(it.id, initPet(it.id, it.t, it.x, it.y));
        }
        for (const id of [...petRegistry.keys()]) if (!living.has(id)) { petRegistry.delete(id); officePets.delete(id); }
        for (const cmd of petBus.queue.splice(0)) {
          const pet = petRegistry.get(cmd.id);
          if (!pet) continue;
          const res = applyPetCmd(pet, cmd, now, { x: me.x, y: me.y, dir: me.dir }, solid);
          if (res.hearts) petFx.current.push({ x: pet.x, y: pet.y - 1.2, born: now, e: cmd.kind === 'treat' ? '🦴' : '❤️' });
          if (res.sound) ambient.pet(pet.kind, res.sound);
        }
        for (const pet of petRegistry.values()) {
          const was = pet.happyUntil;
          stepPet(pet, dt, now, { x: me.x, y: me.y }, solid, Math.random);
          if (pet.happyUntil > was && pet.mode === 'wander') petFx.current.push({ x: pet.x, y: pet.y - 1.2, born: now, e: '❤️' });
          officePets.set(pet.id, { x: pet.x, y: pet.y, face: pet.face, moving: pet.moving, carrying: pet.carrying, awake: pet.kind === 'cat' ? pet.moving || pet.mode !== 'wander' || pet.happyUntil > now : true });
        }
      }
      const theme = { dark: p.dark };
      ctx.fillStyle = p.dark ? '#0b1020' : '#cbd5e1';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      try {
      drawFloor(ctx, p.map, theme, now);
      {
        const seasonNow = seasonFor(p.seasonMode, Date.now());
        drawGroundWeather(ctx, p.map, seasonNow, rainLevel(seasonNow, Date.now()), now);
      }

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
          name: info?.name ?? 'Someone', avatar: info?.avatar ?? defaultAvatar(id), isMe: false, id, bubbleScale: p.bubbleScale, bubble: p.bubbles.current.get(id), speaking: p.speaking.current.has(id), status: statusOf(info?.status)?.emoji,
        });
      }
      people.push({ x: me.x, y: me.y, dir: me.dir, moving: Math.hypot(me.sx, me.sy) > 0.25, name: p.me.name, avatar: p.me.avatar, isMe: true, id: p.me.id, bubbleScale: p.bubbleScale, bubble: p.bubbles.current.get(p.me.id), speaking: p.speaking.current.has(''), status: statusOf(who.get(p.me.id)?.status)?.emoji });

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

      // emoji reactions float up above the person and fade
      const nowMs = Date.now();
      for (const sp of sortedPeople) {
        const em = sp.id ? p.emotes.current.get(sp.id) : undefined;
        if (!em || em.until < nowMs) continue;
        const age = 1 - (em.until - nowMs) / 3500;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - age) * 3);
        ctx.font = '26px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(em.e, sp.x * TILE + Math.sin(age * 9) * 3, sp.y * TILE - 56 - age * 34);
        ctx.restore();
      }

      for (const pet of petRegistry.values() as Iterable<PetState>) if (pet.ball) drawBall(ctx, pet.ball, now);
      petFx.current = petFx.current.filter((f) => now - f.born < 1500);
      for (const f of petFx.current) {
        const age = (now - f.born) / 1500;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.font = '18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.e, f.x * TILE + Math.sin(age * 8) * 4, f.y * TILE - age * 34);
        ctx.restore();
      }

      // something to press F on? show a little prompt over it
      const nearIt = p.editing ? null : nearestInteractive(p.items, me.x, me.y);
      if ((nearIt?.id ?? null) !== (nearRef.current?.id ?? null)) { nearRef.current = nearIt; p.onNear(nearIt); }
      if (nearIt) {
        const sz = itemSize(nearIt);
        const label = INTERACTIVE[nearIt.t] ?? ITEM_DEFS[nearIt.t].label;
        ctx.font = '700 11px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 34;
        const cx0 = (nearIt.x + sz.w / 2) * TILE;
        const cy0 = (nearIt.y + sz.h) * TILE + 16 + Math.sin(now / 280) * 2;
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.beginPath();
        ctx.roundRect(cx0 - tw / 2, cy0 - 11, tw, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(cx0 - tw / 2 + 4, cy0 - 7, 15, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F', cx0 - tw / 2 + 11.5, cy0 + 0.5);
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText(label, cx0 - tw / 2 + 24, cy0 + 0.5);
      }

      drawLighting(ctx, p.map, p.items, theme, now);
      drawZoneLabels(ctx, p.map.zones, theme);

      // edit mode: grid, the build area and a preview of what is about to be placed
      if (p.editing) {
        const b = p.editArea ?? p.map.buildArea;
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
      {
        const wall = Date.now();
        const sky = skyState(p.timeMode, wall);
        const season = seasonFor(p.seasonMode, wall);
        const rain = rainLevel(season, wall);
        const bolt = lightning(rain, wall);
        if (bolt.id !== lastBolt.current) {
          if (bolt.id >= 0) ambient.thunder();
          lastBolt.current = bolt.id;
        }
        ambient.setWeather(rain, season === 'harmattan' ? 1 : 0);
        drawSky(ctx, w, h, sky, season, rain, bolt.strength, now);
      }
      drawVignette(ctx, w, h, p.dark);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('dblclick', dbl);
      canvas.removeEventListener('contextmenu', ctxMenu);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none outline-none" style={{ cursor: props.editing ? 'crosshair' : 'grab' }} />;
}
