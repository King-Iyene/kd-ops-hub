import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { iceConfig } from '../calls/useCalls';

/**
 * The private visitor room: a small video call between a guest and the people who let them in.
 * It runs over a realtime channel whose name is a long random secret, which a guest only learns after being let in.
 * Nothing here touches the database, so a guest can reach nothing else.
 */
export interface RoomPeer { id: string; name: string; stream: MediaStream | null }
export interface RoomChat { id: string; from: string; text: string; at: number; mine: boolean }

interface Conn { pc: RTCPeerConnection; polite: boolean; making: boolean; ignore: boolean; stream: MediaStream }
type Sig = { f: string; t: string; k: 'sdp' | 'ice'; d: unknown };

export function useGuestRoom(opts: { secret: string | null; name: string }) {
  const { secret, name } = opts;
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chat, setChat] = useState<RoomChat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const meId = useRef(crypto.randomUUID());
  const conns = useRef(new Map<string, Conn>());
  const names = useRef(new Map<string, string>());
  const localRef = useRef<MediaStream | null>(null);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const publish = useCallback(() => {
    setPeers([...conns.current.entries()].map(([id, c]) => ({ id, name: names.current.get(id) ?? 'Guest', stream: c.stream.getTracks().length ? c.stream : null })));
  }, []);

  // my camera and microphone (video is optional: if there is no camera we still join with sound)
  useEffect(() => {
    if (!secret) return;
    let live = true;
    void (async () => {
      let stream: MediaStream | null = null;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } }); } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setCamOn(false); setError('No camera, so you joined with sound only.'); } catch {
          setError('We could not use your microphone or camera. Allow them in your browser and try again.'); setMicOn(false); setCamOn(false);
        }
      }
      if (!live) { stream?.getTracks().forEach((t) => t.stop()); return; }
      localRef.current = stream;
      setLocal(stream);
    })();
    return () => { live = false; localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null; setLocal(null); };
  }, [secret]);

  // the room itself
  useEffect(() => {
    if (!secret || !local) return;
    const id = meId.current;
    const ch = supabase.channel(`guest-room:${secret}`, { config: { broadcast: { self: false }, presence: { key: id } } });
    chanRef.current = ch;

    const send = (m: Sig) => { void ch.send({ type: 'broadcast', event: 'sig', payload: m }); };
    const make = (peer: string): Conn => {
      const pc = new RTCPeerConnection(iceConfig());
      const c: Conn = { pc, polite: id > peer, making: false, ignore: false, stream: new MediaStream() };
      conns.current.set(peer, c);
      for (const t of local.getTracks()) pc.addTrack(t, local);
      pc.onicecandidate = (e) => { if (e.candidate) send({ f: id, t: peer, k: 'ice', d: e.candidate.toJSON() }); };
      pc.onnegotiationneeded = async () => {
        try { c.making = true; await pc.setLocalDescription(); send({ f: id, t: peer, k: 'sdp', d: pc.localDescription?.toJSON() }); } catch { /* the next sync tries again */ } finally { c.making = false; }
      };
      pc.ontrack = (e) => { c.stream.addTrack(e.track); e.track.onunmute = publish; publish(); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); };
      publish();
      return c;
    };

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, { name?: string }[]>;
      const here = new Set<string>();
      for (const [k, v] of Object.entries(state)) {
        if (k === id) continue;
        here.add(k);
        names.current.set(k, (v[0]?.name ?? 'Guest').slice(0, 60));
        if (!conns.current.has(k)) make(k);
      }
      for (const [k, c] of [...conns.current]) {
        if (!here.has(k)) { c.pc.close(); conns.current.delete(k); names.current.delete(k); }
      }
      publish();
    });
    ch.on('broadcast', { event: 'sig' }, async ({ payload }) => {
      const m = payload as Sig | null;
      if (!m || m.t !== id || typeof m.f !== 'string') return;
      const c = conns.current.get(m.f) ?? make(m.f);
      try {
        if (m.k === 'sdp') {
          const desc = m.d as RTCSessionDescriptionInit;
          const collision = desc.type === 'offer' && (c.making || c.pc.signalingState !== 'stable');
          c.ignore = !c.polite && collision;
          if (c.ignore) return;
          await c.pc.setRemoteDescription(desc);
          if (desc.type === 'offer') { await c.pc.setLocalDescription(); send({ f: id, t: m.f, k: 'sdp', d: c.pc.localDescription?.toJSON() }); }
        } else {
          try { await c.pc.addIceCandidate(m.d as RTCIceCandidateInit); } catch (e) { if (!c.ignore) throw e; }
        }
      } catch { /* a bad message from one person must not break the room */ }
    });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      const m = payload as { id?: string; from?: string; text?: string } | null;
      if (!m || typeof m.text !== 'string' || typeof m.from !== 'string') return;
      setChat((l) => [...l.slice(-199), { id: String(m.id ?? crypto.randomUUID()), from: m.from!.slice(0, 60), text: m.text!.slice(0, 500), at: Date.now(), mine: false }]);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { setConnected(true); await ch.track({ name }); }
    });

    return () => {
      for (const c of conns.current.values()) c.pc.close();
      conns.current.clear();
      names.current.clear();
      chanRef.current = null;
      setConnected(false);
      setPeers([]);
      void supabase.removeChannel(ch);
    };
  }, [secret, local, name, publish]);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  }, []);
  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  }, []);
  const sendChat = useCallback((text: string) => {
    const clean = text.trim().slice(0, 500);
    const ch = chanRef.current;
    if (!clean || !ch) return;
    const msg = { id: crypto.randomUUID(), from: name, text: clean };
    void ch.send({ type: 'broadcast', event: 'chat', payload: msg });
    setChat((l) => [...l.slice(-199), { ...msg, at: Date.now(), mine: true }]);
  }, [name]);

  return { peers, local, micOn, camOn, chat, error, connected, toggleMic, toggleCam, sendChat };
}
