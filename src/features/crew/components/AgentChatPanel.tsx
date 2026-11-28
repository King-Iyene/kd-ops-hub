import { useMemo, useState } from 'react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCrewAgents, useCrewMessages, useSay } from '../useCrew';
import { canListen, listen } from '../voice';
import { Avatar, StatusDot } from './shared';
import { ago } from '../helpers';

/**
 * A chat with one AI executive, opened from the office by clicking their character. Only the owner can open it (the page checks, and the database
 * refuses anyone else). You write; they answer the next time they run, so a reply is not instant: they are woken on their schedule.
 */
export function AgentChatPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const messages = useCrewMessages();
  const say = useSay();
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
    setStop(() => listen((t) => setBody(t), () => { setListening(false); setStop(null); }));
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-xl" role="dialog" aria-label={`Chat with ${agent.name}`}>
      <div className="flex items-center gap-3 border-b p-3">
        <Avatar agent={agent} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{agent.name} <span className="text-xs font-normal text-muted-foreground">(AI)</span></div>
          <div className="truncate text-xs text-muted-foreground">{agent.title}</div>
          <StatusDot status={agent.status} />
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-72 min-h-24 space-y-2 overflow-y-auto p-3">
        {thread.length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet. Say what you need: they will answer, and push back if you are wrong.</p> : null}
        {thread.map((m) => (
          <div key={m.id} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.from_agent === null ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn('mt-1 text-[10px]', m.from_agent === null ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{ago(m.created_at)}</p>
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
