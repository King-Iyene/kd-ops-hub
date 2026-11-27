import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Who } from '../useOffice';
import type { AvatarStyle } from '../world/types';
import { perf } from '../world/perfStats';
import { FAR, isInitiator, parseSignal, volumeFor, wantsConnection, type RtcSignal, type Spot } from './rules';
import { screenVisible, type ShareInfo, type ShareSurface } from './shareState';

/**
 * Voice and video between the people in the office, straight from browser to browser (WebRTC).
 * Nothing runs until you press "Join voice". The office channel only carries the small set-up messages;
 * the audio and video never touch our servers. Who is connected to whom comes from rules.ts and is re-checked
 * a couple of times a second, so walking away or into a meeting room changes who you hear within a moment.
 *
 * Free Google STUN servers find the route. On a few strict office networks a relay (TURN server) would be needed;
 * add one by filling VITE_TURN_URL, VITE_TURN_USER and VITE_TURN_CREDENTIAL.
 */

/** relay servers fetched from the office-turn function (empty until the Cloudflare keys are added) */
let relayServers: RTCIceServer[] = [];
let relayAt = 0;
async function loadRelay(): Promise<void> {
  if (Date.now() - relayAt < 6 * 3600 * 1000) return;
  try {
    const { data } = await supabase.functions.invoke('office-turn', { body: {} });
    const list = (data as { iceServers?: RTCIceServer[] } | null)?.iceServers;
    relayServers = Array.isArray(list) ? list : [];
    relayAt = Date.now();
  } catch {
    /* keep using STUN only */
  }
}

export function iceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, ...relayServers];
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_TURN_URL) servers.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USER, credential: env.VITE_TURN_CREDENTIAL });
  return { iceServers: servers };
}

interface Conn {
  pc: RTCPeerConnection;
  polite: boolean;
  making: boolean;
  ignore: boolean;
  stream: MediaStream;
  audio: HTMLAudioElement;
  videoSender: RTCRtpSender | null;
  /** their shared screen arrives in its own stream; `primary` is the id of their microphone/camera stream */
  primary: string | null;
  screen: MediaStream;
  screenSender: RTCRtpSender | null;
  screenAudioSender: RTCRtpSender | null;
  /** plays the sound that comes with their shared screen (a tab's audio, say) */
  screenAudio: HTMLAudioElement | null;
  pending: RTCIceCandidateInit[];
  /** which stream each arriving track came in, so a screen is told from a camera even if the news of the share arrives later */
  sids: Map<string, string>;
  /** since when a track has been reported muted (a screen that is not changing sends nothing) */
  mutedSince: Map<string, number>;
  /** the other side has announced a screen share at some point on this connection */
  sawShare: boolean;
  /** streams we already listen to for removed tracks */
  hooked: Set<string>;
  /** when this connection was made, and when it last became connected (0 = never) */
  born: number;
  connectedAt: number;
  /** how good the line is, from the round trip time and lost packets (updated every few seconds while connected) */
  quality: 'good' | 'fair' | 'poor';
  lastIn: { received: number; lost: number } | null;
}

interface LocalMedia {
  stream: MediaStream | null;
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  screen: { stream: MediaStream; track: MediaStreamTrack; audio: MediaStreamTrack | null; info: ShareInfo } | null;
}

export interface Tile {
  /** a shared screen rather than a camera (shown larger) */
  screen?: boolean;
  /** for a shared screen: who is presenting and what they chose to share */
  share?: ShareInfo;
  presenter?: string;
  /** for a person: their picture and whether their microphone and camera are on (from what they told the office) */
  avatar?: AvatarStyle;
  micOn?: boolean;
  camOn?: boolean;
  /** how the connection to them is doing */
  conn?: 'connected' | 'connecting' | 'reconnecting';
  /** line quality, when connected */
  quality?: 'good' | 'fair' | 'poor';
  id: string;
  name: string;
  stream: MediaStream;
  hasVideo: boolean;
  muted: boolean;
}

interface Opts {
  meId: string | null;
  spaceId: string | null;
  roster: Who[];
  /** everyone whose movement we are receiving in this office (does not depend on the online list) */
  peerIds: () => string[];
  /** where someone else is standing (null when unknown) */
  lookup: (id: string) => Spot | null;
  /** where I am standing */
  self: () => Spot;
  /** true when a solid wall lies between the two (sound does not pass walls) */
  occluded?: (a: Spot, b: Spot) => boolean;
  send: (s: RtcSignal) => void;
  setHandler: (h: ((raw: unknown) => void) | null) => void;
  /** how long a connection may take to come up before it is dropped and started again (milliseconds; a test shortens it) */
  watchdogMs?: number;
  /** tell the office that I started or stopped sharing my screen, and what (so everyone sees it, and the others can tell it from a camera) */
  setShare?: (s: ShareInfo | null) => void;
}

export function useCalls(opts: Opts) {
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  // which microphone, camera and speaker, and whether background noise is cut (remembered on this device)
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({ mics: [], cams: [], speakers: [] });
  const [pick, setPick] = useState<{ mic: string; cam: string; speaker: string }>(() => {
    try { const v = JSON.parse(localStorage.getItem('kd:office:devices') ?? '{}') as Record<string, unknown>; return { mic: typeof v.mic === 'string' ? v.mic : '', cam: typeof v.cam === 'string' ? v.cam : '', speaker: typeof v.speaker === 'string' ? v.speaker : '' }; } catch { return { mic: '', cam: '', speaker: '' }; }
  });
  const [noise, setNoiseState] = useState(() => { try { return localStorage.getItem('kd:office:noise') !== '0'; } catch { return true; } });
  const [dataSaver, setDataSaverState] = useState(() => { try { return localStorage.getItem('kd:office:datasaver') === '1'; } catch { return false; } });
  const saverRef = useRef(dataSaver);
  saverRef.current = dataSaver;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const noiseRef = useRef(noise);
  noiseRef.current = noise;
  /** the camera picture: small and slow when saving data */
  const videoSize = () => (saverRef.current ? { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 12, max: 15 } } : { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } });
  /** cap how much the camera sends (bits per second) */
  const capVideo = async (sender: RTCRtpSender | null) => {
    if (!sender) return;
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = saverRef.current ? 150_000 : 1_100_000;
      await sender.setParameters(p);
    } catch { /* the browser keeps its own limit */ }
  };
  const micConstraints = () => ({ ...(pickRef.current.mic ? { deviceId: { exact: pickRef.current.mic } } : {}), echoCancellation: true, noiseSuppression: noiseRef.current, autoGainControl: true });
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({ mics: list.filter((d) => d.kind === 'audioinput'), cams: list.filter((d) => d.kind === 'videoinput'), speakers: list.filter((d) => d.kind === 'audiooutput') });
    } catch { /* no devices to list */ }
  }, []);
  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);
  const [camOn, setCamOn] = useState(false);
  const [selfCam, setSelfCam] = useState<MediaStream | null>(null);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
  const [, setVersion] = useState(0);

  const o = useRef(opts);
  o.current = opts;
  const conns = useRef(new Map<string, Conn>());
  /** cap what a shared screen sends: sharp text matters more than smooth motion */
  const capScreen = async (sender: RTCRtpSender | null) => {
    if (!sender) return;
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      // the presenter sends a copy to every viewer: the more of them, the less each copy may take
      const n = conns.current.size;
      p.encodings[0].maxBitrate = saverRef.current ? 600_000 : n <= 3 ? 2_500_000 : n <= 6 ? 1_500_000 : 1_000_000;
      p.encodings[0].maxFramerate = 15;
      (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-resolution';
      await sender.setParameters(p);
    } catch { /* the browser keeps its own limit */ }
  };

  const local = useRef<LocalMedia>({ stream: null, audio: null, video: null, screen: null });
  const [sharing, setSharing] = useState(false);
  const capCount = useRef(0);
  /** what I am sharing right now (null when nothing) */
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  /** who is talking right now ('' is me): a ref for the map (read every frame) and a state for the meeting view */
  const speaking = useRef(new Set<string>());
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const joinedRef = useRef(false);
  const mutedRef = useRef(mutedPeers);
  mutedRef.current = mutedPeers;
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const close = useCallback((id: string) => {
    const c = conns.current.get(id);
    if (!c) return;
    conns.current.delete(id);
    c.pc.onicecandidate = null;
    c.pc.onnegotiationneeded = null;
    c.pc.ontrack = null;
    c.pc.onconnectionstatechange = null;
    c.pc.close();
    c.audio.srcObject = null;
    if (c.screenAudio) c.screenAudio.srcObject = null;
    bump();
  }, [bump]);

  const closeAll = useCallback(() => { for (const id of [...conns.current.keys()]) close(id); }, [close]);

  /** after a connection is dropped for being stuck, wait a little (longer each time it happens) before the next try */
  const notBefore = useRef(new Map<string, number>());
  const resets = useRef(new Map<string, number>());
  /**
   * A connection that is stuck or has failed is dropped and started again, by itself, so nobody has to refresh the page to be heard.
   * The other side is told, so it drops its half too and the two start clean (the one with the lower id makes the new offer).
   */
  const resetConn = useCallback((id: string) => {
    const me = o.current.meId;
    if (!me || !conns.current.has(id)) return;
    try { o.current.send({ f: me, t: id, k: 'rst', d: {} }); } catch { /* they will time out on their side too */ }
    close(id);
    const n = (resets.current.get(id) ?? 0) + 1;
    resets.current.set(id, n);
    notBefore.current.set(id, Date.now() + Math.min(16_000, 1000 * 2 ** Math.min(n, 4)));
  }, [close]);

  /** start a sound element; a browser may refuse until the person has touched the page, so retry on the next touch */
  const keepPlaying = (el: HTMLAudioElement) => {
    void el.play().catch(() => {
      const again = () => { void el.play().catch(() => undefined); };
      window.addEventListener('pointerdown', again, { once: true });
      window.addEventListener('keydown', again, { once: true });
    });
  };
  /** start playing the sound that comes with a shared screen (once per connection; it follows the same volume as their voice) */
  const playScreenAudio = (c: Conn) => {
    if (!c.screenAudio) {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = c.screen; // only the sound plays here; the picture is shown by the screen tile
      if (pickRef.current.speaker) void (el as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(pickRef.current.speaker).catch(() => undefined);
      c.screenAudio = el;
    }
    keepPlaying(c.screenAudio);
  };

  /**
   * Sort a connection's pictures into camera and shared screen using what the presenter announced (the news can arrive after the
   * picture does), and clear a share the presenter has stopped. Returns true when something moved.
   */
  const settleScreen = (c: Conn, share: ShareInfo | undefined): boolean => {
    let moved = false;
    if (share) {
      c.sawShare = true;
      if (share.pid && c.primary !== share.pid) { c.primary = share.pid; moved = true; } // the announcement is the truth about which stream is their voice
      for (const t of c.stream.getTracks()) {
        if (c.sids.get(t.id) === share.sid) {
          c.stream.removeTrack(t); c.screen.addTrack(t); moved = true;
          if (t.kind === 'audio') playScreenAudio(c);
        }
      }
      for (const t of c.screen.getTracks()) {
        const sid = c.sids.get(t.id);
        if (sid && sid !== share.sid) { c.screen.removeTrack(t); moved = true; } // an older share of theirs
      }
    } else if (c.sawShare) {
      for (const t of c.screen.getTracks()) { c.screen.removeTrack(t); moved = true; } // they stopped
    }
    return moved;
  };

  const create = useCallback((id: string): Conn => {
    const me = o.current.meId as string;
    const pc = new RTCPeerConnection(iceConfig());
    const stream = new MediaStream();
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    if (pickRef.current.speaker) void (audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(pickRef.current.speaker).catch(() => undefined);
    const c: Conn = { pc, polite: !isInitiator(me, id), making: false, ignore: false, stream, audio, videoSender: null, primary: null, screen: new MediaStream(), screenSender: null, screenAudioSender: null, screenAudio: null, pending: [], sids: new Map(), mutedSince: new Map(), sawShare: false, hooked: new Set(), born: Date.now(), connectedAt: 0, quality: 'good', lastIn: null };
    conns.current.set(id, c);

    pc.onicecandidate = (e) => {
      if (e.candidate) o.current.send({ f: me, t: id, k: 'ice', d: e.candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        c.making = true;
        await pc.setLocalDescription();
        o.current.send({ f: me, t: id, k: 'sdp', d: pc.localDescription?.toJSON() ?? {} });
      } catch {
        /* the next rules check will try again */
      } finally {
        c.making = false;
      }
    };
    pc.ontrack = (e) => {
      const t = e.track;
      const sid = e.streams[0]?.id ?? null;
      if (sid) c.sids.set(t.id, sid);
      const share = o.current.roster.find((r) => r.id === id)?.share;
      if (share) c.sawShare = true;
      // their microphone and camera name the main stream (the share announcement says so too, even for someone with no microphone)
      if (share?.pid) c.primary = share.pid;
      const isScreenAudio = t.kind === 'audio' && !!sid && !!share && sid === share.sid;
      if (t.kind === 'audio' && !isScreenAudio && !c.primary) c.primary = sid;
      // a video from the announced screen stream (or, without an announcement, from any stream other than the main one) is a shared screen
      const isScreen = isScreenAudio || (t.kind === 'video' && !!sid && (share ? sid === share.sid : !!c.primary && sid !== c.primary));
      const target = isScreen ? c.screen : stream;
      if (!target.getTracks().includes(t)) target.addTrack(t);
      t.onmute = () => {
        c.mutedSince.set(t.id, Date.now());
        window.setTimeout(bump, 12_500); // a still screen may stay quiet; look again once the grace is over
        bump();
      };
      t.onunmute = () => { c.mutedSince.delete(t.id); bump(); };
      t.onended = () => { stream.removeTrack(t); c.screen.removeTrack(t); bump(); };
      // when the other side takes a track away (stops sharing) it leaves the stream it came in
      const ms = e.streams[0];
      if (ms && !c.hooked.has(ms.id)) {
        c.hooked.add(ms.id);
        ms.addEventListener('removetrack', (ev) => { stream.removeTrack(ev.track); c.screen.removeTrack(ev.track); bump(); });
      }
      if (isScreenAudio) playScreenAudio(c);
      else if (t.kind === 'audio') {
        // browsers may refuse to play sound until the person has touched the page: start now, and retry on the next touch
        void audio.play().catch(() => {
          const again = () => { void audio.play().catch(() => undefined); };
          window.addEventListener('pointerdown', again, { once: true });
          window.addEventListener('keydown', again, { once: true });
        });
      }
      bump();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') c.connectedAt = Date.now();
      if (pc.connectionState === 'failed') resetConn(id);
      else if (pc.connectionState === 'closed') close(id);
      else bump();
    };
    // a connection that has dropped out may come back by itself; if it has not after a moment, ask the network to find a new route
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState !== 'disconnected') return;
      window.setTimeout(() => {
        if (conns.current.get(id) === c && pc.iceConnectionState === 'disconnected') { try { pc.restartIce(); } catch { /* the watchdog handles it */ } }
      }, 3000);
    };

    const l = local.current;
    if (l.stream && l.audio) pc.addTrack(l.audio, l.stream);
    else pc.addTransceiver('audio', { direction: 'recvonly' }); // listening only: still receive their voice
    if (l.stream && l.video) { c.videoSender = pc.addTrack(l.video, l.stream); void capVideo(c.videoSender); }
    if (l.screen) {
      c.screenSender = pc.addTrack(l.screen.track, l.screen.stream); void capScreen(c.screenSender);
      if (l.screen.audio) c.screenAudioSender = pc.addTrack(l.screen.audio, l.screen.stream);
    }
    bump();
    return c;
  }, [bump, close]);

  // messages from the other side
  const onSignal = useCallback(async (raw: unknown) => {
    const me = o.current.meId;
    if (!me || !joinedRef.current) return;
    const s = parseSignal(raw, me);
    if (!s) return;
    const other = o.current.lookup(s.f);
    let c = conns.current.get(s.f);
    // never accept a call from someone we should not be hearing (for example, from outside our meeting room)
    if (!other || !wantsConnection(o.current.self(), other, true)) return;
    // they say a connection is stuck: drop ours too; whoever makes the offers starts a new one a moment later
    if (s.k === 'rst') {
      if (c) { close(s.f); notBefore.current.set(s.f, Date.now() + 1000); }
      return;
    }
    if (!c) {
      if (s.k !== 'sdp') return;
      c = create(s.f);
    }
    const { pc } = c;
    try {
      if (s.k === 'sdp') {
        const desc = s.d as RTCSessionDescriptionInit;
        const collision = desc.type === 'offer' && (c.making || pc.signalingState !== 'stable');
        c.ignore = !c.polite && collision;
        if (c.ignore) return;
        await pc.setRemoteDescription(desc);
        for (const cand of c.pending.splice(0)) await pc.addIceCandidate(cand).catch(() => undefined);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          o.current.send({ f: me, t: s.f, k: 'sdp', d: pc.localDescription?.toJSON() ?? {} });
        }
      } else {
        const cand = s.d as RTCIceCandidateInit;
        if (!pc.remoteDescription) c.pending.push(cand);
        else await pc.addIceCandidate(cand).catch(() => { if (!c?.ignore) throw new Error('ice'); });
      }
    } catch {
      /* a bad message from one person must not break the call with everyone else */
    }
  }, [create]);

  // who should I be connected to right now, and how loud
  useEffect(() => {
    if (!joined) return;
    const tick = () => {
      const { meId, peerIds, lookup, self } = o.current;
      if (!meId) return;
      const mine = self();
      const here = new Set<string>();
      // who is near comes from the movement we receive, so calls work even when the online list is behind
      for (const id of peerIds()) {
        if (id === meId) continue;
        here.add(id);
        const other = lookup(id);
        if (!other) continue;
        const c = conns.current.get(id);
        // the wall check only runs for people who are close enough to matter
        const near = Math.hypot(mine.x - other.x, mine.y - other.y) <= FAR;
        const occ = near && !!o.current.occluded?.(mine, other);
        const want = wantsConnection(mine, other, !!c, occ);
        if (want && !c && isInitiator(meId, id) && Date.now() >= (notBefore.current.get(id) ?? 0)) create(id);
        else if (!want && c) close(id);
        const cur = conns.current.get(id);
        if (cur && cur.pc.connectionState !== 'connected' && Date.now() - cur.born > (o.current.watchdogMs ?? 12_000)) { resetConn(id); continue; } // stuck: start again
        if (cur && cur.connectedAt && Date.now() - cur.connectedAt > 10_000) resets.current.delete(id); // healthy for a while: forget past trouble
        if (cur) {
          cur.audio.volume = mutedRef.current.has(id) ? 0 : volumeFor(mine, other, occ);
          if (cur.screenAudio) cur.screenAudio.volume = cur.audio.volume;
          if (settleScreen(cur, o.current.roster.find((r) => r.id === id)?.share)) bump();
        }
      }
      for (const id of [...conns.current.keys()]) if (!here.has(id)) close(id);
      perf.rtc = conns.current.size;
      // while I share, re-fit what each viewer's copy may take whenever the number of viewers changes
      if (local.current.screen && conns.current.size !== capCount.current) {
        capCount.current = conns.current.size;
        for (const c of conns.current.values()) void capScreen(c.screenSender);
      }
    };
    const t = setInterval(tick, 400);
    tick();
    return () => clearInterval(t);
  }, [joined, create, close, resetConn]);

  useEffect(() => {
    opts.setHandler(joined ? (raw) => { void onSignal(raw); } : null);
    return () => opts.setHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, onSignal]);

  // a different office: drop every call (the new office's people connect by the same rules)
  useEffect(() => { closeAll(); }, [opts.spaceId, closeAll]);

  const stopLocal = useCallback(() => {
    local.current.audio?.stop();
    local.current.video?.stop();
    local.current.screen?.track.stop();
    local.current.screen?.audio?.stop();
    local.current = { stream: null, audio: null, video: null, screen: null };
    setSharing(false);
    setShareInfo(null);
    o.current.setShare?.(null);
  }, []);

  const join = useCallback(async () => {
    if (joinedRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loadRelay();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
      } catch (e) {
        // no microphone (blocked or missing): join listening only, and say why
        stream = new MediaStream();
        const n = (e as DOMException)?.name;
        setError(n === 'NotAllowedError'
          ? 'Microphone is blocked in your browser, so you can listen but not speak. Click the padlock left of the web address, set Microphone to Allow, then press the mic button.'
          : 'No microphone found, so you can listen but not speak.');
      }
      local.current = { stream, audio: stream.getAudioTracks()[0] ?? null, video: null, screen: null };
      joinedRef.current = true;
      setJoined(true);
      // you join with the microphone off; press the mic button when you want to talk
      if (local.current.audio) local.current.audio.enabled = false;
      setMicOn(false);
      setCamOn(false);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === 'NotAllowedError' ? 'The browser is blocking the microphone for this site. Click the padlock left of the web address, set Microphone and Camera to Allow, reload, then press Join voice again.' : name === 'NotFoundError' ? 'No microphone was found.' : 'Could not start the microphone.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const leave = useCallback(() => {
    joinedRef.current = false;
    closeAll();
    stopLocal();
    setJoined(false);
    setCamOn(false);
    setSelfCam(null);
  }, [closeAll, stopLocal]);

  useEffect(() => () => { joinedRef.current = false; closeAll(); stopLocal(); }, [closeAll, stopLocal]);

  const toggleMic = useCallback(async () => {
    const l = local.current;
    if (!l.stream) return;
    if (!l.audio) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
        const track = mic.getAudioTracks()[0];
        if (!track) return;
        l.stream.addTrack(track);
        l.audio = track;
        for (const c of conns.current.values()) c.pc.addTrack(track, l.stream);
        setMicOn(true);
        setError(null);
      } catch {
        setError('Microphone is still blocked. Click the padlock left of the web address and set Microphone to Allow.');
      }
      return;
    }
    l.audio.enabled = !l.audio.enabled;
    setMicOn(l.audio.enabled);
  }, []);

  const toggleCam = useCallback(async () => {
    const l = local.current;
    if (!l.stream) return;
    if (l.video) {
      l.video.stop();
      for (const c of conns.current.values()) {
        if (c.videoSender) { try { c.pc.removeTrack(c.videoSender); } catch { /* already gone */ } c.videoSender = null; }
      }
      l.stream.removeTrack(l.video);
      l.video = null;
      setCamOn(false);
      setSelfCam(null);
      try { localStorage.setItem('kd:office:cam', '0'); } catch { /* fine */ }
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { ...(pickRef.current.cam ? { deviceId: { exact: pickRef.current.cam } } : {}), ...videoSize() } });
      const track = cam.getVideoTracks()[0];
      if (!track || !l.stream) return;
      l.stream.addTrack(track);
      l.video = track;
      for (const c of conns.current.values()) { c.videoSender = c.pc.addTrack(track, l.stream); void capVideo(c.videoSender); }
      setCamOn(true);
      setSelfCam(new MediaStream([track]));
      try { localStorage.setItem('kd:office:cam', '1'); } catch { /* fine */ }
      setError(null);
    } catch {
      setError('Could not start the camera. Click the padlock left of the web address, set Camera to Allow, and try again.');
    }
  }, []);

  const savePick = (next: { mic: string; cam: string; speaker: string }) => {
    setPick(next);
    try { localStorage.setItem('kd:office:devices', JSON.stringify(next)); } catch { /* fine */ }
  };

  /** switch microphone: a live one is swapped in place, so nobody in the call hears a gap */
  const selectMic = useCallback(async (id: string) => {
    savePick({ ...pickRef.current, mic: id });
    pickRef.current = { ...pickRef.current, mic: id };
    const l = local.current;
    if (!l.stream || !l.audio) return;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
      const track = mic.getAudioTracks()[0];
      if (!track) return;
      const old = l.audio;
      track.enabled = old.enabled;
      for (const c of conns.current.values()) {
        const sender = c.pc.getSenders().find((x) => x.track && x.track.id === old.id);
        if (sender) await sender.replaceTrack(track);
      }
      l.stream.removeTrack(old);
      old.stop();
      l.stream.addTrack(track);
      l.audio = track;
      setError(null);
    } catch {
      setError('Could not switch to that microphone.');
    }
  }, []);

  const selectCam = useCallback(async (id: string) => {
    savePick({ ...pickRef.current, cam: id });
    pickRef.current = { ...pickRef.current, cam: id };
    const l = local.current;
    if (!l.stream || !l.video) return;
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, ...videoSize() } });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      const old = l.video;
      for (const c of conns.current.values()) if (c.videoSender) await c.videoSender.replaceTrack(track);
      l.stream.removeTrack(old);
      old.stop();
      l.stream.addTrack(track);
      l.video = track;
      setSelfCam(new MediaStream([track]));
      setError(null);
    } catch {
      setError('Could not switch to that camera.');
    }
  }, []);

  const selectSpeaker = useCallback((id: string) => {
    savePick({ ...pickRef.current, speaker: id });
    pickRef.current = { ...pickRef.current, speaker: id };
    for (const c of conns.current.values()) void (c.audio as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id).catch(() => undefined);
  }, []);

  /** data saver on or off: takes effect on the live camera straight away */
  const setDataSaver = useCallback((on: boolean) => {
    setDataSaverState(on);
    saverRef.current = on;
    try { localStorage.setItem('kd:office:datasaver', on ? '1' : '0'); } catch { /* fine */ }
    void local.current.video?.applyConstraints(videoSize()).catch(() => undefined);
    for (const c of conns.current.values()) void capVideo(c.videoSender);
  }, []);

  /** cut background noise from my microphone (on or off) */
  const setNoise = useCallback((on: boolean) => {
    setNoiseState(on);
    noiseRef.current = on;
    try { localStorage.setItem('kd:office:noise', on ? '1' : '0'); } catch { /* fine */ }
    void local.current.audio?.applyConstraints({ noiseSuppression: on, echoCancellation: true, autoGainControl: true }).catch(() => undefined);
  }, []);

  const stopShare = useCallback(() => {
    const s = local.current.screen;
    if (!s) return;
    local.current.screen = null;
    s.track.onended = null;
    s.track.stop();
    s.audio?.stop();
    for (const c of conns.current.values()) {
      if (c.screenSender) { try { c.pc.removeTrack(c.screenSender); } catch { /* already gone */ } c.screenSender = null; }
      if (c.screenAudioSender) { try { c.pc.removeTrack(c.screenAudioSender); } catch { /* already gone */ } c.screenAudioSender = null; }
    }
    setSharing(false);
    setShareInfo(null);
    o.current.setShare?.(null); // everyone is told it stopped, so no stale picture is left open
  }, []);

  /** Share my screen, a window or a browser tab with everyone I am talking to. */
  const toggleShare = useCallback(async () => {
    if (local.current.screen) { stopShare(); return; }
    if (!local.current.stream || !navigator.mediaDevices?.getDisplayMedia) { setError('This browser cannot share the screen.'); return; }
    try {
      const wanted = {
        video: { frameRate: { ideal: 15, max: 30 }, width: { ideal: 1920, max: 2560 }, height: { ideal: 1080, max: 1440 } },
        audio: true, // the picker offers "also share audio" (a tab's or the computer's sound); it is only sent if the person ticks it
        // the office tab itself is never offered (sharing it would show a picture inside a picture), and the sharer may change what is shared without starting again
        selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include',
      } as DisplayMediaStreamOptions;
      let display: MediaStream;
      try {
        display = await navigator.mediaDevices.getDisplayMedia(wanted);
      } catch (e) {
        const n = (e as DOMException)?.name;
        if (n === 'NotAllowedError' || n === 'AbortError' || n === 'NotReadableError' || n === 'SecurityError') throw e;
        display = await navigator.mediaDevices.getDisplayMedia({ video: true }); // a browser that dislikes a setting above
      }
      const track = display.getVideoTracks()[0];
      if (!track || !local.current.stream) { display.getTracks().forEach((t) => t.stop()); return; }
      try { track.contentHint = 'detail'; } catch { /* the browser decides */ }
      const audioTrack = display.getAudioTracks()[0] ?? null;
      const stream = new MediaStream(audioTrack ? [track, audioTrack] : [track]);
      const st = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
      const surface: ShareSurface = st.displaySurface === 'monitor' || st.displaySurface === 'window' || st.displaySurface === 'browser' ? st.displaySurface : 'unknown';
      const info: ShareInfo = { sid: stream.id, pid: local.current.stream.id, label: track.label || '', surface, audio: !!audioTrack };
      local.current.screen = { stream, track, audio: audioTrack, info };
      track.onended = stopShare; // the browser's own "Stop sharing" button
      for (const c of conns.current.values()) {
        c.screenSender = c.pc.addTrack(track, stream); void capScreen(c.screenSender);
        if (audioTrack) c.screenAudioSender = c.pc.addTrack(audioTrack, stream);
      }
      setSharing(true);
      setShareInfo(info);
      o.current.setShare?.(info); // the office is told what is being shared, so everyone sees it and opens it
      setError(null);
    } catch (e) {
      const n = (e as DOMException)?.name;
      if (n === 'NotAllowedError' || n === 'AbortError') return; // the person closed the picker
      setError(n === 'NotReadableError'
        ? 'Your computer would not let the browser capture the screen. On a Mac, allow Screen Recording for this browser in System Settings, Privacy and Security, then try again.'
        : 'Could not start screen sharing.');
    }
  }, [stopShare]);

  // every few seconds, rate each connection (round trip time and lost packets) so a poor line is shown on the card
  useEffect(() => {
    if (!joined) return;
    const t = window.setInterval(() => {
      for (const c of conns.current.values()) {
        if (c.pc.connectionState !== 'connected') continue;
        void c.pc.getStats().then((rep) => {
          let rtt = 0;
          let received = 0;
          let lost = 0;
          rep.forEach((r) => {
            if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded') && typeof r.currentRoundTripTime === 'number') rtt = Math.max(rtt, r.currentRoundTripTime * 1000);
            if (r.type === 'inbound-rtp' && r.kind === 'audio') { received += r.packetsReceived ?? 0; lost += r.packetsLost ?? 0; }
          });
          const prev = c.lastIn;
          c.lastIn = { received, lost };
          const dr = prev ? received - prev.received : 0;
          const dl = prev ? Math.max(0, lost - prev.lost) : 0;
          const loss = dr + dl > 20 ? dl / (dr + dl) : 0;
          const q: 'good' | 'fair' | 'poor' = rtt > 400 || loss > 0.08 ? 'poor' : rtt > 200 || loss > 0.03 ? 'fair' : 'good';
          if (q !== c.quality) { c.quality = q; bump(); }
        }).catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [joined, bump]);

  /** Start every connection again from scratch (the "Reconnect" button, for when somebody cannot hear or be heard). */
  const reconnectAll = useCallback(() => {
    for (const id of [...conns.current.keys()]) resetConn(id);
    for (const id of [...notBefore.current.keys()]) notBefore.current.set(id, Date.now() + 500);
    resets.current.clear();
  }, [resetConn]);

  // the network came back, or the computer woke up: connections that dropped are started again, working ones look for a fresh route
  useEffect(() => {
    if (!joined) return;
    let hiddenAt = 0;
    const nudge = () => {
      for (const [id, c] of [...conns.current]) {
        if (c.pc.connectionState === 'connected') { try { c.pc.restartIce(); } catch { /* fine */ } } else resetConn(id);
      }
    };
    const onVisible = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30_000) nudge();
      hiddenAt = 0;
    };
    window.addEventListener('online', nudge);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', nudge); document.removeEventListener('visibilitychange', onVisible); };
  }, [joined, resetConn]);

  const toggleMutePeer = useCallback((id: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const tiles: Tile[] = [];
  const nowMs = Date.now();
  for (const [id, c] of conns.current) {
    const entry = opts.roster.find((r) => r.id === id);
    const who = entry?.name ?? 'Someone';
    const share = entry?.share;
    const v = c.stream.getVideoTracks()[0];
    tiles.push({
      id,
      name: who,
      stream: c.stream,
      hasVideo: !!v && !v.muted && v.readyState === 'live',
      muted: mutedPeers.has(id),
      avatar: entry?.avatar,
      micOn: entry?.mic,
      camOn: entry?.cam,
      conn: c.pc.connectionState === 'connected' ? 'connected' : c.connectedAt ? 'reconnecting' : 'connecting',
      quality: c.quality,
    });
    const sv = c.screen.getVideoTracks()[0];
    if (sv) {
      const announced = !!share && (c.sids.get(sv.id) ?? share.sid) === share.sid;
      const since = c.mutedSince.get(sv.id);
      if (screenVisible({ announced, everAnnounced: c.sawShare, live: sv.readyState === 'live', muted: sv.muted, mutedForMs: since ? nowMs - since : 0 })) {
        tiles.unshift({ id: `${id}:screen`, name: `${who}'s screen`, stream: c.screen, hasVideo: true, muted: false, screen: true, share: share ?? undefined, presenter: who });
      }
    }
  }
  const stableTiles = useMemo(() => tiles, [tiles.map((t) => `${t.id}${t.hasVideo}${t.muted}${t.name}${t.share?.sid ?? ''}${t.share?.label ?? ''}${t.micOn ?? ''}${t.camOn ?? ''}${t.conn ?? ''}${t.quality ?? ''}${t.avatar ? 'a' : ''}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  /** the people who are connected to me right now (who can see what I share) */
  const viewers = [...conns.current.keys()].map((id) => opts.roster.find((r) => r.id === id)?.name ?? 'Someone');
  const stableViewers = useMemo(() => viewers, [viewers.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // listen to the loudness of my microphone and of everyone in the call to know who is talking
  useEffect(() => {
    if (!joined) return;
    const ctx = new AudioContext();
    const probes = new Map<string, { an: AnalyserNode; src: MediaStreamAudioSourceNode; buf: Uint8Array<ArrayBuffer>; last: number }>();
    const level = (p: { an: AnalyserNode; buf: Uint8Array<ArrayBuffer> }) => {
      p.an.getByteTimeDomainData(p.buf);
      let sum = 0;
      for (const v of p.buf) { const d = (v - 128) / 128; sum += d * d; }
      return Math.sqrt(sum / p.buf.length);
    };
    const tick = () => {
      const want = new Map<string, MediaStream>();
      const l = local.current;
      if (l.audio && l.audio.enabled) want.set('', new MediaStream([l.audio]));
      for (const [id, c] of conns.current) if (c.stream.getAudioTracks().length) want.set(id, c.stream);
      for (const [id, p] of probes) if (!want.has(id)) { p.src.disconnect(); probes.delete(id); }
      for (const [id, st] of want) {
        const trackId = st.getAudioTracks()[0]?.id ?? '';
        const key = id + ':' + trackId;
        const have = probes.get(id) as ({ key?: string } & ReturnType<typeof probes.get>) | undefined;
        if (have && (have as unknown as { key: string }).key === key) continue;
        if (have) { have.src.disconnect(); probes.delete(id); }
        try {
          const src = ctx.createMediaStreamSource(st);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          const probe = { an, src, buf: new Uint8Array(an.fftSize) as Uint8Array<ArrayBuffer>, last: 0, key };
          probes.set(id, probe as unknown as { an: AnalyserNode; src: MediaStreamAudioSourceNode; buf: Uint8Array<ArrayBuffer>; last: number });
        } catch { /* a stream that cannot be listened to is simply never shown as talking */ }
      }
      const now = Date.now();
      const next = new Set<string>();
      for (const [id, p] of probes) {
        if (level(p) > 0.03) p.last = now;
        if (now - p.last < 350) next.add(id);
      }
      const prev = speaking.current;
      if (next.size !== prev.size || [...next].some((x) => !prev.has(x))) {
        speaking.current = next;
        setSpeakingIds(next);
      }
    };
    const timer = setInterval(tick, 120);
    return () => {
      clearInterval(timer);
      for (const p of probes.values()) p.src.disconnect();
      void ctx.close().catch(() => undefined);
      speaking.current = new Set();
      setSpeakingIds(new Set());
    };
  }, [joined]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__kdCalls = async () => {
      const out: Record<string, unknown>[] = [];
      for (const [id, c] of conns.current) {
        let inBytes = 0;
        let outBytes = 0;
        (await c.pc.getStats()).forEach((r) => {
          if (r.type === 'inbound-rtp') inBytes += r.bytesReceived ?? 0;
          if (r.type === 'outbound-rtp') outBytes += r.bytesSent ?? 0;
        });
        out.push({ id: id.slice(0, 8), state: c.pc.connectionState, ice: c.pc.iceConnectionState, inBytes, outBytes, audio: c.stream.getAudioTracks().length, video: c.stream.getVideoTracks().length, screen: c.screen.getVideoTracks().length });
      }
      return { joined: joinedRef.current, peers: out };
    };
  }, []);

  /** The screen I am sharing, if any (a recording by the presenter includes it). */
  const localScreen = useCallback((): MediaStream | null => local.current.screen?.stream ?? null, []);

  /** Every audio stream in the call right now (mine and everyone connected), for the recorder to mix. */
  const audioStreams = useCallback((): MediaStream[] => {
    const out: MediaStream[] = [];
    const l = local.current;
    if (l.stream && l.audio) out.push(new MediaStream([l.audio]));
    if (l.screen?.audio) out.push(new MediaStream([l.screen.audio])); // the sound that comes with my shared screen
    for (const c of conns.current.values()) {
      if (c.stream.getAudioTracks().length) out.push(c.stream);
      if (c.screen.getAudioTracks().length) out.push(c.screen);
    }
    return out;
  }, []);

  return { joined, busy, error, micOn, camOn, selfCam, sharing, shareInfo, viewers: stableViewers, speaking, speakingIds, tiles: stableTiles, join, leave, toggleMic, toggleCam, toggleShare, toggleMutePeer, reconnectAll, audioStreams, localScreen, devices, pick, noise, dataSaver, setDataSaver, selectMic, selectCam, selectSpeaker, setNoise, refreshDevices };
}
