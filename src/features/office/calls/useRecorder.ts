import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Records a meeting room (a video of the office, or of the shared screen with everyone's pictures when somebody shares one, with everyone's voices; sound only if the picture is not available), on the recorder's own computer, and saves it to private storage.
 *  - Only people listed in office_recorders may record (the database enforces this too).
 *  - Only inside a meeting room, and only while joined to voice. Leaving the room or the call stops it.
 *  - Everyone in the room is told (announce flag, shown as a banner by the page).
 *  - Mixes my microphone and everyone connected to me into one track, saved in parts of about 15 minutes so a
 *    crash or closed tab loses at most the current part.
 */

export const SEGMENT_MS = 15 * 60 * 1000;

export interface RoomInfo { id: string; name: string }
export interface UnsentPart { name: string; blob: Blob }

interface Opts {
  meId: string | null;
  spaceId: string | null;
  canRecord: boolean;
  joined: boolean;
  room: RoomInfo | null;
  getStreams: () => MediaStream[];
  getNames: () => string[];
  /** a live video of the office (the map), recorded together with the sound; none means audio only */
  getVideoTrack?: () => MediaStreamTrack | null;
  /** tells the room we started or stopped */
  announce: (on: boolean) => void;
}

function pickMime(video: boolean): string | undefined {
  const list = video
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const m of list) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function useRecorder(opts: Opts) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unsent, setUnsent] = useState<UnsentPart[]>([]);
  const o = useRef(opts);
  o.current = opts;

  const run = useRef<{
    ctx: AudioContext;
    dest: MediaStreamAudioDestinationNode;
    sources: Map<string, MediaStreamAudioSourceNode>;
    rec: MediaRecorder | null;
    session: string;
    part: number;
    room: RoomInfo;
    spaceId: string | null;
    meId: string;
    mime: string | undefined;
    video: MediaStreamTrack | null;
    segStart: number;
    startedAt: Date;
    names: Set<string>;
    sync: ReturnType<typeof setInterval>;
    rotate: ReturnType<typeof setTimeout> | null;
    tick: ReturnType<typeof setInterval>;
    stopping: boolean;
  } | null>(null);

  const upload = useCallback(async (blob: Blob, r: NonNullable<typeof run.current>, part: number, startedAt: Date, durationS: number, names: string[]) => {
    const isVideo = !!r.video;
    const ext = r.mime?.includes('ogg') ? 'ogg' : r.mime?.includes('mp4') ? (isVideo ? 'mp4' : 'm4a') : 'webm';
    const path = `${r.meId}/${r.session}/part-${String(part).padStart(3, '0')}${isVideo ? '-v' : ''}.${ext}`;
    const up = await supabase.storage.from('office-recordings').upload(path, blob, { contentType: blob.type || (isVideo ? 'video/webm' : 'audio/webm'), upsert: false });
    if (up.error) throw up.error;
    const ins = await supabase.from('office_recordings').insert({
      session_id: r.session, part, space_id: r.spaceId, room_id: r.room.id, room_name: r.room.name,
      recorded_by: r.meId, started_at: startedAt.toISOString(), duration_s: durationS, size_bytes: blob.size, path, participants: names,
    });
    if (ins.error) throw ins.error;
  }, []);

  /** start a recorder for one part; when it ends the part is uploaded */
  const startPart = useCallback((r: NonNullable<typeof run.current>) => {
    const chunks: Blob[] = [];
    const source = r.video ? new MediaStream([...r.dest.stream.getAudioTracks(), r.video]) : r.dest.stream;
    const rec = new MediaRecorder(source, { mimeType: r.mime, audioBitsPerSecond: 64_000, ...(r.video ? { videoBitsPerSecond: 2_500_000 } : {}) });
    const part = r.part;
    const startedAt = new Date();
    r.segStart = Date.now();
    r.rec = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || (r.video ? 'video/webm' : 'audio/webm') });
      const durationS = Math.round((Date.now() - r.segStart) / 1000);
      const names = [...r.names];
      if (blob.size < 2000) return; // nothing worth keeping
      upload(blob, r, part, startedAt, durationS, names)
        .then(() => setSaved((n) => n + 1))
        .catch((e: unknown) => {
          setUnsent((u) => [...u, { name: `${r.room.name.replace(/\W+/g, '-')}-part-${part}.webm`, blob }]);
          setError(`A recording part could not be saved (${(e as Error)?.message ?? 'upload failed'}). Download it below so it is not lost.`);
        });
    };
    rec.start(10_000);
    r.part += 1;
    r.rotate = setTimeout(() => {
      if (r.stopping) return;
      if (rec.state !== 'inactive') rec.stop();
      startPart(r);
    }, SEGMENT_MS);
  }, [upload]);

  const stop = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.stopping = true;
    clearInterval(r.sync);
    clearInterval(r.tick);
    if (r.rotate) clearTimeout(r.rotate);
    if (r.rec && r.rec.state !== 'inactive') r.rec.stop();
    // give the last part a moment to be handed over before the mixer is closed
    setTimeout(() => { void r.ctx.close().catch(() => undefined); r.video?.stop(); }, 1500);
    run.current = null;
    setRecording(false);
    setSeconds(0);
    o.current.announce(false);
  }, []);

  const start = useCallback(() => {
    const { meId, spaceId, canRecord, joined, room } = o.current;
    if (run.current || !meId || !canRecord || !joined || !room) return;
    if (typeof MediaRecorder === 'undefined') { setError('This browser cannot record audio.'); return; }
    setError(null);
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    let video: MediaStreamTrack | null = null;
    try { video = o.current.getVideoTrack?.() ?? null; } catch { video = null; }
    const mime = pickMime(!!video) ?? (video ? pickMime(false) : undefined);
    if (video && !mime?.startsWith('video')) video = null;
    const sources = new Map<string, MediaStreamAudioSourceNode>();
    const names = new Set<string>(o.current.getNames());
    const syncSources = () => {
      const live = new Map<string, MediaStream>();
      for (const s of o.current.getStreams()) { const t = s.getAudioTracks()[0]; if (t) live.set(t.id, s); }
      for (const [id, s] of live) {
        if (!sources.has(id)) { const n = ctx.createMediaStreamSource(s); n.connect(dest); sources.set(id, n); }
      }
      for (const [id, n] of sources) if (!live.has(id)) { n.disconnect(); sources.delete(id); }
      for (const n of o.current.getNames()) names.add(n);
    };
    syncSources();
    const r: NonNullable<typeof run.current> = {
      ctx, dest, sources, rec: null, session: crypto.randomUUID(), part: 1, room, spaceId, meId, mime, video,
      segStart: Date.now(), startedAt: new Date(), names,
      sync: setInterval(syncSources, 1000), rotate: null,
      tick: setInterval(() => setSeconds(Math.round((Date.now() - r.startedAt.getTime()) / 1000)), 1000),
      stopping: false,
    };
    run.current = r;
    startPart(r);
    setRecording(true);
    setSaved(0);
    o.current.announce(true);
  }, [startPart]);

  // stop automatically when I leave the room, leave the call, or change office
  useEffect(() => {
    const r = run.current;
    if (r && (!opts.joined || opts.room?.id !== r.room.id || opts.spaceId !== r.spaceId)) stop();
  }, [opts.joined, opts.room?.id, opts.spaceId, stop]);

  // closing the tab mid-meeting: warn, and stop on unmount
  useEffect(() => {
    if (!recording) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording]);
  useEffect(() => () => { if (run.current) stop(); }, [stop]);

  const dismissUnsent = useCallback(() => { setUnsent([]); setError(null); }, []);

  return { recording, seconds, saved, error, unsent, start, stop, dismissUnsent };
}
