import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Who } from '../useOffice';
import { isInitiator, parseSignal, volumeFor, wantsConnection, type RtcSignal, type Spot } from './rules';

/**
 * Voice and video between the people in the office, straight from browser to browser (WebRTC).
 * Nothing runs until you press "Join voice". The office channel only carries the small set-up messages;
 * the audio and video never touch our servers. Who is connected to whom comes from rules.ts and is re-checked
 * a couple of times a second, so walking away or into a meeting room changes who you hear within a moment.
 *
 * Free Google STUN servers find the route. On a few strict office networks a relay (TURN server) would be needed;
 * add one by filling VITE_TURN_URL, VITE_TURN_USER and VITE_TURN_CREDENTIAL.
 */

function iceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
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
  pending: RTCIceCandidateInit[];
}

interface LocalMedia {
  stream: MediaStream | null;
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  screen: { stream: MediaStream; track: MediaStreamTrack } | null;
}

export interface Tile {
  /** a shared screen rather than a camera (shown larger) */
  screen?: boolean;
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
  /** where someone else is standing (null when unknown) */
  lookup: (id: string) => Spot | null;
  /** where I am standing */
  self: () => Spot;
  send: (s: RtcSignal) => void;
  setHandler: (h: ((raw: unknown) => void) | null) => void;
}

export function useCalls(opts: Opts) {
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [selfCam, setSelfCam] = useState<MediaStream | null>(null);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
  const [, setVersion] = useState(0);

  const o = useRef(opts);
  o.current = opts;
  const conns = useRef(new Map<string, Conn>());
  const local = useRef<LocalMedia>({ stream: null, audio: null, video: null, screen: null });
  const [sharing, setSharing] = useState(false);
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
    bump();
  }, [bump]);

  const closeAll = useCallback(() => { for (const id of [...conns.current.keys()]) close(id); }, [close]);

  const create = useCallback((id: string): Conn => {
    const me = o.current.meId as string;
    const pc = new RTCPeerConnection(iceConfig());
    const stream = new MediaStream();
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    const c: Conn = { pc, polite: !isInitiator(me, id), making: false, ignore: false, stream, audio, videoSender: null, primary: null, screen: new MediaStream(), screenSender: null, pending: [] };
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
      // the microphone always arrives first and names the main stream; a video from any other stream is a shared screen
      if (t.kind === 'audio' && !c.primary) c.primary = sid;
      const target = t.kind === 'video' && c.primary && sid && sid !== c.primary ? c.screen : stream;
      if (!target.getTracks().includes(t)) target.addTrack(t);
      t.onmute = bump;
      t.onunmute = bump;
      t.onended = () => { target.removeTrack(t); bump(); };
      bump();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') close(id);
    };

    const l = local.current;
    if (l.stream && l.audio) pc.addTrack(l.audio, l.stream);
    else pc.addTransceiver('audio', { direction: 'recvonly' }); // listening only: still receive their voice
    if (l.stream && l.video) c.videoSender = pc.addTrack(l.video, l.stream);
    if (l.screen) c.screenSender = pc.addTrack(l.screen.track, l.screen.stream);
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
      const { meId, spaceId, roster, lookup, self } = o.current;
      if (!meId) return;
      const mine = self();
      const here = new Set<string>();
      for (const r of roster) {
        if (r.id === meId || r.spaceId !== spaceId) continue;
        here.add(r.id);
        const other = lookup(r.id);
        if (!other) continue;
        const c = conns.current.get(r.id);
        const want = wantsConnection(mine, other, !!c);
        if (want && !c && isInitiator(meId, r.id)) create(r.id);
        else if (!want && c) close(r.id);
        const cur = conns.current.get(r.id);
        if (cur) cur.audio.volume = mutedRef.current.has(r.id) ? 0 : volumeFor(mine, other);
      }
      for (const id of [...conns.current.keys()]) if (!here.has(id)) close(id);
    };
    const t = setInterval(tick, 400);
    tick();
    return () => clearInterval(t);
  }, [joined, create, close]);

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
    local.current = { stream: null, audio: null, video: null, screen: null };
    setSharing(false);
  }, []);

  const join = useCallback(async () => {
    if (joinedRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
      setMicOn(!!local.current.audio);
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
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } });
      const track = cam.getVideoTracks()[0];
      if (!track || !l.stream) return;
      l.stream.addTrack(track);
      l.video = track;
      for (const c of conns.current.values()) c.videoSender = c.pc.addTrack(track, l.stream);
      setCamOn(true);
      setSelfCam(new MediaStream([track]));
      setError(null);
    } catch {
      setError('Could not start the camera. Click the padlock left of the web address, set Camera to Allow, and try again.');
    }
  }, []);

  const stopShare = useCallback(() => {
    const s = local.current.screen;
    if (!s) return;
    local.current.screen = null;
    s.track.onended = null;
    s.track.stop();
    for (const c of conns.current.values()) {
      if (c.screenSender) { try { c.pc.removeTrack(c.screenSender); } catch { /* already gone */ } c.screenSender = null; }
    }
    setSharing(false);
  }, []);

  /** Share my screen, a window or a browser tab with everyone I am talking to. */
  const toggleShare = useCallback(async () => {
    if (local.current.screen) { stopShare(); return; }
    if (!local.current.stream || !navigator.mediaDevices?.getDisplayMedia) { setError('This browser cannot share the screen.'); return; }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      const stream = new MediaStream([track]);
      local.current.screen = { stream, track };
      track.onended = stopShare; // the browser's own "Stop sharing" button
      for (const c of conns.current.values()) c.screenSender = c.pc.addTrack(track, stream);
      setSharing(true);
      setError(null);
    } catch (e) {
      if ((e as DOMException)?.name !== 'NotAllowedError') setError('Could not start screen sharing.');
    }
  }, [stopShare]);

  const toggleMutePeer = useCallback((id: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const tiles: Tile[] = [];
  for (const [id, c] of conns.current) {
    const v = c.stream.getVideoTracks()[0];
    tiles.push({
      id,
      name: opts.roster.find((r) => r.id === id)?.name ?? 'Someone',
      stream: c.stream,
      hasVideo: !!v && !v.muted && v.readyState === 'live',
      muted: mutedPeers.has(id),
    });
    const sv = c.screen.getVideoTracks()[0];
    if (sv && !sv.muted && sv.readyState === 'live') {
      const who = opts.roster.find((r) => r.id === id)?.name ?? 'Someone';
      tiles.unshift({ id: `${id}:screen`, name: `${who}'s screen`, stream: c.screen, hasVideo: true, muted: false, screen: true });
    }
  }
  const stableTiles = useMemo(() => tiles, [tiles.map((t) => `${t.id}${t.hasVideo}${t.muted}${t.name}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Every audio stream in the call right now (mine and everyone connected), for the recorder to mix. */
  const audioStreams = useCallback((): MediaStream[] => {
    const out: MediaStream[] = [];
    const l = local.current;
    if (l.stream && l.audio) out.push(new MediaStream([l.audio]));
    for (const c of conns.current.values()) if (c.stream.getAudioTracks().length) out.push(c.stream);
    return out;
  }, []);

  return { joined, busy, error, micOn, camOn, selfCam, sharing, tiles: stableTiles, join, leave, toggleMic, toggleCam, toggleShare, toggleMutePeer, audioStreams };
}
