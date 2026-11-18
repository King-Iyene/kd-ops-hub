import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AvatarStyle } from './world/types';
import { pack, shouldSend, unpack, type Motion, type SentMotion } from './world/netSync';
import { cleanAvatar } from './world/render';
import type { RtcSignal } from './calls/rules';
import type { DoorMsg } from './calls/locks';
import type { Ping } from './social';

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
  /** a status id such as 'focus' (see status.ts), or '' */
  status: string;
}

export interface PeerMotion { x: number; y: number; vx: number; vy: number; dir: 0 | 1 | 2 | 3; at: number }

const HIDDEN_LIMIT_MS = 15 * 60_000;

function useAwake(): boolean {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (document.hidden) {
        timer = setTimeout(() => {
          // someone in a call or recording stays connected however long the window is behind another
          if (!(window as unknown as { __kdBusy?: boolean }).__kdBusy) setAwake(false);
        }, HIDDEN_LIMIT_MS);
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
  const statusRef = useRef('');
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMeta = useRef('');
  /** people we were told are talking, with the time that stops counting */
  const peerTalking = useRef(new Map<string, number>());
  const doorHandler = useRef<((raw: unknown) => void) | null>(null);
  const pingHandler = useRef<((raw: unknown) => void) | null>(null);
  const selfRef = useRef(self);
  selfRef.current = self;
  const spaceRef = useRef(spaceId);
  spaceRef.current = spaceId;
  /** what the lobby knows about me */
  const meta = (s: { name: string; avatar: AvatarStyle }) => ({
    n: s.name, a: s.avatar, s: spaceRef.current, z: zoneRef.current, r: recRef.current ? 1 : 0, k: lockRef.current ? 1 : 0, st: statusRef.current, t: Date.now(),
  });

  const selfId = self?.id ?? null;

  // lobby: who is here and where
  useEffect(() => {
    if (!selfId || !awake) return;
    const ch = supabase.channel('office:lobby', { config: { private: true, broadcast: { self: false }, presence: { key: selfId } } });
    lobby.current = ch;
    const sync = () => {
      const state = ch.presenceState() as Record<string, { n?: string; a?: unknown; s?: string | null; z?: string | null; r?: number; k?: number; st?: string; t?: number }[]>;
      const list: Who[] = [];
      for (const [id, metas] of Object.entries(state)) {
        const m = metas.reduce((a, b) => ((b.t ?? 0) > (a.t ?? 0) ? b : a), metas[0]);
        if (!m) continue;
        list.push({ id, name: typeof m.n === 'string' ? m.n.slice(0, 60) : 'Someone', avatar: cleanAvatar(m.a, id), spaceId: m.s ?? null, zone: m.z ?? null, rec: m.r === 1, locked: m.k === 1, status: typeof m.st === 'string' ? m.st.slice(0, 12) : '' });
      }
      setRoster(list);
      // forget people who have left
      const here = new Set(list.map((w) => w.id));
      for (const id of [...peers.current.keys()]) if (!here.has(id)) peers.current.delete(id);
    };
    // rings and messages addressed to one person (see social.ts); everyone gets the packet, only the addressee acts
    ch.on('broadcast', { event: 'ping' }, ({ payload }) => { pingHandler.current?.(payload); });
    ch.on('presence', { event: 'sync' }, sync).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        const s = selfRef.current;
        if (s) { const m = meta(s); lastMeta.current = JSON.stringify({ ...m, t: 0 }); await ch.track(m); }
      }
    });
    return () => {
      setConnected(false);
      void supabase.removeChannel(ch);
      lobby.current = null;
    };
  }, [selfId, awake]);

  // Presence updates are rate limited by the server (too many and they are dropped, so nobody sees anybody).
  // So: wait a moment and send once, and never send what has not changed.
  const pushMeta = useCallback((now?: boolean) => {
    const send = () => {
      metaTimer.current = null;
      const s = selfRef.current;
      if (!lobby.current || !s) return;
      const m = meta(s);
      const key = JSON.stringify({ ...m, t: 0 });
      if (key === lastMeta.current) return;
      lastMeta.current = key;
      void lobby.current.track(m);
    };
    if (now) {
      if (metaTimer.current) clearTimeout(metaTimer.current);
      send();
    } else if (!metaTimer.current) {
      metaTimer.current = setTimeout(send, 300);
    }
  }, []);

  // tell the lobby when we change office, room or avatar (rare)
  const announce = useCallback((zone: string | null) => {
    zoneRef.current = zone;
    pushMeta();
  }, []);

  /** Tell the room that I am (or am no longer) recording. */
  const setRecording = useCallback((on: boolean) => {
    recRef.current = on;
    pushMeta();
  }, []);

  /** Show a status next to my name. */
  const setStatus = useCallback((id: string) => {
    statusRef.current = id;
    pushMeta();
  }, []);

  /** Lock or unlock the meeting room I am standing in (everyone else in the office sees it). */
  const setLocked = useCallback((on: boolean) => {
    lockRef.current = on;
    pushMeta();
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
    const ch = supabase.channel(`office:space:${spaceId}`, { config: { private: true, broadcast: { self: false, ack: false } } });
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
    // someone started or stopped talking (shown as a green glow even before their audio reaches us)
    ch.on('broadcast', { event: 'sp' }, ({ payload }) => {
      const p = payload as { i?: unknown; on?: unknown } | null;
      if (!p || typeof p.i !== 'string' || p.i.length > 64 || p.i === selfId) return;
      if (p.on === true) peerTalking.current.set(p.i, Date.now() + 4000);
      else peerTalking.current.delete(p.i);
    });
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
  const sendPing = useCallback((payload: Ping) => {
    void lobby.current?.send({ type: 'broadcast', event: 'ping', payload });
  }, []);
  const setPingHandler = useCallback((h: ((raw: unknown) => void) | null) => { pingHandler.current = h; }, []);
  const sendSpeaking = useCallback((on: boolean) => {
    const ch = room.current;
    const s = selfRef.current;
    if (ch && roomReady.current && s) void ch.send({ type: 'broadcast', event: 'sp', payload: { i: s.id, on } });
  }, []);
  const sendDoor = useCallback((payload: DoorMsg) => {
    const ch = room.current;
    if (ch && roomReady.current) void ch.send({ type: 'broadcast', event: 'door', payload });
  }, []);
  const setDoorHandler = useCallback((h: ((raw: unknown) => void) | null) => { doorHandler.current = h; }, []);
  const setRtcHandler = useCallback((h: ((raw: unknown) => void) | null) => { rtcHandler.current = h; }, []);

  return { roster, connected, peers, update, announce, setRecording, setLocked, setStatus, mine, sendRtc, setRtcHandler, sendDoor, setDoorHandler, sendPing, setPingHandler, sendSpeaking, peerTalking };
}
