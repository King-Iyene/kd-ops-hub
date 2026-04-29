import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Save,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Database,
  Activity,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Brain,
  Globe,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const ALL_ROLES = ['super_admin', 'admin', 'finance', 'operations', 'driver', 'field_staff'] as const;

interface Config {
  id: string;
  system_prompt: string;
  text_model: string;
  vision_model: string;
  embedding_model: string;
  daily_message_limit: number;
  enable_web_search: boolean;
  enable_fx_rates: boolean;
  enable_platform_query: boolean;
  is_enabled: boolean;
  updated_at: string;
}

interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  source: string | null;
  tags: string[];
  visible_to_roles: string[];
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

interface UsageRow {
  user_id: string;
  full_name: string;
  total_messages: number;
  total_tokens: number;
}

export default function AssistantAdmin() {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [config, setConfig] = useState<Config | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [embedding, setEmbedding] = useState<string | null>(null); // id of row being embedded

  const [editKb, setEditKb] = useState<Partial<KnowledgeRow> | null>(null);
  const [showKbDialog, setShowKbDialog] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: cfg }, { data: kb }, { data: usageRows }] = await Promise.all([
      supabase.from('chatbot_config').select('*').limit(1).single(),
      supabase.from('chatbot_knowledge').select('*').order('updated_at', { ascending: false }),
      supabase.from('chatbot_usage')
        .select('user_id, message_count, tokens_total')
        .order('usage_date', { ascending: false })
        .limit(500),
    ]);
    setConfig(cfg as Config | null);
    setKnowledge((kb ?? []) as KnowledgeRow[]);

    // Aggregate usage by user
    const userIds = [...new Set((usageRows ?? []).map((u: any) => u.user_id))];
    const { data: profs } = userIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const agg = new Map<string, UsageRow>();
    for (const u of usageRows ?? []) {
      const row = agg.get(u.user_id) ?? {
        user_id: u.user_id,
        full_name: profMap.get(u.user_id) ?? 'Unknown',
        total_messages: 0,
        total_tokens: 0,
      };
      row.total_messages += u.message_count ?? 0;
      row.total_tokens += u.tokens_total ?? 0;
      agg.set(u.user_id, row);
    }
    setUsage([...agg.values()].sort((a, b) => b.total_messages - a.total_messages));
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) fetchAll();
  }, [isSuperAdmin]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase.from('chatbot_config').update({
      system_prompt: config.system_prompt,
      text_model: config.text_model,
      vision_model: config.vision_model,
      daily_message_limit: config.daily_message_limit,
      enable_web_search: config.enable_web_search,
      enable_fx_rates: config.enable_fx_rates,
      enable_platform_query: config.enable_platform_query,
      is_enabled: config.is_enabled,
      updated_by: profile?.id,
    }).eq('id', config.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('chatbot_config_updated', 'Updated assistant configuration', profile);
    toast({ title: 'Configuration saved' });
    fetchAll();
  };

  const openKbForm = (row?: KnowledgeRow) => {
    setEditKb(row ?? {
      title: '',
      content: '',
      source: '',
      tags: [],
      visible_to_roles: [...ALL_ROLES],
    });
    setShowKbDialog(true);
  };

  const saveKb = async () => {
    if (!editKb || !editKb.title?.trim() || !editKb.content?.trim()) {
      toast({ title: 'Title and content are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      title: editKb.title!.trim(),
      content: editKb.content!.trim(),
      source: editKb.source?.trim() || null,
      tags: editKb.tags ?? [],
      visible_to_roles: editKb.visible_to_roles ?? [...ALL_ROLES],
      embedding: null, // reset on edit so it gets re-embedded
    };
    let resultId: string | null = null;
    if (editKb.id) {
      const { error } = await supabase.from('chatbot_knowledge').update(payload).eq('id', editKb.id);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); setSaving(false); return; }
      resultId = editKb.id;
    } else {
      const { data, error } = await supabase.from('chatbot_knowledge')
        .insert({ ...payload, created_by: profile?.id })
        .select('id').single();
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); setSaving(false); return; }
      resultId = data.id;
    }
    setSaving(false);
    setShowKbDialog(false);
    await logAudit(editKb.id ? 'chatbot_kb_updated' : 'chatbot_kb_created', `Knowledge: ${payload.title}`, profile);
    // Generate embedding immediately
    if (resultId) {
      await generateEmbedding(resultId);
    }
    fetchAll();
  };

  const deleteKb = async (row: KnowledgeRow) => {
    if (!confirm(`Delete "${row.title}"?`)) return;
    const { error } = await supabase.from('chatbot_knowledge').delete().eq('id', row.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('chatbot_kb_deleted', `Knowledge: ${row.title}`, profile);
    toast({ title: 'Deleted' });
    fetchAll();
  };

  const generateEmbedding = async (knowledgeId: string) => {
    setEmbedding(knowledgeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('chatbot-embed', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: { knowledge_id: knowledgeId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Embedded', description: 'Ready for retrieval.' });
      fetchAll();
    } catch (err) {
      toast({ title: 'Embedding failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setEmbedding(null);
    }
  };

  const reembedAll = async () => {
    if (!confirm('Re-embed all knowledge entries? This may take a minute.')) return;
    setEmbedding('all');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('chatbot-embed', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: { all: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const failed = data?.failed ?? 0;
      toast({
        title: `Embedded ${data?.embedded ?? 0} of ${(data?.embedded ?? 0) + failed} entries`,
        description: failed > 0 ? `${failed} failed — check browser console for details.` : 'All entries ready for retrieval.',
        variant: failed > 0 ? 'destructive' : 'default',
      });
      fetchAll();
    } catch (err) {
      toast({ title: 'Failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setEmbedding(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="kd-display text-xl font-semibold mb-2">Super admin only</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Assistant management is restricted to super admins.
        </p>
        <Button asChild variant="outline">
          <Link to="/assistant"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Assistant</Link>
        </Button>
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const unembeddedCount = knowledge.filter((k) => !k.embedding).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/assistant"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Link>
          </Button>
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="kd-display text-xl font-semibold">Assistant Management</h1>
            <p className="text-xs text-muted-foreground">
              Configure the AI brain · Last updated {formatDateTime(config.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Assistant {config.is_enabled ? 'on' : 'off'}</span>
          <Switch
            checked={config.is_enabled}
            onCheckedChange={(v) => setConfig({ ...config, is_enabled: v })}
          />
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Brain</TabsTrigger>
          <TabsTrigger value="knowledge">
            <Database className="h-3.5 w-3.5 mr-1.5" /> Knowledge ({knowledge.length})
            {unembeddedCount > 0 && <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-400 text-amber-600">{unembeddedCount} unembedded</Badge>}
          </TabsTrigger>
          <TabsTrigger value="usage"><Activity className="h-3.5 w-3.5 mr-1.5" /> Usage</TabsTrigger>
        </TabsList>

        {/* ─── Brain / Config tab ─────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" /> System Prompt
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                The persona and base instructions. Sent on every request.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.system_prompt}
                onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
                rows={8}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Text Model (Groq)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={config.text_model}
                  onChange={(e) => setConfig({ ...config, text_model: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Recommended: <code>llama-3.3-70b-versatile</code> (best free), <code>llama-3.1-8b-instant</code> (fastest), <code>mixtral-8x7b-32768</code> (long context).
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Vision Model (Gemini)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={config.vision_model}
                  onChange={(e) => setConfig({ ...config, vision_model: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Recommended: <code>gemini-1.5-flash</code> (fast, free), <code>gemini-1.5-pro</code> (best quality, smaller free quota).
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Limits & Tools</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Daily message limit per user</Label>
                  <Input
                    type="number"
                    value={config.daily_message_limit}
                    onChange={(e) => setConfig({ ...config, daily_message_limit: parseInt(e.target.value) || 50 })}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <ToggleRow
                  icon={<Globe className="h-4 w-4 text-blue-500" />}
                  title="Web search (Brave)"
                  description="Allow the bot to fetch live web results when users ask about news, current events, or hit the search button."
                  checked={config.enable_web_search}
                  onChange={(v) => setConfig({ ...config, enable_web_search: v })}
                />
                <ToggleRow
                  icon={<Sparkles className="h-4 w-4 text-amber-500" />}
                  title="FX rates lookup"
                  description="Auto-fetch USD/NGN, GBP/NGN, EUR/NGN rates when users ask about currency."
                  checked={config.enable_fx_rates}
                  onChange={(v) => setConfig({ ...config, enable_fx_rates: v })}
                />
                <ToggleRow
                  icon={<Database className="h-4 w-4 text-emerald-500" />}
                  title="Platform queries (read-only)"
                  description="Let the bot query platform data (filtered by user role) to answer questions about trips, expenses, etc."
                  checked={config.enable_platform_query}
                  onChange={(v) => setConfig({ ...config, enable_platform_query: v })}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button onClick={fetchAll} variant="outline">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Reload
            </Button>
            <Button onClick={saveConfig} disabled={saving} className="bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save configuration
            </Button>
          </div>
        </TabsContent>

        {/* ─── Knowledge tab ───────────────────────────────────────────────── */}
        <TabsContent value="knowledge" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-medium">Knowledge base</p>
              <p className="text-xs text-muted-foreground">
                Upload documents and information for the bot to retrieve. Each entry is embedded and used in semantic search.
              </p>
            </div>
            <div className="flex gap-2">
              {unembeddedCount > 0 && (
                <Button onClick={reembedAll} variant="outline" disabled={embedding === 'all'}>
                  {embedding === 'all' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Brain className="h-4 w-4 mr-1.5" />}
                  Embed missing ({unembeddedCount})
                </Button>
              )}
              <Button onClick={() => openKbForm()} className="bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90">
                <Plus className="h-4 w-4 mr-1.5" /> Add knowledge
              </Button>
            </div>
          </div>

          {knowledge.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Database className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">No knowledge entries yet</p>
                <p className="text-xs text-muted-foreground">
                  Add platform documentation, policies, or FAQs so the assistant can answer accurately.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {knowledge.map((k) => (
                <Card key={k.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{k.title}</p>
                          {k.embedding ? (
                            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                              <Eye className="h-2.5 w-2.5 mr-0.5" /> Indexed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                              <EyeOff className="h-2.5 w-2.5 mr-0.5" /> Not embedded
                            </Badge>
                          )}
                          {k.source && <span className="text-[10px] text-muted-foreground">{k.source}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{k.content}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {k.visible_to_roles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-[9px] py-0 px-1.5">{r}</Badge>
                          ))}
                          {k.tags.map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5">#{t}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!k.embedding && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7"
                            disabled={embedding === k.id}
                            onClick={() => generateEmbedding(k.id)}
                            title="Generate embedding"
                          >
                            {embedding === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openKbForm(k)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteKb(k)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Usage tab ───────────────────────────────────────────────────── */}
        <TabsContent value="usage" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cumulative usage by user</CardTitle></CardHeader>
            <CardContent>
              {usage.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No usage yet.</p>
              ) : (
                <div className="space-y-1">
                  {usage.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
                      <p className="text-sm font-medium truncate">{u.full_name}</p>
                      <div className="flex gap-3 text-xs tabular-nums shrink-0">
                        <span className="text-muted-foreground">{u.total_messages} msgs</span>
                        <span className="text-muted-foreground">{u.total_tokens.toLocaleString()} tokens</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Knowledge Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showKbDialog} onOpenChange={setShowKbDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editKb?.id ? 'Edit knowledge entry' : 'Add knowledge entry'}</DialogTitle>
          </DialogHeader>
          {editKb && (
            <div className="space-y-3">
              <div>
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  value={editKb.title ?? ''}
                  onChange={(e) => setEditKb({ ...editKb, title: e.target.value })}
                  placeholder="e.g. How to file an expense report"
                />
              </div>
              <div>
                <Label>Content <span className="text-destructive">*</span></Label>
                <Textarea
                  value={editKb.content ?? ''}
                  onChange={(e) => setEditKb({ ...editKb, content: e.target.value })}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="Paste documentation, FAQs, or platform information here..."
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  This text is embedded as a vector and retrieved when users ask related questions.
                </p>
              </div>
              <div>
                <Label>Source (optional)</Label>
                <Input
                  value={editKb.source ?? ''}
                  onChange={(e) => setEditKb({ ...editKb, source: e.target.value })}
                  placeholder="e.g. HR Handbook v2.1"
                />
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={(editKb.tags ?? []).join(', ')}
                  onChange={(e) => setEditKb({ ...editKb, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="payroll, leave, fleet"
                />
              </div>
              <div>
                <Label>Visible to roles</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_ROLES.map((role) => {
                    const checked = (editKb.visible_to_roles ?? []).includes(role);
                    return (
                      <button
                        key={role} type="button"
                        onClick={() => {
                          const next = checked
                            ? (editKb.visible_to_roles ?? []).filter((r) => r !== role)
                            : [...(editKb.visible_to_roles ?? []), role];
                          setEditKb({ ...editKb, visible_to_roles: next });
                        }}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          checked
                            ? 'bg-violet-100 border-violet-400 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Only users with these roles will see this knowledge during retrieval.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKbDialog(false)}>Cancel</Button>
            <Button onClick={saveKb} disabled={saving} className="bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save & embed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleRow({
  icon, title, description, checked, onChange,
}: {
  icon: React.ReactNode; title: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/20">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
