import { Circle, DoorOpen, Headphones, LayoutGrid, Lock, LockOpen, LogOut, Mic, MicOff, MonitorOff, MonitorUp, Square, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Tile } from './useCalls';

interface Props {
  joined: boolean;
  busy: boolean;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  selfCam: MediaStream | null;
  sharing: boolean;
  onShare: () => void;
  onMeeting: () => void;
  /** ids of people talking now ('' is me), and my name, for the video tray */
  speakingIds: Set<string>;
  meName: string;
  /** size of the video tiles: 0 small, 1 medium, 2 large */
  traySize: 0 | 1 | 2;
  tiles: Tile[];
  /** name of the meeting room I am standing in, or null in the open */
  roomName: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onMic: () => void;
  onCam: () => void;
  onMutePeer: (id: string) => void;
  /** recording: allowed to record, am recording, seconds so far, and a notice when anyone in my room is recording */
  canRecord: boolean;
  recording: boolean;
  recSeconds: number;
  recNotice: string | null;
  recError: string | null;
  unsent: { name: string; blob: Blob }[];
  onRecord: () => void;
  onStopRecord: () => void;
  onDismissUnsent: () => void;
  /** locking: is my meeting room locked, who is knocking, and what I can do about it */
  roomLocked: boolean;
  knocks: { id: string; name: string; room: string }[];
  onToggleLock: () => void;
  onLetIn: (k: { id: string; room: string }) => void;
  onDismissKnock: (id: string) => void;
  /** the profile card shown at the left of the bar */
  leading?: React.ReactNode;
}

function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** A shared screen, shown larger; click to open it full size. */
function ScreenTile({ tile }: { tile: Tile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = tile.stream; void v.play().catch(() => undefined); }
  }, [tile.stream]);
  return (
    <div className="relative h-40 w-64 overflow-hidden rounded-lg border border-border bg-slate-900 shadow-lg">
      <video ref={ref} muted playsInline onClick={() => void ref.current?.requestFullscreen?.().catch(() => undefined)} className="h-full w-full cursor-zoom-in object-contain" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-0.5 text-[11px] text-white">{tile.name}</span>
    </div>
  );
}

/** A person in the video tray: their picture (or an initial), a green frame while they talk, mute, click for the big view. */
const TRAY_SIZES = ['h-24 w-36', 'h-36 w-52 sm:h-44 sm:w-64', 'h-48 w-72 sm:h-60 sm:w-80'];

function TrayTile({ stream, name, speaking, muted, mirror, size, onMute, onOpen }: { size: 0 | 1 | 2; stream: MediaStream | null; name: string; speaking: boolean; muted?: boolean; mirror?: boolean; onMute?: () => void; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && stream) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  return (
    <div className={`group relative ${TRAY_SIZES[size]} shrink-0 overflow-hidden rounded-xl border-2 bg-slate-900 shadow-lg ${speaking ? 'border-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.75)]' : 'border-white/70'}`}>
      {stream ? (
        <video ref={ref} muted playsInline onClick={onOpen} className={`h-full w-full cursor-pointer object-cover ${mirror ? '-scale-x-100' : ''}`} />
      ) : (
        <button type="button" onClick={onOpen} className="flex h-full w-full items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/25 text-2xl font-semibold text-primary">{name.slice(0, 1).toUpperCase()}</span></button>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2.5 py-1 text-xs text-white">
        <span className="truncate">{name}</span>
        {onMute && (
          <button type="button" onClick={onMute} aria-label={muted ? `Unmute ${name}` : `Mute ${name}`} title={muted ? 'Unmute them' : 'Mute them (only for you)'} className="ml-1 rounded p-0.5 hover:bg-white/25">
            {muted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** One small icon button. */
function Btn({ on, ok, danger, label, onClick, disabled, children }: { on?: boolean; ok?: boolean; danger?: boolean; label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  const tone = danger ? 'bg-red-600 text-white hover:bg-red-700' : ok ? 'bg-emerald-500/20 text-emerald-600 ring-1 ring-emerald-500/50 hover:bg-emerald-500/30 dark:text-emerald-400' : on ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-foreground hover:bg-muted';
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors disabled:opacity-50 ${tone}`}>
      {children}
    </button>
  );
}

/**
 * The bottom bar: lock, microphone, camera, share, record and leave, all small and together.
 * Cameras show as bubbles above people on the map; this keeps the people you can hear (with a mute each) and shared screens.
 */
export function CallDock({
  joined, busy, error, micOn, camOn, sharing, onShare, onMeeting, speakingIds, meName, traySize, selfCam, tiles, roomName, onJoin, onLeave, onMic, onCam, onMutePeer,
  canRecord, recording, recSeconds, recNotice, recError, unsent, onRecord, onStopRecord, onDismissUnsent,
  roomLocked, knocks, onToggleLock, onLetIn, onDismissKnock, leading,
}: Props) {
  const screens = tiles.filter((t) => t.screen);
  const people = tiles.filter((t) => !t.screen);
  return (
    <>
      {joined && (people.length > 0 || camOn) && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-10 flex max-w-[92%] -translate-x-1/2 gap-2 overflow-x-auto px-1 pb-1">
          {camOn && selfCam && <TrayTile size={traySize} stream={selfCam} name={`You${meName ? '' : ''}`} speaking={speakingIds.has('')} mirror onOpen={onMeeting} />}
          {people.map((t) => (
            <TrayTile key={t.id} size={traySize} stream={t.hasVideo ? t.stream : null} name={t.name} speaking={speakingIds.has(t.id)} muted={t.muted} onMute={() => onMutePeer(t.id)} onOpen={onMeeting} />
          ))}
        </div>
      )}
      {joined && screens.length > 0 && (
        <div className="absolute right-3 top-3 flex max-h-[75%] flex-col items-end gap-1.5 overflow-y-auto">
          {screens.map((t) => <ScreenTile key={t.id} tile={t} />)}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-3">
        {error && <p className="pointer-events-auto rounded-md bg-destructive px-2.5 py-0.5 text-[11px] text-destructive-foreground shadow">{error}</p>}
        {knocks.map((k) => (
          <div key={k.id} className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] shadow-lg">
            <DoorOpen className="h-3.5 w-3.5 text-primary" />
            <span><strong>{k.name}</strong> is knocking</span>
            <button type="button" className="rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground" onClick={() => onLetIn(k)}>Let in</button>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onDismissKnock(k.id)} aria-label="Ignore">✕</button>
          </div>
        ))}
        {recNotice && (
          <p className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-0.5 text-[11px] font-medium text-white shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{recNotice}
          </p>
        )}
        {recError && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-destructive px-2.5 py-0.5 text-[11px] text-destructive-foreground shadow">
            <span>{recError}</span>
            {unsent.map((u) => <button key={u.name} type="button" className="underline" onClick={() => downloadBlob(u.name, u.blob)}>Download {u.name}</button>)}
            <button type="button" className="opacity-80" onClick={onDismissUnsent} aria-label="Dismiss">✕</button>
          </div>
        )}
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
          {leading && (
            <>
              {leading}
              <span className="mx-0.5 h-5 w-px bg-border" />
            </>
          )}
          {roomName && (
            <>
              <Btn on={roomLocked} label={roomLocked ? 'Unlock the room' : 'Lock the room so nobody else can walk in'} onClick={onToggleLock}>
                {roomLocked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </Btn>
              <span className="mx-0.5 h-5 w-px bg-border" />
            </>
          )}
          {!joined ? (
            <Btn label="Join voice and video" onClick={onJoin} disabled={busy}><Headphones className="h-4 w-4" />{busy ? 'Starting…' : 'Join voice'}</Btn>
          ) : (
            <>
              <Btn ok={micOn} danger={!micOn} label={micOn ? 'Microphone is ON: click to mute' : 'Microphone is OFF: click to turn on'} onClick={onMic}>{micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}</Btn>
              <Btn ok={camOn} danger={!camOn} label={camOn ? 'Camera is ON: click to turn off' : 'Camera is OFF: click to turn on'} onClick={onCam}>{camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}</Btn>
              <Btn on={sharing} label={sharing ? 'Stop sharing your screen' : 'Share your screen, a window or a tab'} onClick={onShare}>{sharing ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}</Btn>
              <Btn label="Meeting view: everyone large, like a meeting" onClick={onMeeting}><LayoutGrid className="h-4 w-4" /></Btn>
              {canRecord && roomName && (
                recording
                  ? <Btn danger label="Stop recording" onClick={onStopRecord}><Square className="h-3 w-3 fill-current" />{clock(recSeconds)}</Btn>
                  : <Btn label="Record this meeting (everyone in the room is told)" onClick={onRecord}><Circle className="h-3.5 w-3.5 fill-red-500 text-red-500" /></Btn>
              )}
              <span className="mx-0.5 h-5 w-px bg-border" />
              <Btn label="Leave voice" onClick={onLeave}><LogOut className="h-4 w-4" /></Btn>
              <span className="hidden px-1.5 text-[11px] text-muted-foreground lg:inline">
                {roomName ? 'Private room' : people.length ? `${people.length} nearby` : 'Walk up to someone'}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
