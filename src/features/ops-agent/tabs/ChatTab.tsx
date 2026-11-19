import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useChatMessages, useChatThreads, useDeleteChatThread, useSendChat } from '@/queries/useOpsAgent';
import type { ChatMessage } from '../agentDb';

const SUGGESTIONS = [
  'Who has not sent the daily report today?',
  'Which tasks are overdue, and whose are they?',
  'How many hours did each person track this week?',
  'Who is on leave today?',
  'How is the team doing on tasks overall?',
];

const TOOL_LABEL: Record<string, string> = {
  people: 'people', tasks: 'tasks', task_summary: 'task summary', daily_reports: 'daily reports', hours: 'tracked hours',
  leave: 'leave', flags: 'Inbox items', request_human_action: 'a request for a person to act',
};

type Shown = Pick<ChatMessage, 'role' | 'content' | 'tool_calls'> & { key: string };

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
  const [text, setText] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const [tail, setTail] = useState<{ q: string; reply: string; tools: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const shown = useMemo<Shown[]>(() => {
    const rows: Shown[] = (messages.data ?? []).map((m) => ({ key: m.id, role: m.role, content: m.content, tool_calls: m.tool_calls }));
    if (tail && !rows.some((m) => m.role === 'assistant' && m.content === tail.reply)) {
      if (!rows.length || rows[rows.length - 1].role !== 'user' || rows[rows.length - 1].content !== tail.q) rows.push({ key: 'tail-q', role: 'user', content: tail.q, tool_calls: null });
      rows.push({ key: 'tail-a', role: 'assistant', content: tail.reply, tool_calls: tail.tools });
    }
    if (asking) rows.push({ key: 'asking', role: 'user', content: asking, tool_calls: null });
    return rows;
  }, [messages.data, tail, asking]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [shown.length, send.isPending]);

  const ask = (q?: string) => {
    const message = (q ?? text).trim();
    if (!message || send.isPending) return;
    setError(null); setTail(null); setAsking(message); setText('');
    send.mutate({ message, thread_id: threadId }, {
      onSuccess: (r) => {
        if (r.thread_id) setThreadId(r.thread_id);
        if (r.ok && r.reply) setTail({ q: message, reply: r.reply, tools: r.tools_used ?? [] });
        else setError(r.message ?? 'Chat could not answer. Please try again.');
      },
      onError: (e) => setError(e.message),
      onSettled: () => setAsking(null),
    });
  };

  const open = (id: string | null) => { setThreadId(id); setTail(null); setError(null); setAsking(null); };
  const list = threads.data ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]" data-testid="agent-chat">
      <aside className="space-y-2">
        <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => open(null)} data-testid="chat-new">
          <MessageSquarePlus className="mr-2 h-4 w-4" /> New chat
        </Button>
        {threads.isLoading ? <Skeleton className="h-20 w-full" /> : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto md:max-h-[28rem]" aria-label="Conversations">
            {list.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</li>}
            {list.map((t) => (
              <li key={t.id} className="group flex items-center">
                <button
                  type="button" onClick={() => open(t.id)} aria-current={t.id === threadId}
                  className={cn('flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60', t.id === threadId && 'bg-muted font-medium')}
                >{t.title}</button>
                <button
                  type="button" aria-label={`Delete conversation ${t.title}`} title="Delete this conversation"
                  className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  onClick={() => del.mutate(t.id, { onSuccess: () => { if (t.id === threadId) open(null); } })}
                ><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[26rem] flex-col rounded-lg border bg-card">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" data-testid="chat-messages">
          {shown.length === 0 && !messages.isLoading && (
            <div className="space-y-3 py-6 text-center">
              <Bot className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Ask about tasks, daily reports, tracked hours, leave or people.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted/60" data-testid="chat-suggestion">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.isLoading && threadId && <Skeleton className="h-16 w-2/3" />}
          {shown.map((m) => (
            <div key={m.key} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', m.role === 'user' ? 'bg-primary/10' : 'bg-muted/60')} data-role={m.role}>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                {m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Looked at: {[...new Set(m.tool_calls)].map((t) => TOOL_LABEL[t] ?? t).join(', ')}</p>
                )}
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex justify-start" role="status" aria-label="The agent is working">
              <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking it up…</div>
            </div>
          )}
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert" data-testid="chat-error">{error}</p>}
          <div ref={endRef} />
        </div>

        <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <Textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="Ask the Ops Agent…" aria-label="Your question" className="min-h-[2.75rem] resize-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          />
          <Button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send" data-testid="chat-send"><Send className="h-4 w-4" /></Button>
        </form>
        <p className="px-4 pb-3 text-xs text-muted-foreground">Answers use data you are allowed to see. The agent cannot change or send anything; a request to is added to the Inbox for a person.</p>
      </section>
    </div>
  );
}
