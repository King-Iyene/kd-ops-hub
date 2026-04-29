import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Bot,
  Send,
  X,
  Maximize2,
  Loader2,
  ChevronDown,
  Globe,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface WidgetMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used?: string[];
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export function ChatWidget() {
  const location = useLocation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [unread, setUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hooks must be declared before any conditional returns (Rules of Hooks)
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Don't render on the full assistant page (redundant there)
  if (location.pathname.startsWith('/assistant')) return null;
  if (!user) return null;

  async function loadRecentConversation() {
    const { data } = await supabase
      .from('chatbot_conversations')
      .select('id')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      setConvId(data.id);
      const { data: msgs } = await supabase
        .from('chatbot_messages')
        .select('id, role, content, tools_used')
        .eq('conversation_id', data.id)
        .order('created_at', { ascending: true })
        .limit(20);
      setMessages((msgs ?? []) as WidgetMessage[]);
    }
  }

  function handleToggle() {
    if (!open) {
      setOpen(true);
      setUnread(false);
      if (!convId) loadRecentConversation();
    } else {
      setOpen(false);
    }
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

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.conversation_id && data.conversation_id !== convId) {
        setConvId(data.conversation_id);
      }
      setUseWebSearch(false);

      // Reload messages from DB to get real IDs + assistant reply
      const { data: fresh } = await supabase
        .from('chatbot_messages')
        .select('id, role, content, tools_used')
        .eq('conversation_id', data.conversation_id)
        .order('created_at', { ascending: true })
        .limit(20);
      setMessages((fresh ?? []) as WidgetMessage[]);

      // If widget is closed, mark unread
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

  function handleNew() {
    setConvId(null);
    setMessages([]);
    setInput('');
    setUseWebSearch(false);
  }

  return (
    <>
      {/* Slide-up panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20 overflow-hidden"
          style={{ height: 'min(520px, calc(100vh - 7rem))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="font-semibold text-sm">KD Assistant</span>
              <Sparkles className="h-3 w-3 opacity-70" />
            </div>
            <div className="flex items-center gap-1">
              <Link to="/assistant" title="Open full view">
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-white/20 transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </Link>
              <button
                type="button"
                onClick={handleNew}
                className="p-1 rounded-md hover:bg-white/20 transition-colors text-[11px] font-medium px-2"
                title="New chat"
              >
                New
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-white/20 transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-3">
            {messages.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
                <Bot className="h-8 w-8 text-violet-400/60" />
                <p className="text-xs text-muted-foreground">
                  Ask me anything about KD-Ops
                </p>
              </div>
            )}
            <div className="space-y-3">
              {messages.filter((m) => m.role !== 'system').map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 mr-1.5 shadow">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className="max-w-[80%]">
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.tools_used && m.tools_used.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.tools_used.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">
                            {t === 'web_search' ? '🌐' : t === 'fx_rates' ? '💱' : '📚'} {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 mr-1.5">
                    <Bot className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border/40 px-3 py-2 shrink-0 bg-card/80">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask anything…"
                  rows={1}
                  className="resize-none pr-2 min-h-[38px] max-h-[100px] text-sm py-2 leading-snug"
                  disabled={sending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setUseWebSearch((v) => !v)}
                  title={useWebSearch ? 'Web search on' : 'Web search off'}
                  className={`p-1.5 rounded-md transition-colors ${
                    useWebSearch
                      ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                </button>
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating action button */}
      <button
        type="button"
        onClick={handleToggle}
        className="fixed bottom-6 right-4 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        aria-label="Open AI assistant"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Bot className="h-6 w-6" />
            {unread && (
              <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-card" />
            )}
          </>
        )}
      </button>
    </>
  );
}
