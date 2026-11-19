import { useState } from 'react';
import { Mic, MicOff, Radio, Volume2, VolumeX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** The red "LIVE" strip everybody sees while someone speaks to the whole office: who, what about, and a way to switch it off for yourself. */
export function TownHallBanner({ speaker, title, mine, listening, joined, onMute, onEnd, onJoinVoice }: {
  speaker: string;
  title: string;
  mine: boolean;
  /** I have the town hall switched on */
  listening: boolean;
  /** my voice is connected, so I can hear it */
  joined: boolean;
  onMute: () => void;
  onEnd: () => void;
  onJoinVoice: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-red-500/50 bg-card/95 px-3 py-2 shadow-xl backdrop-blur">
        <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />LIVE</span>
        <div className="min-w-0 text-sm"><span className="font-semibold">{mine ? 'You are speaking to the whole office' : `${speaker} is speaking to the whole office`}</span>{title ? <span className="text-muted-foreground"> · {title}</span> : null}</div>
        {mine ? (
          <Button size="sm" variant="destructive" className="h-7" onClick={onEnd}>End town hall</Button>
        ) : !joined ? (
          <Button size="sm" className="h-7" onClick={onJoinVoice}><Volume2 className="mr-1 h-3.5 w-3.5" />Turn on voice to listen</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7" onClick={onMute}>{listening ? <><VolumeX className="mr-1 h-3.5 w-3.5" />Mute</> : <><Volume2 className="mr-1 h-3.5 w-3.5" />Listen</>}</Button>
        )}
      </div>
    </div>
  );
}

/** The podium: speak to the whole office, live, like a gong that talks. */
export function TownHallDialog({ open, onClose, canSpeak, live, mine, speaker, title, audience, micOn, onGoLive, onEnd, onToggleMic }: {
  open: boolean;
  onClose: () => void;
  canSpeak: boolean;
  /** somebody is speaking right now */
  live: boolean;
  /** and it is me */
  mine: boolean;
  speaker: string;
  title: string;
  /** how many other people are in the office */
  audience: number;
  micOn: boolean;
  onGoLive: (title: string) => Promise<void>;
  onEnd: () => void;
  onToggleMic: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await onGoLive(topic.trim()); onClose(); } finally { setBusy(false); } };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-red-500" />Town hall</DialogTitle></DialogHeader>
        {live && mine ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-red-500/10 p-3 text-sm"><b>You are live.</b> Everyone in the office who has voice on can hear you, wherever they are. {audience > 0 ? `${audience} ${audience === 1 ? 'person is' : 'people are'} in the office.` : 'Nobody else is here right now.'}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onToggleMic}>{micOn ? <><Mic className="mr-1.5 h-4 w-4" />Mute my mic</> : <><MicOff className="mr-1.5 h-4 w-4" />Unmute my mic</>}</Button>
              <Button variant="destructive" className="flex-1" onClick={() => { onEnd(); onClose(); }}>End town hall</Button>
            </div>
          </div>
        ) : live ? (
          <p className="text-sm text-muted-foreground"><b className="text-foreground">{speaker}</b> is speaking to the whole office{title ? ` about "${title}"` : ''}. Only one town hall can run at a time. You can switch it off for yourself with Mute on the red strip.</p>
        ) : !canSpeak ? (
          <p className="text-sm text-muted-foreground">Only admins can speak to the whole office. Ask one to switch it on for everyone in the office settings, or to make the announcement for you.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Speak to everyone in the office at once, like the gong but with your voice. A gong rings, everyone sees the red LIVE strip, and anyone with voice on hears you wherever they are (they can mute it for themselves).</p>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={60} placeholder="What is it about? (optional)" aria-label="Topic" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            <Button className="w-full bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={() => void go()}><Radio className="mr-2 h-4 w-4" />{busy ? 'Going live…' : 'Go live'}</Button>
            <p className="text-center text-[11px] text-muted-foreground">Your microphone is switched on when you go live. {audience} {audience === 1 ? 'person is' : 'people are'} in the office.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
