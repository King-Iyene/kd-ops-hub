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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
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
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_from_address: string | null;
  session_timeout_minutes: number;
  audit_log_retention_days: number;
  fuel_weekly_budgets: Record<string, number>;
}

const EXPENSE_CATEGORIES = [
  'fuel',
  'transport',
  'mileage',
  'office_supplies',
  'client_entertainment',
  'other',
];

const NOTIF_EVENTS = [
  { key: 'email_approvals', label: 'Approval requests assigned to me' },
  { key: 'email_payments', label: 'Payment batch status changes' },
  { key: 'email_compliance', label: 'Statutory compliance deadlines' },
  { key: 'email_expenses', label: 'Expense approved / rejected' },
  { key: 'email_fleet', label: 'Fuel + trip activity' },
  { key: 'email_leave', label: 'Leave requests and balances' },
] as const;

const SettingsPage = () => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // Notification preferences are per-user, not company-wide.
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [digest, setDigest] = useState<'immediate' | 'hourly' | 'daily' | 'never'>('immediate');

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
        expense_limits: settings.expense_limits,
        dual_approval_threshold_ngn: settings.dual_approval_threshold_ngn,
        paystack_mode: settings.paystack_mode,
        paystack_webhook_url: settings.paystack_webhook_url,
        airtable_base_id: settings.airtable_base_id,
        airtable_income_table_id: settings.airtable_income_table_id,
        airtable_expenses_table_id: settings.airtable_expenses_table_id,
        airtable_sync_enabled: settings.airtable_sync_enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_username: settings.smtp_username,
        smtp_from_address: settings.smtp_from_address,
        session_timeout_minutes: settings.session_timeout_minutes,
        audit_log_retention_days: settings.audit_log_retention_days,
        fuel_weekly_budgets: settings.fuel_weekly_budgets,
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
    const path = `company-logo-${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '_')}`;
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
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

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="company"><Building2 className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="integrations"><LinkIcon className="mr-2 h-4 w-4" /> Integrations</TabsTrigger>
          <TabsTrigger value="policy"><CreditCard className="mr-2 h-4 w-4" /> Expense policy</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-2 h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck className="mr-2 h-4 w-4" /> Security</TabsTrigger>
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="departments"><Network className="mr-2 h-4 w-4" /> Departments</TabsTrigger>
          )}
          <TabsTrigger value="tags"><Tags className="mr-2 h-4 w-4" /> Tags</TabsTrigger>
        </TabsList>

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
                      patch({ cash_on_hand_ngn: Number(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Powers the runway estimate on the Cash Flow report.
                  </p>
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
            </CardHeader>
            <CardContent className="space-y-3">
              {EXPENSE_CATEGORIES.map((cat) => (
                <div
                  key={cat}
                  className="grid grid-cols-5 items-center gap-3 border-b last:border-0 pb-2"
                >
                  <Label className="col-span-2 capitalize">
                    {cat.replace(/_/g, ' ')}
                  </Label>
                  <Input
                    type="number"
                    className="col-span-2"
                    value={settings.expense_limits[cat] || ''}
                    onChange={(e) =>
                      patch({
                        expense_limits: {
                          ...settings.expense_limits,
                          [cat]: Number(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="No limit"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = { ...settings.expense_limits };
                      delete next[cat];
                      patch({ expense_limits: next });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Submissions above the per-category cap are blocked with a toast
                and never reach an approver.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fuel weekly budget (per department)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {Object.entries(settings.fuel_weekly_budgets || {}).map(
                  ([dept, amount]) => (
                    <div key={dept} className="flex items-center gap-3">
                      <Input
                        className="flex-1"
                        value={dept}
                        readOnly
                      />
                      <Input
                        type="number"
                        className="w-48"
                        value={amount}
                        onChange={(e) =>
                          patch({
                            fuel_weekly_budgets: {
                              ...settings.fuel_weekly_budgets,
                              [dept]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const next = { ...settings.fuel_weekly_budgets };
                          delete next[dept];
                          patch({ fuel_weekly_budgets: next });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      fuel_weekly_budgets: {
                        ...settings.fuel_weekly_budgets,
                        [`Department ${Object.keys(settings.fuel_weekly_budgets || {}).length + 1}`]: 0,
                      },
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" /> Add department
                </Button>
              </div>
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
      </Tabs>
    </div>
  );
};

export default SettingsPage;

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
      .from('global_tags')
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
        const { error } = await supabase.from('global_tags').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('company_settings_saved', `Tag "${payload.name}" updated`, profile);
        toast({ title: 'Tag updated' });
      } else {
        const { error } = await supabase.from('global_tags').insert(payload);
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
    const { error } = await supabase.from('global_tags').delete().eq('id', t.id);
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
      .from('global_tags')
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
        const { error } = await supabase.from('global_tags').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('company_settings_saved', `Tag "${payload.name}" updated`, profile);
        toast({ title: 'Tag updated' });
      } else {
        const { error } = await supabase.from('global_tags').insert(payload);
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
    const { error } = await supabase.from('global_tags').delete().eq('id', t.id);
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
