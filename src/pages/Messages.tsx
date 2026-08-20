// Messages — direct messages and small group chats between KDOps users.
//
// Deliberately minimal: a conversation list on the left, a thread on the
// right, a composer at the bottom. No channels, no nested threads, no
// reactions — those are exactly the kind of thing that make a chat feature
// confusing rather than useful for a team that just wants to reach a
// colleague. Membership is fixed at creation (see the direct_messages
// migration for why) — start a new group if the audience needs to change.
//
// Data model: dm_conversations / dm_conversation_participants / dm_messages.
// A DM is a conversation with exactly 2 participants; a group is 3+. Both
// are the same underlying shape — this page just derives the display name
// differently (the other person's name for a DM, the chosen name for a
// group).

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Plus, Search, Loader2, Users, X, Check } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';

interface Person {
  id: string;
  full_name: string | null;
  photo_url: string | null;
}

interface ConversationRow {
  id: string;
  name: string | null;
  created_by: string | null;
  last_message_at: string;
  otherParticipants: Person[];
  lastMessagePreview: string | null;
  lastMessageFrom: string | null;
  unread: boolean;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}

function displayName(conv: Pick<ConversationRow, 'name' | 'otherParticipants'>): string {
  if (conv.name) return conv.name;
  if (conv.otherParticipants.length === 0) return 'Just you';
  if (conv.otherParticipants.length === 1) return conv.otherParticipants[0].full_name || 'Unknown';
  return conv.otherParticipants.map((p) => (p.full_name || 'Unknown').split(' ')[0]).join(', ');
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Messages() {
  usePageTitle('Messages');
  const { toast } = useToast();
  const { user, profile } = useAuthStore();
  const myId = user?.id;

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [peopleById, setPeopleById] = useState<Record<string, Person>>({});

  // New conversation dialog
  const [newOpen, setNewOpen] = useState(false);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [pickedPeople, setPickedPeople] = useState<Person[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  // ─── Load conversation list ─────────────────────────────────────────────
  const reloadConversations = async () => {
    if (!myId) return;
    setLoading(true);
    try {
      const { data: myRows } = await (supabase as any)
        .from('dm_conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', myId);
      const convIds = (myRows ?? []).map((r: any) => r.conversation_id);
      if (convIds.length === 0) {
        setConversations([]);
        return;
      }
      const readByConv: Record<string, string | null> = {};
      for (const r of myRows as any[]) readByConv[r.conversation_id] = r.last_read_at;

      const [{ data: convs }, { data: parts }, { data: recentMsgs }] = await Promise.all([
        (supabase as any).from('dm_conversations').select('id, name, created_by, last_message_at').in('id', convIds),
        (supabase as any).from('dm_conversation_participants').select('conversation_id, user_id').in('conversation_id', convIds),
        (supabase as any).from('dm_messages').select('id, conversation_id, sender_id, body, created_at')
          .in('conversation_id', convIds).order('created_at', { ascending: false }).limit(500),
      ]);

      const otherUserIds = new Set<string>();
      for (const p of (parts ?? []) as any[]) if (p.user_id !== myId) otherUserIds.add(p.user_id);
      let peopleMap = peopleById;
      const missing = [...otherUserIds].filter((id) => !peopleMap[id]);
      if (missing.length > 0) {
        const { data: profs } = await supabase.from('profiles_directory').select('id, full_name, photo_url').in('id', missing);
        const merged = { ...peopleMap };
        for (const p of (profs ?? []) as any[]) merged[p.id] = { id: p.id, full_name: p.full_name, photo_url: p.photo_url };
        peopleMap = merged;
        setPeopleById(merged);
      }

      const lastByConv: Record<string, MessageRow> = {};
      for (const m of (recentMsgs ?? []) as MessageRow[]) {
        if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
      }

      const rows: ConversationRow[] = ((convs ?? []) as any[]).map((c) => {
        const others = ((parts ?? []) as any[])
          .filter((p) => p.conversation_id === c.id && p.user_id !== myId)
          .map((p) => peopleMap[p.user_id])
          .filter(Boolean) as Person[];
        const last = lastByConv[c.id];
        const myReadAt = readByConv[c.id];
        const unread = !!last && last.sender_id !== myId && (!myReadAt || new Date(last.created_at) > new Date(myReadAt));
        return {
          id: c.id,
          name: c.name,
          created_by: c.created_by,
          last_message_at: c.last_message_at,
          otherParticipants: others,
          lastMessagePreview: last?.body ?? null,
          lastMessageFrom: last?.sender_id ?? null,
          unread,
        };
      }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      setConversations(rows);
    } catch (e: unknown) {
      toast({ title: 'Could not load messages', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reloadConversations(); }, [myId]);

  // ─── Load + subscribe to the active thread ──────────────────────────────
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setMessagesLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('dm_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (!cancelled) {
        setMessages((data ?? []) as MessageRow[]);
        setMessagesLoading(false);
        void markRead(activeId);
      }
    })();

    const channel = supabase
      .channel(`dm-thread-${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${activeId}`,
      }, (payload) => {
        setMessages((cur) => [...cur, payload.new as MessageRow]);
        void markRead(activeId);
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function markRead(conversationId: string) {
    if (!myId) return;
    await (supabase as any)
      .from('dm_conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', myId);
    setConversations((cur) => cur.map((c) => (c.id === conversationId ? { ...c, unread: false } : c)));
  };

  // ─── Sending ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = composerText.trim();
    if (!text || !activeId || !myId) return;
    setSending(true);
    setComposerText('');
    try {
      const { error } = await (supabase as any).from('dm_messages').insert({
        conversation_id: activeId, sender_id: myId, body: text,
      });
      if (error) throw new Error(error.message);
      void reloadConversations();
    } catch (e: unknown) {
      toast({ title: 'Message not sent', description: errorMessage(e), variant: 'destructive' });
      setComposerText(text);
    } finally {
      setSending(false);
    }
  };

  // ─── New conversation ────────────────────────────────────────────────────
  const openNewConversation = async () => {
    setNewOpen(true);
    setPickedPeople([]);
    setGroupName('');
    setPeopleQuery('');
    if (allPeople.length === 0) {
      const { data } = await supabase.from('profiles_directory').select('id, full_name, photo_url')
        .eq('status', 'active').neq('id', myId ?? '').order('full_name');
      setAllPeople(((data ?? []) as any[]).map((p) => ({ id: p.id, full_name: p.full_name, photo_url: p.photo_url })));
    }
  };

  const filteredPeople = useMemo(
    () => allPeople.filter((p) => (p.full_name || '').toLowerCase().includes(peopleQuery.toLowerCase())
      && !pickedPeople.some((x) => x.id === p.id)),
    [allPeople, peopleQuery, pickedPeople],
  );

  const startConversation = async () => {
    if (!myId || pickedPeople.length === 0) return;
    setCreating(true);
    try {
      // Reuse an existing 1:1 DM instead of creating a duplicate — only
      // applies when starting a plain 2-person DM (not a named group).
      if (pickedPeople.length === 1) {
        const otherId = pickedPeople[0].id;
        const existing = conversations.find(
          (c) => !c.name && c.otherParticipants.length === 1 && c.otherParticipants[0].id === otherId,
        );
        if (existing) {
          setActiveId(existing.id);
          setNewOpen(false);
          return;
        }
      }

      const { data: conv, error: cErr } = await (supabase as any)
        .from('dm_conversations')
        .insert({
          name: pickedPeople.length > 1 ? (groupName.trim() || null) : null,
          created_by: myId,
        })
        .select('id')
        .single();
      if (cErr) throw new Error(cErr.message);
      const conversationId = conv.id as string;

      const participantRows = [myId, ...pickedPeople.map((p) => p.id)].map((uid) => ({
        conversation_id: conversationId, user_id: uid,
      }));
      const { error: pErr } = await (supabase as any).from('dm_conversation_participants').insert(participantRows);
      if (pErr) throw new Error(pErr.message);

      await reloadConversations();
      setActiveId(conversationId);
      setNewOpen(false);
    } catch (e: unknown) {
      toast({ title: 'Could not start conversation', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" pattern="constellation">
        <PageHeader
          className="mb-0"
          title="Messages"
          description="Direct messages and small group chats with your team."
          icon={MessageSquare}
          actions={
            <Button size="sm" onClick={openNewConversation}>
              <Plus className="mr-2 h-4 w-4" /> New message
            </Button>
          }
        />
      </AuroraHero>

      <Card className="rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] h-[calc(100dvh-260px-3.5rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-260px)] min-h-[420px]">
          {/* Conversation list */}
          <div className={cn(
            'border-r border-border overflow-y-auto',
            activeId ? 'hidden md:block' : 'block',
          )}>
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
                <Button size="sm" variant="outline" onClick={openNewConversation}>
                  <Plus className="mr-2 h-4 w-4" /> Message someone
                </Button>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 flex items-start gap-2.5 border-b border-border/60 transition-colors',
                    activeId === c.id ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  {c.otherParticipants.length > 1 ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                      <Users className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase">
                      {initials(c.otherParticipants[0]?.full_name ?? null)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-sm', c.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                        {displayName(c)}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(c.last_message_at)}</span>
                    </div>
                    <p className={cn('truncate text-xs mt-0.5', c.unread ? 'text-foreground' : 'text-muted-foreground')}>
                      {c.lastMessagePreview
                        ? `${c.lastMessageFrom === myId ? 'You: ' : ''}${c.lastMessagePreview}`
                        : 'No messages yet'}
                    </p>
                  </div>
                  {c.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>

          {/* Thread */}
          <div className={cn('flex flex-col', activeId ? 'flex' : 'hidden md:flex')}>
            {!active ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Pick a conversation, or start a new one.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <button className="md:hidden text-muted-foreground" onClick={() => setActiveId(null)} aria-label="Back">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{displayName(active)}</p>
                    {active.otherParticipants.length > 1 && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {active.otherParticipants.map((p) => p.full_name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-8">
                      No messages yet — say hello.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_id === myId;
                      const sender = mine ? profile : peopleById[m.sender_id];
                      return (
                        <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                          {!mine && active.otherParticipants.length > 1 && (
                            <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                              {sender?.full_name ?? 'Unknown'}
                            </span>
                          )}
                          <div className={cn(
                            'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
                            mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
                          )}>
                            {m.body}
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                            {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>

                <div className="border-t border-border p-3 flex items-end gap-2">
                  <Textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                    }}
                    placeholder="Write a message…"
                    className="min-h-[42px] max-h-[140px] text-sm resize-none"
                    rows={1}
                  />
                  <Button size="icon" aria-label="Send message" onClick={handleSend} disabled={sending || !composerText.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* New conversation dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pickedPeople.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pickedPeople.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium pl-2.5 pr-1.5 py-1">
                    {p.full_name}
                    <button onClick={() => setPickedPeople((cur) => cur.filter((x) => x.id !== p.id))} aria-label="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {pickedPeople.length > 1 && (
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Name this group (optional)"
              />
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Search people…"
                className="pl-8"
              />
            </div>
            <div className="border border-border rounded-lg max-h-[240px] overflow-y-auto divide-y divide-border/60">
              {filteredPeople.length === 0 ? (
                <p className="text-xs text-muted-foreground italic p-3">No matches.</p>
              ) : (
                filteredPeople.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPickedPeople((cur) => [...cur, p])}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase">
                      {initials(p.full_name)}
                    </span>
                    <span className="text-sm truncate flex-1">{p.full_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={startConversation} disabled={creating || pickedPeople.length === 0}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Start conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
