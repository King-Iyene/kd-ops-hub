// Communications → Compose
//
// Multi-channel composer (Email / SMS / WhatsApp) + a unified send history.
//
// Channel is the first choice, not an afterthought — audience, scheduling,
// and the send action all adapt to whichever channel is picked, instead of
// SMS/WhatsApp being separate bolted-on tabs. Email uses email_campaigns
// (Resend); SMS/WhatsApp use the parallel message_campaigns table (Termii) —
// see the message_campaigns_and_scheduling migration for why that's a
// separate table rather than overloading email_campaigns' schema.
//
// Recipients can be:
//   - typed manually (comma/newline separated — emails for the Email
//     channel, phone numbers for SMS/WhatsApp)
//   - selected from contacts (paste from CRM)
//   - selected from active employees (optionally filtered by department)
//   - selected from contractors
//
// Body source (Email only):
//   - Pick a saved template by key OR
//   - Author a one-off subject + HTML body inline
// SMS/WhatsApp bodies are always a one-off plain-text message — Termii's
// WhatsApp free-form send (used here) doesn't have a template system of its
// own the way Meta's stricter Business API template flow does.
//
// Scheduling: any channel can be sent now or scheduled for later. A
// scheduled campaign is inserted with status='scheduled' and picked up by
// the campaign-scheduler cron job (fires every 5 minutes) instead of being
// dispatched immediately.
//
// Test mode:
//   - "Send test to me" — fires a single message to the operator's own
//     email/phone before the bulk send, so rendering can be checked without
//     blasting recipients. Always immediate, regardless of the schedule
//     toggle.

import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  MessageSquare,
  MessageCircle,
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
  Pencil,
  RotateCcw,
  CalendarClock,
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
import { confirm } from '@/hooks/use-confirm';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { parseNigerianPhone } from '@/lib/phone';
import {
  listEmailTemplates,
  renderTemplate,
  updateEmailTemplate,
  resetEmailTemplate,
  wrapEmailHtml,
  type EmailTemplate,
} from '@/lib/email-templates';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';

type Channel = 'email' | 'sms' | 'whatsapp';
type RecipientSource = 'manual' | 'contacts' | 'employees' | 'contractors';
type BodySource = 'template' | 'custom';
type SendMode = 'now' | 'schedule';

interface Recipient {
  email?: string;
  /** Termii-form phone (digits only, country code, no leading +). */
  phone?: string;
  name?: string;
}

interface CampaignSummary {
  id: string;
  channel: Channel;
  name: string | null;
  /** Email subject, or the first ~80 chars of an SMS/WhatsApp message. */
  subject: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  created_at: string;
  completed_at: string | null;
  scheduled_for?: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMS_SEGMENT_LEN = 160;

const CHANNEL_META: Record<Channel, { label: string; icon: React.ReactNode }> = {
  email: { label: 'Email', icon: <Mail className="h-3.5 w-3.5" /> },
  sms: { label: 'SMS', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  whatsapp: { label: 'WhatsApp', icon: <MessageCircle className="h-3.5 w-3.5" /> },
};

function recipientKey(r: Recipient, channel: Channel): string | undefined {
  return channel === 'email' ? r.email?.trim().toLowerCase() : r.phone;
}

function dedupeRecipients(rs: Recipient[], channel: Channel): Recipient[] {
  const seen = new Set<string>();
  return rs.filter((r) => {
    const k = recipientKey(r, channel);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A small pill-row of mutually exclusive options — used in place of a
 *  native Select for short, frequently-toggled choices, where a dropdown
 *  hides the options behind an extra click for no reason. */
function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-card text-foreground shadow-sm border border-border/60'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Communications() {
  usePageTitle('Communications');
  const { toast } = useToast();
  const { user, profile } = useAuthStore();

  // Channel — the first choice; everything below adapts to it.
  const [channel, setChannel] = useState<Channel>('email');

  // Templates (Email only)
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [companyName, setCompanyName] = useState('KD Squares');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Body — Email
  const [bodySource, setBodySource] = useState<BodySource>('custom');
  const [templateKey, setTemplateKey] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState(
    '<p>Hi {{recipient_name}},</p>\n<p>Write your message here.</p>\n<p>— KD Squares</p>',
  );
  // Body — SMS / WhatsApp
  const [textMessage, setTextMessage] = useState('');

  // Recipients
  const [recipientSource, setRecipientSource] = useState<RecipientSource>('manual');
  const [manualText, setManualText] = useState('');
  const [pickedRecipients, setPickedRecipients] = useState<Recipient[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Scheduling
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [scheduledFor, setScheduledFor] = useState('');

  // Send / preview state
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<{ id: string; channel: Channel } | null>(null);
  const [activeProgress, setActiveProgress] = useState<CampaignSummary | null>(null);

  // Template editing
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editHtmlBody, setEditHtmlBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editResetting, setEditResetting] = useState(false);

  // History
  const [history, setHistory] = useState<CampaignSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ─── Load templates + history ─────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const [tpls, cs, depts] = await Promise.all([
          listEmailTemplates(),
          supabase.from('company_settings')
            .select('company_name, logo_url')
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .maybeSingle(),
          supabase.from('departments').select('id, name').order('name'),
        ]);
        setTemplates(tpls);
        if (cs.data) {
          setCompanyName((cs.data as any).company_name || 'KD Squares');
          setLogoUrl((cs.data as any).logo_url || null);
        }
        setDepartments((depts.data as { id: string; name: string }[]) || []);
      } catch {
        // non-fatal
      }
      void reloadHistory();
    })();
  }, []);

  async function reloadHistory() {
    setHistoryLoading(true);
    const [emailRes, msgRes] = await Promise.all([
      supabase
        .from('email_campaigns')
        .select('id, name, subject, status, total_recipients, total_sent, total_failed, created_at, completed_at, scheduled_for')
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('message_campaigns')
        .select('id, name, channel, message, status, total_recipients, total_sent, total_failed, created_at, completed_at, scheduled_for')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    const emailRows: CampaignSummary[] = ((emailRes.data ?? []) as any[]).map((r) => ({
      id: r.id, channel: 'email', name: r.name, subject: r.subject, status: r.status,
      total_recipients: r.total_recipients, total_sent: r.total_sent, total_failed: r.total_failed,
      created_at: r.created_at, completed_at: r.completed_at, scheduled_for: r.scheduled_for,
    }));
    const msgRows: CampaignSummary[] = ((msgRes.data ?? []) as any[]).map((r) => ({
      id: r.id, channel: r.channel, name: r.name, subject: String(r.message || '').slice(0, 80), status: r.status,
      total_recipients: r.total_recipients, total_sent: r.total_sent, total_failed: r.total_failed,
      created_at: r.created_at, completed_at: r.completed_at, scheduled_for: r.scheduled_for,
    }));
    const merged = [...emailRows, ...msgRows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25);
    setHistory(merged);
    setHistoryLoading(false);
  };

  // ─── Template editing ──────────────────────────────────────────────────
  const openTemplateEditor = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl);
    setEditSubject(tpl.subject);
    setEditHtmlBody(tpl.html_body);
  };

  const saveTemplateEdit = async () => {
    if (!editingTemplate) return;
    setEditSaving(true);
    try {
      await updateEmailTemplate(editingTemplate.id, {
        subject: editSubject,
        html_body: editHtmlBody,
        text_body: editingTemplate.text_body,
      });
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === editingTemplate.id
            ? { ...t, subject: editSubject, html_body: editHtmlBody }
            : t,
        ),
      );
      toast({ title: 'Template saved' });
      setEditingTemplate(null);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  const resetTemplateToDefault = async () => {
    if (!editingTemplate) return;
    if (!(await confirm({ title: 'Reset template?', description: 'Reset this template to its factory default? Your edits will be lost.' }))) return;
    setEditResetting(true);
    try {
      await resetEmailTemplate(editingTemplate.id);
      const restored: EmailTemplate = {
        ...editingTemplate,
        subject: editingTemplate.default_subject,
        html_body: editingTemplate.default_html_body,
        text_body: editingTemplate.default_text_body,
      };
      setTemplates((prev) => prev.map((t) => (t.id === editingTemplate.id ? restored : t)));
      toast({ title: 'Template reset to default' });
      setEditingTemplate(null);
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e?.message, variant: 'destructive' });
    } finally {
      setEditResetting(false);
    }
  };

  // ─── Recipient builder ─────────────────────────────────────────────────
  const manualRecipients: Recipient[] = useMemo(() => {
    const lines = manualText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (channel === 'email') {
      return lines
        .map((s): Recipient | null => {
          const m1 = s.match(/^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>\s*$/);
          if (m1) return { name: m1[1].trim(), email: m1[2].trim() };
          const m2 = s.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)\s*\((.+?)\)\s*$/);
          if (m2) return { email: m2[1].trim(), name: m2[2].trim() };
          if (EMAIL_RX.test(s)) return { email: s };
          return null;
        })
        .filter((r): r is Recipient => r !== null && EMAIL_RX.test(r.email!));
    }
    return lines
      .map((s): Recipient | null => {
        const parsed = parseNigerianPhone(s);
        return parsed.ok && parsed.termii ? { phone: parsed.termii } : null;
      })
      .filter((r): r is Recipient => r !== null);
  }, [manualText, channel]);

  const allRecipients = useMemo(
    () => dedupeRecipients(recipientSource === 'manual' ? manualRecipients : pickedRecipients, channel),
    [recipientSource, manualRecipients, pickedRecipients, channel],
  );

  const loadFromSource = async (src: Exclude<RecipientSource, 'manual'>, ch: Channel) => {
    setPickerLoading(true);
    setPickedRecipients([]);
    try {
      const field = ch === 'email' ? 'email' : 'phone';
      let rows: { val: string | null; name?: string | null }[] = [];
      if (src === 'contacts') {
        const { data } = await supabase.from('contacts').select(`${field}, full_name`).not(field, 'is', null).limit(5000);
        rows = (data ?? []).map((r: any) => ({ val: r[field], name: r.full_name }));
      } else if (src === 'employees') {
        let q = supabase.from('profiles_directory').select(`${field}, full_name`).eq('status', 'active').not(field, 'is', null).limit(5000);
        if (deptFilter !== 'all') q = q.eq('department_id', deptFilter);
        const { data } = await q;
        rows = (data ?? []).map((r: any) => ({ val: r[field], name: r.full_name }));
      } else if (src === 'contractors') {
        const { data } = await supabase.from('contractors').select(`${field}, full_name`)
          .neq('status', 'deleted').neq('is_anonymised', true).not(field, 'is', null);
        rows = (data ?? []).map((r: any) => ({ val: r[field], name: r.full_name }));
      }

      let cleaned: Recipient[];
      if (ch === 'email') {
        cleaned = rows
          .filter((r) => r.val && EMAIL_RX.test(r.val))
          .map((r) => ({ email: r.val!, name: r.name ?? undefined }));
      } else {
        cleaned = rows
          .map((r): Recipient | null => {
            if (!r.val) return null;
            const parsed = parseNigerianPhone(r.val);
            return parsed.ok && parsed.termii ? { phone: parsed.termii, name: r.name ?? undefined } : null;
          })
          .filter((r): r is Recipient => r !== null);
      }
      setPickedRecipients(dedupeRecipients(cleaned, ch));
    } catch (e: any) {
      toast({ title: 'Could not load recipients', description: e?.message, variant: 'destructive' });
    } finally {
      setPickerLoading(false);
    }
  };

  // Re-pull whenever the department filter changes while Employees is
  // active, or the channel changes (email needs addresses, SMS/WhatsApp
  // need phone numbers — an entirely different column).
  useEffect(() => {
    setManualText('');
    if (recipientSource !== 'manual') void loadFromSource(recipientSource, channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    if (recipientSource === 'employees') void loadFromSource('employees', channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter]);

  // ─── Body resolution (template or custom) — Email only ────────────────
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
    if (channel === 'email') {
      if (!effectiveSubject.trim()) return 'Subject is required.';
      if (!effectiveHtml.trim()) return 'Body is required.';
    } else {
      if (!textMessage.trim()) return 'Message is required.';
    }
    if (sendMode === 'schedule') {
      if (!scheduledFor) return 'Pick a date and time to schedule for.';
      if (new Date(scheduledFor).getTime() <= Date.now()) return 'Scheduled time must be in the future.';
    }
    return null;
  };

  const createEmailCampaign = async (
    recipients: Recipient[],
    opts: { test_mode: boolean; name?: string; schedule?: string | null },
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
        status: opts.schedule ? 'scheduled' : 'draft',
        scheduled_for: opts.schedule ?? null,
      })
      .select('id')
      .single();
    if (cErr) {
      toast({ title: 'Could not create campaign', description: cErr.message, variant: 'destructive' });
      return null;
    }
    const campaignId = (campaign as any).id as string;
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

  const createMessageCampaign = async (
    recipients: Recipient[],
    opts: { test_mode: boolean; name?: string; schedule?: string | null },
  ): Promise<string | null> => {
    const { data: campaign, error: cErr } = await supabase
      .from('message_campaigns')
      .insert({
        name: opts.name ?? null,
        channel,
        message: textMessage,
        created_by: user?.id ?? null,
        test_mode: opts.test_mode,
        total_recipients: recipients.length,
        status: opts.schedule ? 'scheduled' : 'draft',
        scheduled_for: opts.schedule ?? null,
      })
      .select('id')
      .single();
    if (cErr) {
      toast({ title: 'Could not create campaign', description: cErr.message, variant: 'destructive' });
      return null;
    }
    const campaignId = (campaign as any).id as string;
    const rows = recipients.map((r) => ({
      campaign_id: campaignId,
      to_address: r.phone,
      name: r.name ?? null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const { error } = await supabase.from('message_campaign_recipients').insert(slice);
      if (error) {
        toast({ title: 'Recipient insert failed', description: error.message, variant: 'destructive' });
        return null;
      }
    }
    return campaignId;
  };

  const triggerSender = async (campaignId: string, ch: Channel): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    const fn = ch === 'email' ? 'bulk-email-sender' : 'message-campaign-sender';
    const { error } = await supabase.functions.invoke(fn, {
      body: { campaign_id: campaignId },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) throw new Error(error.message);
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      if (channel === 'email') {
        const myEmail = (profile as any)?.email || (user as any)?.email;
        if (!myEmail) { toast({ title: 'No email on profile', variant: 'destructive' }); return; }
        const v = validateBeforeSend();
        if (v && !v.startsWith('Pick a date') && !v.startsWith('Scheduled')) { toast({ title: v, variant: 'destructive' }); return; }
        const cid = await createEmailCampaign(
          [{ email: myEmail, name: (profile as any)?.full_name ?? 'You' }],
          { test_mode: true, name: 'Test send' },
        );
        if (!cid) return;
        await triggerSender(cid, 'email');
        toast({ title: 'Test sent', description: `Check ${myEmail}` });
      } else {
        const myPhone = (profile as any)?.phone;
        const parsed = myPhone ? parseNigerianPhone(myPhone) : null;
        if (!parsed?.ok || !parsed.termii) {
          toast({ title: 'No valid Nigerian phone number on profile', variant: 'destructive' });
          return;
        }
        if (!textMessage.trim()) { toast({ title: 'Message is required.', variant: 'destructive' }); return; }
        const cid = await createMessageCampaign(
          [{ phone: parsed.termii, name: (profile as any)?.full_name ?? 'You' }],
          { test_mode: true, name: 'Test send' },
        );
        if (!cid) return;
        await triggerSender(cid, channel);
        toast({ title: 'Test sent', description: `Check ${parsed.local}` });
      }
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
      toast({ title: 'No recipients', description: `Add at least one valid ${channel === 'email' ? 'email' : 'phone number'}.`, variant: 'destructive' });
      return;
    }
    const scheduling = sendMode === 'schedule';
    const confirmMsg = scheduling
      ? `Schedule for ${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'} at ${new Date(scheduledFor).toLocaleString()}?`
      : `Send to ${allRecipients.length} recipient${allRecipients.length === 1 ? '' : 's'}?`;
    if (!(await confirm({ title: scheduling ? 'Schedule send?' : 'Send now?', description: confirmMsg }))) return;

    setSending(true);
    try {
      const scheduleIso = scheduling ? new Date(scheduledFor).toISOString() : null;
      const name = channel === 'email' ? effectiveSubject.slice(0, 80) : textMessage.slice(0, 80);
      const cid = channel === 'email'
        ? await createEmailCampaign(allRecipients, { test_mode: false, name, schedule: scheduleIso })
        : await createMessageCampaign(allRecipients, { test_mode: false, name, schedule: scheduleIso });
      if (!cid) return;

      if (scheduling) {
        toast({ title: 'Scheduled', description: `Will send at ${new Date(scheduledFor).toLocaleString()}.` });
      } else {
        setActiveCampaign({ id: cid, channel });
        await triggerSender(cid, channel);
        toast({ title: 'Send started', description: 'Watch the progress card below.' });
      }
      void reloadHistory();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // ─── Active campaign progress polling ─────────────────────────────────
  useEffect(() => {
    if (!activeCampaign) return;
    let cancelled = false;
    const table = activeCampaign.channel === 'email' ? 'email_campaigns' : 'message_campaigns';
    const tick = async () => {
      const cols = activeCampaign.channel === 'email'
        ? 'id, name, subject, status, total_recipients, total_sent, total_failed, created_at, completed_at'
        : 'id, name, message, status, total_recipients, total_sent, total_failed, created_at, completed_at';
      const { data } = await supabase
        .from(table)
        .select(cols)
        .eq('id', activeCampaign.id)
        .maybeSingle();
      if (!cancelled && data) {
        const row = data as any;
        setActiveProgress({
          id: row.id,
          channel: activeCampaign.channel,
          name: row.name,
          subject: row.subject ?? String(row.message || '').slice(0, 80),
          status: row.status,
          total_recipients: row.total_recipients,
          total_sent: row.total_sent,
          total_failed: row.total_failed,
          created_at: row.created_at,
          completed_at: row.completed_at,
        });
        if (['sent', 'partially_sent', 'failed', 'cancelled'].includes(row.status)) {
          void reloadHistory();
        }
      }
    };
    void tick();
    const id = window.setInterval(tick, 2000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeCampaign]);

  const isProgressTerminal = activeProgress
    && ['sent', 'partially_sent', 'failed', 'cancelled'].includes(activeProgress.status);

  const smsSegments = channel !== 'email' ? Math.max(1, Math.ceil(textMessage.length / SMS_SEGMENT_LEN)) : 1;

  return (
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" scanLine={!!activeProgress} pattern="pulse">
        <PageHeader
          className="mb-0"
          title="Communications"
          description="Compose across email, SMS, and WhatsApp. Send to a single recipient, or to a curated list."
          icon={Mail}
        />
      </AuroraHero>

      {/* Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="kd-section-title">Compose</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Channel — the top-level choice everything else adapts to */}
            <div className="space-y-1.5">
              <Label className="kd-label">Send via</Label>
              <SegmentedControl
                value={channel}
                onChange={(v) => setChannel(v)}
                options={(['email', 'sms', 'whatsapp'] as Channel[]).map((c) => ({
                  value: c, label: CHANNEL_META[c].label, icon: CHANNEL_META[c].icon,
                }))}
              />
              {channel === 'whatsapp' && (
                <p className="kd-field-hint">
                  Business-initiated WhatsApp messages outside a 24-hour reply window may require an
                  approved template on Meta's side — if sends fail, that's usually why.
                </p>
              )}
            </div>

            {channel === 'email' ? (
              <>
                <div className="space-y-1.5">
                  <Label className="kd-label">Body source</Label>
                  <SegmentedControl
                    value={bodySource}
                    onChange={(v) => setBodySource(v as BodySource)}
                    options={[
                      { value: 'custom', label: 'One-off message' },
                      { value: 'template', label: 'Saved template' },
                    ]}
                  />
                </div>

                {bodySource === 'template' ? (
                  <div className="space-y-2">
                    <Label className="kd-label">Template</Label>
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground flex-1">{activeTemplate.description}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-7 text-xs"
                          onClick={() => openTemplateEditor(activeTemplate)}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit template
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="kd-label">Subject</Label>
                      <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="kd-label">HTML body</Label>
                      <Textarea
                        value={htmlBody}
                        onChange={(e) => setHtmlBody(e.target.value)}
                        className="font-mono text-xs min-h-[260px]"
                      />
                      <p className="kd-field-hint">
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
                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="bg-muted/40 px-3 py-2 border-b border-border text-xs text-muted-foreground">
                        Subject: <strong>{previewSubject}</strong>
                      </div>
                      <iframe title="Preview" srcDoc={previewHtml} className="w-full h-[420px] bg-white" />
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="kd-label mb-0">Message</Label>
                  <span className={cn(
                    'text-[10px] tabular-nums',
                    channel === 'sms' && smsSegments > 1 ? 'text-amber-500' : 'text-muted-foreground',
                  )}>
                    {textMessage.length} chars
                    {channel === 'sms' && ` · ${smsSegments} segment${smsSegments === 1 ? '' : 's'}`}
                  </span>
                </div>
                <Textarea
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  className="text-sm min-h-[180px]"
                  placeholder="Write your message…"
                />
                {channel === 'sms' && smsSegments > 1 && (
                  <p className="kd-field-hint text-amber-500">
                    Messages over {SMS_SEGMENT_LEN} characters are billed as multiple SMS segments per recipient.
                  </p>
                )}
              </div>
            )}

            {/* Scheduling — applies to every channel */}
            <div className="space-y-1.5 pt-1 border-t border-border/60">
              <Label className="kd-label pt-3 block">When</Label>
              <SegmentedControl
                value={sendMode}
                onChange={(v) => setSendMode(v)}
                options={[
                  { value: 'now', label: 'Send now' },
                  { value: 'schedule', label: 'Schedule for later', icon: <CalendarClock className="h-3.5 w-3.5" /> },
                ]}
              />
              {sendMode === 'schedule' && (
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="mt-1.5 max-w-[240px]"
                />
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button variant="outline" onClick={handleSendTest} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send test to me
              </Button>
              <Button onClick={handleSendAll} disabled={sending || allRecipients.length === 0}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : sendMode === 'schedule' ? <CalendarClock className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                {sendMode === 'schedule' ? 'Schedule for' : 'Send to'} {allRecipients.length || 0}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recipient picker */}
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="kd-section-title flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> Recipients · {allRecipients.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="kd-label">Source</Label>
              <SegmentedControl
                value={recipientSource}
                onChange={(s) => {
                  setRecipientSource(s);
                  if (s !== 'manual') void loadFromSource(s, channel);
                }}
                options={[
                  { value: 'manual', label: channel === 'email' ? 'Type addresses' : 'Type numbers' },
                  { value: 'contacts', label: 'Contacts' },
                  { value: 'employees', label: 'Employees' },
                  { value: 'contractors', label: 'Contractors' },
                ]}
              />
            </div>

            {recipientSource === 'employees' && (
              <div className="space-y-1">
                <Label className="kd-label">Department</Label>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {recipientSource === 'manual' ? (
              <div className="space-y-1">
                <Label className="kd-label">
                  {channel === 'email' ? 'Addresses' : 'Phone numbers'} — one per line or comma-separated
                </Label>
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="text-xs min-h-[120px]"
                  placeholder={channel === 'email'
                    ? 'bola@example.com\nLola Adeyemi <lola@example.com>'
                    : '08012345678\n+2348098765432'}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Loaded from {recipientSource}.
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => void loadFromSource(recipientSource as any, channel)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Reload
                  </Button>
                </div>
                {pickerLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="border border-border rounded-lg max-h-[260px] overflow-y-auto divide-y divide-border/60">
                    {pickedRecipients.length === 0 && (
                      <p className="text-xs text-muted-foreground italic p-3">No recipients found.</p>
                    )}
                    {pickedRecipients.map((r) => {
                      const key = recipientKey(r, channel) ?? '';
                      const display = r.name || (channel === 'email' ? r.email : r.phone) || '';
                      return (
                        <div key={key} className="text-xs px-2.5 py-1.5 flex items-center gap-2 group">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase">
                            {display.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{display}</p>
                            {r.name && <p className="truncate text-[10px] text-muted-foreground">{channel === 'email' ? r.email : r.phone}</p>}
                          </div>
                          <button
                            onClick={() => setPickedRecipients((cur) => cur.filter((x) => recipientKey(x, channel) !== key))}
                            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity"
                            aria-label="Remove"
                          ><Trash2 className="h-3 w-3" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              {channel === 'email'
                ? <>Supports plain emails and <code className="text-[9px]">Name &lt;email&gt;</code> format.</>
                : 'Nigerian mobile numbers only — any common format works. '}
              Duplicates filtered automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live progress card for the in-flight campaign */}
      {activeProgress && (
        <Card className="rounded-xl border-primary/40">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              {isProgressTerminal
                ? activeProgress.status === 'sent'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />
                : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {CHANNEL_META[activeProgress.channel].label} campaign {activeProgress.status}
            </CardTitle>
            {isProgressTerminal && (
              <Button size="sm" variant="ghost" onClick={() => { setActiveCampaign(null); setActiveProgress(null); }}>
                Dismiss
              </Button>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="truncate">{activeProgress.subject}</p>
            <div className="text-xs text-muted-foreground">
              {activeProgress.total_sent} sent · {activeProgress.total_failed} failed · {activeProgress.total_recipients} total
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="kd-section-title flex items-center gap-2">
            <History className="h-4 w-4" /> Recent campaigns
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void reloadHistory()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No campaigns yet.</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject / message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={`${h.channel}-${h.id}`}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {h.status === 'scheduled' && h.scheduled_for
                        ? `Scheduled · ${new Date(h.scheduled_for).toLocaleString()}`
                        : new Date(h.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        {CHANNEL_META[h.channel].icon}
                        {CHANNEL_META[h.channel].label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[360px] truncate" title={h.subject}>{h.subject}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        h.status === 'sent' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' :
                        h.status === 'sending' ? 'border-sky-500/40 text-sky-700 dark:text-sky-400' :
                        h.status === 'scheduled' ? 'border-violet-500/40 text-violet-700 dark:text-violet-400' :
                        h.status === 'partially_sent' ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' :
                        h.status === 'failed' ? 'border-rose-500/40 text-rose-700 dark:text-rose-400' :
                        'border-slate-500/40 text-slate-700 dark:text-slate-400'
                      }>
                        {h.status === 'sending' && <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />}
                        {h.status === 'scheduled' && <CalendarClock className="h-3 w-3 mr-1 inline" />}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template editor dialog */}
      <ResponsiveDialog
        open={!!editingTemplate}
        onOpenChange={(v) => { if (!v) setEditingTemplate(null); }}
        title={<span className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit template — {editingTemplate?.name}</span>}
        size="3xl"
        footer={
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={resetTemplateToDefault}
              disabled={editResetting || editSaving}
              className="text-muted-foreground"
            >
              {editResetting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <RotateCcw className="h-3 w-3 mr-1" /> Reset to default
            </Button>
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => setEditingTemplate(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={saveTemplateEdit} disabled={editSaving || !editSubject.trim()}>
                {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save template
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="kd-label">Subject line</Label>
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              placeholder="Email subject…"
            />
          </div>
          <div className="space-y-1">
            <Label className="kd-label">HTML body</Label>
            <Textarea
              value={editHtmlBody}
              onChange={(e) => setEditHtmlBody(e.target.value)}
              className="font-mono text-xs min-h-[320px]"
            />
            {editingTemplate?.variables && editingTemplate.variables.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Available variables:{' '}
                {editingTemplate.variables.map((v) => (
                  <code key={v.name} className="mr-1">{`{{${v.name}}}`}</code>
                ))}
              </p>
            )}
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
