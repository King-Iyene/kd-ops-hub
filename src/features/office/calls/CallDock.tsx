import { useEffect, useRef } from 'react';
import { Circle, DoorOpen, Headphones, Lock, LockOpen, Mic, MicOff, PhoneOff, Square, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tile } from './useCalls';

interface Props {
  joined: boolean;
  busy: boolean;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  selfCam: MediaStream | null;
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

function VideoTile({ tile, onMute }: { tile: Tile; onMute: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = tile.stream; void v.play().catch(() => undefined); }
  }, [tile.stream, tile.hasVideo]);
  return (
    <div className="relative h-24 w-36 overflow-hidden rounded-lg border border-border bg-slate-900 shadow">
      {/* the sound plays through a separate audio element, so this picture is always muted */}
      <video ref={ref} muted playsInline className={`h-full w-full object-cover ${tile.hasVideo ? '' : 'hidden'}`} />
      {!tile.hasVideo && (
        <div className="flex h-full w-full items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-semibold text-primary">{tile.name.slice(0, 1).toUpperCase()}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-0.5 text-[11px] text-white">
        <span className="truncate">{tile.name}</span>
        <button type="button" onClick={onMute} className="ml-1 shrink-0 rounded p-0.5 hover:bg-white/20" aria-label={tile.muted ? `Unmute ${tile.name}` : `Mute ${tile.name}`} title={tile.muted ? 'Unmute them' : 'Mute them (only for you)'}>
          {tile.muted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** My own camera, mirrored like a mirror, so I can see what others see. */
function SelfTile({ stream, micOn }: { stream: MediaStream; micOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  return (
    <div className="relative h-24 w-36 overflow-hidden rounded-lg border-2 border-primary/60 bg-slate-900 shadow">
      <video ref={ref} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-0.5 text-[11px] text-white">
        <span>You</span>
        {!micOn && <MicOff className="h-3.5 w-3.5 text-red-400" />}
      </div>
    </div>
  );
}

/** Join button, mic and camera controls, and a tile for each person you are talking to. */
export function CallDock({ joined, busy, error, micOn, camOn, selfCam, tiles, roomName, onJoin, onLeave, onMic, onCam, onMutePeer, canRecord, recording, recSeconds, recNotice, recError, unsent, onRecord, onStopRecord, onDismissUnsent, roomLocked, knocks, onToggleLock, onLetIn, onDismissKnock }: Props) {
  return (
    <>
      {joined && (tiles.length > 0 || selfCam) && (
        <div className="absolute right-3 top-3 flex max-h-[70%] flex-col gap-2 overflow-y-auto">
          {selfCam && <SelfTile stream={selfCam} micOn={micOn} />}
          {tiles.map((t) => <VideoTile key={t.id} tile={t} onMute={() => onMutePeer(t.id)} />)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1.5 px-3">
        {error && <p className="pointer-events-auto rounded-lg bg-destructive px-3 py-1 text-xs text-destructive-foreground shadow">{error}</p>}
        {knocks.map((k) => (
          <div key={k.id} className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs shadow-lg">
            <DoorOpen className="h-4 w-4 text-primary" />
            <span><strong>{k.name}</strong> is knocking</span>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={() => onLetIn(k)}>Let in</Button>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onDismissKnock(k.id)} aria-label="Ignore">✕</button>
          </div>
        ))}
        {recNotice && (
          <p className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white shadow">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />{recNotice}
          </p>
        )}
        {recError && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg bg-destructive px-3 py-1 text-xs text-destructive-foreground shadow">
            <span>{recError}</span>
            {unsent.map((u) => <button key={u.name} type="button" className="underline" onClick={() => downloadBlob(u.name, u.blob)}>Download {u.name}</button>)}
            <button type="button" className="ml-1 opacity-80" onClick={onDismissUnsent} aria-label="Dismiss">✕</button>
          </div>
        )}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          {roomName && (
            <Button size="sm" variant={roomLocked ? 'default' : 'outline'} onClick={onToggleLock} title={roomLocked ? 'Unlock the room' : 'Lock the room so nobody else can walk in'}>
              {roomLocked ? <Lock className="mr-1.5 h-4 w-4" /> : <LockOpen className="mr-1.5 h-4 w-4" />}{roomLocked ? 'Locked' : 'Lock'}
            </Button>
          )}
          {!joined ? (
            <Button size="sm" onClick={onJoin} disabled={busy}><Headphones className="mr-1.5 h-4 w-4" />{busy ? 'Starting…' : 'Join voice'}</Button>
          ) : (
            <>
              <Button size="sm" variant={micOn ? 'outline' : 'destructive'} onClick={onMic} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} title={micOn ? 'Mute yourself' : 'Unmute yourself'}>
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant={camOn ? 'default' : 'outline'} onClick={onCam} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} title={camOn ? 'Turn camera off' : 'Turn camera on'}>
                {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              {canRecord && roomName && (
                recording ? (
                  <Button size="sm" variant="destructive" onClick={onStopRecord} title="Stop recording"><Square className="mr-1.5 h-3.5 w-3.5 fill-current" />{clock(recSeconds)}</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={onRecord} title="Record this meeting (everyone in the room is told)"><Circle className="mr-1.5 h-3.5 w-3.5 fill-red-500 text-red-500" />Record</Button>
                )
              )}
              <span className="px-2 text-xs text-muted-foreground">
                {roomName ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{roomName}: only people in this room can hear you</span>
                  : tiles.length ? `Talking with ${tiles.length} nearby` : 'Walk up to someone to talk'}
              </span>
              <Button size="sm" variant="outline" onClick={onLeave} aria-label="Leave voice" title="Leave voice"><PhoneOff className="h-4 w-4" /></Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
