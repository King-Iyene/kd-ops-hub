import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCrewAgents, useCrewMessages, useMarkRead, useSay } from '../useCrew';
import { canListen, canSpeak, listen, micProblem, speak, stopSpeaking } from '../voice';
import { Avatar, Empty } from './shared';
import { agentName, ago } from '../helpers';

const KIND_TONE: Record<string, string> = {
  challenge: 'bg-red-500/15 text-red-600', alert: 'bg-amber-500/15 text-amber-700', reminder: 'bg-amber-500/15 text-amber-700',
  report: 'bg-blue-500/15 text-blue-700', brief: 'bg-violet-500/15 text-violet-700', reply: 'bg-muted text-muted-foreground', message: 'bg-muted text-muted-foreground',
};

const VOICE_KEY = 'crew.voice';
const readVoicePref = (): boolean => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } };

export function MessagesTab() {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const messages = useCrewMessages();
  const markRead = useMarkRead();
  const say = useSay();
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [voice, setVoice] = useState(readVoicePref);
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const spoken = useRef<Set<string> | null>(null);

  const inbox = useMemo(() => (messages.data ?? []).filter((m) => m.to_owner), [messages.data]);
  const unread = inbox.filter((m) => !m.read_at);

  // Read new messages aloud (when voice is on). The first load only remembers what is already there, so opening the page never starts talking.
  useEffect(() => {
    if (!messages.data) return;
    if (spoken.current === null) { spoken.current = new Set(inbox.map((m) => m.id)); return; }
    if (!voice) { inbox.forEach((m) => spoken.current!.add(m.id)); return; }
    for (const m of [...inbox].reverse()) {
      if (spoken.current.has(m.id)) continue;
      spoken.current.add(m.id);
      const a = agents.data?.find((x) => x.id === m.from_agent);
      if (a && !m.read_at) speak(`${a.name} says: ${m.body}`, a.slug);
    }
  }, [messages.data, inbox, voice, agents.data]);

  useEffect(() => () => { stopListening.current?.(); stopSpeaking(); }, []);

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    try { localStorage.setItem(VOICE_KEY, next ? '1' : '0'); } catch { /* private window */ }
    if (!next) stopSpeaking();
  };
  const toggleMic = () => {
    if (listening) { stopListening.current?.(); return; }
    setListening(true);
    stopListening.current = listen((t) => setBody(t), (problem) => { setListening(false); if (problem) toast({ title: 'Microphone', description: micProblem(problem), variant: 'destructive' }); });
  };
  const send = () => {
    if (!to || !body.trim()) return;
    say.mutate({ agentId: to, body }, {
      onSuccess: () => { setBody(''); toast({ title: 'Sent', description: `${agentName(agents.data, to)} gets it the next time they run.` }); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Who to message">
            <option value="">Choose who to message…</option>
            {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}: {a.title}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Only you (and people you allow later) can message them. They ignore everyone else.</span>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={listening ? 'Listening…' : 'Say it straight. They will push back if you are wrong.'} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={send} disabled={!to || !body.trim() || say.isPending}><Send className="mr-1 h-4 w-4" />Send</Button>
          {canListen() ? (
            <Button size="sm" variant={listening ? 'destructive' : 'outline'} onClick={toggleMic}>{listening ? <MicOff className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}{listening ? 'Stop' : 'Speak'}</Button>
          ) : null}
          {canSpeak() ? (
            <Button size="sm" variant={voice ? 'default' : 'outline'} onClick={toggleVoice} title="Free: uses your browser's own voices">
              {voice ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}{voice ? 'Voice on' : 'Voice off'}
            </Button>
          ) : null}
          {unread.length > 0 ? <Button size="sm" variant="ghost" onClick={() => markRead.mutate(unread.map((m) => m.id))}>Mark {unread.length} read</Button> : null}
        </div>
      </div>

      {messages.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!messages.isLoading && inbox.length === 0 ? <Empty>No messages from the agents yet.</Empty> : null}
      <div className="space-y-2">
        {inbox.map((m) => {
          const a = agents.data?.find((x) => x.id === m.from_agent);
          return (
            <div key={m.id} className={cn('flex gap-3 rounded-lg border p-3', !m.read_at && 'border-primary/40 bg-primary/5')}>
              {a ? <Avatar agent={a} size={32} /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{agentName(agents.data, m.from_agent)}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', KIND_TONE[m.kind])}>{m.kind}</span>
                  <span>{ago(m.created_at)}</span>
                  {a && canSpeak() ? <button type="button" className="ml-auto hover:text-foreground" onClick={() => speak(m.body, a.slug)} aria-label="Hear this">Hear</button> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
