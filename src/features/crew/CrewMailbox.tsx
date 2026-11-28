import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import { useCrewAgents, useCrewAttention, useCrewInbox, useCrewSettings, useMarkRead, useSay } from './useCrew';
import { ago } from './helpers';

export const OPEN_MAILBOX = 'crew-open-mailbox';

/** Opens the mailbox from anywhere (a pop-up, a link), optionally on one message. */
export function openMailbox(messageId?: string) { window.dispatchEvent(new CustomEvent(OPEN_MAILBOX, { detail: { id: messageId ?? null } })); }

/**
 * The owner's mailbox: an envelope in the top bar with the number of unread messages from the executives; click it and a panel slides in from the
 * right with every message to you, newest first. Open one to read it in full and answer it right there. Nobody else sees it: the button is only
 * shown to the owner, and the database returns nothing to anyone else.
 */
function Mailbox() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const agents = useCrewAgents();
  const inbox = useCrewInbox(true);
  const attention = useCrewAttention(true);
  const markRead = useMarkRead();
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [alertsOn, setAlertsOn] = useState(() => typeof Notification === 'undefined' || Notification.permission !== 'default');

  useEffect(() => {
    const h = (e: Event) => { setOpenId((e as CustomEvent<{ id: string | null }>).detail?.id ?? null); setOpen(true); };
    window.addEventListener(OPEN_MAILBOX, h);
    return () => window.removeEventListener(OPEN_MAILBOX, h);
  }, []);

  const byId = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a])), [agents.data]);
  const mail = useMemo(() => (inbox.data ?? []).filter((m) => m.to_owner && m.from_agent).sort((a, b) => b.created_at.localeCompare(a.created_at)), [inbox.data]);
  const current = openId ? mail.find((m) => m.id === openId) ?? null : null;
  const from = current?.from_agent ? byId.get(current.from_agent) : undefined;

  useEffect(() => { if (current && !current.read_at) markRead.mutate([current.id]); // opening a message reads it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const first = (id: string | null) => (id ? byId.get(id)?.name.split(' ')[0] : undefined) ?? 'Someone';
  const send = () => {
    if (!current?.from_agent || !reply.trim()) return;
    say.mutate({ agentId: current.from_agent, body: reply.trim() }, {
      onSuccess: () => { setReply(''); toast({ title: 'Sent', description: first(current.from_agent) + ' will read it and answer.' }); },
      onError: (e) => toast({ title: 'Not sent', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <>
      <button type="button" onClick={() => { setOpenId(null); setOpen(true); }} aria-label={`Mailbox, ${attention.unreadCount} unread`} title="Messages from your executives"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 transition hover:bg-primary/25">
        <Mail className="h-5 w-5" />
        {attention.unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{attention.unreadCount > 99 ? '99+' : attention.unreadCount}</span> : null}
      </button>
      {/* the standing mailbox: always on screen, with how many messages are waiting; click it to open the panel */}
      {!open ? (
        <button type="button" onClick={() => { setOpenId(null); setOpen(true); }} aria-label={`Open the mailbox, ${attention.unreadCount} unread`}
          className={cn('fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-2xl transition hover:scale-105',
            attention.unreadCount > 0 ? 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/30' : 'border-border bg-card text-foreground')}>
          <Mail className="h-5 w-5" />
          {attention.unreadCount > 0 ? <span>{attention.unreadCount} unread</span> : <span>Mailbox</span>}
        </button>
      ) : null}
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              {current ? <button type="button" aria-label="Back to the mailbox" onClick={() => setOpenId(null)} className="rounded p-1 hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button> : null}
              {current ? `From ${first(current.from_agent)}` : 'Mailbox'}
            </SheetTitle>
            <SheetDescription>{current ? (from?.title ?? '') + ' · ' + ago(current.created_at) : `${attention.unreadCount} unread · every message from your executives`}</SheetDescription>
          </SheetHeader>

          {current ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-3 flex items-center gap-3">
                  {from ? <AvatarFace avatar={agentAvatar(from)} size={44} /> : null}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{from?.name ?? 'An executive'}</p>
                    <p className="text-xs text-muted-foreground">{current.kind.toUpperCase()}</p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{current.body}</p>
              </div>
              <div className="border-t p-3">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder={`Reply to ${first(current.from_agent)}…`} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={send} disabled={!reply.trim() || say.isPending}><Send className="mr-1 h-4 w-4" />Send</Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setOpen(false); navigate('/crew'); }}>Open the team channel</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!alertsOn ? (
                <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3 text-[13px]">
                  <span className="flex-1">Get a desktop alert when an executive writes to you, even when this tab is in the background.</span>
                  <Button size="sm" onClick={() => { void Notification.requestPermission().then(() => setAlertsOn(true)); }}>Turn on</Button>
                </div>
              ) : null}
              {mail.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet. When an executive writes to you it lands here.</p> : null}
              <ul className="divide-y">
                {mail.map((m) => {
                  const a = m.from_agent ? byId.get(m.from_agent) : undefined;
                  const unread = !m.read_at;
                  return (
                    <li key={m.id}>
                      <button type="button" onClick={() => setOpenId(m.id)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50', unread && 'bg-primary/5')}>
                        {a ? <AvatarFace avatar={agentAvatar(a)} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2 text-sm"><span className={cn('truncate', unread ? 'font-bold' : 'font-medium')}>{first(m.from_agent)}</span><span className="text-[11px] uppercase text-muted-foreground">{m.kind}</span><span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(m.created_at)}</span></span>
                          <span className={cn('mt-0.5 line-clamp-2 text-[13px]', unread ? 'text-foreground' : 'text-muted-foreground')}>{m.body}</span>
                        </span>
                        {unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t p-3 text-center"><Button size="sm" variant="ghost" onClick={() => { setOpen(false); navigate('/crew'); }}>Open the team channel</Button></div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Only the owner gets a mailbox: the button is not even rendered for anyone else, and it makes no requests for them. */
export function CrewMailbox() {
  const me = useAuthStore((s) => s.profile);
  if (me?.role !== 'super_admin') return null;
  return <OwnerGate meId={me.id} />;
}

function OwnerGate({ meId }: { meId: string }) {
  const settings = useCrewSettings();
  if (settings.data?.owner_profile_id !== meId) return null;
  return <Mailbox />;
}
