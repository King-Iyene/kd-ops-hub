import { useEffect, useRef } from 'react';
import { Mic, MicOff, Minimize2, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import type { Tile } from './useCalls';

function Feed({ stream, mirror, className }: { stream: MediaStream; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  // the sound plays through a separate audio element, so every picture here is muted
  return <video ref={ref} muted playsInline className={`${className ?? ''} ${mirror ? '-scale-x-100' : ''}`} />;
}

/**
 * Everyone in the call, large, like a meeting. Opens over the map; the map and your avatar keep running underneath.
 * A green frame shows who is talking; each person has their own mute.
 */
export function MeetingView({ me, selfCam, micOn, camOn, tiles, speaking, onMutePeer, onClose }: {
  me: string;
  selfCam: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  tiles: Tile[];
  /** ids of people talking now ('' is me) */
  speaking: Set<string>;
  onMutePeer: (id: string) => void;
  onClose: () => void;
}) {
  const screens = tiles.filter((t) => t.screen);
  const people = tiles.filter((t) => !t.screen);
  const count = people.length + 1;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-2 bg-background/95 p-3 pb-16 backdrop-blur">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Meeting view · {count} {count === 1 ? 'person' : 'people'}</span>
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-muted" aria-label="Back to the map"><Minimize2 className="h-4 w-4" />Back to the map</button>
      </div>
      {screens.length > 0 && (
        <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(screens.length, 2)}, minmax(0, 1fr))` }}>
          {screens.map((t) => (
            <div key={t.id} className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-slate-900">
              <Feed stream={t.stream} className="h-full w-full object-contain" />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{t.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`grid gap-2 ${screens.length ? 'h-36 shrink-0' : 'min-h-0 flex-1'}`} style={{ gridTemplateColumns: `repeat(${screens.length ? Math.min(count, 6) : cols}, minmax(0, 1fr))` }}>
        <div className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-slate-900 ${speaking.has('') ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]' : 'border-border'}`}>
          {selfCam && camOn ? <Feed stream={selfCam} mirror className="h-full w-full object-cover" /> : (
            <div className="flex h-full w-full items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/25 text-2xl font-semibold text-primary">{me.slice(0, 1).toUpperCase()}</span></div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2.5 py-1 text-xs text-white">
            <span>You</span>
            <span className="flex items-center gap-1.5">{camOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5 text-red-400" />}{micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-red-400" />}</span>
          </div>
        </div>
        {people.map((t) => (
          <div key={t.id} className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-slate-900 ${speaking.has(t.id) ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]' : 'border-border'}`}>
            {t.hasVideo ? <Feed stream={t.stream} className="h-full w-full object-cover" /> : (
              <div className="flex h-full w-full items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/25 text-2xl font-semibold text-primary">{t.name.slice(0, 1).toUpperCase()}</span></div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2.5 py-1 text-xs text-white">
              <span className="truncate">{t.name}</span>
              <button type="button" onClick={() => onMutePeer(t.id)} aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`} title={t.muted ? 'Unmute them' : 'Mute them (only for you)'} className="rounded p-0.5 hover:bg-white/20">
                {t.muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
