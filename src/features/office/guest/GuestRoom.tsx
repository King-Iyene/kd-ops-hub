import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, MessageSquare, PhoneOff, Send, Video, VideoOff } from 'lucide-react';
import { useGuestRoom } from './useGuestRoom';

function Tile({ stream, name, self }: { stream: MediaStream | null; name: string; self?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
  return (
    <div className="relative flex aspect-video min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
      <video ref={ref} autoPlay playsInline muted={self} className={`h-full w-full object-cover ${hasVideo ? '' : 'invisible'} ${self ? '[transform:scaleX(-1)]' : ''}`} />
      {!hasVideo && <span className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white/80">{name.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-lg bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">{self ? `${name} (you)` : name}</span>
    </div>
  );
}

/** The private visitor room: video of everyone in it, mic and camera, a small chat, and leave. */
export function GuestRoom({ secret, name, onLeave, note }: { secret: string; name: string; onLeave: () => void; note?: string }) {
  const room = useGuestRoom({ secret, name });
  const [chatOpen, setChatOpen] = useState(false);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [room.chat.length, chatOpen]);

  const tiles = 1 + room.peers.length;
  const cols = tiles <= 1 ? 'grid-cols-1 max-w-xl' : tiles <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
  const btn = 'flex h-11 w-11 items-center justify-center rounded-full transition';

  return (
    <div className="ko flex h-full min-h-0 w-full flex-col gap-3 text-white">
      {note && <p className="text-center text-xs text-white/60">{note}</p>}
      {room.error && <p className="text-center text-xs text-amber-300">{room.error}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto">
          <div className={`grid w-full gap-3 ${cols}`}>
            <Tile stream={room.local} name={name} self />
            {room.peers.map((p) => <Tile key={p.id} stream={p.stream} name={p.name} />)}
            {room.peers.length === 0 && (
              <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-white/15 p-4 text-center text-sm text-white/60">
                {room.connected ? 'Waiting for the others to join…' : 'Connecting…'}
              </div>
            )}
          </div>
        </div>
        {chatOpen && (
          <aside className="flex w-64 shrink-0 flex-col rounded-2xl bg-white/[0.06] ring-1 ring-white/10 max-sm:absolute max-sm:inset-x-3 max-sm:bottom-24 max-sm:top-24 max-sm:z-10 max-sm:w-auto max-sm:bg-slate-900">
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 text-[13px]">
              {room.chat.length === 0 && <p className="text-xs text-white/50">Messages here are only seen by people in this room, and are not saved.</p>}
              {room.chat.map((m) => (
                <p key={m.id} className="break-words"><span className="font-semibold text-white/70">{m.mine ? 'You' : m.from}: </span>{m.text}</p>
              ))}
              <div ref={endRef} />
            </div>
            <form className="flex gap-1.5 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); room.sendChat(text); setText(''); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Message" className="h-9 min-w-0 flex-1 rounded-lg bg-white/10 px-2.5 text-[13px] outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/40" />
              <button type="submit" aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-900"><Send className="h-4 w-4" /></button>
            </form>
          </aside>
        )}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={room.toggleMic} aria-label={room.micOn ? 'Mute' : 'Unmute'} className={`${btn} ${room.micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500'}`}>{room.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</button>
        <button type="button" onClick={room.toggleCam} aria-label={room.camOn ? 'Turn camera off' : 'Turn camera on'} className={`${btn} ${room.camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500'}`}>{room.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}</button>
        <button type="button" onClick={() => setChatOpen((o) => !o)} aria-label="Chat" className={`${btn} ${chatOpen ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}><MessageSquare className="h-5 w-5" /></button>
        <button type="button" onClick={onLeave} aria-label="Leave" className={`${btn} bg-red-600 hover:bg-red-500`}><PhoneOff className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
