// Communications → Compose
//
// Single-screen email composer + recent campaign history.
//
// Recipients can be:
//   - typed manually (comma/newline separated)
//   - selected from contacts (paste from CRM)
//   - selected from active employees (profiles with role IN drivers/staff/etc.)
//   - selected from contractors
//
// Body source:
//   - Pick a saved template by key OR
//   - Author a one-off subject + HTML body inline
//
// Test mode:
//   - "Send test to me" button — fires a single email to the operator's
//     own profile email with a synthetic recipient row, BEFORE the bulk
//     send. Lets the operator verify rendering with real Resend without
//     blasting recipients.
//
// Sending:
//   - Inserts email_campaigns + email_campaign_recipients rows.
//   - Invokes bulk-email-sender edge fn which throttles + writes per-row
//     status. Page polls campaign progress every 2s until terminal.

import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Send,
  Users,
  Code,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import {
  listEmailTemplates,
  renderTemplate,
  wrapEmailHtml,
  type EmailTemplate,
} from '@/lib/email-templates';

type RecipientSource = 'manual' | 'contacts' | 'employees' | 'contractors';
type BodySource = 'template' | 'custom';

interface Recipient {
  email: string;
  name?: string;
}

interface CampaignSummary {
  id: string;
  name: string | null;
  subject: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  created_at: string;
  completed_at: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dedupe = (rs: Recipient[]): Recipient[] => {
  const seen = new Set<string>();
  return rs.filter((r) => {
    const k = r.email.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export default function Communications() {
  usePageTitle('Communications');
  const { toast } = useToast();
  const { user, profile } = useAuthStore();

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [companyName, setCompanyName] = useState('KD Squares');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Body
  const [bodySource, setBodySource] = useState<BodySource>('custom');
  const [templateKey, setTemplateKey] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState(
    '<p>Hi {{recipient_name}},</p>\n<p>Write your message here.</p>\n<p>— KD Squares</p>',
  );

  // Recipients
  const [recipientSource, setRecipientSource] = useState<RecipientSource>('manual');
  const [manualText, setManualText] = useState('');
  const [pickedRecipients, setPickedRecipients] = useState<Recipient[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Send / preview state
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeProgress, setActiveProgress] = useState<CampaignSummary | null>(null);

  // History
  const [history, setHistory] = useState<CampaignSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ─── Load templates + history ─────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const [tpls, cs] = await Promise.all([
          listEmailTemplates(),
          supabase.from('company_settings')
            .select('company_name, logo_url')
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .maybeSingle(),
        ]);
        setTemplates(tpls);
        if (cs.data) {
          setCompanyName((cs.data as any).company_name || 'KD Squares');
          setLogoUrl((cs.data as any).logo_url || null);
        }
      } catch {
        // non-fatal
      }
      void reloadHistory();
    })();
  }, []);

  const reloadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('email_campaigns')
      .select('id, name, subject, status, total_recipients, total_sent, total_failed, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(25);
    setHistory(((data ?? []) as CampaignSummary[]));
    setHistoryLoading(false);
  };

  // ─── Recipient builder ─────────────────────────────────────────────────
  const manualRecipients: Recipient[] = useMemo(() => {
    return manualText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => EMAIL_RX.test(s))
      .map((email) => ({ email }));
  }, [manualText]);

  const allRecipients = useMemo(
    () => dedupe(recipientSource === 'manual' ? manualRecipients : pickedRecipients),
    [recipientSource, manualRecipients, pickedRecipients],
  );

  const loadFromSource = async (src: Exclude<RecipientSource, 'manual'>) => {
    setPickerLoading(true);
    setPickedRecipients([]);
    try {
      let data: { email: string | null; name?: string | null }[] = [];
      if (src === 'contacts') {
        const { data: rows } = await supabase
          .from('contacts').select('email, full_name')
          .not('email', 'is', null);
        data = (rows ?? []).map((r: any) => ({ email: r.email, name: r.full_name }));
      } else if (src === 'employees') {
        const { data: rows } = await supabase
          .from('profiles').select('email, full_name')
          .eq('status', 'active')
          .not('email', 'is', null);
        data = (rows ?? []).map((r: any) => ({ email: r.email, name: r.full_name }));
      } else if (src === 'contractors') {
        const { data: rows } = await supabase
          .from('contractors').select('email, full_name')
          .not('email', 'is', null);
        data = (rows ?? []).map((r: any) => ({ email: r.email, name: r.full_name }));
      }
      const cleaned = data
        .filter((r) => r.email && EMAIL_RX.test(r.email))
        .map((r) => ({ email: r.email!, name: r.name ?? undefined }));
      setPickedRecipients(dedupe(cleaned));
    } catch (e: any) {
      toast({ title: 'Could not load recipients', description: e?.message, variant: 'destructive' });
    } finally {
      setPickerLoading(false);
    }
  };

  // ─── Body resolution (template or custom) ─────────────────────────────
  const activeTemplate = useMemo(
    () => (bodySource === 'template' ? templates.find((t) => t.key === templateKey) ?? null : null),
    [bodySource, templates, templateKey],
  );

  const effectiveSubject = activeTemplate?.subject ?? subject;
  const effectiveHtml = activeTemplate?.html_body ?? htmlBody;
  const effectiveText = activeTemplate?.text_body ?? null;

  const previewVars: Record<string, unknown> = useMemo(() => {
    const v: Record<string, unknown> = {
      recipient_name: 'Bola Adeyemi',
      company_name: companyName,
    };
    if (activeTemplate) {
      for (const def of activeTemplate.variables ?? []) {
        if (def.example) v[def.name] = def.example;
      }
    }
    return v;
  }, [activeTemplate, companyName]);

  const previewSubject = renderTemplate(effectiveSubject, previewVars);
  const previewHtml = wrapEmailHtml({
    bodyHtml: renderTemplate(effectiveHtml, previewVars),
    companyName,
    logoUrl,
    preheader: previewSubject,
  });

  // ─── Sending ───────────────────────────────────────────────────────────
  const validateBeforeSend = (): string | null => {
    if (!effectiveSubject.trim()) return 'Subject is required.';
    if (!effectiveHtml.trim()) return 'Body is required.';
    return null;
  };

  const createCampaign = async (
    recipients: Recipient[],
    opts: { test_mode: boolean; name?: string },
  ): Promise<string | null> => {
    const { data: campaign, error: cErr } = await supabase
      .from('email_campaigns')
      .insert({
        name: opts.name ?? null,
        template_key: bodySource === 'template' ? templateKey || null : null,
        subject: effectiveSubject,
        html_body: effectiveHtml,
        text_body: effectiveText,
        template_vars: {},
        created_by: user?.id ?? null,
        test_mode: opts.test_mode,
        total_recipients: recipients.length,
        status: 'draft',
      })
      .select('id')
      .single();
    if (cErr) {
      toast({ title: 'Could not create campaign', description: cErr.message, variant: 'destructive' });
      return null;
    }
    const campaignId = (campaign as any).id as string;

    // Insert recipients in batches of 500 to stay under PostgREST payload limits.
    const rows = recipients.map((r) => ({
      campaign_id: campaignId,
      email: r.email,
      name: r.name ?? null,
      vars: r.name ? { recipient_name: r.name } : {},
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const { error } = await supabase.from('email_campaign_recipients').insert(slice);
      if (error) {
        toast({ title: 'Recipient insert failed', description: error.message, variant: 'destructive' });
        return null;
      }
    }
    return campaignId;
  };

  const triggerSender = async (campaignId: string): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke('bulk-email-sender', {
      body: { campaign_id: campaignId },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) throw new Error(error.message);
  };

  const handleSendTest = async () => {
    const myEmail = (profile as any)?.email || (user as any)?.email;
    if (!myEmail) {
      toast({ title: 'No email on profile', variant: 'destructive' });
      return;
    }
    const v = validateBeforeSend();
    if (v) { toast({ title: v, variant: 'destructive' }); return; }
    setSendingTest(true);
    try {
      const cid = await createCampaign(
        [{ email: myEmail, name: (profile as any)?.full_name ?? 'You' }],
        { test_mode: true, name: 'Test send' },
      );
      if (!cid) return;
      await triggerSender(cid);
      toast({ title: 'Test sent', description: `Check ${myEmail}` });
      void reloadHistory();
    } catch (e: any) {
      toast({ title: 'Test send failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendAll = async () => {
    const v = validateBeforeSend();
    if (v) { toast({ title: v, variant: 'destructive' }); return; }
    if (allRecipients.length === 0) {
      toast({ title: 'No recipients', description: 'Add at least one valid email.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Send to ${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'}?`)) return;
    setSending(true);
    try {
      const cid = await createCampaign(allRecipients, {
        test_mode: false,
        name: effectiveSubject.slice(0, 80),
      });
      if (!cid) return;
      setActiveCampaignId(cid);
      await triggerSender(cid);
      toast({ title: 'Send started', description: 'Watch the progress card below.' });
      void reloadHistory();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // ─── Active campaign progress polling ─────────────────────────────────
  useEffect(() => {
    if (!activeCampaignId) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from('email_campaigns')
        .select('id, name, subject, status, total_recipients, total_sent, total_failed, created_at, completed_at')
        .eq('id', activeCampaignId)
        .maybeSingle();
      if (!cancelled && data) {
        setActiveProgress(data as CampaignSummary);
        if (['sent', 'partially_sent', 'failed', 'cancelled'].includes((data as any).status)) {
          void reloadHistory();
        }
      }
    };
    void tick();
    const id = window.setInterval(tick, 2000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeCampaignId]);

  const isProgressTerminal = activeProgress
    && ['sent', 'partially_sent', 'failed', 'cancelled'].includes(activeProgress.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Communications"
        subtitle="Compose templated or one-off emails. Send to a single recipient, or to a curated list."
        icon={<Mail className="h-5 w-5" />}
      />

      {/* Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compose</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Body source */}
            <div className="space-y-1">
              <Label className="text-xs">Body source</Label>
              <Select value={bodySource} onValueChange={(v) => setBodySource(v as BodySource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Write a one-off message</SelectItem>
                  <SelectItem value="template">Use a saved template</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bodySource === 'template' ? (
              <div className="space-y-1">
                <Label className="text-xs">Template</Label>
                <Select value={templateKey} onValueChange={setTemplateKey}>
                  <SelectTrigger><SelectValue placeholder="Pick a template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.key}>
                        {t.name} <span className="text-muted-foreground ml-1">({t.key})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeTemplate && (
                  <p className="text-xs text-muted-foreground">
                    {activeTemplate.description}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">HTML body</Label>
                  <Textarea
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    className="font-mono text-xs min-h-[260px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Use <code>{'{{recipient_name}}'}</code> for personalization.
                  </p>
                </div>
              </>
            )}

            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList>
                <TabsTrigger value="edit"><Code className="h-3 w-3 mr-1" /> Editor</TabsTrigger>
                <TabsTrigger value="preview"><Eye className="h-3 w-3 mr-1" /> Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="pt-3">
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-2 border-b text-xs">
                    Subject: <strong>{previewSubject}</strong>
                  </div>
                  <iframe title="Preview" srcDoc={previewHtml} className="w-full h-[420px] bg-white" />
                </div>
              </TabsContent>
            </Tabs>

            {/* Action row */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button variant="outline" onClick={handleSendTest} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send test to me
              </Button>
              <Button onClick={handleSendAll} disabled={sending || allRecipients.length === 0}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send to {allRecipients.length || 0}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recipient picker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Recipients · {allRecipients.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select
                value={recipientSource}
                onValueChange={(v) => {
                  const s = v as RecipientSource;
                  setRecipientSource(s);
                  if (s !== 'manual') void loadFromSource(s);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Type addresses</SelectItem>
                  <SelectItem value="contacts">All contacts</SelectItem>
                  <SelectItem value="employees">Active employees</SelectItem>
                  <SelectItem value="contractors">Contractors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientSource === 'manual' ? (
              <div className="space-y-1">
                <Label className="text-xs">Email addresses (comma or newline separated)</Label>
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="text-xs min-h-[120px]"
                  placeholder="bola@example.com, lola@example.com"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Loaded from {recipientSource}.
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => void loadFromSource(recipientSource as any)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Reload
                  </Button>
                </div>
                {pickerLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="border rounded-md max-h-[260px] overflow-y-auto divide-y">
                    {pickedRecipients.length === 0 && (
                      <p className="text-xs text-muted-foreground italic p-2">No recipients found.</p>
                    )}
                    {pickedRecipients.map((r) => (
                      <div key={r.email} className="text-xs px-2 py-1.5 flex items-center justify-between">
                        <span>{r.name || r.email}</span>
                        <button
                          onClick={() => setPickedRecipients((cur) => cur.filter((x) => x.email !== r.email))}
                          className="text-muted-foreground hover:text-rose-500"
                          aria-label="Remove"
                        ><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Duplicates and invalid addresses are filtered automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live progress card for the in-flight campaign */}
      {activeProgress && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              {isProgressTerminal
                ? activeProgress.status === 'sent'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />
                : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              Campaign {activeProgress.status}
            </CardTitle>
            {isProgressTerminal && (
              <Button size="sm" variant="ghost" onClick={() => { setActiveCampaignId(null); setActiveProgress(null); }}>
                Dismiss
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>{activeProgress.subject}</p>
            <div className="text-xs text-muted-foreground">
              {activeProgress.total_sent} sent · {activeProgress.total_failed} failed · {activeProgress.total_recipients} total
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Recent campaigns
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void reloadHistory()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No campaigns yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs max-w-[420px] truncate" title={h.subject}>{h.subject}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        h.status === 'sent' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' :
                        h.status === 'sending' ? 'border-sky-500/40 text-sky-700 dark:text-sky-400' :
                        h.status === 'partially_sent' ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' :
                        h.status === 'failed' ? 'border-rose-500/40 text-rose-700 dark:text-rose-400' :
                        'border-slate-500/40 text-slate-700 dark:text-slate-400'
                      }>
                        {h.status === 'sending' && <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />}
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{h.total_sent}</TableCell>
                    <TableCell className="text-right text-xs">
                      {h.total_failed > 0 ? <span className="text-rose-500"><XCircle className="h-3 w-3 inline mr-0.5" />{h.total_failed}</span> : 0}
                    </TableCell>
                    <TableCell className="text-right text-xs">{h.total_recipients}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
