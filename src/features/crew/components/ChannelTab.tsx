import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, CrewMessage } from '../crewDb';
import { useCrewAgents, useCrewChannel, useMarkRead, useSay } from '../useCrew';
import { ago } from '../helpers';
import { Empty } from './shared';

const KIND_TONE: Record<string, string> = {
  challenge: 'bg-red-500/15 text-red-500', alert: 'bg-amber-500/15 text-amber-500', reminder: 'bg-amber-500/15 text-amber-500',
  report: 'bg-sky-500/15 text-sky-500', brief: 'bg-violet-500/15 text-violet-400', question: 'bg-emerald-500/15 text-emerald-500',
};

/** Who a message mentions: every "@First" that matches an executive's first name (case does not matter), once each. */
export function mentionsIn(text: string, agents: Pick<CrewAgent, 'id' | 'name'>[]): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/@([A-Za-z][A-Za-z'-]*)/g)) {
    const a = agents.find((x) => x.name.split(' ')[0].toLowerCase() === m[1].toLowerCase());
    if (a && !found.includes(a.id)) found.push(a.id);
  }
  return found;
}

/**
 * The team channel: every message the executives send to you or to each other, and yours to them, in one feed, like a Slack channel. Read it
 * top to bottom; tag someone with @name to write to them (several tags write to each); click Reply on a message to tag its sender.
 */
export function ChannelTab() {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const channel = useCrewChannel();
  const markRead = useMarkRead();
  const say = useSay();
  const [body, setBody] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const first = (a?: CrewAgent) => a?.name.split(' ')[0] ?? 'Someone';
  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);

  const feed = useMemo(() => [...(channel.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)), [channel.data]);
  const unreadIds = feed.filter((m) => m.to_owner && !m.read_at && m.from_agent).map((m) => m.id).join(',');
  useEffect(() => { if (unreadIds) markRead.mutate(unreadIds.split(',')); // reading the channel clears its unread mark
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [feed.length]);

  const tagged = mentionsIn(body, agents.data ?? []);
  const send = async () => {
    if (!body.trim() || tagged.length === 0) return;
    try {
      for (const id of tagged) await say.mutateAsync({ agentId: id, body });
      setBody('');
    } catch (e) { toast({ title: 'Not sent', description: (e as Error).message, variant: 'destructive' }); }
  };

  const line = (m: CrewMessage, i: number) => {
    const from = m.from_agent ? byId.get(m.from_agent) : undefined;
    const to = m.to_agent ? byId.get(m.to_agent) : undefined;
    const day = new Date(m.created_at).toDateString();
    const showDay = i === 0 || new Date(feed[i - 1].created_at).toDateString() !== day;
    const mine = m.from_agent === null;
    return (
      <div key={m.id}>
        {showDay ? <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</p> : null}
        <div className={cn('group flex gap-3 rounded-lg px-2 py-2 hover:bg-muted/40', mine && 'bg-muted/20')}>
          {from ? <AvatarFace avatar={agentAvatar(from)} size={36} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">You</span>}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-semibold">{mine ? 'You' : first(from)}</span>
              {from ? <span className="text-xs text-muted-foreground">{from.title}</span> : null}
              <span className="text-xs text-muted-foreground">to {m.to_owner ? 'you' : <span className="font-medium text-foreground">@{first(to)}</span>}</span>
              {m.kind !== 'message' ? <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', KIND_TONE[m.kind] ?? 'bg-muted text-muted-foreground')}>{m.kind}</span> : null}
              <span className="ml-auto text-[11px] text-muted-foreground">{ago(m.created_at)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.body}</p>
            {from ? (
              <button type="button" className="mt-1 hidden text-[11px] text-muted-foreground underline group-hover:inline" onClick={() => setBody((b) => (b ? b + ' ' : '') + '@' + first(from) + ' ')}>Reply</button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[min(70vh,44rem)] flex-col rounded-lg border">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {feed.length === 0 ? <Empty>Nothing yet. When the executives write to you or to each other, it all appears here. Tag someone below to start.</Empty> : feed.map(line)}
        <div ref={bottom} />
      </div>
      <div className="border-t p-3">
        <Textarea
          value={body} onChange={(e) => setBody(e.target.value)} rows={2}
          placeholder="Write to the team. Tag who you mean with @name, for example: @Hale ask @Joan about the VAT filing"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void send()} disabled={!body.trim() || tagged.length === 0 || say.isPending}><Send className="mr-1 h-4 w-4" />Send</Button>
          <span className="text-xs text-muted-foreground">
            {tagged.length === 0 ? 'Tag at least one person with @name.' : 'To ' + tagged.map((id) => '@' + first(byId.get(id))).join(', ') + '. Enter sends, Shift+Enter is a new line.'}
          </span>
          <span className="ml-auto flex flex-wrap gap-1">
            {(agents.data ?? []).slice(0, 15).map((a) => (
              <button key={a.id} type="button" className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted" onClick={() => setBody((b) => (b ? b + ' ' : '') + '@' + first(a) + ' ')}>@{first(a)}</button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
