import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Link as LinkIcon,
  ShieldCheck,
  Bell,
  Loader2,
  Save,
  Plus,
  Trash2,
  CreditCard,
  Upload,
  Network,
  Pencil,
  Tags,
  Info,
  AlertTriangle,
  Activity,
  Database,
  Archive,
  ImageIcon,
  Clock,
  BookOpen,
  Shield,
  Wallet,
  HardDrive,
  FileWarning,
  Zap,
  History,
  Car,
  Receipt,
  Users,
  Lock,
  RefreshCw,
  Globe,
  CheckCircle2,
  Sparkles,
  Briefcase,
  Package,
  GraduationCap,
  HeartPulse,
  Star,
  UserPlus2,
  CalendarCheck2,
  ShieldAlert,
  FolderKanban,
  UserCheck,
  Store,
  FilePlus2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImage, isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { validateFileSize } from '@/lib/file-validation';
import { formatNaira, setTimezoneCache } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTip } from '@/components/ui-kit/InfoTip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EXPENSE_CATEGORY_KEYS, expenseCategoryLabel } from '@/lib/expense-categories';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface CompanySettings {
  id: string;
  company_name: string;
  rc_number: string | null;
  tin: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  fiscal_year_preset: 'jan_dec' | 'apr_mar';
  currency_code: string;
  usd_rate: number | null;
  cash_on_hand_ngn: number;
  external_monthly_burn_ngn: number;
  monthly_revenue_estimate_ngn: number;
  cash_updated_at: string | null;
  expense_limits: Record<string, number>;
  dual_approval_threshold_ngn: number;
  paystack_mode: 'test' | 'live';
  paystack_webhook_url: string | null;
  paystack_secret_configured: boolean;
  airtable_api_key_configured: boolean;
  airtable_base_id: string | null;
  airtable_income_table_id: string | null;
  airtable_expenses_table_id: string | null;
  airtable_sync_enabled: boolean;
  paystack_funding_bank: string | null;
  paystack_funding_account_name: string | null;
  paystack_funding_account_number: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_from_address: string | null;
  session_timeout_minutes: number;
  audit_log_retention_days: number;
  fuel_weekly_budgets: Record<string, number>;
  website_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  timezone: string;
}

const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_KEYS;

const NOTIF_EVENTS = [
  { key: 'email_approvals', label: 'Approval requests assigned to me' },
  { key: 'email_payments', label: 'Payment batch status changes' },
  { key: 'email_compliance', label: 'Statutory compliance deadlines' },
  { key: 'email_expenses', label: 'Expense approved / rejected' },
  { key: 'email_fleet', label: 'Fuel + trip activity' },
  { key: 'email_leave', label: 'Leave requests and balances' },
] as const;

const SettingsPage = () => {
  usePageTitle('Settings');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // Notification preferences are per-user, not company-wide.
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [digest, setDigest] = useState<'immediate' | 'hourly' | 'daily' | 'never'>('immediate');

  // Expense category limits — controls for the "add a new limit" row
  const [newLimitCategory, setNewLimitCategory] = useState<string>('');
  const [newLimitAmount, setNewLimitAmount] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, notifRes] = await Promise.all([
      supabase
        .from('company_settings')
        .select('*')
        .eq('id', SINGLETON_ID)
        .maybeSingle(),
      profile?.id
        ? supabase
            .from('notification_preferences')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const s = (settingsRes.data as CompanySettings) || null;
    setSettings(s);
    if (s?.timezone) setTimezoneCache(s.timezone);
    if ((notifRes as any).data) {
      const d = (notifRes as any).data;
      const prefs: Record<string, boolean> = {};
      for (const e of NOTIF_EVENTS) prefs[e.key] = Boolean(d[e.key]);
      setNotifPrefs(prefs);
      setDigest(d.digest_frequency || 'immediate');
    } else {
      // default on
      const prefs: Record<string, boolean> = {};
      for (const e of NOTIF_EVENTS) prefs[e.key] = e.key !== 'email_fleet';
      setNotifPrefs(prefs);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (p: Partial<CompanySettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));

  const save = async () => {
    if (!settings) return;

    // Validate Paystack mode matches key prefixes.
    const mode = settings.paystack_mode;
    const pub = (settings as any).paystack_public_key || '';
    const sec = (settings as any).paystack_secret_key_enc || '';
    if (mode === 'live') {
      if (pub && !pub.startsWith('pk_live_')) {
        toast({
          title: 'Live mode requires live public key',
          description: 'Public key must start with pk_live_. Switch to Test mode or enter a live key.',
          variant: 'destructive',
        });
        return;
      }
      if (sec && !sec.startsWith('sk_live_')) {
        toast({
          title: 'Live mode requires live secret key',
          description: 'Secret key must start with sk_live_. Switch to Test mode or enter a live key.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase
      .from('company_settings')
      .update({
        company_name: settings.company_name?.trim() || '',
        rc_number: settings.rc_number?.trim() || null,
        tin: settings.tin?.trim() || null,
        address: settings.address?.trim() || null,
        website: settings.website?.trim() || null,
        logo_url: settings.logo_url,
        fiscal_year_preset: settings.fiscal_year_preset,
        currency_code: settings.currency_code,
        usd_rate: settings.usd_rate,
        cash_on_hand_ngn: settings.cash_on_hand_ngn,
        external_monthly_burn_ngn: settings.external_monthly_burn_ngn,
        monthly_revenue_estimate_ngn: settings.monthly_revenue_estimate_ngn,
        cash_updated_at: settings.cash_updated_at,
        expense_limits: settings.expense_limits,
        dual_approval_threshold_ngn: settings.dual_approval_threshold_ngn,
        paystack_mode: settings.paystack_mode,
        paystack_webhook_url: settings.paystack_webhook_url,
        paystack_public_key: (settings as any).paystack_public_key || null,
        paystack_secret_key_enc: (settings as any).paystack_secret_key_enc || null,
        airtable_base_id: settings.airtable_base_id,
        airtable_income_table_id: settings.airtable_income_table_id,
        airtable_expenses_table_id: settings.airtable_expenses_table_id,
        airtable_sync_enabled: settings.airtable_sync_enabled,
        paystack_funding_bank: settings.paystack_funding_bank,
        paystack_funding_account_name: settings.paystack_funding_account_name,
        paystack_funding_account_number: settings.paystack_funding_account_number,
        resend_from_address: (settings as any).resend_from_address || null,
        resend_api_key_configured: !!(settings as any).resend_api_key_configured,
        termii_sender_id: (settings as any).termii_sender_id || null,
        termii_api_key_configured: !!(settings as any).termii_api_key_configured,
        whatsapp_enabled: !!(settings as any).whatsapp_enabled,
        sms_enabled: !!(settings as any).sms_enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_username: settings.smtp_username,
        smtp_from_address: settings.smtp_from_address,
        session_timeout_minutes: settings.session_timeout_minutes,
        audit_log_retention_days: settings.audit_log_retention_days,
        fuel_weekly_budgets: settings.fuel_weekly_budgets,
        website_url: settings.website_url || null,
        linkedin_url: settings.linkedin_url || null,
        instagram_url: settings.instagram_url || null,
        facebook_url: settings.facebook_url || null,
        twitter_url: settings.twitter_url || null,
        timezone: settings.timezone || 'Africa/Lagos',
        updated_at: new Date().toISOString(),
      })
      .eq('id', SINGLETON_ID);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    if (settings.timezone) setTimezoneCache(settings.timezone);
    await logAudit('company_settings_saved', 'Company settings saved', profile);
    toast({ title: 'Settings saved' });
    setSaving(false);
  };

  const saveNotifPrefs = async () => {
    if (!profile?.id) return;
    const payload: any = {
      user_id: profile.id,
      digest_frequency: digest,
      ...notifPrefs,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('notification_prefs_updated', 'Notification preferences updated', profile);
    toast({ title: 'Notification preferences saved' });
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    // 5 MB cap is plenty for a company logo — and stops people uploading
    // 50 MB raw camera shots into branded PDFs.
    if (!validateFileSize(file, toast, 5)) {
      e.target.value = '';
      return;
    }
    const compressed = await compressImage(file);
    const path = `company-logo-${Date.now()}-${compressed.name.replace(/[^a-z0-9.]+/gi, '_')}`;
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, compressed, { upsert: false, contentType: compressed.type || undefined });
    if (error) {
      toast({ title: 'Logo upload failed', description: error.message, variant: 'destructive' });
      return;
    }
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    patch({ logo_url: signed?.signedUrl || null });
    toast({ title: 'Logo uploaded — remember to Save' });
  };

  if (loading || !settings)
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Settings"
        description="KDOps runs on these knobs. Take care."
        actions={
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save settings
          </Button>
        }
      />

      <Tabs defaultValue="company" orientation="vertical" className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <TabsList className="flex md:flex-col h-auto items-stretch md:items-start gap-1 bg-card md:bg-transparent border md:border-0 rounded-lg md:rounded-none p-2 md:p-0 md:sticky md:top-20 md:self-start overflow-x-auto md:overflow-visible">
          <p className="hidden md:block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-2">Configuration</p>
          <TabsTrigger value="company" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Building2 className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="integrations" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><LinkIcon className="mr-2 h-4 w-4" /> Integrations</TabsTrigger>
          <TabsTrigger value="policy" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><CreditCard className="mr-2 h-4 w-4" /> Expense policy</TabsTrigger>
          <TabsTrigger value="notifications" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Bell className="mr-2 h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="security" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><ShieldCheck className="mr-2 h-4 w-4" /> Security</TabsTrigger>
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="departments" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Network className="mr-2 h-4 w-4" /> Departments</TabsTrigger>
          )}
          <TabsTrigger value="tags" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Tags className="mr-2 h-4 w-4" /> Tags</TabsTrigger>
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="retention" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Database className="mr-2 h-4 w-4" /> Data Retention</TabsTrigger>
          )}
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="reference" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><BookOpen className="mr-2 h-4 w-4" /> System Reference</TabsTrigger>
          )}
        </TabsList>
        <div className="md:min-w-0">

        {/* COMPANY ------------------------------------------------------- */}
        <TabsContent value="company" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Company name</Label>
                  <Input
                    value={settings.company_name || ''}
                    onChange={(e) => patch({ company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>RC number</Label>
                  <Input
                    value={settings.rc_number || ''}
                    onChange={(e) => patch({ rc_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>TIN</Label>
                  <Input
                    value={settings.tin || ''}
                    onChange={(e) => patch({ tin: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Website</Label>
                  <Input
                    value={settings.website || ''}
                    onChange={(e) => patch({ website: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Registered address</Label>
                <Textarea
                  value={settings.address || ''}
                  onChange={(e) => patch({ address: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fiscal year</Label>
                  <Select
                    value={settings.fiscal_year_preset}
                    onValueChange={(v) => patch({ fiscal_year_preset: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jan_dec">January – December</SelectItem>
                      <SelectItem value="apr_mar">April – March</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Platform timezone <InfoTip text="All dates and times across the platform — audit logs, transactions, approvals — display in this timezone. Default: Africa/Lagos (WAT, UTC+1)." /></Label>
                  <Select
                    value={settings.timezone || 'Africa/Lagos'}
                    onValueChange={(v) => patch({ timezone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Lagos">Africa/Lagos — WAT (UTC+1) 🇳🇬</SelectItem>
                      <SelectItem value="UTC">UTC — Coordinated Universal Time (UTC+0)</SelectItem>
                      <SelectItem value="Africa/Accra">Africa/Accra — GMT (UTC+0) 🇬🇭</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi — EAT (UTC+3) 🇰🇪</SelectItem>
                      <SelectItem value="Africa/Johannesburg">Africa/Johannesburg — SAST (UTC+2) 🇿🇦</SelectItem>
                      <SelectItem value="Africa/Cairo">Africa/Cairo — EET (UTC+2) 🇪🇬</SelectItem>
                      <SelectItem value="Europe/London">Europe/London — GMT/BST (UTC+0/+1) 🇬🇧</SelectItem>
                      <SelectItem value="Europe/Paris">Europe/Paris — CET/CEST (UTC+1/+2) 🇪🇺</SelectItem>
                      <SelectItem value="America/New_York">America/New_York — EST/EDT (UTC-5/-4) 🇺🇸</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai — GST (UTC+4) 🇦🇪</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Cash on hand (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={settings.cash_on_hand_ngn || 0}
                    onChange={(e) =>
                      patch({
                        cash_on_hand_ngn: Number(e.target.value) || 0,
                        cash_updated_at: new Date().toISOString(),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.cash_updated_at ? (
                      <>
                        Last updated {new Date(settings.cash_updated_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}.
                        {(() => {
                          const days = Math.floor((Date.now() - new Date(settings.cash_updated_at).getTime()) / 86400000);
                          if (days >= 7) return <span className="text-warning ml-1">⚠ Stale ({days}d) — update from your bank app.</span>;
                          return null;
                        })()}
                      </>
                    ) : (
                      <span className="text-warning">Never updated. Open your bank app and enter the current balance.</span>
                    )}
                  </p>
                </div>
              </div>

              {/* ── Runway tracking ─────────────────────────────────────── */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Activity className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Runway tracking</p>
                    <p className="text-xs text-muted-foreground">
                      Powers the Financial Health score on the dashboard. Update weekly for accuracy.
                      Off-platform expenses (rent, utilities, contractors paid outside KDOps) won't be
                      captured automatically — set the monthly estimate below so runway stays honest.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>External monthly burn (₦)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={settings.external_monthly_burn_ngn || 0}
                      onChange={(e) =>
                        patch({ external_monthly_burn_ngn: Number(e.target.value) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Recurring monthly spend that doesn't flow through KDOps.
                      Added to in-platform burn for runway calculations.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Monthly revenue estimate (₦)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={settings.monthly_revenue_estimate_ngn || 0}
                      onChange={(e) =>
                        patch({ monthly_revenue_estimate_ngn: Number(e.target.value) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Reduces effective burn for more honest runway. Leave 0 if volatile.
                    </p>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-1">
                <Label>Company logo</Label>
                <div className="flex items-center gap-3">
                  {settings.logo_url ? (
                    <img
                      src={settings.logo_url}
                      alt="Company logo"
                      className="h-14 w-14 rounded-lg object-contain border"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      No logo
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadLogo}
                    />
                    <Button variant="outline" asChild>
                      <span><Upload className="mr-2 h-4 w-4" /> Upload logo</span>
                    </Button>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used on branded exports (payslips, receipts, PDFs).
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Social media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Website URL</Label>
                  <Input
                    value={settings.website_url || ''}
                    onChange={(e) => patch({ website_url: e.target.value })}
                    placeholder="https://kdsquares.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={settings.linkedin_url || ''}
                    onChange={(e) => patch({ linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Instagram URL</Label>
                  <Input
                    value={settings.instagram_url || ''}
                    onChange={(e) => patch({ instagram_url: e.target.value })}
                    placeholder="https://instagram.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Facebook URL</Label>
                  <Input
                    value={settings.facebook_url || ''}
                    onChange={(e) => patch({ facebook_url: e.target.value })}
                    placeholder="https://facebook.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Twitter / X URL</Label>
                  <Input
                    value={settings.twitter_url || ''}
                    onChange={(e) => patch({ twitter_url: e.target.value })}
                    placeholder="https://x.com/..."
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These URLs appear on the contractor application form so applicants can follow your company.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTEGRATIONS -------------------------------------------------- */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paystack</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mode</Label>
                  <Select
                    value={settings.paystack_mode}
                    onValueChange={(v) => patch({ paystack_mode: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test mode</SelectItem>
                      <SelectItem value="live">Live mode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Webhook URL</Label>
                  <Input
                    value={settings.paystack_webhook_url || ''}
                    onChange={(e) => patch({ paystack_webhook_url: e.target.value })}
                    placeholder="https://.../paystack/webhook"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Public key</Label>
                  <Input
                    value={(settings as any).paystack_public_key || ''}
                    onChange={(e) => patch({ paystack_public_key: e.target.value } as any)}
                    placeholder="pk_test_..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Secret key</Label>
                  <Input
                    type="password"
                    value={(settings as any).paystack_secret_key_enc || ''}
                    onChange={(e) => patch({ paystack_secret_key_enc: e.target.value } as any)}
                    placeholder={
                      (settings as any).paystack_secret_key_enc
                        ? '••••••••' + ((settings as any).paystack_secret_key_enc || '').slice(-4)
                        : 'sk_test_...'
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Stored encrypted. Never displayed after save.
                  </p>
                </div>
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-1">Paystack funding details</p>
              <p className="text-xs text-muted-foreground -mt-1">
                Shown on the Payments page so your team can fund the Paystack balance via bank transfer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Bank name</Label>
                  <Input
                    value={settings.paystack_funding_bank || ''}
                    onChange={(e) => patch({ paystack_funding_bank: e.target.value })}
                    placeholder="e.g. GTBank"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account name</Label>
                  <Input
                    value={settings.paystack_funding_account_name || ''}
                    onChange={(e) => patch({ paystack_funding_account_name: e.target.value })}
                    placeholder="e.g. Paystack Payments"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account number</Label>
                  <Input
                    value={settings.paystack_funding_account_number || ''}
                    onChange={(e) => patch({ paystack_funding_account_number: e.target.value })}
                    placeholder="e.g. 0123456789"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
                After saving, the Edge Function reads the secret key from this
                table. Toggle to <strong>Live</strong> when ready for real
                payments.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Airtable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>Airtable sync is not yet active. Configuration saved here is for future use. No data is currently being synced to or from Airtable.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Base ID</Label>
                  <Input
                    value={settings.airtable_base_id || ''}
                    onChange={(e) => patch({ airtable_base_id: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Income table ID</Label>
                  <Input
                    value={settings.airtable_income_table_id || ''}
                    onChange={(e) =>
                      patch({ airtable_income_table_id: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expenses table ID</Label>
                  <Input
                    value={settings.airtable_expenses_table_id || ''}
                    onChange={(e) =>
                      patch({ airtable_expenses_table_id: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={settings.airtable_sync_enabled}
                      onCheckedChange={(v) =>
                        patch({ airtable_sync_enabled: v })
                      }
                    />
                    <span className="text-sm">Sync enabled</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SMTP (email)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>Email delivery is handled via Resend API. SMTP settings are reserved for future use and are not currently active. Do not store credentials here expecting them to work.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Host</Label>
                  <Input
                    value={settings.smtp_host || ''}
                    onChange={(e) => patch({ smtp_host: e.target.value })}
                    placeholder="smtp.sendgrid.net"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={settings.smtp_port || ''}
                    onChange={(e) =>
                      patch({ smtp_port: Number(e.target.value) || null })
                    }
                    placeholder="587"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input
                    value={settings.smtp_username || ''}
                    onChange={(e) => patch({ smtp_username: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>From address</Label>
                  <Input
                    value={settings.smtp_from_address || ''}
                    onChange={(e) =>
                      patch({ smtp_from_address: e.target.value })
                    }
                    placeholder="ops@kdsquares.com"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Password is provided via env vars and never displayed here.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resend (email delivery)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>From address</Label>
                  <Input
                    value={(settings as any).resend_from_address || ''}
                    onChange={(e) => patch({ resend_from_address: e.target.value } as any)}
                    placeholder="ops@kdsquares.com"
                  />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={!!(settings as any).resend_api_key_configured}
                      onCheckedChange={(v) => patch({ resend_api_key_configured: v } as any)}
                    />
                    <span className="text-sm">API key configured</span>
                  </label>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Set <code>RESEND_API_KEY</code> in Supabase secrets. KDOps sends
                branded HTML emails for batch approvals, payslip delivery,
                compliance reminders and rejection notices.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Termii (WhatsApp &amp; SMS)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>SMS and WhatsApp delivery via Termii is not yet active in KDOps. Configuration saved here will be used when this integration is enabled. No messages are currently being sent via Termii.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Sender ID</Label>
                  <Input
                    value={(settings as any).termii_sender_id || ''}
                    onChange={(e) => patch({ termii_sender_id: e.target.value } as any)}
                    placeholder="KDOps"
                  />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={!!(settings as any).termii_api_key_configured}
                      onCheckedChange={(v) => patch({ termii_api_key_configured: v } as any)}
                    />
                    <span className="text-sm">API key configured</span>
                  </label>
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={!!(settings as any).whatsapp_enabled}
                      onCheckedChange={(v) => patch({ whatsapp_enabled: v } as any)}
                    />
                    <span className="text-sm">WhatsApp notifications</span>
                  </label>
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-3">
                    <Switch
                      checked={!!(settings as any).sms_enabled}
                      onCheckedChange={(v) => patch({ sms_enabled: v } as any)}
                    />
                    <span className="text-sm">SMS notifications</span>
                  </label>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Set <code>TERMII_API_KEY</code> in Supabase secrets. KDOps sends
                WhatsApp batch-approved alerts to Finance, SMS payment
                confirmations, and compliance deadline reminders. Nigeria's
                98% WhatsApp open rate makes this the primary notification
                channel.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* POLICY -------------------------------------------------------- */}
        <TabsContent value="policy" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approval thresholds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Dual approval required above (₦) <InfoTip text="Payment batches above this amount need two approvers before processing. Set to 0 to require dual approval for all batches." /></Label>
                <Input
                  type="number"
                  min="0"
                  value={settings.dual_approval_threshold_ngn}
                  onChange={(e) =>
                    patch({
                      dual_approval_threshold_ngn: Number(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Payment batches with a total above this amount require a
                  second approver. Currently {formatNaira(settings.dual_approval_threshold_ngn)}.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense category limits</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Per-category caps on what staff can submit. Categories without a
                limit set are unrestricted. Submissions above the cap are blocked
                at submission and never reach an approver.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* ── Existing limits ─────────────────────────────────── */}
              {Object.entries(settings.expense_limits || {}).filter(([, amt]) => amt > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">
                  No category limits set yet. All expense categories are unrestricted.
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(settings.expense_limits || {})
                    .filter(([, amt]) => amt > 0)
                    .sort(([a], [b]) => expenseCategoryLabel(a).localeCompare(expenseCategoryLabel(b)))
                    .map(([cat, amount]) => (
                      <div
                        key={cat}
                        className="flex items-center gap-3 border rounded-md p-2 bg-muted/20"
                      >
                        <span className="flex-1 text-sm font-medium">
                          {expenseCategoryLabel(cat)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">₦</span>
                          <Input
                            type="number"
                            min="0"
                            className="w-32 h-8 text-right"
                            value={amount}
                            onChange={(e) =>
                              patch({
                                expense_limits: {
                                  ...settings.expense_limits,
                                  [cat]: Number(e.target.value) || 0,
                                },
                              })
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = { ...settings.expense_limits };
                            delete next[cat];
                            patch({ expense_limits: next });
                          }}
                          title="Remove limit"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}

              {/* ── Add new limit ───────────────────────────────────── */}
              {(() => {
                // Categories that don't already have a limit set
                const available = EXPENSE_CATEGORIES.filter(
                  (c) => !((settings.expense_limits || {})[c] > 0),
                );
                if (available.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      All expense categories have limits set.
                    </p>
                  );
                }
                return (
                  <div className="flex items-end gap-2 pt-3 border-t">
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label className="text-xs text-muted-foreground">Add a category limit</Label>
                      <Select value={newLimitCategory} onValueChange={setNewLimitCategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose category…" />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((c) => (
                            <SelectItem key={c} value={c}>
                              {expenseCategoryLabel(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
                      <Input
                        type="number"
                        min="0"
                        className="w-36 h-9"
                        value={newLimitAmount}
                        onChange={(e) => setNewLimitAmount(e.target.value)}
                        placeholder="e.g. 50000"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={!newLimitCategory || !newLimitAmount || Number(newLimitAmount) <= 0}
                      onClick={() => {
                        patch({
                          expense_limits: {
                            ...settings.expense_limits,
                            [newLimitCategory]: Number(newLimitAmount),
                          },
                        });
                        setNewLimitCategory('');
                        setNewLimitAmount('');
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fuel budgets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Fuel budgets are managed per-vehicle in the{' '}
                <a href="/fleet" className="text-primary underline">Fleet page</a> —
                each vehicle has a weekly budget, with carry-forward and per-vehicle
                approval limits enforced when drivers submit fuel requests.
              </p>
              <p className="text-xs text-muted-foreground">
                Per-department budgets used to live here but were not enforced anywhere.
                That UI has been removed to avoid a setting that does nothing.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS ------------------------------------------------- */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {NOTIF_EVENTS.map((e) => (
                <label
                  key={e.key}
                  className="flex items-center justify-between border-b last:border-0 py-2"
                >
                  <span className="text-sm">{e.label}</span>
                  <Switch
                    checked={!!notifPrefs[e.key]}
                    onCheckedChange={(v) =>
                      setNotifPrefs((prev) => ({ ...prev, [e.key]: v }))
                    }
                  />
                </label>
              ))}
              <div className="space-y-1 pt-3">
                <Label>Digest frequency</Label>
                <Select
                  value={digest}
                  onValueChange={(v) => setDigest(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="hourly">Hourly digest</SelectItem>
                    <SelectItem value="daily">Daily digest (8am)</SelectItem>
                    <SelectItem value="never">Never (in-app only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-2">
                <Button variant="outline" onClick={saveNotifPrefs}>
                  <Save className="mr-2 h-4 w-4" /> Save my preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECURITY ----------------------------------------------------- */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session + audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Session timeout (minutes) <InfoTip text="Users are automatically signed out after this period of inactivity. Default: 60 minutes." /></Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.session_timeout_minutes}
                    onChange={(e) =>
                      patch({
                        session_timeout_minutes: Number(e.target.value) || 60,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Audit log retention (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.audit_log_retention_days}
                    onChange={(e) =>
                      patch({
                        audit_log_retention_days: Number(e.target.value) || 365,
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Audit log is append-only at the database layer regardless of this
                retention. Retention controls automatic export + archive.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Module access by role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Access is enforced at both the route level (UI) and the database layer (RLS policies).
                Roles not listed for a module are blocked on both layers — they cannot see the page
                or read/write any data even via direct API calls.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-2 pr-4 font-medium text-muted-foreground w-44">Module</th>
                      {(['super_admin','admin','finance','operations','field_staff / driver'] as const).map(r => (
                        <th key={r} className="text-center pb-2 px-2 font-medium text-muted-foreground capitalize">{r.replace('_',' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {[
                      { module: 'Dashboard',             sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                      { module: 'Expenses',              sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                      { module: 'Payroll / Payslips',    sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Budgets',               sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Fleet',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Contractors',           sa: true,  ad: true,  fi: true,  op: false, fs: false },
                      { module: 'Employees (HR)',        sa: true,  ad: true,  fi: false, op: false, fs: false },
                      { module: 'Leave',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Performance Reviews',   sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Training Records',      sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Benefits',              sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Onboarding',            sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Recruitment',           sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Attendance',            sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Disciplinary',          sa: true,  ad: true,  fi: false, op: false, fs: false },
                      { module: 'Vendors',               sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Clients / CRM',         sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Invoices',              sa: true,  ad: true,  fi: true,  op: false, fs: false },
                      { module: 'Assets',                sa: true,  ad: true,  fi: true,  op: false, fs: false },
                      { module: 'Projects',              sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Tasks',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Goals',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Documents',             sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Audit Log',             sa: true,  ad: true,  fi: false, op: false, fs: false },
                      { module: 'Settings',              sa: true,  ad: false, fi: false, op: false, fs: false },
                    ].map(({ module, sa, ad, fi, op, fs }) => (
                      <tr key={module} className="hover:bg-muted/30 transition-colors">
                        <td className="py-1.5 pr-4 font-medium">{module}</td>
                        {[sa, ad, fi, op, fs].map((allowed, i) => (
                          <td key={i} className="py-1.5 px-2 text-center">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-400'}`}>
                              {allowed ? '✓' : '✕'}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 border-t pt-2">
                Role changes are applied by editing the employee's profile in the <strong>Employees</strong> page.
                Changes take effect on the employee's next page load (no restart required).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Export all company data as a CSV archive — useful for backups and
                supplier changeovers.
              </p>
              <Button
                variant="outline"
                disabled={exportLoading}
                onClick={async () => {
                  setExportLoading(true);
                  await logAudit('report_exported', 'Full company data export requested', profile);
                  toast({
                    title: 'Export queued',
                    description: 'Your export will arrive via email within 15 minutes.',
                  });
                  setExportLoading(false);
                }}
              >
                Request full CSV export
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEPARTMENTS -------------------------------------------------- */}
        <TabsContent value="departments" className="mt-4 space-y-4">
          <DepartmentsManager />
        </TabsContent>

        {/* TAGS --------------------------------------------------------- */}
        <TabsContent value="tags" className="mt-4 space-y-4">
          <TagsManager />
        </TabsContent>

        {/* DATA RETENTION ---------------------------------------------- */}
        <TabsContent value="retention" className="mt-4 space-y-4">
          <DataRetentionPanel />
        </TabsContent>

        {/* SYSTEM REFERENCE -------------------------------------------- */}
        <TabsContent value="reference" className="mt-4 space-y-4">
          <SystemReferencePanel />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;

// ---------------------------------------------------------------------------
// Data Retention panel — Phase 2 (functional)
// ---------------------------------------------------------------------------

interface RetentionPolicy {
  id: string;
  data_type: 'audit_logs' | 'notifications' | 'receipts';
  mode: 'off' | 'archive' | 'archive_delete';
  retention_days: number;
  enabled_at: string | null;
  scheduled_first_run_at: string | null;
  last_run_at: string | null;
  last_run_count: number | null;
  last_run_status: string | null;
  all_paused: boolean;
}

const RETENTION_OPTIONS_DAYS = [
  { label: '6 months',  value: 180 },
  { label: '1 year',    value: 365 },
  { label: '2 years',   value: 730 },
  { label: '3 years',   value: 1095 },
  { label: '6 years (FIRS minimum)', value: 2190 },
];

const RETENTION_META = {
  audit_logs: {
    title: 'Audit log retention',
    icon: Activity,
    whatItIs: 'Every action on the platform (approvals, payments, edits, deletes) is recorded in the audit log. After ~12 months of active use the table can hold 50,000–200,000 rows.',
    whyEnable: 'Old audit rows take database space and slow queries. Archiving compresses them to a JSON file in the archives/ bucket.',
    recommended: 1095,
    legalNote: 'FIRS requires 6 years of supporting records for tax-relevant transactions. Audit logs are evidence — if in doubt, archive (don\'t delete) and keep at least 6 years.',
    dangers: [
      'Once deleted (and the archive expires), there is NO way to reconstruct who did what.',
      'Auditors may request records going back 6+ years.',
      'Missing audit logs during a fraud investigation can create legal exposure.',
    ],
  },
  notifications: {
    title: 'Notifications cleanup',
    icon: Bell,
    whatItIs: 'Read in-app notifications older than the chosen period are deleted. Unread notifications are NEVER touched.',
    whyEnable: 'Notifications accumulate quickly. Cleaning up read ones keeps the bell dropdown fast.',
    recommended: 90,
    legalNote: 'Notifications duplicate information already in audit_logs and source records. Safe to delete once read.',
    dangers: [
      'Users will lose their notification history older than the period.',
      'No archive is kept for notifications (they are duplicated data).',
    ],
  },
  receipts: {
    title: 'Receipts & fuel photos retention',
    icon: Archive,
    whatItIs: 'Approved expense rows older than the chosen period are archived (and optionally deleted). The actual receipt files in storage are kept; only the DB row is touched.',
    whyEnable: 'After 1–2 years, expense rows tied to closed budgets are reference-only and slow down reports.',
    recommended: 1095,
    legalNote: 'Strongly recommend ARCHIVE only — never DELETE. Tax audits may require originals; retain at least 6 years.',
    dangers: [
      'If "archive + delete" is enabled and the archive ZIP is later lost, the data is gone.',
      'Deleted expense rows will no longer appear in historical reports.',
    ],
  },
} as const;

function DataRetentionPanel() {
  const [compressOn, setCompressOn] = useState(isImageCompressionEnabled());
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [pausing, setPausing] = useState(false);
  const [configureFor, setConfigureFor] = useState<RetentionPolicy | null>(null);
  const [runningPolicyId, setRunningPolicyId] = useState<string | null>(null);

  const toggleCompress = (next: boolean) => {
    setImageCompressionEnabled(next);
    setCompressOn(next);
  };

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    // Ensure a row exists for each data type (idempotent).
    const types: RetentionPolicy['data_type'][] = ['audit_logs', 'notifications', 'receipts'];
    for (const t of types) {
      await supabase.from('retention_policies').upsert(
        { data_type: t },
        { onConflict: 'data_type', ignoreDuplicates: true },
      );
    }
    const { data, error } = await supabase
      .from('retention_policies')
      .select('*')
      .in('data_type', types);
    if (error) {
      toast({ title: 'Could not load retention policies', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setPolicies((data as RetentionPolicy[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const anyPaused = policies.some((p) => p.all_paused);
  const anyEnabled = policies.some((p) => p.mode !== 'off');

  const togglePauseAll = async () => {
    setPausing(true);
    const next = !anyPaused;
    const { error } = await supabase
      .from('retention_policies')
      .update({ all_paused: next })
      .in('data_type', ['audit_logs', 'notifications', 'receipts']);
    setPausing(false);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'document_uploaded' as any, // closest existing audit type
      `Data retention ${next ? 'PAUSED ALL' : 'RESUMED ALL'} by admin`,
      profile,
    );
    toast({ title: next ? 'All retention paused' : 'Retention resumed' });
    loadPolicies();
  };

  const runNow = async (p: RetentionPolicy) => {
    if (!confirm(
      `Run cleanup for "${RETENTION_META[p.data_type].title}" right now?\n\n` +
      `This will archive (and ${p.mode === 'archive_delete' ? 'DELETE' : 'KEEP'}) rows older than ` +
      `${p.retention_days} days. Cannot be undone after the archive expires (90 days).`
    )) return;

    setRunningPolicyId(p.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('data-retention-runner', {
        body: { policy_id: p.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      const r = (data?.results || [])[0];
      if (r?.error) throw new Error(r.error);
      toast({
        title: 'Cleanup complete',
        description: `Archived ${r?.archived ?? 0} · Deleted ${r?.deleted ?? 0}`,
      });
      loadPolicies();
    } catch (err: any) {
      toast({ title: 'Cleanup failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRunningPolicyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Top warning banner ─────────────────────────────────────── */}
      <Card className="border-amber-300 bg-amber-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1.5">
              <p className="font-semibold text-amber-900">
                Read this before changing anything on this page
              </p>
              <p className="text-amber-800 leading-relaxed">
                Data retention controls how long old records stay in the system.
                Used incorrectly, they can delete information you legally need
                (Nigerian tax law generally requires <strong>6 years</strong> of
                financial records). Every destructive option below is{' '}
                <strong>disabled by default</strong> and requires multiple
                confirmations to enable.
              </p>
              <p className="text-amber-800 leading-relaxed">
                <strong>Recovery window:</strong> archives are kept for 90 days
                after deletion in a private <code className="text-[11px] bg-amber-100 px-1 rounded">archives/</code>{' '}
                bucket and can be restored by support. After 90 days, archives
                are also removed and recovery is no longer possible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Image compression — FUNCTIONAL ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Image compression on upload
            <span className="text-[10px] font-medium uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
              Active
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium">Compress receipts, photos &amp; IDs before upload</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Resizes images to 1600 px on the longest side and re-encodes
                as JPEG at 82% quality. Receipts and ID photos shrink 5–10×
                with no visible loss. PDFs, GIFs and SVGs are never touched.
              </p>
            </div>
            <Switch checked={compressOn} onCheckedChange={toggleCompress} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-muted-foreground">Typical receipt size</p>
              <p className="font-semibold mt-0.5">3–5 MB → 250–400 KB</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-muted-foreground">Storage savings (1 year)</p>
              <p className="font-semibold mt-0.5">~90% smaller bucket</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-muted-foreground">Risk to existing data</p>
              <p className="font-semibold mt-0.5 text-emerald-700">None — only new uploads</p>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Where it applies:</strong> expense receipts, fuel-request
              photos, vehicle repair receipts, employee avatars, employee
              documents, contractor IDs, and the company logo. Original files
              already in storage are <strong>never modified</strong> — this
              only affects uploads from now on.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Pause-all banner (only shown if any policy is enabled) ─── */}
      {anyEnabled && (
        <Card className={anyPaused ? 'border-red-300 bg-red-50/50' : 'border-emerald-200'}>
          <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className={anyPaused ? 'h-4 w-4 text-red-600' : 'h-4 w-4 text-emerald-600'} />
              {anyPaused
                ? <span className="font-medium text-red-900">All retention is paused — no scheduled runs will execute.</span>
                : <span className="font-medium text-emerald-900">Retention is running normally on enabled policies.</span>}
            </div>
            <Button
              variant={anyPaused ? 'default' : 'destructive'}
              size="sm"
              onClick={togglePauseAll}
              disabled={pausing}
            >
              {pausing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {anyPaused ? 'Resume all' : 'Pause all retention'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Per-policy cards ───────────────────────────────────────── */}
      {loading ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading policies…</CardContent></Card>
      ) : (
        (['audit_logs', 'notifications', 'receipts'] as const).map((dt) => {
          const p = policies.find((x) => x.data_type === dt);
          if (!p) return null;
          return (
            <RetentionPolicyCard
              key={dt}
              policy={p}
              onConfigure={() => setConfigureFor(p)}
              onRunNow={() => runNow(p)}
              isRunning={runningPolicyId === p.id}
            />
          );
        })
      )}

      {/* Multi-step enable / configure dialog */}
      {configureFor && (
        <ConfigureRetentionDialog
          policy={configureFor}
          onClose={() => setConfigureFor(null)}
          onSaved={() => { setConfigureFor(null); loadPolicies(); }}
        />
      )}

      {/* ── Documents — LOCKED ─────────────────────────────────────── */}
      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Employee &amp; HR documents
            <span className="text-[10px] font-medium uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
              Protected
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Documents (contracts, IDs, NDAs, payslips, certificates) are{' '}
            <strong className="text-foreground">never auto-deleted</strong>.
            They contain legal and personal records that must be retained for
            the duration of employment plus a statutory tail (typically 7 years
            after exit under Nigerian labour law). To remove a specific
            document, use the delete button on that document directly — every
            deletion is audit-logged.
          </p>
        </CardContent>
      </Card>

      {/* ── How to monitor what's filling up storage ───────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            How to monitor your Supabase usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Check your Supabase dashboard regularly:
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground leading-relaxed">
            <li>Open your project → <strong>Reports</strong> → <strong>Database</strong> &amp; <strong>Storage</strong>.</li>
            <li>Set a billing alert at <strong>80%</strong> of free-tier limits (500 MB DB, 1 GB storage, 5 GB bandwidth/month).</li>
            <li>Upgrade to Pro ($25/mo) when storage passes 700 MB or DB passes 400 MB. Pro lifts every limit ~100×.</li>
          </ol>
          <p className="text-xs text-muted-foreground border-t pt-2 mt-2 leading-relaxed">
            With ~700 contractors making 4 payments/month and image
            compression enabled, you typically have <strong>2–3 years of
            runway</strong> on the Pro plan before any cleanup is needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RetentionPolicyCard({
  policy, onConfigure, onRunNow, isRunning,
}: {
  policy: RetentionPolicy;
  onConfigure: () => void;
  onRunNow: () => void;
  isRunning: boolean;
}) {
  const meta = RETENTION_META[policy.data_type];
  const Icon = meta.icon;
  const inDelay = policy.scheduled_first_run_at && new Date(policy.scheduled_first_run_at) > new Date();
  const enabled = policy.mode !== 'off';

  let badge: { label: string; cls: string };
  if (policy.all_paused && enabled) {
    badge = { label: 'Paused', cls: 'bg-red-100 text-red-700' };
  } else if (!enabled) {
    badge = { label: 'Off', cls: 'bg-muted text-muted-foreground' };
  } else if (inDelay) {
    badge = { label: '7-day delay', cls: 'bg-amber-100 text-amber-700' };
  } else {
    badge = { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Icon className="h-4 w-4 text-primary" />
          {meta.title}
          <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}>
            {badge.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">What it is</p>
            <p className="text-xs leading-relaxed">{meta.whatItIs}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Why enable it</p>
            <p className="text-xs leading-relaxed">{meta.whyEnable}</p>
          </div>
        </div>

        {/* Current configuration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-muted-foreground">Mode</p>
            <p className="font-semibold mt-0.5 capitalize">
              {policy.mode === 'archive_delete' ? 'Archive + delete' : policy.mode}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-muted-foreground">Retention</p>
            <p className="font-semibold mt-0.5">
              {enabled ? `${policy.retention_days} days` : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-muted-foreground">First run</p>
            <p className="font-semibold mt-0.5">
              {policy.scheduled_first_run_at
                ? new Date(policy.scheduled_first_run_at).toLocaleDateString('en-NG')
                : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-muted-foreground">Last run</p>
            <p className="font-semibold mt-0.5">
              {policy.last_run_at
                ? `${new Date(policy.last_run_at).toLocaleDateString('en-NG')} · ${policy.last_run_count ?? 0}`
                : 'Never'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Legal note:</span> {meta.legalNote}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Dangers</p>
          <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground leading-relaxed">
            {meta.dangers.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>

        <div className="flex gap-2 pt-1 flex-wrap">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            {enabled ? 'Reconfigure' : 'Enable…'}
          </Button>
          {enabled && !inDelay && !policy.all_paused && (
            <Button variant="outline" size="sm" onClick={onRunNow} disabled={isRunning}>
              {isRunning && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Run now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Multi-step configure / enable dialog
//   Step 1: warning + I understand checkbox
//   Step 2: pick mode + retention + see preview count
//   Step 3: type confirmation phrase to enable
// ---------------------------------------------------------------------------

function ConfigureRetentionDialog({
  policy, onClose, onSaved,
}: {
  policy: RetentionPolicy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = RETENTION_META[policy.data_type];
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [mode, setMode] = useState<RetentionPolicy['mode']>(policy.mode === 'off' ? 'archive' : policy.mode);
  const [retentionDays, setRetentionDays] = useState<number>(policy.retention_days || meta.recommended);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const expectedPhrase = `enable ${policy.data_type.replace('_', ' ')}`;

  // Compute preview count whenever step 2 is shown or settings change.
  useEffect(() => {
    if (step !== 2) return;
    setPreviewLoading(true);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const sourceTable: Record<RetentionPolicy['data_type'], string> = {
      audit_logs: 'audit_logs',
      notifications: 'notifications',
      receipts: 'expenses',
    };
    let q = supabase
      .from(sourceTable[policy.data_type])
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff);
    if (policy.data_type === 'notifications') q = q.eq('read', true);
    q.then(({ count }) => {
      setPreviewCount(count ?? 0);
      setPreviewLoading(false);
    });
  }, [step, retentionDays, policy.data_type]);

  const save = async () => {
    setSaving(true);
    const firstRun = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('retention_policies')
      .update({
        mode,
        retention_days: retentionDays,
        enabled_by: profile?.id,
        enabled_at: new Date().toISOString(),
        scheduled_first_run_at: policy.scheduled_first_run_at || firstRun,
      })
      .eq('id', policy.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'document_uploaded' as any,
      `Retention policy "${meta.title}" set to ${mode} / ${retentionDays} days`,
      profile,
    );
    toast({
      title: 'Policy saved',
      description: `First run scheduled for ${new Date(firstRun).toLocaleDateString('en-NG')}. You can pause or change settings any time.`,
    });
    onSaved();
  };

  const disable = async () => {
    if (!confirm('Disable this retention policy? Future scheduled runs will not execute.')) return;
    setSaving(true);
    await supabase
      .from('retention_policies')
      .update({ mode: 'off', scheduled_first_run_at: null })
      .eq('id', policy.id);
    setSaving(false);
    toast({ title: 'Policy disabled' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="h-5 w-5 text-primary" />
            {meta.title} — step {step} of 3
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Read the warning carefully before continuing.'}
            {step === 2 && 'Choose how aggressively to clean up — and see what would be affected today.'}
            {step === 3 && 'Type the confirmation phrase to enable.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-xs">
              <p className="font-bold text-red-900 mb-1">This will permanently move (and optionally delete) data.</p>
              <ul className="list-disc pl-5 space-y-0.5 text-red-900">
                {meta.dangers.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p className="font-semibold mb-1">Legal note</p>
              <p>{meta.legalNote}</p>
            </div>
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2.5 text-xs">
              <p className="font-semibold mb-1">Built-in safeguards</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>7-day delay before the first run.</li>
                <li>Archives kept in private archives/ bucket — recoverable for 90 days.</li>
                <li>Pause-all button stops every policy with one click.</li>
                <li>Every run is audit-logged.</li>
              </ul>
            </div>
            <label className="flex items-start gap-2 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1"
              />
              <span className="text-xs leading-relaxed">
                I have read the dangers and the legal note. I understand that
                deleted data may not be recoverable after 90 days.
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="archive">Archive only (recommended)</SelectItem>
                    <SelectItem value="archive_delete">Archive + delete (advanced)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retention period</Label>
                <Select value={String(retentionDays)} onValueChange={(v) => setRetentionDays(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS_DAYS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs">
              <p className="text-muted-foreground">If enabled today, the first run would affect:</p>
              <p className="text-2xl font-bold mt-1">
                {previewLoading ? '…' : previewCount?.toLocaleString() ?? '—'}
                <span className="text-sm font-normal text-muted-foreground ml-1">rows</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cutoff: anything older than {new Date(Date.now() - retentionDays * 86_400_000).toLocaleDateString('en-NG')}
              </p>
            </div>
            {mode === 'archive_delete' && (
              <div className="rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-900">
                <span className="font-semibold">⚠ Archive + delete</span> permanently removes rows from the source table after the archive succeeds. The archive is your only recovery path.
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Recommended for this data type: <strong>{RETENTION_OPTIONS_DAYS.find((o) => o.value === meta.recommended)?.label}</strong>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p>Type <code className="bg-muted px-1 rounded">{expectedPhrase}</code> to confirm.</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedPhrase}
              autoFocus
            />
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-xs">
              On save, this policy will be marked enabled and the first run will execute on <strong>{new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('en-NG')}</strong> (7 days from now). You can pause or disable it any time before then.
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {policy.mode !== 'off' && step === 1 && (
            <Button variant="destructive" size="sm" onClick={disable} disabled={saving}>
              Disable policy
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>Back</Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!acknowledged}>Next</Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={previewLoading}>Next</Button>
          )}
          {step === 3 && (
            <Button
              onClick={save}
              disabled={confirmText.trim().toLowerCase() !== expectedPhrase || saving}
            >
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Enable policy
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// System Reference panel — tabbed by module
// ---------------------------------------------------------------------------

interface RefRow { a: string; b: string; c?: string; d?: string; e?: string; f?: string; }

function RefTable({ rows, cols }: { rows: RefRow[]; cols: string[] }) {
  const keys: (keyof RefRow)[] = ['a', 'b', 'c', 'd', 'e', 'f'];
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/20">
              {cols.map((_, ci) => (
                <td key={ci} className={`px-3 py-2 align-top ${ci === 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                  {r[keys[ci]] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RefSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

function SystemReferencePanel() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">System Reference</p>
            <p className="text-muted-foreground leading-relaxed">
              Read-only reference of every cap, approval rule, retention policy, security
              setting and operational threshold the platform enforces — organised by module.
              This is the single source of truth. When a rule changes in code, this page is updated too.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 mb-2">
          <TabsTrigger value="overview"      className="text-xs"><History       className="h-3 w-3 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="payments"      className="text-xs"><CreditCard    className="h-3 w-3 mr-1" />Payments</TabsTrigger>
          <TabsTrigger value="finance"       className="text-xs"><Wallet        className="h-3 w-3 mr-1" />Finance Modules</TabsTrigger>
          <TabsTrigger value="expenses"      className="text-xs"><Receipt       className="h-3 w-3 mr-1" />Expenses</TabsTrigger>
          <TabsTrigger value="fleet"         className="text-xs"><Car           className="h-3 w-3 mr-1" />Fleet</TabsTrigger>
          <TabsTrigger value="hr"            className="text-xs"><Users         className="h-3 w-3 mr-1" />HR &amp; Leave</TabsTrigger>
          <TabsTrigger value="workspace"     className="text-xs"><FolderKanban  className="h-3 w-3 mr-1" />Workspace</TabsTrigger>
          <TabsTrigger value="security"      className="text-xs"><Shield        className="h-3 w-3 mr-1" />Security</TabsTrigger>
          <TabsTrigger value="files"         className="text-xs"><FileWarning   className="h-3 w-3 mr-1" />Files &amp; Data</TabsTrigger>
          <TabsTrigger value="infra"         className="text-xs"><HardDrive     className="h-3 w-3 mr-1" />Infrastructure</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Platform change history
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2 leading-relaxed">
              <p><strong>Phase 1 — Tighter access control.</strong> Only the right people can see audit logs, tasks, comments, referrals, and deductions. Webhook duplicates from Paystack no longer create duplicate transactions. Two missing tables (salary increments, revenue entries) were added.</p>
              <p><strong>Phase 2 — More resilient pages.</strong> A bug on one page no longer brings down the whole app — the user sees a friendly error message instead. The Payments page is much faster (was making many small database calls in a loop). Background refreshing slows down when a tab is inactive. Long employee profiles now use page navigation.</p>
              <p><strong>Phase 3 — Sanity checks &amp; receipts.</strong> The database now rejects unrealistically large amounts (e.g. ₦50 billion typed by accident). Risky file types (.exe, .html, .js) are blocked from upload. A "Reconcile" button on Payments re-checks stuck transfers. Every login and logout is recorded in the audit log.</p>
              <p><strong>Phase 4 — Login &amp; browser security.</strong> 5 wrong passwords in 15 minutes briefly locks the account. Failed attempts are saved for admins to review. The browser is told which servers it can talk to so injected scripts can't reach unknown sites. App-wide error reporting is wired up (Sentry-ready).</p>
              <p><strong>Phase 5–14 — Feature build-out.</strong> Two-approver workflow for big expenses, budget locking, leave balance tracking, payroll advances, virtual cards, knowledge base, goals, announcements, compliance calendar, and contractor profiles.</p>
              <p><strong>Phase 15 — Always fresh data.</strong> When you switch back to a browser tab, lists automatically pull the latest numbers so you never see stale data.</p>
              <p><strong>P0 Go-live hardening.</strong> Admins can first-approve their own expenses (others can't). The Approvals page caps how many rows it loads at once. Our server APIs reject calls from unknown websites. Database queries are faster thanks to indexes. Passwords must be 12+ characters with letters and numbers. Logging out cleans up live data subscriptions. All file uploads are limited to 10 MB.</p>
              <p><strong>P1 — Payments page crash fixed.</strong> The page used to crash with "Cannot access before initialization" because some code ran in the wrong order. The fix is now enforced automatically by the linter, so it cannot come back.</p>
              <p><strong>P1 — Safer delete.</strong> Deleting an expense, document, budget, leave request, or fuel request no longer wipes it permanently. The row is hidden from every screen but stays in the database, so an admin can recover it from the Supabase dashboard if it was a mistake.</p>
              <p><strong>P1 — Query caps everywhere.</strong> Every list in the app now has a maximum number of rows it fetches at once. This stops pages from getting slower as your data grows. Covers Dashboard, Budgets, Leave, Approvals, Fleet, Reports, plus supporting lists (departments, budget line items, knowledge versions, employee directories, tags).</p>
              <p><strong>P1 — Auto-trim.</strong> Spaces accidentally typed before or after a value (company name, RC number, TIN, address, website, payment batch name) are stripped automatically before saving.</p>
              <p><strong>P1 — No more double-clicks.</strong> Buttons like Submit, Approve, Lock, Delete on Budgets — and Add note, Affiliate toggle, Deactivate elsewhere — grey out the moment you click them. The screen updates immediately; if the server rejects the change, the screen reverts and shows an error.</p>
              <p><strong>P1 — Branded confirmation pop-ups.</strong> When you delete a subscription, revert a leave approval, or delete an employee document, you see the app's own confirmation box instead of the plain browser pop-up. Same look and feel everywhere.</p>
              <p><strong>P1 — Screen-reader friendliness &amp; cleaner CSV.</strong> Buttons that show only an icon (Pause, Edit, Delete, History) now announce what they do to assistive technology. CSV exports of Contacts, Goals, and Referrals show dates as 27/04/2026 instead of raw timestamps like 2026-04-27T14:00:00Z.</p>
              <p><strong>P1 — Clients module.</strong> New CRM page to track clients (active, inactive, prospect) with contract values, contact details, industry, start date, and notes. Includes search, status filter, pagination, CSV export, and soft delete. Accessible under CRM → Clients in the sidebar.</p>
              <p><strong>P1 — Paystack fee fix.</strong> The Paystack Fees figure on Reports was always ₦0 because the per-transfer fee column is only populated after a real Paystack webhook fires. The calculation now falls back to an estimate (1.5% of transfer amount, minimum ₦50, maximum ₦2,000) for transfers where the actual fee has not yet been recorded, so the Reports P&amp;L shows a realistic figure even during testing.</p>
              <p><strong>P1 — Mobile dialogs &amp; date sanity.</strong> Forms on Compliance and Budgets no longer overflow on small screens — they now scroll inside the dialog instead of running off the page. Date inputs (Client start date, Expense date, Budget periods) now reject unrealistic years like 1900 or 9999, and the budget end date can never be set before the start date.</p>
              <p><strong>P1 — Faster client entry.</strong> The "Add Client" form now puts the cursor in the Name field automatically, so you can start typing immediately without clicking. The Compliance page also shows a friendly "No filings yet" message with guidance for new admins instead of an empty table.</p>
              <p><strong>P1 — Dashboard discovery.</strong> The new Clients module now appears in the Dashboard's Quick Actions panel so it's reachable in one click from anywhere in the app.</p>
              <p><strong>P1 — Client profile pages.</strong> Clicking on any client in the Clients list now opens a dedicated profile page for that client. From there you can edit all details, track contract value, change their status (active / inactive / prospect), and add timestamped notes — the same way you can add notes on a Contact profile. The remove button on the profile also works like the list view: the client is hidden but kept in the database.</p>
              <p><strong>P1 — Compliance keyboard shortcut.</strong> In the "New statutory filing" form, pressing Enter now saves the filing — just like clicking the "Save filing" button. This saves time when quickly logging multiple filings in a row.</p>
              <p><strong>P1 — Reports stopped guessing Paystack fees.</strong> The P&amp;L and Payments reports used to show an estimated Paystack fee figure (1.5% of the transfer amount) which was almost never accurate. The "Paystack Fees" stat card and chart bar have been removed from both the P&amp;L and Payments tabs in Reports. The actual fees Paystack charges (e.g. ₦10 per transfer, plus stamp duty) appear as real entries on the Transactions page, where they naturally count toward what you spent.</p>
              <p><strong>P1 — Friendlier Clients error.</strong> If the Clients table has not been created in the database yet, the page used to show a confusing "schema cache" error from Supabase. It now shows a clear message explaining that the database migration needs to be deployed by running "supabase db push" — so admins know exactly what to do.</p>
              <p><strong>P1 — Paystack fees as separate rows in Transactions.</strong> The Transactions page now shows Paystack transfer fees as their own rows — exactly like the Paystack ledger does. Each completed transfer that has a recorded fee produces a "Charge for transfer: TRF_xxx" row (in amber) directly below the transfer itself. Clicking a fee row navigates to the same batch detail page as the transfer. A "Fees" tab lets you filter to fee rows only.</p>
              <p><strong>P1 — Paystack fees count toward P&amp;L and Payment costs.</strong> Reports now includes real Paystack transfer fees (from webhook data, never estimated) in operating costs. The P&amp;L tab shows a "Paystack Fees" stat card and stacks fees in the monthly chart. Net Profit is now Revenue − disbursements − expenses − actual Paystack fees. The Payments tab also shows a Paystack Fees total, and the CSV export includes the fee column per batch.</p>
              <p><strong>Phase 2 — Invoices module.</strong> A full Invoices page (Finance → Invoices in the sidebar) lets you create, send, and track client invoices. Each invoice supports dynamic line items, Nigerian VAT at 7.5% (configurable to 0 / 5 / 7.5 / 10%), and a clear status workflow: draft → sent → paid | overdue | cancelled. Overdue is detected automatically — no scheduled job needed. Invoices are linked to the Clients CRM. Print-ready view and CSV export included.</p>
              <p><strong>Phase 2 — Dashboard expiry alerts.</strong> The Dashboard now shows an amber alert panel for anything that needs attention in the next 30 days: documents whose expiry date is approaching and compliance filings whose due date is close. Clicking an alert takes you directly to the Documents or Compliance page. Only visible to Finance / Admin / Super Admin roles (not personal dashboards).</p>
              <p><strong>Phase 3 — Vendor Registry.</strong> A dedicated Vendors page (Operations group in the sidebar) stores all suppliers — utilities, SaaS, service providers, logistics partners. Each vendor record holds contact info, CAC RC number, TIN, bank details, payment terms, and contract start/end dates. Contracts expiring within 30 days surface as amber badges. Soft delete and CSV export included. Accessible to Finance, Operations, Admin, and Super Admin.</p>
              <p><strong>Phase 3 — Petty Cash Management.</strong> The Petty Cash page (Finance group) lets you create one or more cash funds (e.g. "Head Office Float", "Lagos Branch"). Each fund has a custodian, an opening balance, and a running current balance that is automatically recalculated by a database trigger after every entry. Disbursements and replenishments are recorded individually with date, purpose, payee, and category. Low-balance alerts appear when a fund drops below ₦5,000.</p>
              <p><strong>Phase 3 — Performance Reviews.</strong> The Performance page (Operations group) introduces structured review cycles — annual, mid-year, quarterly, or probation. Each cycle contains individual reviews (manager, self-assessment, or peer). Reviewers rate employees on five competencies (Delivery, Communication, Teamwork, Initiative, Leadership) on a 1–5 scale; the overall rating is computed as the average. Status flow: draft → submitted → acknowledged. A progress bar on each cycle shows how many reviews have been submitted. Overdue cycles are flagged in red.</p>
              <p><strong>Phase 3 — Petty Cash removed.</strong> The Petty Cash module was built but removed at the user's request — all expenses go through bank transfers and the Expenses module, making a separate cash float tracker redundant. The underlying database tables (petty_cash_funds, petty_cash_entries) remain in the schema but the UI is gone.</p>
              <p><strong>Phase 4 — Asset Register.</strong> A fixed assets page (Finance → Assets) tracks every company asset — IT equipment, motor vehicles, furniture, plant &amp; machinery, buildings, and leasehold improvements. Book value is calculated live using straight-line or reducing-balance depreciation. CITA capital allowance rates (initial and annual) are pre-filled by asset category per Nigerian Companies Income Tax Act rules. Insurance expiry dates trigger 30-day amber badges. Assets can be assigned to employees and departments. Disposed and written-off assets are tracked separately from active ones. CSV export included.</p>
              <p><strong>Phase 4 — Employee Loans removed.</strong> A standalone Loans module was built but removed — the existing employee_advances system in Payroll already handles staff advances with monthly deductions, auto-settlement, and payroll integration. The loan migration (employee_loans table) remains in the schema but the UI is gone.</p>
              <p><strong>Phase 4 — Training &amp; Certifications.</strong> The Training page (Operations → Training) records every employee course and certification. Certifications with expiry dates automatically show as "Expired" when past due — no job needed. Expiry dates within 30 days surface as amber badges. Mandatory training (safety, compliance) is flagged separately from optional development. Filters by employee, type, category, and status. CSV export included. Training costs are tracked for budget analysis.</p>
              <p><strong>Phase 5 — Project Tracker.</strong> A Projects page (Workspace group) links projects to clients (CRM), owners, and departments. Status workflow: planning → active → on_hold → completed / cancelled. Priority levels: critical, high, normal, low. Budget in ₦. Inline milestones with drag-sortable order — mark each milestone complete with a single click. Linked tasks from the Tasks module are counted and displayed per project. Overdue detection on active projects whose end date has passed. CSV export included.</p>
              <p><strong>Phase 5 — Employee Benefits.</strong> A Benefits page (Operations group) tracks all statutory and voluntary benefits per employee: HMO (NHIS), Pension (PFA with RSA PIN), Group Life, and other benefits. Premium amounts and frequency (monthly / quarterly / annually) are stored; monthly equivalent is computed on the fly. Expiry dates within 30 days surface as amber badges. Summary cards show active enrolment counts by type. CSV export included.</p>
              <p><strong>Phase 5 — Onboarding &amp; Offboarding.</strong> An Onboarding page (Operations group) manages joining and exit checklists for employees. Creating a checklist pre-populates it with 11 default onboarding items (documentation, IT setup, HR admin, finance, training, equipment, introduction) or 8 offboarding items — or you can start blank. Each item can be assigned to a team member with a due date. Tick items complete individually; a progress bar shows overall completion. Status is derived in-app (pending / in-progress / completed) — no DB trigger needed. CSV export included.</p>
              <p><strong>Phase 6 — Recruitment Pipeline.</strong> A Recruitment page (Operations group) manages the full hiring lifecycle: create job openings with title, department, employment type (full-time / part-time / contract / intern), salary range, and closing date. Add applicants to each opening; move them through the pipeline stages: New → Screening → Interview 1 → Interview 2 → Offer → Hired / Rejected. Record interview dates, assigned interviewers, offer amounts, and rejection reasons. Stage-filter buttons on each opening show counts per stage. Summary cards track active openings, total applicants, offers out, and hired count. CSV export included.</p>
              <p><strong>Phase 6 — Attendance &amp; Timesheets.</strong> An Attendance page (Operations group) records daily attendance per employee. Each record captures clock-in and clock-out times (stored as TIME — single-timezone Nigeria WAT), attendance status (present / absent / late / half-day / remote / on-leave / public holiday), and overtime minutes. One record per employee per date is enforced by a UNIQUE constraint — upsert on conflict handles re-submission. The page shows a month navigator with a running summary of present, late, absent, and on-leave counts. Overtime hours are totalled for the period. CSV export per month included.</p>
              <p><strong>Phase 6 — Disciplinary Records.</strong> A Disciplinary page (Admin + Super Admin only) manages formal HR actions per Nigerian Labour Act requirements. Incident types cover the full ladder: verbal warning → written warning → final warning → query / show-cause → suspension → termination, plus counselling and other. Each record stores the subject, incident details, formal outcome, and the number of suspension days (if applicable). Employees can formally respond to queries (show-cause letters) via the built-in response thread. Records can be acknowledged (confirming the employee received the notice — required for fair hearing) and expunged with a reason after a clean-record period. Expunged records remain in the audit trail but are hidden from active history unless "Show expunged" is toggled. CSV export included.</p>
              <p className="text-muted-foreground border-t pt-2 mt-2">
                Database changes live in <code>supabase/migrations/</code> · Server-side helpers in <code>supabase/functions/</code> · After deploying, run <code>supabase db push</code> to apply any new database changes.
              </p>
            </CardContent>
          </Card>

          <RefSection icon={Wallet} title="Money caps (all modules)">
            <RefTable
              cols={['What', 'Maximum', 'Why']}
              rows={[
                { a: 'Single payment batch (total)',      b: '₦5,000,000,000', c: 'Catches typo on bulk runs' },
                { a: 'Single transfer (one beneficiary)', b: '₦100,000,000',   c: 'Single Paystack transfer guard' },
                { a: 'One expense submission',            b: '₦100,000,000',   c: 'Catches accidental extra digit' },
                { a: 'One fuel request',                  b: '₦5,000,000',     c: 'Highest plausible single fuel-up' },
                { a: 'One subscription',                  b: '₦50,000,000',    c: 'SaaS / utility max' },
                { a: 'One revenue entry',                 b: '₦5,000,000,000', c: 'Monthly revenue ceiling' },
                { a: 'Annual budget (per category)',      b: '₦5,000,000,000', c: 'Yearly planning ceiling' },
                { a: 'Salary advance',                    b: '₦50,000,000',    c: 'Per-employee advance' },
                { a: 'Annual salary',                     b: '₦100,000,000',   c: 'Per-employee yearly comp' },
              ]}
            />
          </RefSection>

          <RefSection icon={Sparkles} title="What we polished recently (in plain English)">
            <RefTable
              cols={['What you will notice', 'How it works']}
              rows={[
                { a: 'Branded "Are you sure?" pop-ups',      b: 'Deleting a subscription, reverting a leave approval, removing an employee document, or running Reconcile on Payments now shows the app\'s own confirmation box instead of the plain browser one.' },
                { a: 'No accidental double-clicks',          b: 'Buttons like Submit, Approve, Lock, Delete (Budgets), Add note (Contacts), Affiliate toggle (Referrals), Deactivate (Contractors) grey out the moment you click them — so the same change cannot be made twice.' },
                { a: 'Instant on-screen feedback',           b: 'Toggling an affiliate, deactivating a contractor, or adding a note updates the screen straight away. If the server rejects the change, the screen reverts and you see an error.' },
                { a: 'Friendlier for screen readers',        b: 'Icon-only buttons (Pause, Edit, Delete, History) now announce what they do to assistive technology — important for low-vision or keyboard-only users.' },
                { a: 'Cleaner dates in CSV exports',         b: 'Contacts, Goals, and Referrals CSV exports show dates like 27/04/2026 instead of raw timestamps like 2026-04-27T14:00:00Z.' },
                { a: 'Stray spaces auto-stripped',           b: 'Spaces accidentally typed before or after company name, RC number, TIN, website, address, or payment batch name are removed automatically before saving.' },
                { a: 'No silent page failures',              b: 'If a page can\'t load its data (e.g. brief network issue), you see a red error toast — never a blank screen with no explanation.' },
                { a: 'Click a client to open its profile',  b: 'Clicking any row in the Clients list opens a full profile page where you can edit details, add notes, and change status — without opening a small dialog.' },
                { a: 'Notes on client profiles',            b: 'You can add timestamped notes to any client the same way you can for Contacts. Each note shows the date and time it was added, and the full history is visible in one place.' },
                { a: 'Enter key saves compliance filings',  b: 'In the "New statutory filing" form, pressing Enter submits the form — useful when adding several filings quickly without reaching for the mouse.' },
                { a: 'No more guessed Paystack fees',        b: 'Reports used to show an estimated 1.5% Paystack fee figure that was almost always wrong. That stat card and chart bar are gone — actual transfer fees (₦10 charges, stamp duty etc.) appear as real entries on the Transactions page and naturally count toward operating costs.' },
                { a: 'Helpful Clients setup message',        b: 'If an admin opens the Clients page before the database migration has been deployed, the page now says "ask an admin to run supabase db push" instead of a confusing "schema cache" error.' },
                { a: 'Paystack fees as their own rows',       b: 'Each completed Paystack transfer now generates a separate "Charge for transfer: TRF_xxx" row (shown in amber) in the Transactions list — the same way the Paystack ledger shows it. Use the Fees filter tab to view only fee rows. The TRF reference matches Paystack\'s own ledger exactly.' },
                { a: 'Paystack fees in P&L and Payments',     b: 'Real transfer fees (from webhook data, never estimated) now count toward operating costs in Reports. P&L shows a dedicated "Paystack Fees" card and stacks fees in the chart. Net Profit = Revenue − disbursements − expenses − fees.' },
                { a: 'Invoices module',                       b: 'Finance can now create and send invoices to clients with line items, VAT (default 7.5% Nigerian standard), and a status workflow (draft → sent → paid / overdue / cancelled). Overdue is auto-detected by comparing due_date to today. Print-ready layout and CSV export included.' },
                { a: '30-day expiry alerts on Dashboard',     b: 'An amber panel on the main Dashboard shows documents expiring soon and compliance filings due within 30 days. Clicking takes you straight to the relevant page. Visible to Finance / Admin / Super Admin only.' },
                { a: 'Vendor Registry',                       b: 'A Vendors page stores all suppliers with contact info, bank details, CAC/TIN, payment terms, and contract dates. Contracts expiring within 30 days are flagged in amber — no more scrambling to find a supplier\'s bank account before a payment.' },
                { a: 'Petty Cash Management',                 b: 'Create cash funds with custodians. Each disbursement or replenishment adjusts the running balance instantly (via a DB trigger). Low-balance warning shows when a fund drops below ₦5,000. Export a fund\'s full history to CSV.' },
                { a: 'Performance Reviews',                   b: 'Run structured review cycles (annual / mid-year / quarterly / probation). Rate employees on five competencies (1–5 stars). Manager, self-assessment, and peer reviews are tracked separately. A progress bar shows how many reviews have been submitted in each cycle.' },
                { a: 'Asset Register',                        b: 'Track fixed assets with live book value (straight-line or reducing-balance depreciation). CITA capital allowance rates are pre-filled by category. Insurance expiry triggers 30-day alerts. Assets can be assigned to employees and departments. Disposal and write-off tracking included.' },
                { a: 'Training & Certifications',             b: 'Record courses and certifications per employee. Certifications auto-show as "Expired" when past their expiry date. 30-day amber badges for upcoming renewals. Mandatory vs optional flag for compliance training. Filters by employee, type, category, and status.' },
                { a: 'Project Tracker',                       b: 'Create and manage projects linked to clients, owners, and departments. Add milestones inline and tick them complete. Linked tasks are counted per project. Overdue projects are automatically flagged. Priority and status filters included.' },
                { a: 'Employee Benefits',                     b: 'Record HMO, Pension (PFA), Group Life, and other benefits per employee. Store policy numbers, RSA PINs, premiums, and expiry dates. Monthly cost equivalent is computed on the fly for quarterly or annual premiums. Expiry alerts at 30 days.' },
                { a: 'Onboarding & Offboarding',              b: 'Generate joining or exit checklists in one click — pre-filled with Nigerian HR best-practice default items. Tick items complete individually and assign them to team members. Progress bar shows overall completion without any database trigger.' },
                { a: 'Recruitment Pipeline',                   b: 'Post job openings with salary range, employment type, and closing date. Move applicants through a 7-stage pipeline (New → Screening → Interviews → Offer → Hired / Rejected). Track interview dates, assigned interviewers, and offer amounts. Stage-filter buttons on each opening show live counts.' },
                { a: 'Attendance & Timesheets',                b: 'Log daily clock-in/out and attendance status per employee. Month navigator with running totals for present, late, absent, and on-leave. Overtime minutes tracked per day and summed for the period. One record per employee per date enforced at the database level.' },
                { a: 'Disciplinary Records',                   b: 'Full disciplinary ladder: verbal → written → final warning → query → suspension → termination. Employee response thread for show-cause replies (required for fair hearing). Acknowledge receipt, expunge after clean-record period. Visible to Admin and Super Admin only.' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── PAYMENTS ──────────────────────────────────────────────────── */}
        <TabsContent value="payments" className="space-y-4">
          <RefSection icon={CreditCard} title="Paystack integration">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Webhook signature verification', b: 'HMAC-SHA512, timing-safe compare. Rejected events return 401' },
                { a: 'Transfer events handled',        b: 'transfer.success · transfer.failed · transfer.reversed' },
                { a: 'Webhook idempotency',            b: '(reference, event_type) UNIQUE — duplicate deliveries silently ignored' },
                { a: 'Fees captured',                  b: 'paystack_fee_ngn per batch_item; shown in the Fees column on the Transactions page' },
                { a: 'CORS allowed origins',           b: 'ops.kdsquares.com · localhost:5173 · localhost:8080 · localhost:3000 (no wildcard *)' },
                { a: 'Funding wallet',                 b: 'Payments page → top-right link, or dashboard.paystack.com/#/balance/' },
              ]}
            />
          </RefSection>

          <RefSection icon={RefreshCw} title="Batch processing & reconciliation">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Low balance warning',         b: 'Below ₦50,000 → orange banner on Payments page' },
                { a: 'BatchDetail polling interval', b: '15s → 30s → 60s → 120s (exponential backoff)' },
                { a: 'Polling stops after',         b: '30 minutes of no progress (manual refresh still works)' },
                { a: 'Polling pauses when',         b: 'Browser tab is hidden' },
                { a: 'Reconciliation threshold',    b: 'Re-checks any transfer stuck in "pending" for more than 1 hour' },
                { a: 'Reconciliation cap per run',  b: '200 items (rate-limit guard)' },
                { a: 'Manual reconcile button',     b: 'Payments page → "Reconcile" (top-right)' },
              ]}
            />
          </RefSection>

          <RefSection icon={Database} title="Query limits (Payments module)">
            <RefTable
              cols={['Query', 'Limit']}
              rows={[
                { a: 'Approvals — payment batches',         b: '200 rows' },
                { a: 'Dashboard — processed batches (KPI)', b: '500 rows' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── EXPENSES ──────────────────────────────────────────────────── */}
        <TabsContent value="expenses" className="space-y-4">
          <RefSection icon={CheckCircle2} title="Approval flow">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Single approval',         b: 'Expenses below the dual-approval threshold need one approver (admin / finance)' },
                { a: 'Dual approval',           b: 'Expenses at or above the threshold in Settings require two separate approvers' },
                { a: 'Dual threshold',          b: 'Configurable in Settings → Expense Limits (0 = dual approval disabled)' },
                { a: 'Self-approval — non-admin', b: 'Staff / finance / operations cannot approve their own expenses' },
                { a: 'Self-approval — admin',   b: 'super_admin and admin roles CAN first-approve their own expenses (exception)' },
                { a: 'Second approver',         b: 'Must be a different person from the first approver — enforced in code' },
                { a: 'Bulk approve',            b: 'Admin / finance only — each item gets its own audit log entry' },
                { a: 'Rejection reason',        b: 'Mandatory for all rejections — minimum 10 characters' },
              ]}
            />
          </RefSection>

          <RefSection icon={Receipt} title="Expense submission rules">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Maximum single expense',    b: '₦100,000,000 (CHECK constraint in DB)' },
                { a: 'Receipt upload size cap',   b: '10 MB per file' },
                { a: 'Receipt compression',       b: 'Images auto-compressed to 1600 px JPEG @ 82% on upload' },
                { a: 'Resubmission',              b: 'Rejected expenses can be edited and resubmitted — creates audit trail' },
                { a: 'Fuel-linked expenses',      b: 'Approving a fuel request auto-creates / updates a linked expense row' },
              ]}
            />
          </RefSection>

          <RefSection icon={Database} title="Data & query limits (Expenses)">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Soft delete',               b: 'Deleting an expense sets deleted_at — row stays in DB for audit trail' },
                { a: 'Deleted row visibility',    b: 'Hidden from all UI queries; visible in Supabase dashboard for recovery' },
                { a: 'Approvals page limit',      b: '200 pending expenses fetched at once' },
                { a: 'Dashboard spend-calc limit', b: '2,000 approved expenses (for budget KPIs)' },
                { a: 'Budgets spend-calc limit',  b: '2,000 approved expenses' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── FLEET ─────────────────────────────────────────────────────── */}
        <TabsContent value="fleet" className="space-y-4">
          <RefSection icon={Car} title="Fuel requests">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Maximum single fuel request', b: '₦5,000,000 (DB CHECK constraint)' },
                { a: 'File size cap',               b: '10 MB per receipt / document' },
                { a: 'Approval required',           b: 'admin / finance / super_admin' },
                { a: 'Approved → linked expense',   b: 'Approving a fuel request auto-creates a paired expense row' },
                { a: 'Soft delete',                 b: 'Deleting sets deleted_at — record preserved in DB' },
                { a: 'Query limit',                 b: '100 fuel requests fetched per load' },
                { a: 'Trip logs',                   b: 'Hard deleted (no financial value requiring preservation)' },
              ]}
            />
          </RefSection>

          <RefSection icon={Zap} title="Fleet operational thresholds">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Fuel request query limit',    b: '100 rows (most recent first)' },
                { a: 'Trip log query limit',        b: '100 rows (most recent first)' },
                { a: 'Payment type toggle',         b: 'Naming-only — bank fields always visible regardless of toggle' },
                { a: 'Reimbursement vs company',    b: 'Toggle on fuel & repair forms; stored on expense row (is_reimbursement)' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── HR & LEAVE ────────────────────────────────────────────────── */}
        <TabsContent value="hr" className="space-y-4">
          <RefSection icon={Users} title="Leave requests">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Approval roles',          b: 'admin / super_admin / operations' },
                { a: 'Rejection reason',        b: 'Mandatory — minimum 10 characters' },
                { a: 'Balance deducted when',   b: 'Leave is approved — restored if approval is reverted' },
                { a: 'Cancellation',            b: 'Employee can cancel their own pending / approved request' },
                { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
                { a: 'My requests limit',       b: '100 rows (most recent first)' },
                { a: 'Team view limit',         b: '200 rows (admin / privileged roles only)' },
                { a: 'Approvals page limit',    b: '200 pending leave requests' },
              ]}
            />
          </RefSection>

          <RefSection icon={Users} title="Employee profile caps">
            <RefTable
              cols={['Data', 'Cap']}
              rows={[
                { a: 'Payslips shown',             b: '24 (newest first)' },
                { a: 'Salary advances shown',      b: '20 (newest first)' },
                { a: 'Salary increments shown',    b: '20 (newest first)' },
                { a: 'Deductions shown',           b: '20 (newest first)' },
                { a: 'Documents shown',            b: '30 (newest first, soft-deleted excluded)' },
                { a: 'Audit log shown',            b: '50 most recent entries' },
                { a: 'Maximum annual salary',      b: '₦100,000,000 (DB CHECK constraint)' },
                { a: 'Maximum salary advance',     b: '₦50,000,000 (DB CHECK constraint)' },
              ]}
            />
          </RefSection>

          <RefSection icon={Database} title="Budgets">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Maximum annual budget',   b: '₦5,000,000,000 per category (DB CHECK)' },
                { a: 'Approval required',       b: 'admin / finance / super_admin' },
                { a: 'Locking',                 b: 'Locked budgets block new expense submissions against their categories' },
                { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
                { a: 'Query limit',             b: '200 budget rows per load' },
                { a: 'Approvals page limit',    b: '200 pending budgets' },
              ]}
            />
          </RefSection>

          <RefSection icon={Star} title="Performance Reviews">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Cycle types',             b: 'annual · mid_year · quarterly · probation' },
                { a: 'Competency scale',        b: '1–5 stars across 5 competencies (Delivery, Communication, Teamwork, Initiative, Leadership)' },
                { a: 'Overall rating',          b: 'Computed as the average of the five competency ratings' },
                { a: 'Status flow',             b: 'draft → submitted → acknowledged' },
                { a: 'Review types',            b: 'manager · self · peer (each tracked separately)' },
                { a: 'Who can edit',            b: 'The reviewer (until acknowledged) or any manager role' },
                { a: 'Overdue cycles',          b: 'Cycles past target_completion_date with incomplete reviews are flagged red' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={GraduationCap} title="Training &amp; Certifications">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Record types',            b: 'training (course completion) · certification (formal credential)' },
                { a: 'Expiry detection',        b: 'Auto-shows "Expired" when expiry_date &lt; today — no DB job needed' },
                { a: 'Renewal alert',           b: '30-day amber badge when expiry_date is within 30 days' },
                { a: 'Categories',              b: 'professional_development · compliance · safety · technical · leadership · software · other' },
                { a: 'Mandatory flag',          b: 'is_mandatory = true marks compliance/safety training as required' },
                { a: 'Cost tracking',           b: 'cost_ngn fed into budget analysis (no cap)' },
                { a: 'Certificate URL',         b: 'Optional link to PDF or external system' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={HeartPulse} title="Employee Benefits">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Benefit types',           b: 'hmo (NHIS) · pension_pfa (PFA) · group_life · other' },
                { a: 'RSA PIN',                 b: 'Stored only for pension_pfa records — Retirement Savings Account number' },
                { a: 'Premium frequency',       b: 'monthly · quarterly · annually' },
                { a: 'Monthly equivalent',      b: 'Computed in-app: quarterly ÷ 3, annually ÷ 12' },
                { a: 'Status values',           b: 'active · suspended · expired' },
                { a: 'Expiry alert',            b: '30-day amber badge when expiry_date approaches; red when past' },
                { a: 'Multiple records',        b: 'Multiple HMO plans per employee allowed (e.g. employee + family plan)' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={UserCheck} title="Onboarding &amp; Offboarding">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Checklist types',         b: 'onboarding (new hires) · offboarding (exits)' },
                { a: 'Default items seeded',    b: '11 onboarding items · 8 offboarding items (when "Populate defaults" is checked)' },
                { a: 'Item categories',         b: 'documentation · it_setup · hr_admin · finance · training · equipment · introduction · other' },
                { a: 'Item delegation',         b: 'Each item can be assigned to a team member (HR, IT, finance, buddy)' },
                { a: 'Status derivation',       b: 'Computed in-app — pending (0%) · in_progress (1–99%) · completed (100%). No DB trigger.' },
                { a: 'Item completion',         b: 'Click checkbox — sets completed_at + completed_by. Toggleable.' },
                { a: 'Sort order',              b: 'sort_order INT — lower numbers appear first within each category' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={UserPlus2} title="Recruitment Pipeline">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Pipeline stages',         b: 'new → screening → interview_1 → interview_2 → offer → hired | rejected' },
                { a: 'Employment types',        b: 'full_time · part_time · contract · intern' },
                { a: 'Opening status',          b: 'draft (private) · published · closed (no more applicants) · filled' },
                { a: 'Application sources',     b: 'job_board · referral · walk_in · internal · linkedin · other' },
                { a: 'Salary range',            b: 'salary_min_ngn / salary_max_ngn — planning figures, not enforced on offer' },
                { a: 'Offer amount',            b: 'Recorded only when stage is offer or hired; offered_at auto-stamped' },
                { a: 'Hire-to-employee',        b: 'Marking "Hired" does NOT auto-create an auth.users row — admin creates the employee manually' },
                { a: 'Soft delete',             b: 'Job openings use deleted_at; applicants are hard-deleted on removal' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={CalendarCheck2} title="Attendance &amp; Timesheets">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Storage',                 b: 'One row per employee per work_date — UNIQUE constraint at DB level' },
                { a: 'Conflict handling',       b: 'Insert uses upsert(onConflict=employee_id,work_date) — re-submission updates the existing row' },
                { a: 'Time storage',            b: 'clock_in / clock_out are TIME (no timezone) — assumes Nigeria WAT (UTC+1)' },
                { a: 'Status values',           b: 'present · absent · late · half_day · remote · on_leave · public_holiday' },
                { a: 'Overtime tracking',       b: 'overtime_minutes INT ≥ 0 — totalled per period in the summary card' },
                { a: 'Month navigation',        b: 'Page loads 1 month at a time; navigator buttons shift the date range' },
                { a: 'Leave integration',       b: 'on_leave status is set manually; not auto-synced from leave_requests (future)' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
              ]}
            />
          </RefSection>

          <RefSection icon={ShieldAlert} title="Disciplinary Records">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Action ladder',           b: 'verbal_warning → written_warning → final_warning → query → suspension → termination' },
                { a: 'Other types',             b: 'counselling · other (for informal coaching or undefined incidents)' },
                { a: 'Fair hearing support',    b: 'Employee response thread on each record — required by Nigerian Labour Act before termination' },
                { a: 'Acknowledgement',         b: 'acknowledged_at / acknowledged_by — confirms employee received the notice' },
                { a: 'Suspension',              b: 'suspension_days INT > 0 — mandatory when incident_type = suspension' },
                { a: 'Expunge mechanism',       b: 'is_expunged = true hides record from active history but keeps it in audit trail' },
                { a: 'Expunge reason',          b: 'Free-text reason captured (e.g. "12 months clean record")' },
                { a: 'Show expunged toggle',    b: 'Default off — expunged records hidden until "Show expunged" is checked' },
                { a: 'RLS access',              b: 'super_admin / admin only — finance and operations CANNOT view or edit (sensitive HR data)' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── FINANCE MODULES ────────────────────────────────────────────── */}
        <TabsContent value="finance" className="space-y-4">
          <RefSection icon={FilePlus2} title="Invoices">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Default VAT rate',        b: '7.5% — Nigerian standard rate (configurable per invoice)' },
                { a: 'Status workflow',         b: 'draft → sent → paid · overdue · cancelled' },
                { a: 'Overdue detection',       b: 'Auto-detected — sent invoices with due_date &lt; today display as overdue' },
                { a: 'Line items',              b: 'Multiple line items per invoice; quantity × unit_price + VAT = total' },
                { a: 'Payment terms',           b: 'Stored as days (30/60/90/custom) — used to compute due_date from issue_date' },
                { a: 'Currency',                b: 'NGN only — multi-currency not supported in this version' },
                { a: 'Print layout',            b: 'Print-ready CSS — use browser Print to PDF' },
                { a: 'Soft delete',             b: 'Status="cancelled" preferred over deletion to keep audit trail' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
              ]}
            />
          </RefSection>

          <RefSection icon={Store} title="Vendors / Suppliers">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Categories',              b: 'utilities · software · services · supplies · logistics · professional · other' },
                { a: 'Status values',           b: 'active · inactive · blacklisted (last blocks new POs)' },
                { a: 'Required fields',         b: 'Name + category + status. All other fields optional.' },
                { a: 'Tax/CAC fields',          b: 'rc_number (CAC) · tin (FIRS) — both 8–14 chars typical' },
                { a: 'Bank details',            b: 'Stored for direct payment via Paystack transfer recipient flow' },
                { a: 'Contract expiry',         b: 'contract_end within 30 days surfaces as amber badge' },
                { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance / operations' },
              ]}
            />
          </RefSection>

          <RefSection icon={Package} title="Asset Register">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Asset categories',        b: 'plant_machinery · motor_vehicle · furniture · it_equipment · land_building · leasehold_improvement · other' },
                { a: 'Depreciation methods',    b: 'straight_line (default) · reducing_balance' },
                { a: 'Straight-line formula',   b: 'book_value = cost − ((cost − salvage) ÷ useful_life) × years_elapsed' },
                { a: 'CITA initial allowance',  b: 'Pre-filled per category (plant 50% · vehicle 50% · furniture 25% · IT 50% · land/building 10%)' },
                { a: 'CITA annual allowance',   b: 'Pre-filled per category (plant 25% · vehicle 25% · furniture 20% · IT 25% · land/building 10%)' },
                { a: 'Insurance expiry',        b: '30-day amber badge when insurance_expiry approaches' },
                { a: 'Disposal tracking',       b: 'status: active · disposed · written_off — disposed assets hidden from default view' },
                { a: 'Assignment',              b: 'Assets can be linked to an employee (assigned_to) and department' },
                { a: 'RLS write access',        b: 'super_admin / admin / finance only' },
              ]}
            />
          </RefSection>

          <RefSection icon={Briefcase} title="Subscriptions">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Maximum amount',          b: '₦50,000,000 per subscription (DB CHECK)' },
                { a: 'Renewal cycles',          b: 'monthly · quarterly · annually · custom' },
                { a: 'Auto-renewal flag',       b: 'is_auto_renew controls whether system flags upcoming renewals' },
                { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
                { a: 'Categories',              b: 'Linked to global expense categories for budget tracking' },
              ]}
            />
          </RefSection>

          <RefSection icon={CreditCard} title="Virtual Cards">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Card lifecycle',          b: 'pending → active → suspended · expired · closed' },
                { a: 'Daily / monthly caps',    b: 'Stored on the card record; enforced by Paystack at swipe time' },
                { a: 'Linked employee',         b: 'Each card belongs to one employee (linked profile)' },
                { a: 'Soft delete',             b: 'Closed cards stay in DB for transaction history' },
              ]}
            />
          </RefSection>

          <RefSection icon={ShieldCheck} title="Compliance Filings">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Filing types',            b: 'paye · pension · nhf · nhis · vat · cit · firs_other (Nigerian statutory)' },
                { a: 'Due-date alerts',         b: '30-day amber badge on Dashboard for filings due soon' },
                { a: 'Status values',           b: 'pending · submitted · paid · overdue (auto-detected)' },
                { a: 'Document linking',        b: 'Each filing can be linked to a Documents record (receipt PDF)' },
                { a: 'RLS read access',         b: 'super_admin / admin / finance only' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── WORKSPACE ──────────────────────────────────────────────────── */}
        <TabsContent value="workspace" className="space-y-4">
          <RefSection icon={FolderKanban} title="Project Tracker">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Status workflow',         b: 'planning → active → on_hold → completed | cancelled' },
                { a: 'Priority levels',         b: 'critical · high · normal · low' },
                { a: 'Date constraint',         b: 'CHECK: end_date must be ≥ start_date when both set' },
                { a: 'Client linking',          b: 'Optional client_id FK to Clients CRM (sets to NULL on client delete)' },
                { a: 'Owner / department',      b: 'Each project has one owner (auth user) and an optional department' },
                { a: 'Milestones',              b: 'Inline list — pending or complete; Enter key adds; sort_order controls display' },
                { a: 'Linked tasks',            b: 'Tasks gain a project_id FK (added by Phase 5 migration); count shown per project' },
                { a: 'Overdue detection',       b: 'Active project past end_date displays an Overdue badge' },
                { a: 'Budget',                  b: 'budget_ngn is a planning figure; actual spend computed from linked expenses (not stored)' },
                { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
              ]}
            />
          </RefSection>

          <RefSection icon={Users} title="Tasks">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Status values',           b: 'open · in_progress · blocked · done' },
                { a: 'Priority levels',         b: 'critical · high · normal · low' },
                { a: 'Project linkage',         b: 'project_id FK added in Phase 5 — tasks can belong to a project (or stay standalone)' },
                { a: 'Assignment',              b: 'One assignee per task; comments thread for collaboration' },
                { a: 'Soft delete',             b: 'deleted_at — record stays in DB' },
              ]}
            />
          </RefSection>

          <RefSection icon={CheckCircle2} title="Goals (OKR)">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Goal types',              b: 'company · department · team · individual' },
                { a: 'Status values',           b: 'on_track · at_risk · off_track · completed' },
                { a: 'Progress',                b: '0–100% — entered manually by goal owner' },
                { a: 'Visibility',              b: 'Each user sees their own goals + their department goals + company goals' },
              ]}
            />
          </RefSection>

          <RefSection icon={BookOpen} title="Knowledge Base">
            <RefTable
              cols={['Rule', 'Detail']}
              rows={[
                { a: 'Article statuses',        b: 'draft (only author) · published (all authenticated)' },
                { a: 'Versioning',              b: 'knowledge_article_versions stores every save — full edit history retained' },
                { a: 'Search',                  b: 'In-app filtering by title, body, category, tag' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── SECURITY ──────────────────────────────────────────────────── */}
        <TabsContent value="security" className="space-y-4">
          <RefSection icon={Lock} title="Authentication & passwords">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Minimum password length',   b: '12 characters' },
                { a: 'Password complexity',       b: 'Must contain at least one letter and one number' },
                { a: 'Login rate limit',          b: '5 failed attempts per email in 15 minutes → 15-minute lockout' },
                { a: 'Failed login tracking',     b: 'Recorded in failed_login_attempts table (admins only)' },
                { a: 'Login / logout audited',    b: 'Every session start and end recorded in audit_logs' },
                { a: 'Session storage',           b: 'localStorage with auto-refresh JWT. Cleared on Sign Out' },
                { a: '"View As role"',            b: 'super_admin only — sessionStorage, cleared on tab close' },
                { a: 'Realtime cleanup',          b: 'All Supabase realtime channels removed on logout (no ghost subscriptions)' },
              ]}
            />
          </RefSection>

          <RefSection icon={Shield} title="Access control (role matrix)">
            <RefTable
              cols={['Module / Resource', 'super_admin', 'admin', 'finance', 'operations', 'field_staff / driver']}
              rows={[
                { a: 'Dashboard',           b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
                { a: 'Expenses',            b: '✓', c: '✓', d: '✓', e: '✓', f: '✓' },
                { a: 'Payroll / Payslips',  b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Budgets',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Fleet',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Contractors',         b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
                { a: 'Employees (HR)',       b: '✓', c: '✓', d: '—', e: '—', f: '—' },
                { a: 'Leave',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Performance Reviews', b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Training Records',    b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Benefits',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Onboarding',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Recruitment',         b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Attendance',          b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Disciplinary',        b: '✓', c: '✓', d: '—', e: '—', f: '—' },
                { a: 'Vendors',             b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Clients / CRM',       b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Invoices',            b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
                { a: 'Assets',              b: '✓', c: '✓', d: '✓', e: '—', f: '—' },
                { a: 'Projects',            b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Tasks',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Goals',               b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Documents',           b: '✓', c: '✓', d: '✓', e: '✓', f: '—' },
                { a: 'Audit Log',           b: '✓', c: '✓', d: '—', e: '—', f: '—' },
                { a: 'Settings',            b: '✓', c: '—', d: '—', e: '—', f: '—' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground mt-2">✓ = can access · — = blocked at route and database level. Role changes take effect on the employee's next page load.</p>
          </RefSection>

          <RefSection icon={Shield} title="Fine-grained write permissions">
            <RefTable
              cols={['Resource', 'Who can write']}
              rows={[
                { a: 'Audit log write',          b: 'INSERT only — performed_by must equal your own user_id' },
                { a: 'Documents bucket write',   b: 'admin / finance / operations / super_admin' },
                { a: 'Expense approval',         b: 'admin / finance (single items) · admin / finance (bulk)' },
                { a: 'Approval comments',        b: 'admin / finance / operations only' },
                { a: 'Employee deductions',      b: 'Self only OR admin / finance' },
                { a: 'Tasks visibility',         b: 'Assignee + creator + admin / operations' },
                { a: 'Invoices write',           b: 'super_admin / admin / finance only (RLS)' },
                { a: 'Assets write',             b: 'super_admin / admin / finance only (RLS)' },
                { a: 'Disciplinary write',       b: 'super_admin / admin only (RLS)' },
                { a: 'Disciplinary responses',   b: 'super_admin / admin only (RLS)' },
              ]}
            />
          </RefSection>

          <RefSection icon={Globe} title="Network & API security">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Content Security Policy',   b: 'Active in index.html — restricts scripts, connects, iframes to known origins' },
                { a: 'Edge function CORS',        b: 'Locked to ops.kdsquares.com + localhost ports (no wildcard *)' },
                { a: 'Paystack webhook auth',     b: 'HMAC-SHA512 signature verified on every webhook delivery' },
                { a: 'Error reporting',           b: 'window.onerror + ErrorBoundary forward to window.Sentry if configured' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── FILES & DATA ──────────────────────────────────────────────── */}
        <TabsContent value="files" className="space-y-4">
          <RefSection icon={FileWarning} title="File upload rules">
            <RefTable
              cols={['Setting', 'Value']}
              rows={[
                { a: 'Maximum file size',           b: '10 MB per file (5 MB for company logo)' },
                { a: 'Image compression',           b: 'On by default — receipts / photos resize to 1600 px JPEG @ 82%' },
                { a: 'Compression skipped for',     b: 'PDFs, GIFs, SVGs, files smaller than 200 KB' },
                { a: 'Blocked extensions',          b: '.exe .bat .cmd .sh .ps1 .jar .msi .app .dmg .html .js .ts .php .py .rb' },
                { a: 'Documents bucket',            b: 'Private — preview uses short-lived signed URLs' },
                { a: 'Receipts bucket',             b: 'Private — same signed-URL pattern' },
                { a: 'Documents auto-delete',       b: 'NEVER — HR / legal docs survive any retention policy' },
              ]}
            />
          </RefSection>

          <RefSection icon={Database} title="What really happens when you click 'Delete'">
            <RefTable
              cols={['What you delete', 'What actually happens']}
              rows={[
                { a: 'Expense',           b: 'Hidden from every screen, but kept in the database with a "deleted on" timestamp. An admin can restore it from the Supabase dashboard.' },
                { a: 'Document',          b: 'Hidden everywhere and the actual file is removed from storage (frees space). The database record stays so the audit log still references it.' },
                { a: 'Budget',            b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
                { a: 'Leave request',     b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
                { a: 'Fuel request',      b: 'Hidden from every screen, but kept in the database. Recoverable from the Supabase dashboard.' },
                { a: 'Contractor',        b: 'Sensitive personal info (name, email, phone, BVN, bank details) is anonymised. The row stays so historical payments still balance.' },
                { a: 'Trip log',          b: 'Permanently removed (no financial value tied to it).' },
                { a: 'Task or Goal',      b: 'Permanently removed.' },
              ]}
            />
          </RefSection>

          <RefSection icon={Archive} title="Data retention policies">
            <RefTable
              cols={['Data type', 'Current behaviour', 'Recommended setting']}
              rows={[
                { a: 'Audit logs',            b: 'Configurable in Data Retention tab', c: '3 years (FIRS requirement)' },
                { a: 'Notifications (read)',  b: 'Configurable',                       c: '90 days' },
                { a: 'Receipts & files',      b: 'Configurable (archive-only mode)',   c: '2 years archive, never hard-delete' },
                { a: 'Documents (HR/legal)',  b: 'NEVER auto-deleted (locked)',         c: 'Keep 7 years post-employment' },
                { a: 'Archive recovery',      b: '90-day window after archiving',      c: 'Restore via Supabase before expiry' },
                { a: 'First-run delay',       b: '7 days from enabling retention',     c: 'Cancellation window' },
              ]}
            />
          </RefSection>
        </TabsContent>

        {/* ── INFRASTRUCTURE ────────────────────────────────────────────── */}
        <TabsContent value="infra" className="space-y-4">

          {/* ── BACKUP — most prominent section ── */}
          <Card className="border-2 border-primary/40 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-5 w-5 text-primary" />
                Database Backup — Daily Automated (Free)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                A GitHub Actions workflow (<code>.github/workflows/daily-backup.yml</code>) runs every night
                at <strong>02:00 WAT</strong> and creates a compressed SQL dump of the entire database.
                Backups are stored as GitHub Actions artifacts — <strong>completely free, no Pro plan needed</strong>.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="font-semibold text-primary">One-time setup (2 min)</p>
                  <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                    <li><strong>SUPABASE_ACCESS_TOKEN</strong> — already in GitHub secrets ✅</li>
                    <li>Find your project ref: open Supabase → look at the URL:<br />
                      <code className="text-xs">supabase.com/dashboard/project/<strong>THIS_PART</strong></code></li>
                    <li>GitHub repo → <strong>Settings → Secrets → Actions → New secret</strong></li>
                    <li>Name: <strong><code>SUPABASE_PROJECT_REF</code></strong> · Value: paste the ref</li>
                    <li>Done — backup runs tonight automatically ✅</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-primary">How to restore a backup</p>
                  <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                    <li>GitHub repo → <strong>Actions tab</strong></li>
                    <li>Click <strong>"Daily Database Backup"</strong> on the left</li>
                    <li>Open any past run → scroll to <strong>Artifacts</strong></li>
                    <li>Download the zip → extract the <code>.sql.gz</code> file</li>
                    <li>Run: <code>gunzip backup.sql.gz</code></li>
                    <li>Then: <code>psql "$DB_URL" &lt; backup.sql</code></li>
                  </ol>
                </div>
              </div>

              <RefTable
                cols={['What', 'Detail']}
                rows={[
                  { a: 'Schedule',           b: '02:00 WAT every day (01:00 UTC). Can also be triggered manually from the Actions tab.' },
                  { a: 'Retention',          b: '30 days of backups kept. Oldest are deleted automatically — no manual cleanup needed.' },
                  { a: 'Storage used',       b: 'Typical small DB: 2–5 MB compressed per backup × 30 = 60–150 MB. GitHub Free plan gives 500 MB artifact storage.' },
                  { a: 'When storage fills', b: 'The workflow logs a warning if a single backup exceeds 15 MB. Check usage at github.com/settings/billing → Storage. Fix: reduce retention_days in the workflow file from 30 to 14, or upgrade to GitHub Pro ($4/mo) for 2 GB.' },
                  { a: 'What is backed up',  b: 'Full logical dump: all tables, data, and indexes. Does NOT include Supabase Edge Function secrets (those live in Supabase Vault — record them separately in a password manager).' },
                  { a: 'Manual trigger',     b: 'GitHub → Actions → "Daily Database Backup" → "Run workflow" button. Use this before any major migration or data change.' },
                  { a: 'Verify it is running', b: 'After setup, go to GitHub → Actions tab → "Daily Database Backup" — green checkmarks = working. A red X means SUPABASE_PROJECT_REF secret is wrong or missing.' },
                ]}
              />
            </CardContent>
          </Card>

          <RefSection icon={HardDrive} title="Supabase capacity (free tier)">
            <RefTable
              cols={['Resource', 'Limit / guidance']}
              rows={[
                { a: 'Database storage',       b: '500 MB — watch this first as data grows' },
                { a: 'File storage',            b: '1 GB' },
                { a: 'Bandwidth',               b: '5 GB / month' },
                { a: 'Edge Function invocations', b: '500,000 / month' },
                { a: 'Realtime concurrent peers', b: '200' },
                { a: 'Auth users (MAU)',         b: '50,000' },
                { a: 'Upgrade trigger',          b: 'Pro tier ($25/mo) lifts all limits 50–100×. Storage fills first at scale.' },
              ]}
            />
          </RefSection>

          <RefSection icon={Zap} title="Query limits by page">
            <RefTable
              cols={['Page / query', 'Limit']}
              rows={[
                { a: 'Approvals — each table (batches, expenses, fuel, budgets, leave)', b: '200 rows' },
                { a: 'Approvals — profiles',           b: '500 rows' },
                { a: 'Dashboard — approved expenses',  b: '2,000 rows' },
                { a: 'Dashboard — processed batches',  b: '500 rows' },
                { a: 'Budgets — budget rows',          b: '200 rows' },
                { a: 'Budgets — spend-calc expenses',  b: '2,000 rows' },
                { a: 'Budgets — spend-calc batches',   b: '500 rows' },
                { a: 'Leave — my requests',            b: '100 rows' },
                { a: 'Leave — team requests',          b: '200 rows' },
                { a: 'Fleet — fuel requests',          b: '100 rows' },
                { a: 'Fleet — trip logs',              b: '100 rows' },
              ]}
            />
          </RefSection>

          <RefSection icon={Activity} title="Permanent code guardrails">
            <RefTable
              cols={['Rule', 'What it prevents']}
              rows={[
                { a: 'Linter blocks "used too early" code', b: 'Stops a function from being called before the line that defines it. This was the cause of the old Payments page crash, so the rule is now an error and CI will fail if anyone reintroduces it.' },
                { a: 'Strict list of audit actions',         b: 'Every audit log action name (e.g. expense_approved, contractor_deactivated) must be in a fixed list. Typos that would silently break the audit log are caught at build time.' },
                { a: 'Production build tool',                b: 'We use Vite 8 (Rolldown). Its stricter optimisation makes the older crash-causing patterns surface immediately, not in production.' },
              ]}
            />
          </RefSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departments CRUD
// ---------------------------------------------------------------------------

interface Dept {
  id: string;
  name: string;
  description: string | null;
  head_id: string | null;
  head: { id: string; full_name: string } | null;
  created_at: string;
}

interface ProfileOption {
  id: string;
  full_name: string;
}

function DepartmentsManager() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [headId, setHeadId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Dept | null>(null);
  const [deletingDept, setDeletingDept] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: profilesData }, { data: memberData }] = await Promise.all([
      supabase.from('departments').select('*, head:profiles!head_id(id, full_name)').order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('profiles').select('department_id').not('department_id', 'is', null),
    ]);
    setDepts((data as Dept[]) || []);
    setProfileOptions((profilesData as ProfileOption[]) || []);
    const counts: Record<string, number> = {};
    (memberData || []).forEach((p: any) => {
      counts[p.department_id] = (counts[p.department_id] || 0) + 1;
    });
    setMemberCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setEditing(null);
    setName('');
    setDesc('');
    setHeadId('');
  };

  const openAdd = () => { reset(); setShowForm(true); };
  const openEdit = (d: Dept) => {
    setEditing(d);
    setName(d.name);
    setDesc(d.description || '');
    setHeadId(d.head_id || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      description: desc.trim() || null,
      head_id: headId || null,
    };
    if (editing) {
      const { error } = await supabase.from('departments').update(payload).eq('id', editing.id);
      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      } else {
        await logAudit('company_settings_saved', `Department "${name.trim()}" updated`, profile);
        toast({ title: 'Department updated' });
      }
    } else {
      const { error } = await supabase.from('departments').insert(payload);
      if (error) {
        toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      } else {
        await logAudit('company_settings_saved', `Department "${name.trim()}" created`, profile);
        toast({ title: 'Department created' });
      }
    }
    setSubmitting(false);
    setShowForm(false);
    reset();
    load();
  };

  const handleDelete = async (d: Dept) => {
    if (memberCounts[d.id]) {
      toast({
        title: 'Cannot delete',
        description: `${memberCounts[d.id]} employee(s) are assigned to this department. Reassign them first.`,
        variant: 'destructive',
      });
      return;
    }
    const { count } = await supabase
      .from('budgets')
      .select('*', { count: 'exact', head: true })
      .eq('department_id', d.id);
    if (count && count > 0) {
      toast({
        title: 'Cannot delete',
        description: `${count} budget(s) reference this department. Reassign them first.`,
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('departments').delete().eq('id', d.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('company_settings_saved', `Department "${d.name}" deleted`, profile);
      toast({ title: 'Department deleted' });
      load();
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Departments</CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add department
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {depts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              No departments yet. Add one to organize your team.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.description || '—'}</TableCell>
                    <TableCell className="text-sm">{d.head?.full_name || '—'}</TableCell>
                    <TableCell className="text-right">{memberCounts[d.id] || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} department</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operations" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-1">
              <Label>Head of department</Label>
              <Select value={headId || '__none__'} onValueChange={(v) => setHeadId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a head (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {profileOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete department</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deletingDept}
              onClick={async () => {
                if (confirmDelete) {
                  setDeletingDept(true);
                  await handleDelete(confirmDelete);
                  setDeletingDept(false);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



// ---------------------------------------------------------------------------
// Global Tags CRUD
// ---------------------------------------------------------------------------

interface Tag {
  id: string;
  name: string;
  color: string;
  module: string;
  created_at: string;
}

const TAG_MODULES = ['all', 'contacts', 'contractors', 'employees', 'tasks', 'documents'] as const;
const TAG_COLORS = [
  '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#D6AC50',
] as const;

function TagsManager() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [module, setModule] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('name');
    setTags((data as Tag[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setName(''); setColor('#6b7280'); setModule('all'); };

  const openAdd = () => { reset(); setShowForm(true); };
  const openEdit = (t: Tag) => {
    setEditing(t);
    setName(t.name);
    setColor(t.color);
    setModule(t.module);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Tag name is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = { name: name.trim(), color, module };
    try {
      if (editing) {
        const { error } = await supabase.from('tags').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('company_settings_saved', `Tag "${payload.name}" updated`, profile);
        toast({ title: 'Tag updated' });
      } else {
        const { error } = await supabase.from('tags').insert(payload);
        if (error) throw error;
        await logAudit('company_settings_saved', `Tag "${payload.name}" created`, profile);
        toast({ title: 'Tag created' });
      }
      setShowForm(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (t: Tag) => {
    const { error } = await supabase.from('tags').delete().eq('id', t.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('company_settings_saved', `Tag "${t.name}" deleted`, profile);
      toast({ title: 'Tag deleted' });
      load();
    }
  };

  if (loading) {
    return <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Global Tags</CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add tag
          </Button>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No tags yet. Tags can be used across Contacts, Contractors, Tasks, and Documents.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <div
                  key={t.id}
                  className="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50 kd-transition"
                  onClick={() => openEdit(t)}
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="font-medium">{t.name}</span>
                  {t.module !== 'all' && (
                    <span className="text-[10px] text-muted-foreground capitalize">({t.module})</span>
                  )}
                  <button
                    disabled={deletingTagId === t.id}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setDeletingTagId(t.id);
                      await handleDelete(t);
                      setDeletingTagId(null);
                    }}
                    className="opacity-0 group-hover:opacity-100 kd-transition ml-1 disabled:opacity-30"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP, Priority, Lagos" />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 kd-transition ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Module</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAG_MODULES.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m === 'all' ? 'All modules' : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Restrict this tag to a specific module or make it available everywhere.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
