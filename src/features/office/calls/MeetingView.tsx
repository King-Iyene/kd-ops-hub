import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Loader2, LogOut, Maximize2, Mic, MicOff, Minimize2, MonitorOff, MonitorUp, Pin, RefreshCw, Smile, Video, VideoOff, Volume2, VolumeX, UserSquare2 } from 'lucide-react';
import type { Tile } from './useCalls';
import { describeShare } from './shareState';
import { AvatarFace } from '../AvatarFace';
import type { AvatarStyle } from '../world/types';
import { EmojiPicker } from '../EmojiPicker';
import { useEmoteBar } from '../emoji';

/** The meeting card: everyone in the call, large, in the KD colours (teal, cyan and gold). Controls are on the card itself. */

function Feed({ stream, mirror, className, onReady }: { stream: MediaStream; mirror?: boolean; className?: string; onReady?: (ready: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  // the sound plays through a separate audio element, so every picture here is muted
  return <video ref={ref} muted playsInline className={`${className ?? ''} ${mirror ? '-scale-x-100' : ''}`} onLoadedData={() => onReady?.(true)} onResize={() => onReady?.(true)} />;
}

/** Four small corner marks, like a heads-up display. */
function Brackets({ lit }: { lit: boolean }) {
  const c = lit ? 'border-emerald-300/90' : 'border-[#00ECFF]/45';
  const base = `pointer-events-none absolute h-3 w-3 ${c} transition-colors`;
  return (
    <>
      <span className={`${base} left-1.5 top-1.5 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${base} right-1.5 top-1.5 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${base} bottom-1.5 left-1.5 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${base} bottom-1.5 right-1.5 rounded-br-md border-b-2 border-r-2`} />
    </>
  );
}

/** Three little bars for the line to this person: all lit is good, two is fair, one is poor. */
function SignalBars({ quality }: { quality: 'good' | 'fair' | 'poor' }) {
  const lit = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
  const color = quality === 'good' ? 'bg-emerald-300' : quality === 'fair' ? 'bg-amber-300' : 'bg-red-400';
  return (
    <span title={quality === 'good' ? 'Good connection' : quality === 'fair' ? 'Fair connection' : 'Poor connection'} className="flex items-end gap-px" aria-label={`${quality} connection`}>
      {[5, 8, 11].map((h, i) => <span key={h} className={`w-[3px] rounded-sm ${i < lit ? color : 'bg-white/25'}`} style={{ height: h }} />)}
    </span>
  );
}

interface PersonProps {
  name: string;
  avatar?: AvatarStyle;
  stream?: MediaStream | null;
  showVideo: boolean;
  speaking: boolean;
  isMe?: boolean;
  /** undefined: not known (an older version on their side) */
  micOn?: boolean;
  camOn?: boolean;
  conn?: 'connected' | 'connecting' | 'reconnecting';
  quality?: 'good' | 'fair' | 'poor';
  /** nobody could say who this is (an older version of the app): ask them to refresh */
  unknown?: boolean;
  /** an emoji they just sent, floating over their picture */
  reaction?: string;
  muted?: boolean;
  small?: boolean;
  pinned?: boolean;
  onMute?: () => void;
  onPin?: () => void;
  className?: string;
}

/** One person: their picture, or their avatar and name when the camera is off; who is talking glows. */
function PersonTile(p: PersonProps) {
  const size = p.small ? 52 : 104;
  return (
    <div className={`group relative min-h-0 overflow-hidden rounded-2xl border transition-[box-shadow,border-color] duration-200 ${p.speaking ? 'border-emerald-300/80 shadow-[0_0_0_1px_rgba(110,231,183,.5),0_0_28px_rgba(52,211,153,.45)]' : 'border-[#00ECFF]/20 shadow-[0_10px_30px_-18px_rgba(0,0,0,.9)]'} bg-gradient-to-br from-[#06384e] via-[#05293a] to-[#031a26] ${p.className ?? ''}`}>
      {p.showVideo && p.stream ? (
        <Feed stream={p.stream} mirror={p.isMe} className="h-full w-full object-cover" />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center">
          <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(0,236,255,.16), transparent 55%)' }} />
          <div className="relative">
            {p.speaking && <span className="absolute -inset-3 animate-ping rounded-full bg-emerald-300/25" />}
            <div className={`rounded-full p-[3px] ${p.speaking ? 'bg-emerald-300 shadow-[0_0_24px_rgba(52,211,153,.7)]' : 'bg-gradient-to-br from-[#00ECFF]/70 to-[#D6AC50]/70'}`}>
              <div className="rounded-full bg-[#031a26] p-1">
                {p.avatar ? <AvatarFace avatar={p.avatar} size={size} /> : (
                  <span className="flex items-center justify-center rounded-full bg-primary/25 font-semibold text-primary" style={{ width: size, height: size, fontSize: size / 2.6 }}>{p.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <Brackets lit={p.speaking} />
      {p.reaction && (
        <span key={p.reaction} className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 animate-in zoom-in-50 fade-in text-[44px] leading-none drop-shadow-[0_6px_14px_rgba(0,0,0,.6)] duration-200">{p.reaction}</span>
      )}
      {p.conn && p.conn !== 'connected' && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" />{p.conn === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-6 text-white">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-tight" title={p.unknown ? 'Their app is an older version and cannot say who they are. Ask them to refresh the page.' : undefined}>{p.name}{p.unknown && <span className="ml-1.5 font-normal text-amber-300/90">· ask them to refresh</span>}{p.isMe && <span className="ml-1.5 rounded bg-[#00ECFF]/20 px-1 text-[9px] font-bold uppercase tracking-wider text-[#9ff6ff]">you</span>}</span>
        {p.micOn === false && <span title="Microphone is off" className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/85"><MicOff className="h-3 w-3" /></span>}
        {p.micOn === true && !p.speaking && <Mic className="h-3.5 w-3.5 text-emerald-300/90" />}
        {p.camOn === false && <span title="Camera is off" className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15"><VideoOff className="h-3 w-3" /></span>}
        {p.conn === 'connected' && p.quality && !p.isMe && <SignalBars quality={p.quality} />}
      </div>
      {(p.onMute || p.onPin) && (
        <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {p.onPin && <button type="button" onClick={p.onPin} title={p.pinned ? 'Unpin' : 'Pin to the big picture'} aria-label={p.pinned ? 'Unpin' : 'Pin'} className={`flex h-7 w-7 items-center justify-center rounded-full backdrop-blur ${p.pinned ? 'bg-[#D6AC50] text-black' : 'bg-black/60 text-white hover:bg-black/80'}`}><Pin className="h-3.5 w-3.5" /></button>}
          {p.onMute && <button type="button" onClick={p.onMute} title={p.muted ? 'Unmute them (only for you)' : 'Mute them (only for you)'} aria-label={p.muted ? `Unmute ${p.name}` : `Mute ${p.name}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80">{p.muted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}</button>}
        </div>
      )}
    </div>
  );
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
    <div ref={box} className="relative min-h-0 overflow-hidden rounded-2xl border border-[#00ECFF]/25 bg-slate-950 shadow-[0_0_40px_-12px_rgba(0,236,255,.35)]">
      <Feed stream={tile.stream} className="h-full w-full object-contain" onReady={setReady} />
      {!ready && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70"><Loader2 className="h-4 w-4 animate-spin" />Waiting for {tile.presenter ?? 'their'} picture…</div>}
      <Brackets lit={false} />
      <div className="absolute left-3 top-3 flex max-w-[70%] items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1 text-xs text-white backdrop-blur">
        <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="truncate"><strong>{tile.presenter ?? 'Someone'}</strong> is sharing{what ? ` · ${what.text}` : ''}{tile.share?.audio ? ' · with sound' : ''}</span>
      </div>
      <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}
        onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void box.current?.requestFullscreen?.().catch(() => undefined); }}
        className="absolute right-3 top-3 rounded-lg bg-black/65 p-1.5 text-white backdrop-blur hover:bg-black/80">
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** A round control on the dock: lit when it is doing something, red when it is off and that matters. */
function DockButton({ label, onClick, active, danger, children, wide }: { label: string; onClick: () => void; active?: boolean; danger?: boolean; children: React.ReactNode; wide?: boolean }) {
  const tone = danger ? 'bg-red-500 text-white hover:bg-red-400 shadow-[0_0_18px_rgba(239,68,68,.45)]'
    : active ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-inset ring-emerald-300/60 hover:bg-emerald-400/30'
      : 'bg-white/[0.07] text-white hover:bg-white/[0.14] ring-1 ring-inset ring-white/10';
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-11 items-center justify-center gap-2 rounded-full transition ${wide ? 'px-4 text-[12.5px] font-semibold' : 'w-11'} ${tone}`}>
      {children}
    </button>
  );
}

export interface MeetingProps {
  me: { name: string; avatar?: AvatarStyle };
  selfCam: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  tiles: Tile[];
  /** ids of people talking now ('' is me) */
  speaking: Set<string>;
  /** the room we are in, if any */
  roomName?: string | null;
  onMutePeer: (id: string) => void;
  onMic: () => void;
  onCam: () => void;
  onShare: () => void;
  /** start every connection again (for when somebody cannot hear or be heard) */
  onReconnect: () => void;
  onLeave: () => void;
  onClose: () => void;
  /** emoji reactions: send one, and read the ones on show now (by connection id; mine is under selfId) */
  onEmote: (e: string) => void;
  emotes: Map<string, { e: string; until: number }>;
  selfId: string;
}

/**
 * Everyone in the call, large, like a meeting. Opens over the map; the map and your avatar keep running underneath.
 * A glow shows who is talking; each person shows their avatar and name when their camera is off, and whether their microphone and camera
 * are on. The controls (microphone, camera, share, reconnect, leave) are on the card. When somebody shares a screen it fills the card with
 * everyone's picture in a strip at the top. "Speaker" view makes whoever is talking (or whoever you pinned) the big picture.
 */
export function MeetingView(p: MeetingProps) {
  const screens = p.tiles.filter((t) => t.screen);
  const people = p.tiles.filter((t) => !t.screen);
  const count = people.length + 1;
  const presenting = screens.length > 0;
  const [layout, setLayout] = useState<'grid' | 'speaker'>(() => { try { return localStorage.getItem('kd:office:meeting-layout') === 'speaker' ? 'speaker' : 'grid'; } catch { return 'grid'; } });
  const setLayoutSaved = (l: 'grid' | 'speaker') => { setLayout(l); try { localStorage.setItem('kd:office:meeting-layout', l); } catch { /* fine */ } };
  const [pinned, setPinned] = useState<string | null>(null);
  const lastSpeaker = useRef<string | null>(null);
  for (const id of p.speaking) if (id && people.some((t) => t.id === id)) lastSpeaker.current = id;
  const troubled = people.filter((t) => t.conn && t.conn !== 'connected').length;
  // emoji on show now, read a couple of times a second (they live for a few seconds)
  const [reactions, setReactions] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const now = Date.now();
      const next: Record<string, string> = {};
      for (const [id, v] of p.emotes) if (v.until > now) next[id] = v.e;
      setReactions((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    read();
    const t = window.setInterval(read, 400);
    return () => window.clearInterval(t);
  }, [p.emotes]);
  const bar = useEmoteBar();
  const [emoOpen, setEmoOpen] = useState(false);
  const react = (e: string) => { bar.bump(e); p.onEmote(e); };
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const title = presenting
    ? p.tiles.filter((t) => t.screen).length === 1 ? `${screens[0].presenter ?? 'Someone'} is sharing` : `${screens.length} screens shared`
    : p.roomName ?? 'Meeting';

  const me = <PersonTile key="me" name={p.me.name} avatar={p.me.avatar} stream={p.selfCam} showVideo={!!p.selfCam && p.camOn} speaking={p.speaking.has('')} isMe reaction={reactions[p.selfId]} micOn={p.micOn} camOn={p.camOn} small={presenting || layout === 'speaker'} className={presenting || layout === 'speaker' ? 'h-full w-44 shrink-0' : ''} />;
  const person = (t: Tile, small: boolean, big = false) => (
    <PersonTile key={t.id} name={t.name} avatar={t.avatar} stream={t.stream} showVideo={t.hasVideo} speaking={p.speaking.has(t.id)} micOn={t.micOn} camOn={t.camOn ?? t.hasVideo} conn={t.conn} quality={t.quality} unknown={t.unknown} reaction={reactions[t.id]} muted={t.muted}
      small={small} pinned={pinned === t.id} onMute={() => p.onMutePeer(t.id)} onPin={() => setPinned((cur) => (cur === t.id ? null : t.id))} className={small ? 'h-full w-44 shrink-0' : big ? 'h-full' : ''} />
  );

  const featuredId = pinned && people.some((t) => t.id === pinned) ? pinned : [...p.speaking].find((id) => id && people.some((t) => t.id === id)) ?? lastSpeaker.current ?? people[0]?.id ?? null;
  const featured = people.find((t) => t.id === featuredId) ?? null;

  return (
    <div ref={root} className="absolute inset-0 z-20 flex flex-col gap-3 p-3 pb-3 text-white backdrop-blur-md" style={{ background: 'radial-gradient(1100px 520px at 12% -10%, rgba(0,236,255,.12), transparent 60%), radial-gradient(900px 480px at 100% 110%, rgba(214,172,80,.10), transparent 60%), linear-gradient(180deg, rgba(3,26,38,.97), rgba(2,18,27,.98))' }}>
      {/* a faint grid, like a display */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(0,236,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,236,255,1) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

      <div className="relative flex items-center gap-3">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ff6ff]/85">Live</span>
        </span>
        <span className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{title}</span>
        <span className="font-mono text-[11px] font-semibold text-[#D6AC50]">{String(count).padStart(2, '0')}</span>
        <span className="h-px min-w-6 flex-1 bg-gradient-to-r from-[#00ECFF]/35 to-transparent" />
        {troubled > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300"><Loader2 className="h-3 w-3 animate-spin" />{troubled} connecting</span>}
        {!presenting && count > 2 && (
          <span className="flex rounded-full bg-white/[0.06] p-0.5 ring-1 ring-inset ring-white/10" role="group" aria-label="Layout">
            <button type="button" onClick={() => setLayoutSaved('grid')} aria-pressed={layout === 'grid'} title="Everyone the same size" className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${layout === 'grid' ? 'bg-[#00ECFF]/20 text-[#9ff6ff]' : 'text-white/60 hover:text-white'}`}><LayoutGrid className="h-3.5 w-3.5" />Grid</button>
            <button type="button" onClick={() => setLayoutSaved('speaker')} aria-pressed={layout === 'speaker'} title="Whoever talks (or whoever you pin) is the big picture" className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${layout === 'speaker' ? 'bg-[#00ECFF]/20 text-[#9ff6ff]' : 'text-white/60 hover:text-white'}`}><UserSquare2 className="h-3.5 w-3.5" />Speaker</button>
          </span>
        )}
        <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void root.current?.requestFullscreen?.().catch(() => undefined); }} title={full ? 'Leave full screen' : 'Full screen'} aria-label={full ? 'Leave full screen' : 'Full screen'} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-inset ring-white/10 hover:bg-white/[0.14]">{full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={p.onClose} className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-[12px] font-semibold ring-1 ring-inset ring-white/10 hover:bg-white/[0.14]" aria-label="Back to the map"><Minimize2 className="h-3.5 w-3.5" />Back to the map</button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        {presenting ? (
          <>
            {/* everyone's picture at the top, the shared screen large beneath */}
            <div className="flex h-28 shrink-0 gap-2.5 overflow-x-auto" aria-label="Everyone in the call">
              {me}
              {people.map((t) => person(t, true))}
            </div>
            <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(screens.length, 2)}, minmax(0, 1fr))` }}>
              {screens.map((t) => <ScreenStage key={t.id} tile={t} />)}
            </div>
          </>
        ) : layout === 'speaker' && featured ? (
          <>
            <div className="flex h-28 shrink-0 gap-2.5 overflow-x-auto">
              {me}
              {people.filter((t) => t.id !== featured.id).map((t) => person(t, true))}
            </div>
            <div className="min-h-0 flex-1">{person(featured, false, true)}</div>
          </>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {me}
            {people.map((t) => person(t, false))}
          </div>
        )}
        {people.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] text-white/55">Nobody else is in the call yet. People who come into this room, or near you, join automatically.</p>
        )}
      </div>

      {/* the controls, on the card */}
      <div className="relative flex items-center justify-center">
        {emoOpen && <div className="absolute bottom-full z-30 mb-3"><EmojiPicker quick={bar.quick} freq={bar.freq} onPick={react} onQuick={bar.setQuick} onClose={() => setEmoOpen(false)} /></div>}
        <div className="flex items-center gap-2 rounded-full bg-[#031a26]/85 p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,.9)] ring-1 ring-inset ring-[#00ECFF]/25 backdrop-blur">
          <DockButton label={p.micOn ? 'Microphone is on: click to mute' : 'Microphone is off: click to turn on'} active={p.micOn} danger={!p.micOn} onClick={p.onMic}>{p.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</DockButton>
          <DockButton label={p.camOn ? 'Camera is on: click to turn off' : 'Camera is off: click to turn on'} active={p.camOn} danger={!p.camOn} onClick={p.onCam}>{p.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}</DockButton>
          <DockButton label={p.sharing ? 'Stop sharing your screen' : 'Share your screen, a window or a tab'} active={p.sharing} onClick={p.onShare}>{p.sharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}</DockButton>
          <span className="mx-1 h-6 w-px bg-white/15" />
          {bar.quick.map((e) => (
            <button key={e} type="button" title={`React ${e}`} aria-label={`React ${e}`} onClick={() => react(e)} className="flex h-11 w-9 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 hover:bg-white/[0.08]">{e}</button>
          ))}
          <DockButton label="More reactions" active={emoOpen} onClick={() => setEmoOpen((o) => !o)}><Smile className="h-5 w-5" /></DockButton>
          <span className="mx-1 h-6 w-px bg-white/15" />
          <DockButton label="Reconnect: start the connections again if somebody cannot hear or be heard" onClick={p.onReconnect}><RefreshCw className="h-5 w-5" /></DockButton>
          <DockButton label="Leave the call" danger wide onClick={p.onLeave}><LogOut className="h-4 w-4" />Leave</DockButton>
        </div>
      </div>
    </div>
  );
}
