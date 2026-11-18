import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AvatarStyle } from './world/types';
import { pack, shouldSend, unpack, type Motion, type SentMotion } from './world/netSync';
import { cleanAvatar } from './world/render';
import type { RtcSignal } from './calls/rules';
import type { DoorMsg } from './calls/locks';

/**
 * Live presence for the office, built to stay quiet (see netSync.ts):
 *  - one "lobby" channel (presence only): who is online, in which office and which room. Changes only when someone
 *    arrives, leaves, switches office or walks into another room.
 *  - one channel per office (broadcast only): movement events, sent only on start / turn / stop.
 *  - everything is torn down after the tab has been hidden for two minutes.
 */
export interface Who {
  id: string;
  name: string;
  avatar: AvatarStyle;
  spaceId: string | null;
  zone: string | null;
  /** this person is recording the meeting they are in (everyone in that room is told) */
  rec: boolean;
  /** this person has locked the meeting room they are standing in */
  locked: boolean;
}

export interface PeerMotion { x: number; y: number; vx: number; vy: number; dir: 0 | 1 | 2 | 3; at: number }

const HIDDEN_LIMIT_MS = 120_000;

function useAwake(): boolean {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (document.hidden) {
        timer = setTimeout(() => setAwake(false), HIDDEN_LIMIT_MS);
      } else {
        if (timer) clearTimeout(timer);
        timer = null;
        setAwake(true);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return awake;
}

export function useOffice(self: { id: string; name: string; avatar: AvatarStyle } | null, spaceId: string | null) {
  const awake = useAwake();
  const [roster, setRoster] = useState<Who[]>([]);
  const [connected, setConnected] = useState(false);
  const peers = useRef(new Map<string, PeerMotion>());
  const lobby = useRef<RealtimeChannel | null>(null);
  const room = useRef<RealtimeChannel | null>(null);
  const roomReady = useRef(false);
  const lastSent = useRef<SentMotion | null>(null);
  const mine = useRef<{ m: Motion; dir: 0 | 1 | 2 | 3 }>({ m: { x: 0, y: 0, vx: 0, vy: 0 }, dir: 0 });
  const rtcHandler = useRef<((raw: unknown) => void) | null>(null);
  const zoneRef = useRef<string | null>(null);
  const recRef = useRef(false);
  const lockRef = useRef(false);
  const doorHandler = useRef<((raw: unknown) => void) | null>(null);
  const selfRef = useRef(self);
  selfRef.current = self;
  const spaceRef = useRef(spaceId);
  spaceRef.current = spaceId;
  /** what the lobby knows about me */
  const meta = (s: { name: string; avatar: AvatarStyle }) => ({
    n: s.name, a: s.avatar, s: spaceRef.current, z: zoneRef.current, r: recRef.current ? 1 : 0, k: lockRef.current ? 1 : 0,
  });

  const selfId = self?.id ?? null;

  // lobby: who is here and where
  useEffect(() => {
    if (!selfId || !awake) return;
    const ch = supabase.channel('office:lobby', { config: { presence: { key: selfId } } });
    lobby.current = ch;
    const sync = () => {
      const state = ch.presenceState() as Record<string, { n?: string; a?: unknown; s?: string | null; z?: string | null; r?: number; k?: number }[]>;
      const list: Who[] = [];
      for (const [id, metas] of Object.entries(state)) {
        const m = metas[0];
        if (!m) continue;
        list.push({ id, name: typeof m.n === 'string' ? m.n.slice(0, 60) : 'Someone', avatar: cleanAvatar(m.a, id), spaceId: m.s ?? null, zone: m.z ?? null, rec: m.r === 1, locked: m.k === 1 });
      }
      setRoster(list);
      // forget people who have left
      const here = new Set(list.map((w) => w.id));
      for (const id of [...peers.current.keys()]) if (!here.has(id)) peers.current.delete(id);
    };
    ch.on('presence', { event: 'sync' }, sync).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        const s = selfRef.current;
        if (s) await ch.track(meta(s));
      }
    });
    return () => {
      setConnected(false);
      void supabase.removeChannel(ch);
      lobby.current = null;
    };
  }, [selfId, awake]);

  // tell the lobby when we change office, room or avatar (rare)
  const announce = useCallback((zone: string | null) => {
    zoneRef.current = zone;
    const s = selfRef.current;
    if (lobby.current && s) void lobby.current.track(meta(s));
  }, []);

  /** Tell the room that I am (or am no longer) recording. */
  const setRecording = useCallback((on: boolean) => {
    recRef.current = on;
    const s = selfRef.current;
    if (lobby.current && s) void lobby.current.track(meta(s));
  }, []);

  /** Lock or unlock the meeting room I am standing in (everyone else in the office sees it). */
  const setLocked = useCallback((on: boolean) => {
    lockRef.current = on;
    const s = selfRef.current;
    if (lobby.current && s) void lobby.current.track(meta(s));
  }, []);

  useEffect(() => {
    announce(zoneRef.current);
  }, [spaceId, self?.avatar, self?.name, announce]);

  // movement for the office we are in
  useEffect(() => {
    if (!selfId || !spaceId || !awake) return;
    peers.current.clear();
    lastSent.current = null;
    roomReady.current = false;
    const ch = supabase.channel(`office:space:${spaceId}`, { config: { broadcast: { self: false, ack: false } } });
    room.current = ch;
    const emit = () => {
      const { m, dir } = mine.current;
      void ch.send({ type: 'broadcast', event: 'm', payload: pack(selfId, m, dir) });
      lastSent.current = { ...m, at: Date.now() };
    };
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      const p = unpack(payload);
      if (!p || p.id === selfId) return;
      peers.current.set(p.id, { x: p.x, y: p.y, vx: p.vx, vy: p.vy, dir: p.dir, at: Date.now() });
    });
    // someone just arrived and asks where everybody is: answer once, spread out a little so we do not all reply at once
    ch.on('broadcast', { event: 'q' }, () => {
      setTimeout(() => { if (roomReady.current) emit(); }, Math.random() * 400);
    });
    // call set-up messages (see calls/useCalls.ts); handled by whoever registered a handler
    ch.on('broadcast', { event: 'rtc' }, ({ payload }) => { rtcHandler.current?.(payload); });
    // knocking on a locked door, letting someone in, unlocking (see calls/locks.ts)
    ch.on('broadcast', { event: 'door' }, ({ payload }) => { doorHandler.current?.(payload); });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        roomReady.current = true;
        void ch.send({ type: 'broadcast', event: 'q', payload: {} });
        emit();
      }
    });
    const peerMap = peers.current;
    return () => {
      roomReady.current = false;
      void supabase.removeChannel(ch);
      room.current = null;
      peerMap.clear();
    };
  }, [selfId, spaceId, awake]);

  /** Call every frame with our current motion. Sends a message only when the traffic budget says so. */
  const update = useCallback((m: Motion, dir: 0 | 1 | 2 | 3, now: number) => {
    mine.current = { m, dir };
    const ch = room.current;
    if (!ch || !roomReady.current || !selfRef.current) return;
    const reason = shouldSend(lastSent.current, m, now);
    if (!reason) return;
    void ch.send({ type: 'broadcast', event: 'm', payload: pack(selfRef.current.id, m, dir) });
    lastSent.current = { ...m, at: now };
  }, []);

  /** Send a call set-up message to the people in this office (only the addressee acts on it). */
  const sendRtc = useCallback((payload: RtcSignal) => {
    const ch = room.current;
    if (ch && roomReady.current) void ch.send({ type: 'broadcast', event: 'rtc', payload });
  }, []);
  const sendDoor = useCallback((payload: DoorMsg) => {
    const ch = room.current;
    if (ch && roomReady.current) void ch.send({ type: 'broadcast', event: 'door', payload });
  }, []);
  const setDoorHandler = useCallback((h: ((raw: unknown) => void) | null) => { doorHandler.current = h; }, []);
  const setRtcHandler = useCallback((h: ((raw: unknown) => void) | null) => { rtcHandler.current = h; }, []);

  return { roster, connected, peers, update, announce, setRecording, setLocked, mine, sendRtc, setRtcHandler, sendDoor, setDoorHandler };
}
