import { useEffect, useMemo, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import { ChannelTab } from '@/features/crew/components/ChannelTab';
import { ago } from '@/features/crew/helpers';
import { useCrewAgents, useCrewInbox, useMarkRead, useSay } from '@/features/crew/useCrew';

/**
 * The Mailbox: where every communication with your executives lives. Inbox is what they send to you (open one on the right, read it in full and
 * answer it there); Everything is the whole team channel, including what they say to each other. Super Admin only, and only the owner gets any
 * messages (the database returns nothing to anyone else).
 */
export default function Mailbox() {
  const { toast } = useToast();
  const agents = useCrewAgents();
  const inbox = useCrewInbox(true);
  const markRead = useMarkRead();
  const say = useSay();
  const [tab, setTab] = useState<'inbox' | 'all'>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);
  const mail = useMemo(() => (inbox.data ?? []).filter((m) => m.to_owner && m.from_agent).sort((a, b) => b.created_at.localeCompare(a.created_at)), [inbox.data]);
  const current = mail.find((m) => m.id === openId) ?? mail[0] ?? null;
  const unread = mail.filter((m) => !m.read_at).length;
  const from = current?.from_agent ? byId.get(current.from_agent) : undefined;
  const first = (id: string | null) => (id ? byId.get(id)?.name.split(' ')[0] : undefined) ?? 'Someone';

  useEffect(() => { if (current && !current.read_at) markRead.mutate([current.id]); // opening a message reads it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const send = () => {
    if (!current?.from_agent || !reply.trim()) return;
    say.mutate({ agentId: current.from_agent, body: reply.trim() }, {
      onSuccess: () => { setReply(''); toast({ title: 'Sent', description: first(current.from_agent) + ' will read it and answer.' }); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader title="Mailbox" icon={Mail} description="Every message from your executives, and everything they say to each other. Open one to read it and answer it. Only you can see this." />
      <div className="mb-4 flex gap-2" role="tablist">
        <Button role="tab" aria-selected={tab === 'inbox'} size="sm" variant={tab === 'inbox' ? 'default' : 'outline'} onClick={() => setTab('inbox')}>
          Inbox{unread > 0 ? <span className="ml-2 rounded-full bg-background/20 px-1.5 text-[11px]">{unread}</span> : null}
        </Button>
        <Button role="tab" aria-selected={tab === 'all'} size="sm" variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>Everything (team channel)</Button>
      </div>

      {tab === 'all' ? <ChannelTab /> : (
        <div className="grid h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden rounded-lg border md:grid-cols-[22rem_1fr]">
          <div className="min-h-0 overflow-y-auto border-r">
            {mail.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet. When an executive writes to you it lands here.</p> : null}
            <ul className="divide-y">
              {mail.map((m) => {
                const a = m.from_agent ? byId.get(m.from_agent) : undefined;
                const isNew = !m.read_at;
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setOpenId(m.id)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50', current?.id === m.id && 'bg-muted', isNew && 'bg-primary/5')}>
                      {a ? <AvatarFace avatar={agentAvatar(a)} size={40} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-muted" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2 text-sm"><span className={cn('truncate', isNew ? 'font-bold' : 'font-medium')}>{first(m.from_agent)}</span><span className="text-[11px] uppercase text-muted-foreground">{m.kind}</span><span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(m.created_at)}</span></span>
                        <span className={cn('mt-0.5 line-clamp-2 text-[13px]', isNew ? 'text-foreground' : 'text-muted-foreground')}>{m.body}</span>
                      </span>
                      {isNew ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex min-h-0 flex-col">
            {current ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <div className="mb-4 flex items-center gap-4">
                    {from ? <AvatarFace avatar={agentAvatar(from)} size={64} /> : null}
                    <div className="min-w-0">
                      <p className="text-lg font-bold">{from?.name ?? 'An executive'}</p>
                      <p className="text-sm text-muted-foreground">{from?.title} · {current.kind.toUpperCase()} · {ago(current.created_at)}</p>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{current.body}</p>
                </div>
                <div className="border-t p-4">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder={`Reply to ${first(current.from_agent)}…`} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" onClick={send} disabled={!reply.trim() || say.isPending}><Send className="mr-1 h-4 w-4" />Send</Button>
                    <span className="text-xs text-muted-foreground">Ctrl+Enter sends. {first(current.from_agent)} is woken to read it.</span>
                  </div>
                </div>
              </>
            ) : <p className="m-auto p-6 text-sm text-muted-foreground">Select a message to read it.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
