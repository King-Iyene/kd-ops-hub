import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Bot,
  Send,
  X,
  Maximize2,
  Loader2,
  Globe,
  Sparkles,
  Plus,
  MessageSquare,
  ChevronLeft,
  TrendingUp,
  BookOpen,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

// Shared localStorage cache (same prefix as Assistant.tsx so history is unified)
const CACHE_PREFIX = 'kd_chat_v1_';
function cacheSet(convId: string, msgs: WidgetMessage[]) {
  try { localStorage.setItem(CACHE_PREFIX + convId, JSON.stringify(msgs)); } catch { /* quota */ }
}
function cacheGet(convId: string): WidgetMessage[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + convId);
    return raw ? (JSON.parse(raw) as WidgetMessage[]) : null;
  } catch { return null; }
}

interface WidgetMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tools_used?: string[];
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

const TOOL_META: Record<string, { label: string; cls: string }> = {
  knowledge_base: { label: 'Knowledge base', cls: 'kd-badge kd-badge-primary'  },
  web_search:     { label: 'Web search',     cls: 'kd-badge kd-badge-muted'    },
  fx_rates:       { label: 'FX rates',       cls: 'kd-badge kd-badge-success'  },
  fallback_gemini:{ label: 'Gemini',         cls: 'kd-badge kd-badge-warning'  },
};

export function ChatWidget() {
  const location = useLocation();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [unread, setUnread] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // Rules of Hooks: all effects before any conditional returns
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && view === 'chat') textareaRef.current?.focus();
  }, [open, view]);

  if (location.pathname.startsWith('/assistant')) return null;
  if (!user) return null;

  // ── Data helpers ─────────────────────────────────────────────────────────

  async function loadConversations() {
    const { data } = await supabase
      .from('chatbot_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);
    setConversations((data ?? []) as Conversation[]);
  }

  async function loadConversation(id: string) {
    setLoadingHistory(true);
    setConvId(id);
    const { data } = await supabase
      .from('chatbot_messages')
      .select('id, role, content, tools_used')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(30);
    const dbMsgs = (data ?? []) as WidgetMessage[];
    if (dbMsgs.length > 0) {
      cacheSet(id, dbMsgs);
      setMessages(dbMsgs);
    } else {
      setMessages(cacheGet(id) ?? []);
    }
    setLoadingHistory(false);
    setView('chat');
  }

  function handleOpen() {
    setOpen(true);
    setUnread(false);
    if (!convId) {
      loadConversations().then(async () => {
        // Auto-load the most recent conversation
        const { data } = await supabase
          .from('chatbot_conversations')
          .select('id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) loadConversation(data.id);
      });
    }
  }

  function handleClose() {
    setOpen(false);
    setView('chat');
  }

  function handleNewChat() {
    setConvId(null);
    setMessages([]);
    setInput('');
    setUseWebSearch(false);
    setView('chat');
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const optimistic: WidgetMessage = {
      id: `opt-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((m) => [...m, optimistic]);
    setInput('');
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('chatbot-chat', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        body: {
          conversation_id: convId,
          message: text,
          attachments: [],
          use_web_search: useWebSearch,
        },
      });

      if (error) {
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? error.message);
      }
      if (data?.error) throw new Error(data.error);

      const newConvId: string = data.conversation_id;
      if (newConvId !== convId) setConvId(newConvId);
      setUseWebSearch(false);

      setMessages((m) => {
        const base = m.filter((x) => x.id !== optimistic.id);
        const updated: WidgetMessage[] = [
          ...base,
          { ...optimistic, id: `u-${Date.now()}` },
          {
            id: `a-${Date.now()}`,
            role: 'assistant' as const,
            content: data.reply,
            tools_used: data.tools_used ?? [],
          },
        ];
        cacheSet(newConvId, updated);
        return updated;
      });

      if (!open) setUnread(true);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(text);
      toast({
        title: 'Message failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Widget panel ──────────────────────────────────────────────── */}
      {open && (
        <div
          className={`
            fixed z-50 flex flex-col
            bg-card border border-border/60 shadow-2xl shadow-black/20
            kd-animate-scale-in overflow-hidden
            /* Mobile: full-width bottom sheet */
            bottom-0 left-0 right-0 rounded-t-2xl
            /* Desktop: floating panel above FAB */
            sm:bottom-20 sm:right-4 sm:left-auto sm:rounded-2xl sm:w-[380px]
          `}
          style={{ height: 'min(560px, calc(100dvh - 5rem))' }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-primary to-cyan-500 text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {view === 'history' ? (
                <button
                  type="button"
                  onClick={() => setView('chat')}
                  className="p-1 rounded-md hover:bg-white/20 kd-transition"
                  title="Back to chat"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : (
                <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="kd-display text-sm font-semibold leading-tight truncate">
                  {view === 'history' ? 'Chat history' : 'KD Assistant'}
                </p>
                {view === 'chat' && (
                  <p className="text-[10px] text-white/70 truncate">
                    Llama 3.3 · Gemini Vision · Tavily
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {view === 'chat' && (
                <>
                  <button
                    type="button"
                    onClick={() => { loadConversations(); setView('history'); }}
                    className="p-1.5 rounded-md hover:bg-white/20 kd-transition"
                    title="Chat history"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="p-1.5 rounded-md hover:bg-white/20 kd-transition"
                    title="New chat"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <Link
                    to="/assistant"
                    className="p-1.5 rounded-md hover:bg-white/20 kd-transition"
                    title="Open full view"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-md hover:bg-white/20 kd-transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── History view ───────────────────────────────────────── */}
          {view === 'history' && (
            <div className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                  <button
                    onClick={handleNewChat}
                    className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-primary/40 px-3 py-2.5 text-primary hover:bg-primary/5 kd-transition text-sm font-medium"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    New conversation
                  </button>

                  {conversations.length === 0 && (
                    <div className="py-8 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No conversations yet</p>
                    </div>
                  )}

                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => loadConversation(c.id)}
                      className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left kd-transition ${
                        c.id === convId
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-muted/60 border border-transparent'
                      }`}
                    >
                      <MessageSquare className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${c.id === convId ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate text-foreground">{c.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                    </button>
                  ))}

                  <Link
                    to="/assistant"
                    className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 kd-transition mt-2"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    View full assistant
                  </Link>
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ── Chat view ──────────────────────────────────────────── */}
          {view === 'chat' && (
            <>
              <ScrollArea className="flex-1">
                <div className="px-3 py-3 space-y-3">

                  {/* Empty / loading states */}
                  {loadingHistory && (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
                    </div>
                  )}

                  {!loadingHistory && messages.length === 0 && (
                    <div className="flex flex-col items-center py-8 text-center px-2">
                      <div className="kd-animate-float h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center mb-3 shadow-[var(--shadow-md)]">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-sm font-medium mb-0.5">How can I help?</p>
                      <p className="text-[11px] text-muted-foreground leading-snug max-w-[200px]">
                        Ask about payments, fleet, payroll or anything on the platform.
                      </p>
                    </div>
                  )}

                  {/* Messages */}
                  {!loadingHistory && messages.filter((m) => m.role !== 'system').map((m) => (
                    <WidgetBubble key={m.id} message={m} />
                  ))}

                  {/* Typing indicator */}
                  {sending && (
                    <div className="flex gap-2 items-end kd-animate-fade-in">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)]">
                        <Bot className="h-3 w-3 text-white" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* ── Composer ─────────────────────────────────────── */}
              <div className="border-t border-border/40 px-3 py-2.5 shrink-0 bg-card/90 safe-bottom">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setUseWebSearch((v) => !v)}
                    title={useWebSearch ? 'Web search on' : 'Web search off'}
                    className={`p-1.5 rounded-lg kd-transition shrink-0 mb-0.5 ${
                      useWebSearch
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </button>

                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={useWebSearch ? 'Search the web…' : 'Ask anything…'}
                    rows={1}
                    className="resize-none flex-1 min-h-[38px] max-h-[100px] text-sm py-2 leading-snug bg-muted/40 border-muted focus-visible:bg-background"
                    disabled={sending}
                  />

                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="h-9 w-9 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground kd-transition shadow-[var(--shadow-sm)] mb-0.5"
                  >
                    {sending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
                  Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Floating action button ──────────────────────────────────── */}
      <button
        type="button"
        onClick={open ? handleClose : handleOpen}
        className={`
          fixed bottom-5 right-4 z-50 h-14 w-14 rounded-full
          bg-gradient-to-br from-primary to-cyan-500
          text-white shadow-lg shadow-primary/30
          hover:shadow-primary/50 hover:scale-105 active:scale-95
          kd-transition flex items-center justify-center
          /* Mobile safe area */
          sm:bottom-6
        `}
        aria-label="Open AI assistant"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Bot className="h-6 w-6" />
            {unread && (
              <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-card" />
            )}
          </>
        )}
      </button>
    </>
  );
}

/* ── Widget message bubble ─────────────────────────────────────────── */
function WidgetBubble({ message }: { message: WidgetMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 items-end kd-animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>

      {!isUser && (
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)]">
          <Bot className="h-3 w-3 text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>

        {!isUser && message.tools_used && message.tools_used.length > 0 && (
          <div className="flex flex-wrap gap-1 px-0.5">
            {message.tools_used.map((t) => {
              const meta = TOOL_META[t];
              return (
                <span key={t} className={`${meta?.cls ?? 'kd-badge kd-badge-muted'} text-[9px]`}>
                  {meta?.label ?? t}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
