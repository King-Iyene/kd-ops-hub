import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, BarChart3, CalendarOff, CheckSquare, Check, Clock, Copy, FileText, History, Inbox, ListChecks, MessageSquarePlus, Plus, RotateCcw, Trash2, TriangleAlert,
  UserRoundCheck, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useChatMessages, useChatThreads, useDeleteChatThread, useSendChat } from '@/queries/useOpsAgent';
import { useAuthStore } from '@/store/authStore';
import type { ChatMessage, ChatThread } from '../agentDb';
import { Markdown } from '../Markdown';
import { dayGroup, greeting } from '../time';

const SUGGESTIONS: { q: string; icon: LucideIcon }[] = [
  { q: 'Who has not sent the daily report today?', icon: FileText },
  { q: 'Which tasks are overdue, and whose are they?', icon: ListChecks },
  { q: 'How many hours did each person track this week?', icon: Clock },
  { q: 'Who is on leave today?', icon: CalendarOff },
];

const TOOL: Record<string, { label: string; icon: LucideIcon }> = {
  people: { label: 'people', icon: Users },
  tasks: { label: 'tasks', icon: CheckSquare },
  task_summary: { label: 'task summary', icon: BarChart3 },
  daily_reports: { label: 'daily reports', icon: FileText },
  hours: { label: 'tracked hours', icon: Clock },
  leave: { label: 'leave', icon: CalendarOff },
  flags: { label: 'Inbox items', icon: Inbox },
  request_human_action: { label: 'a request for a person to act', icon: UserRoundCheck },
};

type Shown = Pick<ChatMessage, 'role' | 'content' | 'tool_calls'> & { key: string };

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* blocked: nothing to do */ }
  };
  return (
    <button
      type="button" onClick={copy} aria-label={done ? 'Copied' : 'Copy answer'} title="Copy answer" data-testid="chat-copy"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring kd-transition"
    >{done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}</button>
  );
}

function LookedAt({ tools }: { tools: string[] }) {
  const unique = [...new Set(tools)];
  if (unique.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="chat-looked-at">
      <span>Looked at:</span>{' '}
      {unique.map((t) => {
        const meta = TOOL[t] ?? { label: t, icon: FileText };
        const Icon = meta.icon;
        return <span key={t} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5"><Icon className="h-3 w-3" aria-hidden="true" />{meta.label}</span>;
      })}
    </p>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-label="The agent is working" data-testid="chat-typing">
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
      </span>
      Looking it up
    </div>
  );
}

function ThreadList({ threads, loading, activeId, onOpen, onNew, onDelete }: {
  threads: ChatThread[]; loading: boolean; activeId: string | null; onOpen: (id: string) => void; onNew: () => void; onDelete: (t: ChatThread) => void;
}) {
  const groups = useMemo(() => {
    const g: Record<'Today' | 'Earlier', ChatThread[]> = { Today: [], Earlier: [] };
    for (const t of threads) g[dayGroup(t.updated_at)].push(t);
    return g;
  }, [threads]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button size="sm" variant="outline" className="w-full justify-start" onClick={onNew} data-testid="chat-new">
        <MessageSquarePlus className="mr-2 h-4 w-4" /> New chat
      </Button>
      {loading ? <Skeleton className="h-20 w-full" /> : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label="Conversations" role="group">
          {threads.length === 0 && <p className="px-2 text-xs text-muted-foreground">No conversations yet. Ask something to start one.</p>}
          {(['Today', 'Earlier'] as const).filter((k) => groups[k].length > 0).map((k) => (
            <div key={k}>
              <p className="mb-1 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
              <ul className="space-y-0.5">
                {groups[k].map((t) => (
                  <li key={t.id} className="group flex items-center">
                    <button
                      type="button" onClick={() => onOpen(t.id)} aria-current={t.id === activeId ? 'true' : undefined}
                      className={cn('min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring kd-transition', t.id === activeId ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
                    >{t.title}</button>
                    <button
                      type="button" aria-label={`Delete conversation ${t.title}`} title="Delete this conversation"
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 max-md:opacity-60"
                      onClick={() => onDelete(t)}
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ask the agent about the business. The answer is written by Claude from live data the signed-in person may see
 * (tasks, daily reports, hours, leave, people, the Inbox). It cannot change anything: a request to is added to the
 * Inbox as a "Human action required" item.
 */
export function ChatTab() {
  const threads = useChatThreads();
  const [threadId, setThreadId] = useState<string | null>(null);
  const messages = useChatMessages(threadId);
  const send = useSendChat();
  const del = useDeleteChatThread();
  const fullName = useAuthStore((s) => s.profile?.full_name);
  const [text, setText] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const [tail, setTail] = useState<{ q: string; reply: string; tools: string[] } | null>(null);
  const [error, setError] = useState<{ message: string; q: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const shown = useMemo<Shown[]>(() => {
    const rows: Shown[] = (messages.data ?? []).map((m) => ({ key: m.id, role: m.role, content: m.content, tool_calls: m.tool_calls }));
    if (tail && !rows.some((m) => m.role === 'assistant' && m.content === tail.reply)) {
      if (!rows.length || rows[rows.length - 1].role !== 'user' || rows[rows.length - 1].content !== tail.q) rows.push({ key: 'tail-q', role: 'user', content: tail.q, tool_calls: null });
      rows.push({ key: 'tail-a', role: 'assistant', content: tail.reply, tool_calls: tail.tools });
    }
    if (asking) rows.push({ key: 'asking', role: 'user', content: asking, tool_calls: null });
    return rows;
  }, [messages.data, tail, asking]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [shown.length, send.isPending, error]);

  // The box grows with what is typed, up to about eight lines, then scrolls.
  const grow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, []);
  useLayoutEffect(grow, [text, grow]);

  const ask = (q?: string) => {
    const message = (q ?? text).trim();
    if (!message || send.isPending) return;
    setError(null); setTail(null); setAsking(message); setText('');
    send.mutate({ message, thread_id: threadId }, {
      onSuccess: (r) => {
        if (r.thread_id) setThreadId(r.thread_id);
        if (r.ok && r.reply) setTail({ q: message, reply: r.reply, tools: r.tools_used ?? [] });
        else setError({ message: r.message ?? 'Chat could not answer. Try again in a moment.', q: message });
      },
      onError: (e) => setError({ message: `${e.message}. Check your connection and try again.`, q: message }),
      onSettled: () => setAsking(null),
    });
  };

  const open = (id: string | null) => { setThreadId(id); setTail(null); setError(null); setAsking(null); setSheet(false); if (id === null) inputRef.current?.focus(); };
  const remove = (t: ChatThread) => del.mutate(t.id, { onSuccess: () => { if (t.id === threadId) open(null); } });
  const list = threads.data ?? [];
  const current = list.find((t) => t.id === threadId);
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  const empty = shown.length === 0 && !messages.isLoading;

  const rail = (
    <ThreadList threads={list} loading={threads.isLoading} activeId={threadId} onOpen={(id) => open(id)} onNew={() => open(null)} onDelete={remove} />
  );

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card/40 md:h-[calc(100dvh-12.5rem)]" data-testid="agent-chat">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/50 p-3 md:flex">{rail}</aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button size="sm" variant="ghost" className="min-w-0 flex-1 justify-start px-2" onClick={() => setSheet(true)} aria-label="Conversations">
            <History className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{current?.title ?? 'Conversations'}</span>
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => open(null)} aria-label="New chat" title="New chat"><Plus className="h-4 w-4" /></Button>
        </div>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent side="left" className="flex w-[19rem] flex-col gap-3 p-4">
            <SheetHeader><SheetTitle className="text-base">Conversations</SheetTitle></SheetHeader>
            {rail}
          </SheetContent>
        </Sheet>

        <div className="flex-1 overflow-y-auto" aria-live="polite" data-testid="chat-messages">
          <div className={cn('mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-4 py-6 sm:px-6', empty && 'min-h-full justify-center')}>
            {empty && (
              <div className="space-y-6 py-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]" data-testid="chat-greeting">{greeting()}{first ? `, ${first}` : ''}</h2>
                  <p className="text-sm text-muted-foreground">Ask about tasks, daily reports, tracked hours, leave or people. Answers come from live data you are allowed to see.</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map(({ q, icon: Icon }) => (
                    <button
                      key={q} type="button" onClick={() => ask(q)} data-testid="chat-suggestion"
                      className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3.5 text-left text-sm kd-transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="leading-snug">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.isLoading && threadId && <Skeleton className="h-16 w-2/3" />}
            {shown.map((m) => m.role === 'user' ? (
              <div key={m.key} className="flex justify-end" data-role="user">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm leading-relaxed">{m.content}</p>
              </div>
            ) : (
              <div key={m.key} className="group space-y-2" data-role="assistant">
                <Markdown text={m.content} className="break-words text-[0.9375rem] leading-7 text-foreground/90" />
                <div className="flex flex-wrap items-center gap-2">
                  {(m.tool_calls?.length ?? 0) > 0 && <LookedAt tools={m.tool_calls ?? []} />}
                  <span className="ml-auto"><CopyButton text={m.content} /></span>
                </div>
              </div>
            ))}
            {send.isPending && <Typing />}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm" role="alert" data-testid="chat-error">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="flex-1">{error.message}</p>
                <Button size="sm" variant="outline" onClick={() => ask(error.q)} disabled={send.isPending}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again</Button>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form className="mx-auto w-full max-w-[46rem] px-3 pb-3 sm:px-6 sm:pb-4" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <div className="flex items-end gap-2 rounded-3xl border bg-card py-2 pl-4 pr-2 shadow-lg focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/40 kd-transition">
            <textarea
              ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder="Ask the Ops Agent…" aria-label="Your question"
              className="max-h-48 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={!text.trim() || send.isPending} aria-label="Send" data-testid="chat-send"><ArrowUp className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 px-2 text-center text-2xs text-muted-foreground">The agent cannot change or send anything. A request to is added to the Inbox for a person.</p>
        </form>
      </section>
    </div>
  );
}
