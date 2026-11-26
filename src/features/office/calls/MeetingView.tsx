import { useEffect, useRef, useState } from 'react';
import { Maximize2, Mic, MicOff, Minimize2, MonitorUp, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import type { Tile } from './useCalls';
import { describeShare } from './shareState';

function Feed({ stream, mirror, className, onReady }: { stream: MediaStream; mirror?: boolean; className?: string; onReady?: (ready: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  // the sound plays through a separate audio element, so every picture here is muted
  return <video ref={ref} muted playsInline className={`${className ?? ''} ${mirror ? '-scale-x-100' : ''}`} onLoadedData={() => onReady?.(true)} onResize={() => onReady?.(true)} />;
}

/** One shared screen, large: who is presenting and what, a fullscreen button, and a clear note while the first picture is on its way. */
function ScreenStage({ tile }: { tile: Tile }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const what = tile.share ? describeShare(tile.share) : null;
  return (
    <div ref={box} className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-slate-950">
      <Feed stream={tile.stream} className="h-full w-full object-contain" onReady={setReady} />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Waiting for {tile.presenter ?? 'their'} picture…</div>}
      <div className="absolute left-2 top-2 flex max-w-[70%] items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1 text-xs text-white backdrop-blur">
        <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="truncate"><strong>{tile.presenter ?? 'Someone'}</strong> is sharing{what ? ` · ${what.text}` : ''}</span>
      </div>
      <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}
        onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void box.current?.requestFullscreen?.().catch(() => undefined); }}
        className="absolute right-2 top-2 rounded-lg bg-black/65 p-1.5 text-white backdrop-blur hover:bg-black/80">
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Everyone in the call, large, like a meeting. Opens over the map; the map and your avatar keep running underneath.
 * A green frame shows who is talking; each person has their own mute.
 * When somebody shares their screen it fills the card, with everyone's picture in a strip at the top.
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
  const presenting = screens.length > 0;
  const title = presenting
    ? screens.length === 1 ? `${screens[0].presenter ?? 'Someone'} is sharing their screen` : `${screens.length} screens are being shared`
    : `Meeting view · ${count} ${count === 1 ? 'person' : 'people'}`;

  const selfTile = (
    <div className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-slate-900 ${presenting ? 'h-full w-44 shrink-0' : ''} ${speaking.has('') ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]' : 'border-border'}`}>
      {selfCam && camOn ? <Feed stream={selfCam} mirror className="h-full w-full object-cover" /> : (
        <div className="flex h-full w-full items-center justify-center"><span className={`flex ${presenting ? 'h-10 w-10 text-lg' : 'h-16 w-16 text-2xl'} items-center justify-center rounded-full bg-primary/25 font-semibold text-primary`}>{me.slice(0, 1).toUpperCase()}</span></div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2.5 py-1 text-xs text-white">
        <span>You</span>
        <span className="flex items-center gap-1.5">{camOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5 text-red-400" />}{micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-red-400" />}</span>
      </div>
    </div>
  );
  const personTile = (t: Tile) => (
    <div key={t.id} className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-slate-900 ${presenting ? 'h-full w-44 shrink-0' : ''} ${speaking.has(t.id) ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]' : 'border-border'}`}>
      {t.hasVideo ? <Feed stream={t.stream} className="h-full w-full object-cover" /> : (
        <div className="flex h-full w-full items-center justify-center"><span className={`flex ${presenting ? 'h-10 w-10 text-lg' : 'h-16 w-16 text-2xl'} items-center justify-center rounded-full bg-primary/25 font-semibold text-primary`}>{t.name.slice(0, 1).toUpperCase()}</span></div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2.5 py-1 text-xs text-white">
        <span className="truncate">{t.name}</span>
        <button type="button" onClick={() => onMutePeer(t.id)} aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`} title={t.muted ? 'Unmute them' : 'Mute them (only for you)'} className="rounded p-0.5 hover:bg-white/20">
          {t.muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-2 bg-background/95 p-3 pb-16 backdrop-blur">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-muted" aria-label="Back to the map"><Minimize2 className="h-4 w-4" />Back to the map</button>
      </div>
      {presenting ? (
        <>
          {/* everyone's picture at the top, the shared screen large beneath */}
          <div className="flex h-28 shrink-0 gap-2 overflow-x-auto" aria-label="Everyone in the call">
            {selfTile}
            {people.map(personTile)}
          </div>
          <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(screens.length, 2)}, minmax(0, 1fr))` }}>
            {screens.map((t) => <ScreenStage key={t.id} tile={t} />)}
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {selfTile}
          {people.map(personTile)}
        </div>
      )}
    </div>
  );
}
