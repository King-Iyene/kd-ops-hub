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
  AlertCircle,
  Image as ImageIcon,
  FileText,
  Zap,
  Search,
  BookOpen,
  Settings as SettingsIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const TOOL_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  knowledge_base: { label: 'Knowledge base', icon: BookOpen },
  web_search:     { label: 'Web search',     icon: Globe },
  fx_rates:       { label: 'FX rates',       icon: Sparkles },
  fallback_gemini:{ label: 'Gemini fallback',icon: Zap },
};

export default function Assistant() {
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSuperAdmin = profile?.role === 'super_admin';

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('chatbot_conversations')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversations((data ?? []) as Conversation[]);
  };

  const fetchMessages = async (convId: string) => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('chatbot_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
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
    fetchConversations();
    fetchUsage();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeConvId) fetchMessages(activeConvId);
    else setMessages([]);
  }, [activeConvId]);

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
        toast({
          title: 'File too large',
          description: `${f.name} exceeds 10 MB limit.`,
          variant: 'destructive',
        });
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
        // Try to extract the real error from the response body (non-2xx case)
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? error.message);
      }
      if (data?.error) throw new Error(data.error);

      // If a brand new conversation was created, switch to it
      if (data.conversation_id && data.conversation_id !== activeConvId) {
        setActiveConvId(data.conversation_id);
      }
      setUseWebSearch(false);
      // Refresh from server (gets real IDs and timestamps)
      await fetchMessages(data.conversation_id);
      await fetchConversations();
      await fetchUsage();
    } catch (err) {
      toast({
        title: 'Failed to send message',
        description: (err as Error).message,
        variant: 'destructive',
      });
      // Roll back the optimistic user message
      setMessages((curr) => curr.filter((m) => m.id !== optimisticUser.id));
      setAttachments(sentAttachments);
      setInput(messageText);
    } finally {
      setSending(false);
    }
  };

  const togglePin = async (conv: Conversation) => {
    await supabase.from('chatbot_conversations')
      .update({ pinned: !conv.pinned }).eq('id', conv.id);
    fetchConversations();
  };

  const deleteConversation = async (conv: Conversation) => {
    if (!confirm(`Delete "${conv.title}"? This cannot be undone.`)) return;
    await supabase.from('chatbot_conversations').delete().eq('id', conv.id);
    if (activeConvId === conv.id) startNewChat();
    fetchConversations();
  };

  const remainingMessages = useMemo(() => {
    if (!usageToday) return null;
    return Math.max(0, usageToday.limit - usageToday.used);
  }, [usageToday]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-4 sm:-mx-6 -my-4 sm:-my-6">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b bg-background flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shrink-0">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="kd-display text-lg font-semibold truncate">KD-Ops Assistant</h1>
            <p className="text-xs text-muted-foreground truncate">
              AI helper for the platform · Powered by Llama 3.3 + Gemini
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {remainingMessages !== null && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {remainingMessages} of {usageToday?.limit} left today
            </Badge>
          )}
          {isSuperAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link to="/assistant/admin">
                <SettingsIcon className="h-4 w-4 mr-1.5" />
                Manage
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Conversations sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r bg-muted/30 shrink-0">
          <div className="p-3 border-b">
            <Button onClick={startNewChat} className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> New chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 px-2">
                  No conversations yet. Send a message to start.
                </p>
              ) : conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group rounded-lg px-2 py-2 cursor-pointer flex items-start gap-2 transition-colors ${
                    activeConvId === c.id
                      ? 'bg-violet-100 dark:bg-violet-950/30'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setActiveConvId(c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate flex items-center gap-1">
                      {c.pinned && <Pin className="h-3 w-3 shrink-0 text-violet-500" />}
                      {c.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(c.updated_at)}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(c); }}
                      className="h-6 w-6 rounded hover:bg-background/80 flex items-center justify-center"
                      title={c.pinned ? 'Unpin' : 'Pin'}
                    >
                      {c.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(c); }}
                      className="h-6 w-6 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-red-600 flex items-center justify-center"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-4">
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <EmptyState />
              ) : messages.map((m) => <MessageBubble key={m.id} message={m} />)}
              {sending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t bg-background px-4 sm:px-6 py-3 shrink-0">
            <div className="max-w-3xl mx-auto">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs"
                    >
                      {a.mime_type.startsWith('image/')
                        ? <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
                        : <FileText className="h-3.5 w-3.5 text-blue-500" />}
                      <span className="truncate max-w-[160px]">{a.name}</span>
                      <span className="text-muted-foreground">
                        {(a.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        onClick={() => setAttachments((c) => c.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
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
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image or document"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={useWebSearch ? 'default' : 'outline'}
                  className={`h-10 w-10 shrink-0 ${
                    useWebSearch ? 'bg-violet-600 hover:bg-violet-700' : ''
                  }`}
                  onClick={() => setUseWebSearch((v) => !v)}
                  title={useWebSearch ? 'Web search ON for next message' : 'Enable web search'}
                >
                  <Globe className="h-4 w-4" />
                </Button>

                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    useWebSearch
                      ? 'Search the web... (e.g. "latest USD/NGN rate")'
                      : 'Ask about payments, fleet, payroll, or anything else...'
                  }
                  className="min-h-[40px] max-h-32 resize-none flex-1"
                  rows={1}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || (!input.trim() && attachments.length === 0)}
                  size="icon"
                  className="h-10 w-10 shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90"
                >
                  {sending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Press Enter to send, Shift+Enter for new line · Replies may be inaccurate; verify important info.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const suggestions = [
    { icon: '💱', text: 'What is the current Naira to Dollar rate?' },
    { icon: '🚗', text: 'Show me my vehicle fuel logs from this week' },
    { icon: '📊', text: 'Help me draft a fuel expense report' },
    { icon: '📄', text: 'Upload a receipt and I\'ll extract the details' },
  ];
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 items-center justify-center mb-4 shadow-lg">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="kd-display text-2xl font-semibold mb-2">How can I help today?</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        I know about your KD-Ops platform — payments, fleet, payroll, expenses, and more. I can also search the web, check FX rates, and analyse images or PDFs.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
        {suggestions.map((s, i) => (
          <Card key={i} className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="p-3 flex items-start gap-2 text-left">
              <span className="text-base shrink-0">{s.icon}</span>
              <p className="text-xs leading-snug">{s.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-950/40'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600'
        }`}
      >
        {isUser
          ? <span className="text-xs font-bold text-blue-700">You</span>
          : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-full rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-950 dark:text-blue-100'
              : 'bg-muted/60'
          }`}
        >
          {message.content}
          {message.attachments?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 text-[10px]"
                >
                  {a.mime_type.startsWith('image/')
                    ? <ImageIcon className="h-3 w-3" />
                    : <FileText className="h-3 w-3" />}
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {message.tools_used?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {message.tools_used.map((t) => {
              const meta = TOOL_LABELS[t];
              const Icon = meta?.icon ?? Search;
              return (
                <Badge
                  key={t}
                  variant="outline"
                  className="text-[10px] gap-1 font-normal"
                >
                  <Icon className="h-2.5 w-2.5" />
                  {meta?.label ?? t}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="bg-muted/60 rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
