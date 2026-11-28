import { useEffect, useMemo, useState } from 'react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCrewAgents, useCrewMessages, useMarkRead, useSay } from '../useCrew';
import { canListen, listen, micProblem } from '../voice';
import { StatusDot } from './shared';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import { ago } from '../helpers';

/**
 * A chat with one AI executive, opened from the office by clicking their character. Only the owner can open it (the page checks, and the database
 * refuses anyone else). You write; they answer the next time they run, so a reply is not instant: they are woken on their schedule.
 */
export function AgentChatPanel({ agentId, onClose, embedded = false, onBack }: { agentId: string; onClose?: () => void; /** inside the Office chat window (fills the conversation area) instead of a floating box */ embedded?: boolean; onBack?: () => void }) {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const messages = useCrewMessages();
  const say = useSay();
  const markRead = useMarkRead();
  const [body, setBody] = useState('');
  const [listening, setListening] = useState(false);
  const [stop, setStop] = useState<(() => void) | null>(null);
  const agent = agents.data?.find((a) => a.id === agentId);

  const thread = useMemo(
    () => (messages.data ?? [])
      .filter((m) => (m.from_agent === agentId && m.to_owner) || (m.from_agent === null && m.to_agent === agentId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-30),
    [messages.data, agentId],
  );

  // reading the conversation clears its unread mark
  const unreadIds = thread.filter((m) => m.from_agent === agentId && !m.read_at).map((m) => m.id).join(",");
  useEffect(() => { if (unreadIds) markRead.mutate(unreadIds.split(",")); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds]);

  if (!agent) return null;

  const send = () => {
    if (!body.trim()) return;
    say.mutate({ agentId, body }, {
      onSuccess: () => { setBody(''); toast({ title: 'Sent', description: `${agent.name} reads it the next time they run.` }); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };
  const toggleMic = () => {
    if (listening) { stop?.(); return; }
    setListening(true);
    setStop(() => listen((t) => setBody(t), (problem) => { setListening(false); setStop(null); if (problem) toast({ title: 'Microphone', description: micProblem(problem), variant: 'destructive' }); }));
  };

  return (
    <div className={embedded ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'fixed bottom-4 right-4 z-40 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-xl'} role={embedded ? undefined : 'dialog'} aria-label={`Chat with ${agent.name}`}>
      <div className="flex items-center gap-3 border-b p-3">
        {embedded && onBack ? <button type="button" onClick={onBack} aria-label="Back to conversations" className="rounded p-1 text-muted-foreground hover:bg-muted sm:hidden">←</button> : null}
        <AvatarFace avatar={agentAvatar(agent)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{agent.name.split(' ')[0]}</div>
          <div className="truncate text-xs text-muted-foreground">{agent.title}</div>
          <StatusDot status={agent.status} />
        </div>
        {embedded || !onClose ? null : <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
      </div>
      <div className={embedded ? 'min-h-0 flex-1 space-y-2 overflow-y-auto p-3' : 'max-h-72 min-h-24 space-y-2 overflow-y-auto p-3'}>
        {thread.length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet. Say what you need: they will answer, and push back if you are wrong.</p> : null}
        {thread.map((m) => (
          <div key={m.id} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.from_agent === null ? 'ml-auto bg-white/10 text-foreground ring-1 ring-inset ring-white/10' : 'bg-muted')}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn('mt-1 text-[10px]', 'text-muted-foreground')}>{ago(m.created_at)}</p>
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder={listening ? 'Listening…' : `Message ${agent.name.split(' ')[0]}…`} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={send} disabled={!body.trim() || say.isPending}><Send className="mr-1 h-4 w-4" />Send</Button>
          {canListen() ? <Button size="sm" variant={listening ? 'destructive' : 'outline'} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak'}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button> : null}
          <a href="/crew" className="ml-auto text-xs text-muted-foreground underline">Open Crew</a>
        </div>
      </div>
    </div>
  );
}
