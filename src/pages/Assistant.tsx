import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Send,
  Plus,
  Paperclip,
  Globe,
  X,
  Loader2,
  Trash2,
  Pin,
  PinOff,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Zap,
  Search,
  BookOpen,
  Settings as SettingsIcon,
  MessageSquare,
  ChevronRight,
  Cpu,
  TrendingUp,
  HelpCircle,
  FileSearch,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: Array<{ name: string; mime_type: string }>;
  tools_used: string[];
  model_used: string | null;
  created_at: string;
}

interface AttachmentDraft {
  name: string;
  mime_type: string;
  data_url: string;
  size: number;
}

// localStorage cache — persists messages across tab/page navigation even
// when the DB insert is failing (e.g. pending migration on production).
const CACHE_PREFIX = 'kd_chat_v1_';
function cacheSet(convId: string, msgs: Message[]) {
  try { localStorage.setItem(CACHE_PREFIX + convId, JSON.stringify(msgs)); } catch { /* quota */ }
}
function cacheGet(convId: string): Message[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + convId);
    return raw ? (JSON.parse(raw) as Message[]) : null;
  } catch { return null; }
}
function cacheDel(convId: string) {
  try { localStorage.removeItem(CACHE_PREFIX + convId); } catch { /* ignore */ }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const TOOL_META: Record<string, { label: string; icon: typeof Globe; cls: string }> = {
  knowledge_base: { label: 'Knowledge base', icon: BookOpen,  cls: 'kd-badge kd-badge-primary' },
  web_search:     { label: 'Web search',     icon: Globe,     cls: 'kd-badge kd-badge-muted'   },
  fx_rates:       { label: 'FX rates',       icon: TrendingUp,cls: 'kd-badge kd-badge-success' },
  fallback_gemini:{ label: 'Gemini fallback',icon: Zap,       cls: 'kd-badge kd-badge-warning' },
};

const SUGGESTIONS = [
  { icon: TrendingUp, text: 'What is the current Naira to Dollar rate?',   cls: 'text-success' },
  { icon: Cpu,        text: 'Explain how the payroll batch process works',  cls: 'text-primary' },
  { icon: FileSearch, text: 'Help me draft a fuel expense report',          cls: 'text-accent-foreground' },
  { icon: HelpCircle, text: 'What permissions does a fleet manager have?',  cls: 'text-muted-foreground' },
];

export default function Assistant() {
  usePageTitle('Assistant');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [usageToday, setUsageToday] = useState<{ used: number; limit: number } | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suppressFetchRef = useRef(false);
  const isSuperAdmin = profile?.role === 'super_admin';

  const fetchConversations = async () => {
    // Explicit user_id filter so super_admin doesn't see other users'
    // conversations (RLS grants super_admin blanket SELECT). Same reason
    // the widget's loadConversations() filters explicitly.
    if (!profile?.id) return;
    const { data } = await supabase
      .from('chatbot_conversations')
      .select('id, title, pinned, updated_at')
      .eq('user_id', profile.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversations((data ?? []) as Conversation[]);
  };

  const fetchMessages = async (convId: string) => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('chatbot_messages')
      .select('id, role, content, attachments, tools_used')
      .eq('conversation_id', convId)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('fetchMessages error:', error);
      toast({ title: 'Could not load messages', description: error.message, variant: 'destructive' });
    }
    const dbMsgs = ((data ?? []) as Message[]).reverse();
    if (dbMsgs.length > 0) {
      cacheSet(convId, dbMsgs);
      setMessages(dbMsgs);
    } else {
      // DB is empty (insert still failing in production) — fall back to local cache
      const cached = cacheGet(convId);
      setMessages(cached ?? []);
    }
    setLoadingHistory(false);
  };

  const fetchUsage = async () => {
    if (!profile?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: usage }, { data: cfg }] = await Promise.all([
      supabase.from('chatbot_usage')
        .select('message_count').eq('user_id', profile.id).eq('usage_date', today).maybeSingle(),
      supabase.from('chatbot_config').select('daily_message_limit').limit(1).single(),
    ]);
    setUsageToday({
      used: usage?.message_count ?? 0,
      limit: cfg?.daily_message_limit ?? 50,
    });
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('chatbot_conversations')
        .select('id, title, pinned, updated_at')
        .eq('user_id', profile.id)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(50);
      const list = (data ?? []) as Conversation[];
      setConversations(list);
      if (list.length > 0) {
        setActiveConvId((prev) => prev ?? list[0].id);
      }
    };
    init();
    fetchUsage();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }
    if (activeConvId) fetchMessages(activeConvId);
    else setMessages([]);
  }, [activeConvId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setAttachments([]);
    setInput('');
    setUseWebSearch(false);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    const next: AttachmentDraft[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: 'File too large', description: `${f.name} exceeds 10 MB limit.`, variant: 'destructive' });
        continue;
      }
      const reader = new FileReader();
      const data_url: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      next.push({ name: f.name, mime_type: f.type || 'application/octet-stream', data_url, size: f.size });
    }
    setAttachments((curr) => [...curr, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (sending) return;

    const messageText = input.trim();
    const optimisticUser: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId || 'new',
      role: 'user',
      content: messageText,
      attachments: attachments.map((a) => ({ name: a.name, mime_type: a.mime_type })),
      tools_used: [],
      model_used: null,
      created_at: new Date().toISOString(),
    };
    setMessages((curr) => [...curr, optimisticUser]);
    setInput('');
    const sentAttachments = attachments;
    setAttachments([]);
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('chatbot-chat', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        body: {
          conversation_id: activeConvId,
          message: messageText,
          attachments: sentAttachments.map(({ name, mime_type, data_url }) => ({ name, mime_type, data_url })),
          use_web_search: useWebSearch,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.text === 'function') {
            const raw = await ctx.text();
            if (raw) {
              const parsed = JSON.parse(raw);
              msg = parsed.error || parsed.message || msg;
            }
          }
        } catch { /* use original message */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const convId: string = data.conversation_id;
      const isNewConv = convId !== activeConvId;

      if (isNewConv) {
        suppressFetchRef.current = true;
        setActiveConvId(convId);
      }
      setUseWebSearch(false);

      setMessages((curr) => {
        const base = curr.filter((m) => m.id !== optimisticUser.id);
        const updated: Message[] = [
          ...base,
          { ...optimisticUser, id: `u-${Date.now()}`, conversation_id: convId },
          {
            id: `a-${Date.now()}`,
            conversation_id: convId,
            role: 'assistant' as const,
            content: data.reply,
            attachments: [],
            tools_used: data.tools_used ?? [],
            model_used: data.model_used ?? null,
            created_at: new Date().toISOString(),
          },
        ];
        // Persist to localStorage so history survives tab switches even when
        // the DB insert is failing (pending migration on production).
        cacheSet(convId, updated);
        return updated;
      });

      await fetchConversations();
      await fetchUsage();
    } catch (err) {
      toast({ title: 'Failed to send message', description: (err as Error).message, variant: 'destructive' });
      setMessages((curr) => curr.filter((m) => m.id !== optimisticUser.id));
      setAttachments(sentAttachments);
      setInput(messageText);
    } finally {
      setSending(false);
    }
  };

  const togglePin = async (conv: Conversation) => {
    await supabase.from('chatbot_conversations').update({ pinned: !conv.pinned }).eq('id', conv.id);
    fetchConversations();
  };

  const deleteConversation = async (conv: Conversation) => {
    await supabase.from('chatbot_conversations').delete().eq('id', conv.id);
    cacheDel(conv.id);
    if (activeConvId === conv.id) startNewChat();
    fetchConversations();
  };

  const remainingMessages = useMemo(() => {
    if (!usageToday) return null;
    return Math.max(0, usageToday.limit - usageToday.used);
  }, [usageToday]);

  const filteredConversations = useMemo(() => {
    if (!sidebarSearch.trim()) return conversations;
    const q = sidebarSearch.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, sidebarSearch]);

  const pinnedConvs  = filteredConversations.filter((c) => c.pinned);
  const recentConvs  = filteredConversations.filter((c) => !c.pinned);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-4rem)] -mx-4 sm:-mx-6 -my-4 sm:-my-6">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-[var(--shadow-sm)] shrink-0">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="kd-display text-base font-semibold truncate leading-tight">KD-Ops Assistant</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              Powered by Llama&nbsp;3.3&nbsp;70B · Gemini Vision · Tavily Search
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {usageToday && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-default">
                  <span className={remainingMessages === 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                    {remainingMessages ?? '—'} / {usageToday.limit}
                  </span>
                  <span className="text-muted-foreground/50">messages left</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">Daily message quota</TooltipContent>
            </Tooltip>
          )}
          {isSuperAdmin && (
            <Button asChild variant="outline" size="sm" className="kd-transition">
              <Link to="/assistant/admin">
                <SettingsIcon className="h-3.5 w-3.5 mr-1.5" />
                Manage
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">

        {/* ── Conversation sidebar ─────────────────────────────────── */}
        <aside className="hidden md:flex flex-col w-64 border-r bg-muted/20 shrink-0">

          {/* New chat + search */}
          <div className="p-3 border-b space-y-2">
            <Button
              onClick={startNewChat}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground kd-transition"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New chat
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search conversations…"
                className="pl-8 h-8 text-xs bg-background/60"
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground kd-transition"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">

              {/* Pinned */}
              {pinnedConvs.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Pinned
                  </p>
                  {pinnedConvs.map((c) => (
                    <ConvItem
                      key={c.id}
                      conv={c}
                      active={activeConvId === c.id}
                      pendingDelete={pendingDeleteId === c.id}
                      onSelect={() => { setPendingDeleteId(null); setActiveConvId(c.id); }}
                      onPin={() => togglePin(c)}
                      onRequestDelete={() => setPendingDeleteId(c.id)}
                      onCancelDelete={() => setPendingDeleteId(null)}
                      onConfirmDelete={() => { setPendingDeleteId(null); deleteConversation(c); }}
                    />
                  ))}
                </div>
              )}

              {/* Recent */}
              {recentConvs.length > 0 && (
                <div>
                  {pinnedConvs.length > 0 && (
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Recent
                    </p>
                  )}
                  {recentConvs.map((c) => (
                    <ConvItem
                      key={c.id}
                      conv={c}
                      active={activeConvId === c.id}
                      pendingDelete={pendingDeleteId === c.id}
                      onSelect={() => { setPendingDeleteId(null); setActiveConvId(c.id); }}
                      onPin={() => togglePin(c)}
                      onRequestDelete={() => setPendingDeleteId(c.id)}
                      onCancelDelete={() => setPendingDeleteId(null)}
                      onConfirmDelete={() => { setPendingDeleteId(null); deleteConversation(c); }}
                    />
                  ))}
                </div>
              )}

              {filteredConversations.length === 0 && (
                <div className="py-8 text-center px-3">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {sidebarSearch ? 'No matching conversations' : 'No conversations yet'}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Chat main area ───────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <ScrollArea className="flex-1">
            <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
                  <p className="text-xs text-muted-foreground">Loading conversation…</p>
                </div>

              ) : messages.length === 0 ? (
                <EmptyState onSuggestion={(text) => { setInput(text); }} />

              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} />)
              )}

              {sending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* ── Composer ──────────────────────────────────────────── */}
          <div className="border-t bg-card px-4 sm:px-6 py-3 shrink-0">
            <div className="max-w-2xl mx-auto">

              {/* Attachment chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs kd-transition"
                    >
                      {a.mime_type.startsWith('image/')
                        ? <ImageIcon className="h-3 w-3 text-primary shrink-0" />
                        : <FileText className="h-3 w-3 text-muted-foreground shrink-0" />}
                      <span className="truncate max-w-[140px]">{a.name}</span>
                      <span className="text-muted-foreground/60">{(a.size / 1024).toFixed(0)} KB</span>
                      <button
                        onClick={() => setAttachments((c) => c.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive kd-transition ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.txt,.csv,.md"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />

                {/* Attach */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground kd-transition"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Attach image or document (max 10 MB)</TooltipContent>
                </Tooltip>

                {/* Web search toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`h-9 w-9 shrink-0 kd-transition ${
                        useWebSearch
                          ? 'text-primary bg-primary/10 hover:bg-primary/15'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setUseWebSearch((v) => !v)}
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {useWebSearch ? 'Web search ON for next message' : 'Enable Tavily web search'}
                  </TooltipContent>
                </Tooltip>

                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder={
                    useWebSearch
                      ? 'Search the web… (e.g. "latest USD/NGN rate")'
                      : 'Ask about payments, fleet, payroll, or anything else…'
                  }
                  className="min-h-[40px] max-h-28 resize-none flex-1 text-sm bg-muted/30 border-muted focus-visible:bg-background"
                  rows={1}
                  disabled={sending}
                />

                <Button
                  onClick={sendMessage}
                  disabled={sending || (!input.trim() && attachments.length === 0)}
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground kd-transition shadow-[var(--shadow-sm)]"
                >
                  {sending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <p className="text-[10px] text-muted-foreground/60">
                  Enter to send · Shift+Enter for new line
                </p>
                {useWebSearch && (
                  <span className="kd-badge kd-badge-primary text-[10px] flex items-center gap-1">
                    <Globe className="h-2.5 w-2.5" /> Web search active
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar conversation item ─────────────────────────────────────── */
function ConvItem({
  conv,
  active,
  pendingDelete,
  onSelect,
  onPin,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  conv: Conversation;
  active: boolean;
  pendingDelete: boolean;
  onSelect: () => void;
  onPin: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div
      className={`group rounded-lg px-2.5 py-2 cursor-pointer flex items-start gap-2 kd-transition mb-0.5 ${
        pendingDelete
          ? 'bg-destructive/8 border border-destructive/25'
          : active
            ? 'bg-primary/10 border border-primary/20'
            : 'hover:bg-muted/60 border border-transparent'
      }`}
      onClick={() => { if (!pendingDelete) onSelect(); }}
    >
      <MessageSquare className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
        pendingDelete ? 'text-destructive/60' : active ? 'text-primary' : 'text-muted-foreground/50'
      }`} />
      <div className="flex-1 min-w-0">
        {pendingDelete ? (
          <p className="text-xs font-medium text-destructive leading-snug">Delete this chat?</p>
        ) : (
          <>
            <p className={`text-xs font-medium truncate ${active ? 'text-primary' : 'text-foreground'}`}>
              {conv.title}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDateTime(conv.updated_at)}
            </p>
          </>
        )}
      </div>

      {pendingDelete ? (
        /* Inline confirmation buttons */
        <div className="flex gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
            className="h-5 rounded px-1.5 text-[10px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground kd-transition"
          >
            Cancel
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
            className="h-5 rounded px-1.5 text-[10px] font-medium bg-destructive/90 hover:bg-destructive text-destructive-foreground kd-transition"
          >
            Delete
          </button>
        </div>
      ) : (
        /* Normal hover actions */
        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 kd-transition">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted kd-transition"
            title={conv.pinned ? 'Unpin' : 'Pin'}
          >
            {conv.pinned
              ? <PinOff className="h-3 w-3 text-muted-foreground" />
              : <Pin className="h-3 w-3 text-muted-foreground" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-destructive/10 text-destructive/60 hover:text-destructive kd-transition"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Empty state with suggestions ──────────────────────────────────── */
function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="kd-animate-float inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 items-center justify-center mb-5 shadow-[var(--shadow-md)]">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h2 className="kd-display text-2xl font-semibold mb-1.5">How can I help today?</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed">
        I know your KD-Ops platform — payments, fleet, payroll, expenses, and more.
        I can also search the web, check FX rates, and analyse images or PDFs.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s.text)}
            className="flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left hover:bg-muted/40 hover:border-border/80 kd-transition shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] group"
          >
            <span className={`mt-0.5 shrink-0 ${s.cls}`}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground kd-transition leading-snug">
              {s.text}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground mt-0.5 ml-auto shrink-0 kd-transition" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────── */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 kd-animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>

      {/* Avatar */}
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)] ${
          isUser
            ? 'bg-muted border'
            : 'bg-gradient-to-br from-primary to-cyan-500'
        }`}
      >
        {isUser
          ? <span className="text-[10px] font-bold text-muted-foreground">You</span>
          : <Bot className="h-4 w-4 text-white" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 space-y-1 ${isUser ? 'items-end flex flex-col' : ''}`}>
        <div
          className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted/60 text-foreground rounded-bl-sm'
          }`}
        >
          {message.content}

          {message.attachments?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-background/20 px-1.5 py-0.5 text-[10px]"
                >
                  {a.mime_type.startsWith('image/')
                    ? <ImageIcon className="h-2.5 w-2.5" />
                    : <FileText className="h-2.5 w-2.5" />}
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tool badges */}
        {!isUser && message.tools_used?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-0.5">
            {message.tools_used.map((t) => {
              const meta = TOOL_META[t];
              const Icon = meta?.icon ?? Search;
              return (
                <span key={t} className={`${meta?.cls ?? 'kd-badge kd-badge-muted'} flex items-center gap-1 text-[10px]`}>
                  <Icon className="h-2.5 w-2.5" />
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

/* ── Typing indicator ───────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex gap-3 kd-animate-fade-in">
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)]">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="bg-muted/60 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
