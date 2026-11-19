import { useEffect, useRef } from 'react';
import type { AvatarStyle, Item, ItemType, MapDef, Zone } from './world/types';
import { INTERACTIVE, SEAT_TYPES, seatAt, ITEM_DEFS, RIDE_SPEED, isRoom, itemSize, nearestInteractive, WALK_SPEED, advance, buildSolid, extrapolate, facing, findPath, inputVelocity, zoneAt } from './world/world';
import { TILE, defaultAvatar, depth, drawBall, drawFloor, drawItems, officePets, drawLighting, drawPerson, drawVignette, drawWalls, drawZoneLabels, type DrawPerson } from './world/render';
import type { PeerMotion, Who } from './useOffice';
import type { Motion } from './world/netSync';
import { statusOf } from './status';
import { drawBirds, drawGroundWeather, drawSky } from './world/skyfx';
import { lightning, rainFor, seasonFor, skyState, type SeasonMode, type TimeMode } from './world/sky';
import { ambient } from './ambient';
import { applyPetCmd, initPet, petBus, petRegistry, playTick, stepPet, type PetState } from './world/pets';

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
  /** the pointer rests on an office or a seat (null when it leaves) */
  onHoverZone: (h: { zoneId: string; cx: number; cy: number } | null) => void;
  /** the map's canvas, so a recording can film it */
  canvasEl?: React.MutableRefObject<HTMLCanvasElement | null>;
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
  /** pinch to zoom: multiply the zoom by this */
  onZoomBy: (factor: number) => void;
  /** walk to a spot (a double click, or a tap on a phone) */
  onWalkTo: (x: number, y: number) => void;
  /** I am on a power bike, and getting on or off */
  riding: boolean;
  /** which kind of vehicle each vehicle item is, and the one I am on */
  vehicleKinds?: Record<string, 'bike' | 'kart'>;
  rideKind?: 'bike' | 'kart';
  /** pos is where you are when you get off, so the vehicle stays there */
  onRide: (on: boolean, bikeId?: string, pos?: { x: number; y: number; dir: number }) => void;
  /** emoji reactions floating over people, by person id */
  emotes: React.MutableRefObject<Map<string, { e: string; until: number }>>;
  onPortal: (target: 'team' | 'mine') => void;
  dark: boolean;
  zoom: number;
  /** edit mode: walking is off and clicks place or remove furniture */
  editing: boolean;
  tool: EditTool;
  ghost: (tile: { x: number; y: number }) => { ok: boolean };
  /** furniture picked up with the Move tool (drawn following the pointer) */
  held?: { item: Item; dx: number; dy: number } | null;
  onTile: (tile: { x: number; y: number }) => void;
}

/** puffs of smoke left behind bikes (shared by every rider on screen) */
const smoke: { x: number; y: number; t: number; r: number; dust?: boolean }[] = [];
const smokeAt = new Map<string, number>();
/** a ring that spreads from the spot you clicked to walk to */
const ripples: { x: number; y: number; t: number }[] = [];

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
  const pulseAt = useRef(-1e9);
  // "find me": bring the view back to my avatar and show where it is
  useEffect(() => { pan.current = { x: 0, y: 0 }; if (props.recenter > 0) pulseAt.current = performance.now(); }, [props.recenter]);
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
  /** the seat I am sitting on (its tile centre), and a seat I am walking to */
  const sitRef = useRef<{ x: number; y: number } | null>(null);
  const wantSit = useRef<string | null>(null);
  const standRef = useRef<() => void>(() => undefined);
  const sitRef2 = useRef<(item: Item, tile?: { x: number; y: number }) => void>(() => undefined);
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
      if (k === 'f' && !propsRef.current.editing) {
        if (sitRef.current) { e.preventDefault(); standRef.current(); return; }
        if (propsRef.current.riding) { e.preventDefault(); propsRef.current.onRide(false, undefined, { x: meRef.current.x, y: meRef.current.y, dir: meRef.current.dir }); return; }
        const near = nearRef.current;
        if (near) { e.preventDefault(); if (near.t === 'bike' || near.t === 'kart') propsRef.current.onRide(true, near.id); else if (SEAT_TYPES.includes(near.t)) sitRef2.current(near); else propsRef.current.onInteract(near); return; }
      }
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
    if (propsRef.current.canvasEl) propsRef.current.canvasEl.current = canvas;
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
    // after you let go of a drag the map keeps gliding for a moment, then eases to a stop
    const inertia = { x: 0, y: 0 };
    const setCursor = (c: string) => { if (canvas.style.cursor !== c) canvas.style.cursor = c; };
    const painting = () => { const t = propsRef.current.tool; return propsRef.current.editing && (t === 'wall' || t === 'unwall' || t === 'floor'); };
    let lastPaint = '';
    const hoverId = { current: null as string | null };
    const hoverZoneId = { current: null as string | null };
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
    const move = (e: MouseEvent) => {
      if (!propsRef.current.editing && !drag.down) {
        const h = personAt(e);
        const hadHover = hoverId.current !== null;
        hoverId.current = h ? h.id : null;
        // while the pointer is on someone, keep telling the page where it is, so their card appears right by it
        if (h) propsRef.current.onHoverPerson({ personId: h.id, isMe: h.isMe, cx: e.clientX, cy: e.clientY, near: h.near });
        else if (hadHover) propsRef.current.onHoverPerson(null);
        // an office or a seat under the pointer (but never while someone is being hovered)
        let zid: string | null = null;
        if (!h) {
          const r = canvas.getBoundingClientRect();
          const { ox, oy, scale } = cam.current;
          const z = zoneAt(propsRef.current.map, (e.clientX - r.left - ox) / (TILE * scale), (e.clientY - r.top - oy) / (TILE * scale));
          if (z && z.kind === 'office') zid = z.id;
        }
        // while over an office or seat, keep telling the page where the pointer is, so the card appears right by it
        if (zid) propsRef.current.onHoverZone({ zoneId: zid, cx: e.clientX, cy: e.clientY });
        else if (hoverZoneId.current) propsRef.current.onHoverZone(null);
        hoverZoneId.current = zid;
      }
      hover.current = toTile(e);
      if (!drag.down) {
        if (propsRef.current.editing) setCursor('crosshair');
        else {
          const t = hover.current;
          const onItem = propsRef.current.items.some((i) => INTERACTIVE[i.t] && t.x >= i.x && t.y >= i.y && t.x < i.x + itemSize(i).w && t.y < i.y + itemSize(i).h);
          setCursor(hoverId.current || hoverZoneId.current || onItem || petAt(e) ? 'pointer' : 'grab');
        }
        return;
      }
      if (painting()) {
        const t = toTile(e);
        const key = `${t.x},${t.y}`;
        if (key !== lastPaint) { lastPaint = key; propsRef.current.onTile(t); }
        return;
      }
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved && !propsRef.current.editing) {
        const nx = drag.px + dx, ny = drag.py + dy;
        inertia.x = inertia.x * 0.5 + (nx - pan.current.x) * 0.5;
        inertia.y = inertia.y * 0.5 + (ny - pan.current.y) * 0.5;
        pan.current = { x: nx, y: ny };
        setCursor('grabbing');
      }
    };
    const down = (e: MouseEvent) => {
      ambient.resume();
      if (e.button !== 0) return;
      drag.down = true;
      drag.moved = false;
      inertia.x = 0; inertia.y = 0;
      drag.sx = e.clientX;
      drag.sy = e.clientY;
      drag.px = pan.current.x;
      drag.py = pan.current.y;
      if (painting()) { const t = toTile(e); lastPaint = `${t.x},${t.y}`; propsRef.current.onTile(t); }
    };
    const up = (e: MouseEvent) => {
      if (!drag.down) return;
      drag.down = false;
      if (propsRef.current.editing) setCursor('crosshair'); else setCursor('grab');
      if (!drag.moved) { inertia.x = 0; inertia.y = 0; }
      if (drag.moved || painting()) return;
      if (!propsRef.current.editing) {
        const pet = petAt(e);
        if (pet) { petBus.queue.push({ kind: pet.mode === 'follow' ? 'stay' : 'call', id: pet.id }); return; }
      }
      if (propsRef.current.editing) propsRef.current.onTile(toTile(e));
      else propsRef.current.onMapClick(toTile(e));
    };
    const dbl = (e: MouseEvent) => {
      pan.current = { x: 0, y: 0 };
      if (propsRef.current.editing) return;
      const t = toTile(e);
      propsRef.current.onWalkTo(t.x + 0.5, t.y + 0.5);
    };
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
    const leave = () => { hover.current = null; drag.down = false; if (hoverId.current) { hoverId.current = null; propsRef.current.onHoverPerson(null); } if (hoverZoneId.current) { hoverZoneId.current = null; propsRef.current.onHoverZone(null); } };
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseleave', leave);
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mouseup', up);
    // touch: drag to pan, pinch to zoom, tap to walk or open things, press and hold for the menu
    const pseudo = (x: number, y: number) => ({ clientX: x, clientY: y, preventDefault() { /* nothing to cancel */ } }) as unknown as MouseEvent;
    let touch: { x: number; y: number; px: number; py: number; moved: boolean; timer: number | null } | null = null;
    let pinch: number | null = null;
    const pinchDist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const tap = (cx: number, cy: number) => {
      const p = propsRef.current;
      const e = pseudo(cx, cy);
      const tile = toTile(e);
      if (p.editing) { p.onTile(tile); return; }
      const pet = petAt(e);
      if (pet) { petBus.queue.push({ kind: pet.mode === 'follow' ? 'stay' : 'call', id: pet.id }); return; }
      const who = personAt(e);
      if (who) { p.onHoverPerson({ personId: who.id, isMe: who.isMe, cx, cy, near: who.near }); return; }
      p.onHoverPerson(null);
      const item = p.items.find((i) => INTERACTIVE[i.t] && tile.x >= i.x && tile.y >= i.y && tile.x < i.x + itemSize(i).w && tile.y < i.y + itemSize(i).h);
      if (item) {
        if (SEAT_TYPES.includes(item.t)) { sitRef2.current(item, tile); return; }
        if (item.t !== 'bike' && item.t !== 'kart') { p.onMapClick(tile); return; }
        const m = meRef.current;
        if (Math.hypot(item.x + 0.5 - m.x, item.y + 0.5 - m.y) < 3) p.onRide(!p.riding, item.id, { x: m.x, y: m.y, dir: m.dir }); else p.onWalkTo(item.x + 0.5, item.y + 1.5);
        return;
      }
      const r = canvas.getBoundingClientRect();
      const { ox, oy, scale } = cam.current;
      const z = zoneAt(p.map, (cx - r.left - ox) / (TILE * scale), (cy - r.top - oy) / (TILE * scale));
      if (z && z.kind === 'office') { p.onHoverZone({ zoneId: z.id, cx, cy }); return; }
      p.onHoverZone(null);
      ripples.push({ x: tile.x + 0.5, y: tile.y + 0.5, t: performance.now() });
      p.onWalkTo(tile.x + 0.5, tile.y + 0.5);
    };
    const tStart = (e: TouchEvent) => {
      ambient.resume();
      if (e.touches.length === 2) {
        pinch = pinchDist(e);
        if (touch?.timer) window.clearTimeout(touch.timer);
        touch = null;
        return;
      }
      const t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, px: pan.current.x, py: pan.current.y, moved: false, timer: null };
      touch.timer = window.setTimeout(() => {
        if (touch && !touch.moved) { const held = touch; touch = null; ctxMenu(pseudo(held.x, held.y)); }
      }, 550);
    };
    const tMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && pinch) {
        const d = pinchDist(e);
        propsRef.current.onZoomBy(d / pinch);
        pinch = d;
        return;
      }
      if (!touch) return;
      const t = e.touches[0];
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      if (Math.abs(dx) + Math.abs(dy) > 10) { touch.moved = true; if (touch.timer) window.clearTimeout(touch.timer); }
      if (touch.moved && !propsRef.current.editing) pan.current = { x: touch.px + dx, y: touch.py + dy };
    };
    const tEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length < 2) pinch = null;
      if (!touch) return;
      const t = touch;
      touch = null;
      if (t.timer) window.clearTimeout(t.timer);
      if (!t.moved) tap(t.x, t.y);
    };
    canvas.addEventListener('touchstart', tStart, { passive: false });
    canvas.addEventListener('touchmove', tMove, { passive: false });
    canvas.addEventListener('touchend', tEnd, { passive: false });
    canvas.addEventListener('touchcancel', tEnd, { passive: false });
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
        // sitting: helpers that need this frame's walls and people
        const peerBodies = () => {
          const who2 = new Map(p.roster.map((q) => [q.id, q]));
          const out: { x: number; y: number }[] = [];
          for (const [id, pm] of p.peers.current) {
            const info = who2.get(id);
            if (!info || info.uid === p.me.uid || (info.spaceId && info.spaceId !== p.spaceId)) continue;
            out.push(extrapolate(solid, { x: pm.x, y: pm.y, vx: pm.vx, vy: pm.vy, at: pm.at }, Date.now()));
          }
          return out;
        };
        standRef.current = () => {
          const s0 = sitRef.current;
          if (!s0) return;
          const bodies = peerBodies();
          const order: [number, number][] = me.dir === 3 ? [[0, -1], [1, 0], [-1, 0], [0, 1]] : me.dir === 1 ? [[-1, 0], [0, 1], [0, -1], [1, 0]] : me.dir === 2 ? [[1, 0], [0, 1], [0, -1], [-1, 0]] : [[0, 1], [1, 0], [-1, 0], [0, -1]];
          for (const [dx, dy] of order) {
            const nx = s0.x + dx, ny = s0.y + dy;
            if (solid[Math.floor(ny)]?.[Math.floor(nx)] !== false) continue;
            if (bodies.some((q) => Math.hypot(q.x - nx, q.y - ny) < 0.8)) continue;
            me.x = nx; me.y = ny; me.sx = 0; me.sy = 0;
            break;
          }
          sitRef.current = null;
          wantSit.current = null;
        };
        sitRef2.current = (item, tile) => {
          if (sitRef.current) return;
          const bodies = peerBodies();
          // the seat tile nearest to where I am (or the one tapped), if nobody is in it
          const cells = itemCells(item).filter((c) => !bodies.some((q) => Math.hypot(q.x - (c.x + 0.5), q.y - (c.y + 0.5)) < 0.8));
          if (!cells.length) { ripples.push({ x: item.x + 0.5, y: item.y + 0.5, t: performance.now() }); return; }
          const pick = (tile && cells.find((c) => c.x === tile.x && c.y === tile.y)) ?? cells.sort((a, b) => Math.hypot(a.x + 0.5 - me.x, a.y + 0.5 - me.y) - Math.hypot(b.x + 0.5 - me.x, b.y + 0.5 - me.y))[0];
          if (Math.hypot(pick.x + 0.5 - me.x, pick.y + 0.5 - me.y) < 2.1) {
            me.x = pick.x + 0.5; me.y = pick.y + 0.5; me.sx = 0; me.sy = 0; me.vx = 0; me.vy = 0;
            sitRef.current = { x: me.x, y: me.y };
            walkGoal.current = null; route.current = []; wantSit.current = null;
          } else {
            wantSit.current = item.id;
            propsRef.current.onWalkTo(pick.x + 0.5, pick.y + 0.5);
          }
        };
        // arrived next to the seat I was walking to: sit down
        if (wantSit.current && !sitRef.current) {
          const it = p.items.find((q) => q.id === wantSit.current);
          if (!it) wantSit.current = null;
          else if (!walkGoal.current && !p.follow) wantSit.current = null;
          else if (itemCells(it).some((c) => Math.hypot(c.x + 0.5 - me.x, c.y + 0.5 - me.y) < 1.3)) sitRef2.current(it);
        }
        let v = inputVelocity(k.has('arrowleft') || k.has('a'), k.has('arrowright') || k.has('d'), k.has('arrowup') || k.has('w'), k.has('arrowdown') || k.has('s'));
        if (sitRef.current) {
          if (v.vx !== 0 || v.vy !== 0) standRef.current();
          else if (walkGoal.current) standRef.current();
          if (sitRef.current) v = { vx: 0, vy: 0 };
        }
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
        if (p.riding) v = { vx: v.vx * RIDE_SPEED, vy: v.vy * RIDE_SPEED };
        me.vx = v.vx;
        me.vy = v.vy;
        const ease = 1 - Math.exp(-dt * 15);
        me.sx += (v.vx - me.sx) * ease;
        me.sy += (v.vy - me.sy) * ease;
        if (v.vx === 0 && Math.abs(me.sx) < 0.08) me.sx = 0;
        if (v.vy === 0 && Math.abs(me.sy) < 0.08) me.sy = 0;
        const np = sitRef.current ? { x: me.x, y: me.y } : advance(solid, me.x, me.y, me.sx, me.sy, dt);
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
        ambient.update({ x: me.x, y: me.y }, p.items, Math.hypot(me.sx, me.sy) > 0.25, now, p.riding);
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
      if (!drag.down && (Math.abs(inertia.x) > 0.2 || Math.abs(inertia.y) > 0.2)) {
        pan.current = { x: pan.current.x + inertia.x, y: pan.current.y + inertia.y };
        inertia.x *= 0.91; inertia.y *= 0.91;
      } else if (!drag.down) { inertia.x = 0; inertia.y = 0; }
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
        playTick(petRegistry.values(), now, dt, Math.random);
        for (const pet of petRegistry.values()) {
          const was = pet.happyUntil;
          stepPet(pet, dt, now, { x: me.x, y: me.y, dir: me.dir }, solid, Math.random, petRegistry);
          if (pet.mode === 'play' && now - pet.fxAt > 900) {
            pet.fxAt = now;
            petFx.current.push({ x: pet.x, y: pet.y - 1.1, born: now, e: pet.kind === 'dog' ? '💨' : '😼' });
            if (Math.random() < 0.35) ambient.pet(pet.kind, pet.kind === 'dog' ? 'bark' : 'meow');
          }
          if (pet.happyUntil > was && pet.mode === 'wander') petFx.current.push({ x: pet.x, y: pet.y - 1.2, born: now, e: '❤️' });
          officePets.set(pet.id, { x: pet.x, y: pet.y, face: pet.face, view: pet.view, moving: pet.moving, carrying: pet.carrying, awake: pet.kind === 'cat' ? pet.moving || pet.mode !== 'wander' || pet.happyUntil > now : true });
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
        drawGroundWeather(ctx, p.map, seasonNow, rainFor(p.seasonMode, seasonNow, Date.now()), now);
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
          name: info?.name ?? 'Someone', avatar: info?.avatar ?? defaultAvatar(id), isMe: false, id, bubbleScale: p.bubbleScale, seated: !info.riding && !!seatAt(p.items, pos.x, pos.y) && !(pm.vx || pm.vy), riding: !!info.riding, vehicle: (info.bike && propsRef.current.vehicleKinds?.[info.bike]) || 'bike', bubble: p.bubbles.current.get(id), speaking: p.speaking.current.has(id), status: statusOf(info?.status)?.emoji,
        });
      }
      people.push({ x: me.x, y: me.y, dir: me.dir, moving: Math.hypot(me.sx, me.sy) > 0.25, name: p.me.name, avatar: p.me.avatar, isMe: true, id: p.me.id, seated: !!sitRef.current && !p.riding, riding: p.riding, vehicle: p.rideKind ?? 'bike', bubbleScale: p.bubbleScale, bubble: p.bubbles.current.get(p.me.id), speaking: p.speaking.current.has(''), status: statusOf(who.get(p.me.id)?.status)?.emoji });

      // trails: smoke behind a rider, a little dust at the feet of anyone walking, and the ring where you clicked
      for (const q of people) {
        if (!q.moving) continue;
        const last = smokeAt.get(q.id ?? '') ?? 0;
        const rider = !!q.riding;
        if (now - last < (rider ? 70 : 140)) continue;
        smokeAt.set(q.id ?? '', now);
        const back = q.dir === 0 ? [0, -1] : q.dir === 3 ? [0, 1] : q.dir === 1 ? [1, 0] : [-1, 0];
        if (rider) smoke.push({ x: q.x * TILE + back[0] * 15 + (Math.random() - 0.5) * 4, y: q.y * TILE + 8 + back[1] * 7 + (Math.random() - 0.5) * 3, t: now, r: 2 + Math.random() * 2 });
        else smoke.push({ x: q.x * TILE + back[0] * 5 + (Math.random() - 0.5) * 6, y: q.y * TILE + 11 + back[1] * 3, t: now, r: 1.2 + Math.random() * 1.2, dust: true });
      }
      while (smoke.length && now - smoke[0].t > 900) smoke.shift();
      if (smoke.length > 160) smoke.splice(0, smoke.length - 160);
      for (const sp of smoke) {
        const life = sp.dust ? 480 : 900;
        const age = (now - sp.t) / life;
        if (age >= 1) continue;
        ctx.fillStyle = sp.dust ? `rgba(205,190,160,${(0.28 * (1 - age)).toFixed(3)})` : `rgba(148,163,184,${(0.5 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y - age * (sp.dust ? 6 : 14), sp.r + age * (sp.dust ? 3 : 6), 0, Math.PI * 2);
        ctx.fill();
      }
      while (ripples.length && now - ripples[0].t > 700) ripples.shift();
      for (const rp of ripples) {
        const age = (now - rp.t) / 700;
        ctx.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - age)).toFixed(3)})`;
        ctx.lineWidth = 2.5 * (1 - age) + 0.5;
        ctx.beginPath();
        ctx.ellipse(rp.x * TILE, rp.y * TILE + 4, 4 + age * 24, 2 + age * 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

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

      // "find me": rings spreading out from my avatar and a tag over it
      if (now - pulseAt.current < 2600) {
        const age = (now - pulseAt.current) / 2600;
        const px0 = me.x * TILE;
        const py0 = me.y * TILE;
        ctx.save();
        for (let k = 0; k < 3; k++) {
          const ph = ((age * 3 + k / 3) % 1);
          ctx.strokeStyle = `rgba(250,204,21,${((1 - ph) * (1 - age * 0.6)).toFixed(3)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px0, py0 - 4, 14 + ph * 70, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = Math.min(1, (1 - age) * 2.2);
        ctx.font = '800 12px system-ui, sans-serif';
        const lab = 'You are here';
        const lw = ctx.measureText(lab).width + 22;
        const by = py0 - 62 + Math.sin(now / 160) * 3;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.roundRect(px0 - lw / 2, by - 12, lw, 24, 12);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px0 - 6, by + 11);
        ctx.lineTo(px0, by + 19);
        ctx.lineTo(px0 + 6, by + 11);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lab, px0, by + 0.5);
        ctx.restore();
      }

      // something to press F on? show a little prompt over it
      if (p.riding && !p.editing) {
        ctx.save();
        ctx.font = '700 10px system-ui, sans-serif';
        const lab = 'F  Get off';
        const lw = ctx.measureText(lab).width + 16;
        const gx = me.x * TILE;
        const gy = me.y * TILE - 66;
        ctx.fillStyle = 'rgba(15,23,42,0.82)';
        ctx.beginPath();
        ctx.roundRect(gx - lw / 2, gy - 9, lw, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lab, gx, gy + 0.5);
        ctx.restore();
      }
      const nearIt = p.editing || p.riding || sitRef.current ? null : nearestInteractive(p.items, me.x, me.y);
      if ((nearIt?.id ?? null) !== (nearRef.current?.id ?? null)) { nearRef.current = nearIt; p.onNear(nearIt); }
      if (nearIt) {
        const sz = itemSize(nearIt);
        
        ctx.font = '700 11px system-ui, sans-serif';
        const tw = 28;
        const cx0 = (nearIt.x + sz.w / 2) * TILE;
        const cy0 = (nearIt.y + sz.h) * TILE + 16 + Math.sin(now / 280) * 2;
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.beginPath();
        ctx.roundRect(cx0 - tw / 2, cy0 - 11, tw, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(cx0 - tw / 2 + 4, cy0 - 7, 20, 14, 5);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F', cx0, cy0 + 0.5);
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
        if (p.held) {
          // the piece being carried: its old spot is dashed, and an outline follows the pointer
          const sz = itemSize(p.held.item);
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = 'rgba(245,158,11,0.95)';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.held.item.x * TILE + 1, p.held.item.y * TILE + 1, sz.w * TILE - 2, sz.h * TILE - 2);
          ctx.restore();
          if (hv) {
            const ok = p.ghost(hv).ok;
            const gx = (hv.x - p.held.dx) * TILE, gy = (hv.y - p.held.dy) * TILE;
            ctx.globalAlpha = 0.72;
            drawItems(ctx, [{ ...p.held.item, x: hv.x - p.held.dx, y: hv.y - p.held.dy }], theme, now);
            ctx.globalAlpha = 1;
            ctx.fillStyle = ok ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.34)';
            ctx.fillRect(gx, gy, sz.w * TILE, sz.h * TILE);
            ctx.strokeStyle = ok ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
            ctx.lineWidth = 2;
            ctx.strokeRect(gx + 1, gy + 1, sz.w * TILE - 2, sz.h * TILE - 2);
          }
        } else if (hv && p.tool === 'move') {
          const res = p.ghost(hv);
          ctx.fillStyle = res.ok ? 'rgba(245,158,11,0.3)' : 'rgba(148,163,184,0.18)';
          ctx.fillRect(hv.x * TILE, hv.y * TILE, TILE, TILE);
        } else if (hv && p.tool) {
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
        const rain = rainFor(p.seasonMode, season, wall);
        const bolt = lightning(rain, wall);
        if (bolt.id !== lastBolt.current) {
          if (bolt.id >= 0) ambient.thunder();
          lastBolt.current = bolt.id;
        }
        ambient.setWeather(rain, season === 'harmattan' ? 1 : 0);
        drawSky(ctx, w, h, sky, season, rain, bolt.strength, now);
        drawBirds(ctx, w, h, sky.light, rain, wall);
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
      canvas.removeEventListener('touchstart', tStart);
      canvas.removeEventListener('touchmove', tMove);
      canvas.removeEventListener('touchend', tEnd);
      canvas.removeEventListener('touchcancel', tEnd);
      canvas.removeEventListener('contextmenu', ctxMenu);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none outline-none" style={{ cursor: props.editing ? 'crosshair' : 'grab' }} />;
}
