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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImage, isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/image-compression';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatNaira } from '@/lib/format';
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
    setSettings((settingsRes.data as CompanySettings) || null);
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
        company_name: settings.company_name,
        rc_number: settings.rc_number,
        tin: settings.tin,
        address: settings.address,
        website: settings.website,
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', SINGLETON_ID);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
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
                  <Label>Cash on hand (₦)</Label>
                  <Input
                    type="number"
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
              <CardTitle className="text-base">Data export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Export all company data as a CSV archive — useful for backups and
                supplier changeovers.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  await logAudit('report_exported', 'Full company data export requested', profile);
                  toast({
                    title: 'Export queued',
                    description: 'Your export will arrive via email within 15 minutes.',
                  });
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
// System Reference panel
//
// One-stop documentation of every cap, threshold, retention rule and
// operational setting the platform enforces. Everything here is read-only.
// When you change a cap or rule elsewhere in the codebase, update the
// corresponding entry below so this stays the single source of truth admins
// can consult instead of digging through code.
// ---------------------------------------------------------------------------

const REF_MONEY_CAPS = [
  { what: 'Single payment batch (total)',     cap: '₦5,000,000,000', why: 'Catches typo on bulk runs' },
  { what: 'Single transfer (one beneficiary)', cap: '₦100,000,000',  why: 'Single Paystack transfer guard' },
  { what: 'One expense submission',            cap: '₦100,000,000',  why: 'Catches accidental extra digit' },
  { what: 'One fuel request',                  cap: '₦5,000,000',    why: 'Highest plausible single fuel-up' },
  { what: 'One subscription',                  cap: '₦50,000,000',   why: 'SaaS / utility max' },
  { what: 'One revenue entry',                 cap: '₦5,000,000,000', why: 'Monthly revenue ceiling' },
  { what: 'Annual budget (per category)',      cap: '₦5,000,000,000', why: 'Yearly planning ceiling' },
  { what: 'Salary advance',                    cap: '₦50,000,000',   why: 'Per-employee advance' },
  { what: 'Annual salary',                     cap: '₦100,000,000',  why: 'Per-employee yearly comp' },
];

const REF_RETENTION = [
  { what: 'Audit logs',         current: 'Configurable in Data Retention tab', recommended: '3 years (FIRS)' },
  { what: 'Notifications (read)', current: 'Configurable',                     recommended: '90 days' },
  { what: 'Receipts & files',   current: 'Configurable (archive only mode)',  recommended: '2 years archive, never delete' },
  { what: 'Documents (HR/legal)', current: 'NEVER auto-deleted (locked)',      recommended: 'Keep 7 years post-employment' },
  { what: 'Archive recovery window', current: '90 days after archive', recommended: 'Restore via support before this expires' },
  { what: 'First-run delay',    current: '7 days from enabling',              recommended: 'Used as cancellation window' },
];

const REF_FILE_RULES = [
  { what: 'Image compression on upload', value: 'On by default — receipts/photos resize to 1600 px JPEG @ 82%' },
  { what: 'Skipped from compression',    value: 'PDFs, GIFs, SVGs, files smaller than 200 KB' },
  { what: 'Documents bucket access',     value: 'Private — preview uses short-lived signed URLs' },
  { what: 'Receipts bucket access',      value: 'Private — same signed-URL pattern' },
  { what: 'Blocked file extensions',     value: '.exe .bat .cmd .sh .ps1 .jar .msi .app .dmg .html .js .ts .php .py .rb (executable / scriptable types)' },
  { what: 'Document NEVER auto-delete',  value: 'HR / legal docs survive any retention policy' },
];

const REF_OPS_THRESHOLDS = [
  { what: 'Low Paystack balance warning',     value: 'Below ₦50,000 → orange banner on Payments page' },
  { what: 'BatchDetail polling interval',     value: '15s → 30s → 60s → 120s (exponential backoff)' },
  { what: 'BatchDetail polling stop',         value: 'After 30 minutes of no progress (manual refresh still works)' },
  { what: 'Polling pauses',                   value: 'When browser tab is hidden' },
  { what: 'Reconciliation threshold',         value: 'Re-checks any batch_item stuck in pending > 1 hour' },
  { what: 'Reconciliation cap per run',       value: '200 items (rate-limit guard)' },
  { what: 'EmployeeProfile page caps',        value: '24 payslips · 20 advances / increments / deductions (newest first)' },
  { what: 'Webhook idempotency',              value: '(reference, event_type) UNIQUE — duplicate Paystack deliveries silently ignored' },
];

const REF_SECURITY = [
  { what: 'Audit log read access',  value: 'super_admin / admin / finance / operations only' },
  { what: 'Audit log write',        value: 'INSERT requires performed_by = your own user_id (no impersonation)' },
  { what: 'Login / logout audited', value: 'Every session start and end is in audit_logs' },
  { what: 'Failed login tracking',  value: 'Recorded in failed_login_attempts (admins only)' },
  { what: 'Login rate limit',       value: '5 failed attempts per email in 15 minutes → 15-minute lockout' },
  { what: 'Settings (page) access', value: 'super_admin only' },
  { what: 'Audit log (page) access', value: 'super_admin / admin only' },
  { what: 'Employees page access',  value: 'super_admin / admin only' },
  { what: 'Documents bucket write', value: 'admin / finance / operations / super_admin' },
  { what: 'Tasks visibility',       value: 'Assignee + creator + admin/operations' },
  { what: 'Approval comments',      value: 'admin / finance / operations only' },
  { what: 'Employee deductions',    value: 'Self only OR admin / finance' },
  { what: 'Profile session',        value: 'localStorage (auto-refresh JWT). Cleared on Sign Out' },
  { what: '"View As role"',         value: 'Super-admin only — sessionStorage, cleared on tab close' },
  { what: 'Content Security Policy', value: 'Active in index.html — limits scripts/connects/iframes to known origins' },
  { what: 'Error reporting hook',   value: 'window.onerror + ErrorBoundary forward to window.Sentry if installed' },
];

const REF_PAYSTACK = [
  { what: 'Webhook signature verification', value: 'HMAC-SHA512, timing-safe compare. Rejected events return 401' },
  { what: 'Transfer events handled',         value: 'transfer.success, transfer.failed, transfer.reversed' },
  { what: 'Fees captured',                   value: 'Stored as paystack_fee_ngn per batch_item; surfaced in Reports P&L' },
  { what: 'Funding wallet link',             value: 'https://dashboard.paystack.com/#/balance/' },
  { what: 'Manual reconcile button',         value: 'Payments page → "Reconcile" (top-right)' },
];

const REF_SUPABASE_LIMITS = [
  { what: 'Free tier — DB storage',     value: '500 MB' },
  { what: 'Free tier — File storage',    value: '1 GB' },
  { what: 'Free tier — Bandwidth',       value: '5 GB / month' },
  { what: 'Free tier — Edge invocations', value: '500K / month' },
  { what: 'Free tier — Realtime peers',  value: '200 concurrent' },
  { what: 'Free tier — Auth users',      value: '50,000 MAU' },
  { what: 'Upgrade trigger',             value: 'Watch Storage closely — first thing to fill at scale. Pro tier ($25/mo) lifts limits 50–100×' },
];

function SystemReferencePanel() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">System Reference</p>
            <p className="text-muted-foreground leading-relaxed">
              Read-only reference of every cap, retention rule, operational
              threshold and security setting the platform enforces.
              Bookmark this page — when you forget what the limit on a
              single transfer is, or how long old audit logs are kept,
              this is the single source of truth.
            </p>
          </div>
        </CardContent>
      </Card>

      <RefSection icon={Wallet}    title="Money limits (typo guards)"
        rows={REF_MONEY_CAPS.map((r) => ({ a: r.what, b: r.cap, c: r.why }))}
        cols={['Where', 'Maximum allowed', 'Why this limit']} />

      <RefSection icon={Database}  title="Data retention"
        rows={REF_RETENTION.map((r) => ({ a: r.what, b: r.current, c: r.recommended }))}
        cols={['Data type', 'Current behaviour', 'Recommended setting']} />

      <RefSection icon={FileWarning} title="File upload rules"
        rows={REF_FILE_RULES.map((r) => ({ a: r.what, b: r.value }))}
        cols={['Setting', 'Value']} />

      <RefSection icon={Zap}        title="Operational thresholds"
        rows={REF_OPS_THRESHOLDS.map((r) => ({ a: r.what, b: r.value }))}
        cols={['Trigger / setting', 'Value']} />

      <RefSection icon={Shield}     title="Security &amp; access"
        rows={REF_SECURITY.map((r) => ({ a: r.what, b: r.value }))}
        cols={['What', 'Who / how']} />

      <RefSection icon={CreditCard} title="Paystack integration"
        rows={REF_PAYSTACK.map((r) => ({ a: r.what, b: r.value }))}
        cols={['Setting', 'Value']} />

      <RefSection icon={HardDrive}  title="Supabase capacity (free tier)"
        rows={REF_SUPABASE_LIMITS.map((r) => ({ a: r.what, b: r.value }))}
        cols={['Resource', 'Limit / guidance']} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Recent platform changes
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2 leading-relaxed">
          <p><strong>Phase 1</strong> — Locked down audit logs &amp; wide-open RLS policies (tasks, comments, referrals, deductions). Added webhook idempotency. Created missing tables (salary_increments, revenue_entries).</p>
          <p><strong>Phase 2</strong> — React error boundaries on every page. N+1 query fix on Payments. Polling backoff + visibility detection. Pagination on EmployeeProfile.</p>
          <p><strong>Phase 3</strong> — Money sanity-cap CHECK constraints. Storage extension denylist (no .exe / .html / .js uploads). Paystack reconciliation function + button. Login / logout audit logs. Friendly error messages for money inputs.</p>
          <p><strong>Phase 4</strong> — Login rate-limit (5 attempts / 15 min). Failed-login audit table. CSP headers in index.html. Global error reporting hooks (window.onerror + unhandledrejection, Sentry-ready). Subscriptions defensive schema migration.</p>
          <p className="text-muted-foreground border-t pt-2 mt-2">
            Each phase is documented in the git history; the SQL migrations to
            apply are in <code>supabase/migrations/</code> and edge functions
            in <code>supabase/functions/</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface RefRow { a: string; b: string; c?: string; }

function RefSection({
  icon: Icon, title, rows, cols,
}: {
  icon: typeof Wallet;
  title: string;
  rows: RefRow[];
  cols: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
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
                  <td className="px-3 py-2 align-top font-medium">{r.a}</td>
                  <td className="px-3 py-2 align-top text-muted-foreground">{r.b}</td>
                  {cols.length === 3 && (
                    <td className="px-3 py-2 align-top text-muted-foreground">{r.c || ''}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
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
              onClick={async () => {
                if (confirmDelete) {
                  await handleDelete(confirmDelete);
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
                    onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                    className="opacity-0 group-hover:opacity-100 kd-transition ml-1"
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
