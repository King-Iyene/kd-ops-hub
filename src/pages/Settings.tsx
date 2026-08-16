import { useCallback, useEffect, useRef, useState } from 'react';
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
  ArrowRightLeft,
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
  Wallet,
  Users,
  Lock,
  ShieldAlert,
  Download,
  Eye,
  EyeOff,
  Fuel,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/hooks/use-confirm';
import { compressImage, isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/image-compression';
import JSZip from 'jszip';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { formatNaira, setTimezoneCache } from '@/lib/format';
import { exportExpensePolicyPdf } from '@/lib/policy-pdf';
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
import TransferAuthSettings from '@/components/settings/TransferAuthSettings';
import EmailTemplatesSettings from '@/components/settings/EmailTemplatesSettings';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { PaymentEmailAudienceCard } from '@/components/settings/PaymentEmailAudienceCard';
import { PaymentRailsCard } from '@/components/settings/PaymentRailsCard';
import FxRateSettings from '@/components/settings/FxRateSettings';
import OfferLetterTemplatesAdmin from '@/components/hr/OfferLetterTemplatesAdmin';

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
  /** Platform-wide policy: when TRUE every user must enrol TOTP MFA.
   *  Toggle visible to super_admin only in Settings → Security. */
  mfa_required_for_all_users: boolean;
  /** When TRUE, approve/reject on payment batches and expenses requires a
   *  fresh password + TOTP re-verification (step-up) immediately before the
   *  action. Off by default — a super_admin opts in once approvers have
   *  enrolled TOTP, since enabling it for someone without TOTP blocks them
   *  from approving anything until they enrol. */
  approval_step_up_required: boolean;
  fuel_weekly_budgets: Record<string, number>;
  website_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  timezone: string;
  // Statutory filing identifiers — used by the Compliance filing pack
  // exporters (LIRS/FIRS/PenCom/NHF/NSITF/ITF). Optional; when blank the
  // export header prints "(missing — set in Settings)".
  state_of_business: string | null;
  pencom_employer_code: string | null;
  nhf_employer_code: string | null;
  nsitf_employer_code: string | null;
  itf_employer_code: string | null;
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
  // Snapshot of the Paystack mode/keys as loaded from the DB, so save() can
  // tell whether the operator actually touched that section THIS session.
  // Without this, saving an unrelated field (e.g. session timeout) re-runs
  // live/test key-prefix validation against whatever was already stored —
  // blocking the entire save on a pre-existing value nobody is editing.
  const loadedPaystackRef = useRef<{ sec: string } | null>(null);

  // Notification preferences are per-user, not company-wide.
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [digest, setDigest] = useState<'immediate' | 'hourly' | 'daily' | 'never'>('immediate');

  // How many approvers (super_admin/admin/operations) have TOTP enrolled —
  // shown next to the step-up toggle so a super_admin doesn't flip it on
  // blind and lock out anyone who hasn't set up 2FA yet.
  const [approverMfaStatus, setApproverMfaStatus] = useState<{ total: number; enrolled: number } | null>(null);

  // Expense category limits — controls for the "add a new limit" row
  const [newLimitCategory, setNewLimitCategory] = useState<string>('');
  const [newLimitAmount, setNewLimitAmount] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, notifRes, mfaStatusRes] = await Promise.all([
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
      profile?.role === 'super_admin'
        ? supabase.rpc('approver_totp_enrollment_status')
        : Promise.resolve({ data: null }),
    ]);
    const mfaRow = Array.isArray((mfaStatusRes as any)?.data)
      ? (mfaStatusRes as any).data[0]
      : (mfaStatusRes as any)?.data;
    if (mfaRow) {
      setApproverMfaStatus({ total: mfaRow.total_approvers, enrolled: mfaRow.enrolled_approvers });
    }
    const s = (settingsRes.data as CompanySettings) || null;
    setSettings(s);
    loadedPaystackRef.current = s
      ? { sec: (s as any).paystack_secret_key_enc || '' }
      : null;
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

    // Validate Paystack secret key prefix if the key was changed this session.
    const sec = (settings as any).paystack_secret_key_enc || '';
    const loaded = loadedPaystackRef.current;
    if (sec && loaded && loaded.sec !== sec) {
      if (!sec.startsWith('sk_test_') && !sec.startsWith('sk_live_')) {
        toast({
          title: 'Invalid Paystack secret key',
          description: 'Secret key must start with sk_test_ or sk_live_.',
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
        mfa_required_for_all_users: settings.mfa_required_for_all_users,
        approval_step_up_required: settings.approval_step_up_required,
        fuel_weekly_budgets: settings.fuel_weekly_budgets,
        website_url: settings.website_url || null,
        linkedin_url: settings.linkedin_url || null,
        instagram_url: settings.instagram_url || null,
        facebook_url: settings.facebook_url || null,
        twitter_url: settings.twitter_url || null,
        timezone: settings.timezone || 'Africa/Lagos',
        // Statutory filing identifiers (Compliance → filing pack)
        state_of_business: settings.state_of_business?.trim() || null,
        pencom_employer_code: settings.pencom_employer_code?.trim() || null,
        nhf_employer_code: settings.nhf_employer_code?.trim() || null,
        nsitf_employer_code: settings.nsitf_employer_code?.trim() || null,
        itf_employer_code: settings.itf_employer_code?.trim() || null,
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
    if (!validateFile(file, toast, 5)) {
      e.target.value = '';
      return;
    }
    const compressed = await compressImage(file);
    // Public "branding" bucket → getPublicUrl is permanent (no expiry), so the
    // logo keeps rendering on payslips/receipts indefinitely. (The old path used
    // the private documents bucket + a 1-year signed URL that silently expired.)
    const path = `company-logo-${Date.now()}-${compressed.name.replace(/[^a-z0-9.]+/gi, '_')}`;
    const { error } = await supabase.storage
      .from('branding')
      .upload(path, compressed, { upsert: true, contentType: compressed.type || undefined });
    if (error) {
      toast({ title: 'Logo upload failed', description: error.message, variant: 'destructive' });
      return;
    }
    const { data: pub } = supabase.storage.from('branding').getPublicUrl(path);
    patch({ logo_url: pub?.publicUrl || null });
    toast({ title: 'Logo uploaded — remember to Save' });
  };

  if (loading || !settings)
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
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

      <Tabs defaultValue="company" orientation="vertical" className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-6">
        <TabsList className="flex md:flex-col h-auto items-stretch md:items-start gap-1 bg-card md:bg-transparent border md:border-0 rounded-lg md:rounded-none p-2 md:p-0 md:sticky md:top-20 md:self-start overflow-x-auto md:overflow-visible">
          <p className="hidden md:block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-2">Configuration</p>
          <TabsTrigger value="company" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Building2 className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="integrations" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><LinkIcon className="mr-2 h-4 w-4" /> Integrations</TabsTrigger>
          <TabsTrigger value="policy" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><CreditCard className="mr-2 h-4 w-4" /> Expense policy</TabsTrigger>
          <TabsTrigger value="exchange_rate" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><ArrowRightLeft className="mr-2 h-4 w-4" /> Exchange rate</TabsTrigger>
          <TabsTrigger value="notifications" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Bell className="mr-2 h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="security" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><ShieldCheck className="mr-2 h-4 w-4" /> Security</TabsTrigger>
          {profile?.role === 'super_admin' && (
            <TabsTrigger value="transfer_auth" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Wallet className="mr-2 h-4 w-4" /> Transfer Authorization</TabsTrigger>
          )}
          {profile?.role === 'super_admin' && (
            <TabsTrigger value="email_templates" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Bell className="mr-2 h-4 w-4" /> Email Templates</TabsTrigger>
          )}
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="departments" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Network className="mr-2 h-4 w-4" /> Departments</TabsTrigger>
          )}
          <TabsTrigger value="tags" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Tags className="mr-2 h-4 w-4" /> Tags</TabsTrigger>
          {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
            <TabsTrigger value="retention" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Database className="mr-2 h-4 w-4" /> Data Retention</TabsTrigger>
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
                  <Label htmlFor="company_name">Company name</Label>
                  <Input
                    id="company_name"
                    value={settings.company_name || ''}
                    onChange={(e) => patch({ company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rc_number">RC number</Label>
                  <Input
                    id="rc_number"
                    value={settings.rc_number || ''}
                    onChange={(e) => patch({ rc_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company_tin">TIN</Label>
                  <Input
                    id="company_tin"
                    value={settings.tin || ''}
                    onChange={(e) => patch({ tin: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company_website">Website</Label>
                  <Input
                    id="company_website"
                    value={settings.website || ''}
                    onChange={(e) => patch({ website: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="registered_address">Registered address</Label>
                <Textarea
                  id="registered_address"
                  value={settings.address || ''}
                  onChange={(e) => patch({ address: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fiscal_year_preset">Fiscal year</Label>
                  <Select
                    value={settings.fiscal_year_preset}
                    onValueChange={(v) => patch({ fiscal_year_preset: v as any })}
                  >
                    <SelectTrigger id="fiscal_year_preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jan_dec">January – December</SelectItem>
                      <SelectItem value="apr_mar">April – March</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="platform_timezone">Platform timezone <InfoTip text="All dates and times across the platform — audit logs, transactions, approvals — display in this timezone. Default: Africa/Lagos (WAT, UTC+1)." /></Label>
                  <Select
                    value={settings.timezone || 'Africa/Lagos'}
                    onValueChange={(v) => patch({ timezone: v })}
                  >
                    <SelectTrigger id="platform_timezone">
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
                  <Label htmlFor="cash_on_hand_ngn">Cash on hand (₦)</Label>
                  <Input
                    id="cash_on_hand_ngn"
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
                    <Label htmlFor="external_monthly_burn_ngn">External monthly burn (₦)</Label>
                    <Input
                      id="external_monthly_burn_ngn"
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
                    <Label htmlFor="monthly_revenue_estimate_ngn">Monthly revenue estimate (₦)</Label>
                    <Input
                      id="monthly_revenue_estimate_ngn"
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

          {/* Statutory filing identifiers — printed on the LIRS / FIRS /
              PenCom / NHF / NSITF / ITF filing pack exports on the
              Compliance page. All optional; the pack still generates when
              blank, just prints "(missing — set in Settings)" in the header. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statutory filing identifiers</CardTitle>
              <p className="text-xs text-muted-foreground pt-1">
                Employer codes printed on statutory return schedules
                downloaded from the Compliance page. TIN and RC number are
                shared with the Company profile above.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="state_of_business">Default state of business</Label>
                  <Select
                    value={settings.state_of_business || '__none__'}
                    onValueChange={(v) =>
                      patch({ state_of_business: v === '__none__' ? null : v })
                    }
                  >
                    <SelectTrigger id="state_of_business">
                      <SelectValue placeholder="Select state…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Not set —</SelectItem>
                      {[
                        'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
                        'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe',
                        'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
                        'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
                        'Taraba','Yobe','Zamfara',
                      ].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Used when an employee has no explicit state of residence.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pencom_employer_code">PenCom employer code</Label>
                  <Input
                    id="pencom_employer_code"
                    value={settings.pencom_employer_code || ''}
                    onChange={(e) => patch({ pencom_employer_code: e.target.value })}
                    placeholder="Prints on PSSP schedule"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nhf_employer_code">NHF employer code</Label>
                  <Input
                    id="nhf_employer_code"
                    value={settings.nhf_employer_code || ''}
                    onChange={(e) => patch({ nhf_employer_code: e.target.value })}
                    placeholder="FMBN-issued"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nsitf_employer_code">NSITF employer code</Label>
                  <Input
                    id="nsitf_employer_code"
                    value={settings.nsitf_employer_code || ''}
                    onChange={(e) => patch({ nsitf_employer_code: e.target.value })}
                    placeholder="NSITF ECS registration"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="itf_employer_code">ITF employer code</Label>
                  <Input
                    id="itf_employer_code"
                    value={settings.itf_employer_code || ''}
                    onChange={(e) => patch({ itf_employer_code: e.target.value })}
                    placeholder="ITF annual return"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <OfferLetterTemplatesAdmin />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Social media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="website_url">Website URL</Label>
                  <Input
                    id="website_url"
                    value={settings.website_url || ''}
                    onChange={(e) => patch({ website_url: e.target.value })}
                    placeholder="https://kdsquares.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    value={settings.linkedin_url || ''}
                    onChange={(e) => patch({ linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="instagram_url">Instagram URL</Label>
                  <Input
                    id="instagram_url"
                    value={settings.instagram_url || ''}
                    onChange={(e) => patch({ instagram_url: e.target.value })}
                    placeholder="https://instagram.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="facebook_url">Facebook URL</Label>
                  <Input
                    id="facebook_url"
                    value={settings.facebook_url || ''}
                    onChange={(e) => patch({ facebook_url: e.target.value })}
                    placeholder="https://facebook.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="twitter_url">Twitter / X URL</Label>
                  <Input
                    id="twitter_url"
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
          {/* Payment Rails: super_admin-only toggle between Paystack and
              Flutterwave, with preflight + typed confirmation + audit trail. */}
          <PaymentRailsCard isSuperAdmin={profile?.role === 'super_admin'} />
          <Card id="paystack" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="text-base">Paystack</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Secret key (fallback)</Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${(settings as any).paystack_secret_key_enc ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                    {(settings as any).paystack_secret_key_enc ? 'Configured' : 'Not configured'}
                  </span>
                  {(settings as any).paystack_secret_key_enc && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={async () => { if (await confirm({ title: 'Remove Paystack key?', description: 'Remove the stored Paystack key? The env-var key will still be used if set.' })) patch({ paystack_secret_key_enc: null } as any); }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Manage via PAYSTACK_SECRET_KEY environment variable or Supabase vault.
                </p>
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-1">Paystack funding details</p>
              <p className="text-xs text-muted-foreground -mt-1">
                Shown on the Payments page so your team can fund the Paystack balance via bank transfer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="paystack_funding_bank">Bank name</Label>
                  <Input
                    id="paystack_funding_bank"
                    value={settings.paystack_funding_bank || ''}
                    onChange={(e) => patch({ paystack_funding_bank: e.target.value })}
                    placeholder="e.g. GTBank"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="paystack_funding_account_name">Account name</Label>
                  <Input
                    id="paystack_funding_account_name"
                    value={settings.paystack_funding_account_name || ''}
                    onChange={(e) => patch({ paystack_funding_account_name: e.target.value })}
                    placeholder="e.g. Paystack Payments"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="paystack_funding_account_number">Account number</Label>
                  <Input
                    id="paystack_funding_account_number"
                    value={settings.paystack_funding_account_number || ''}
                    onChange={(e) => patch({ paystack_funding_account_number: e.target.value })}
                    placeholder="e.g. 0123456789"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
                The secret key here is a fallback — edge functions prefer the
                <strong> PAYSTACK_SECRET_KEY</strong> environment variable set
                in Supabase/Vercel.
              </div>
            </CardContent>
          </Card>

          <NotificationsCard />

          <PaymentEmailAudienceCard />

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
                  <Label htmlFor="airtable_base_id">Base ID</Label>
                  <Input
                    id="airtable_base_id"
                    value={settings.airtable_base_id || ''}
                    onChange={(e) => patch({ airtable_base_id: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="airtable_income_table_id">Income table ID</Label>
                  <Input
                    id="airtable_income_table_id"
                    value={settings.airtable_income_table_id || ''}
                    onChange={(e) =>
                      patch({ airtable_income_table_id: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="airtable_expenses_table_id">Expenses table ID</Label>
                  <Input
                    id="airtable_expenses_table_id"
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
                  <Label htmlFor="smtp_host">Host</Label>
                  <Input
                    id="smtp_host"
                    value={settings.smtp_host || ''}
                    onChange={(e) => patch({ smtp_host: e.target.value })}
                    placeholder="smtp.sendgrid.net"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="smtp_port">Port</Label>
                  <Input
                    id="smtp_port"
                    type="number"
                    value={settings.smtp_port || ''}
                    onChange={(e) =>
                      patch({ smtp_port: Number(e.target.value) || null })
                    }
                    placeholder="587"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="smtp_username">Username</Label>
                  <Input
                    id="smtp_username"
                    value={settings.smtp_username || ''}
                    onChange={(e) => patch({ smtp_username: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="smtp_from_address">From address</Label>
                  <Input
                    id="smtp_from_address"
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
                  <Label htmlFor="resend_from_address">From address</Label>
                  <Input
                    id="resend_from_address"
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
                  <Label htmlFor="termii_sender_id">Sender ID</Label>
                  <Input
                    id="termii_sender_id"
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
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Expense category limits</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Per-category caps on what staff can submit. Categories without a
                  limit set are unrestricted. Submissions above the cap warn the
                  submitter at entry; the claim is still routed for approval but
                  flagged.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportExpensePolicyPdf({
                  companyName: settings.company_name || 'KD Squares',
                  logoUrl: settings.logo_url,
                  expenseLimits: settings.expense_limits || {},
                  dualApprovalThresholdNgn: Number(settings.dual_approval_threshold_ngn || 0),
                  generatedBy: profile?.full_name || profile?.email || undefined,
                })}
                className="shrink-0"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export policy PDF
              </Button>
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
                      <Label htmlFor="new_limit_category" className="text-xs text-muted-foreground">Add a category limit</Label>
                      <Select value={newLimitCategory} onValueChange={setNewLimitCategory}>
                        <SelectTrigger id="new_limit_category" className="h-9">
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
                      <Label htmlFor="new_limit_amount" className="text-xs text-muted-foreground">Amount (₦)</Label>
                      <Input
                        id="new_limit_amount"
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
        <TabsContent value="exchange_rate" className="mt-4 space-y-4">
          <FxRateSettings />
        </TabsContent>

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
                <Label htmlFor="digest_frequency">Digest frequency</Label>
                <Select
                  value={digest}
                  onValueChange={(v) => setDigest(v as any)}
                >
                  <SelectTrigger id="digest_frequency">
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

        {/* TRANSFER AUTHORIZATION (super admin only) -------------------- */}
        <TabsContent value="transfer_auth" className="mt-4 space-y-4">
          {profile?.role === 'super_admin' ? (
            <TransferAuthSettings />
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Transfer Authorization is only visible to Super Admins.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EMAIL TEMPLATES (super admin only) --------------------------- */}
        <TabsContent value="email_templates" className="mt-4 space-y-4">
          {profile?.role === 'super_admin' ? (
            <EmailTemplatesSettings />
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Email Templates is only visible to Super Admins.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SECURITY ----------------------------------------------------- */}
        <TabsContent value="security" className="mt-4 space-y-4">
          {/* Platform-wide 2FA policy. Toggle is super_admin only —
              admins shouldn't be able to relax their own 2FA
              requirement. When enabled, an MfaRequiredBanner shows
              non-dismissibly to every user without an enrolled
              factor, pointing them at /profile to set it up. */}
          {profile?.role === 'super_admin' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Two-factor authentication policy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <Switch
                    checked={!!settings.mfa_required_for_all_users}
                    onCheckedChange={(v) => patch({ mfa_required_for_all_users: v })}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium">Require 2FA for all users</p>
                    <p className="text-[12px] text-muted-foreground leading-snug">
                      When ON, every signed-in user without an enrolled authenticator factor sees a
                      non-dismissible banner pointing them to <span className="font-mono">/profile</span> to set up 2FA.
                      Users can still navigate the app while they enrol — once they enable an authenticator,
                      the banner disappears. Switch OFF to keep 2FA optional.
                    </p>
                  </div>
                </label>
              </CardContent>
            </Card>
          )}

          {profile?.role === 'super_admin' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Re-verification for approvals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <Switch
                    checked={!!settings.approval_step_up_required}
                    onCheckedChange={(v) => patch({ approval_step_up_required: v })}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium">Require password + 2FA re-verification to approve or reject</p>
                    <p className="text-[12px] text-muted-foreground leading-snug">
                      When ON, approving/rejecting a payment batch or expense prompts for a fresh
                      password and authenticator code immediately before the action — on top of
                      normal sign-in. Off by default; a stolen session alone isn't enough to move
                      money once this is on.
                    </p>
                  </div>
                </label>
                {approverMfaStatus && (
                  approverMfaStatus.enrolled < approverMfaStatus.total ? (
                    <p className="text-[12px] flex items-start gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-2.5 py-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Only {approverMfaStatus.enrolled} of {approverMfaStatus.total} approvers
                      (admin/operations/super_admin) have 2FA enrolled. Turning this on blocks the
                      rest from approving anything until they set it up in Profile → Security.
                    </p>
                  ) : (
                    <p className="text-[12px] flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-2.5 py-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      All {approverMfaStatus.total} approvers have 2FA enrolled — safe to turn on.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session + audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="session_timeout_minutes">Session timeout (minutes) <InfoTip text="Users are automatically signed out after this period of inactivity. Default: 120 minutes." /></Label>
                  <Input
                    id="session_timeout_minutes"
                    type="number"
                    min="1"
                    value={settings.session_timeout_minutes}
                    onChange={(e) =>
                      patch({
                        session_timeout_minutes: Number(e.target.value) || 120,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="audit_log_retention_days">Audit log retention (days)</Label>
                  <Input
                    id="audit_log_retention_days"
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

          <FailedLoginPanel />

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
                      { module: 'Payments (batches)',    sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                      { module: 'Expenses',              sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                      { module: 'Payroll / Payslips',    sa: true,  ad: true,  fi: true,  op: false, fs: false },
                      { module: 'Budgets',               sa: true,  ad: true,  fi: true,  op: false, fs: false },
                      { module: 'Fleet',                 sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                      { module: 'Contractors',           sa: true,  ad: true,  fi: true,  op: true,  fs: false },
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
                      { module: 'Documents',             sa: true,  ad: true,  fi: true,  op: false, fs: false },
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
              <p className="text-[11px] text-muted-foreground mt-2">
                <strong>Operations scope:</strong> within <em>Payments</em>, <em>Transactions</em> and contractor
                profiles, Operations sees <strong>only contractor batches</strong> (no Quick Pay, no salary runs, no
                advances, no bonuses, no expense pay-outs). Archived batches are hidden for all roles except
                super_admin / admin. These rules are enforced at the database (RLS) — they hold even against
                direct API calls.
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
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;

// ---------------------------------------------------------------------------
// Failed Login panel — Security tab
// ---------------------------------------------------------------------------

interface FailedLogin {
  id: string;
  email: string;
  ip_hash: string | null;
  reason: string | null;
  attempted_at: string;
}

function FailedLoginPanel() {
  // This panel is admin-only (gated by the surrounding tab), and the
  // operator triaging a brute-force attempt needs to see actual email
  // addresses — patterns (same address hammered, same domain, etc.) are
  // the whole point of having the panel. Default to unmasked. The Mask
  // button is still available for screen-share situations where the
  // operator doesn't want third parties to see the addresses.
  const [rows, setRows] = useState<FailedLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [unmasked, setUnmasked] = useState(true);
  const PAGE_SIZE = 10;

  useEffect(() => {
    supabase
      .from('failed_login_attempts')
      .select('id, email, ip_hash, reason, attempted_at')
      .gte('attempted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('attempted_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows((data as FailedLogin[]) || []);
        setLoading(false);
      });
  }, []);

  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    // Show first 2 chars of the local part, mask the rest, keep the
    // domain intact. So real attempts like noreply@bot.ru render as
    // "no***@bot.ru" — not a placeholder. Toggle "Unmask" to see the
    // full address (audit-logged).
    return local.slice(0, 2) + '***@' + domain;
  };

  const relativeTime = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMins = Math.round(diffMs / 60_000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.round(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.round(diffHrs / 24)}d ago`;
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Failed login attempts
              <span className="text-xs font-normal text-muted-foreground ml-1">(last 30 days)</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground max-w-xl">
              Every wrong password / unknown email hitting the sign-in screen lands here. Use it to
              spot brute-force attempts (same address hammered repeatedly, same hashed IP across
              many users), enumeration scans (lots of one-off addresses on the same domain), and to
              decide when to enable the temporary IP block on the security settings card below.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setUnmasked((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 kd-transition shrink-0"
              title={unmasked ? 'Hide full email addresses (for screen-share)' : 'Show full email addresses'}
            >
              {unmasked ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {unmasked ? 'Mask' : 'Unmask'}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No failed login attempts in the last 30 days.</p>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-muted-foreground border-b">
              {rows.length} total — showing {slice.length} on this page.{' '}
              {unmasked
                ? 'Full email addresses visible.'
                : 'Email addresses partially masked for privacy.'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">IP (hashed)</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {slice.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-4 font-mono">{unmasked ? r.email : maskEmail(r.email)}</td>
                      <td className="py-2 px-4 text-muted-foreground">{r.reason || '—'}</td>
                      <td className="py-2 px-4 font-mono text-muted-foreground">
                        {r.ip_hash ? r.ip_hash.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{relativeTime(r.attempted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t text-[11px] text-muted-foreground">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="h-7 px-2">
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-7 px-2">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
      'data_retention_action',
      `Data retention ${next ? 'PAUSED ALL' : 'RESUMED ALL'} by admin`,
      profile,
    );
    toast({ title: next ? 'All retention paused' : 'Retention resumed' });
    loadPolicies();
  };

  const runNow = async (p: RetentionPolicy) => {
    if (!(await confirm({
      title: 'Run cleanup now?',
      description:
        `Run cleanup for "${RETENTION_META[p.data_type].title}" right now?\n\n` +
        `This will archive (and ${p.mode === 'archive_delete' ? 'DELETE' : 'KEEP'}) rows older than ` +
        `${p.retention_days} days. Cannot be undone after the archive expires (90 days).`,
      variant: 'destructive',
    }))) return;

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

      {/* ── Full Platform Export ─────────────────────────────────── */}
      <PlatformExportCard />

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

// ---------------------------------------------------------------------------
// Full Platform Export — downloads all business data as a ZIP of CSVs
// ---------------------------------------------------------------------------

const EXPORT_TABLES = [
  { name: 'profiles', label: 'Employees', category: 'HR' },
  { name: 'departments', label: 'Departments', category: 'HR' },
  { name: 'attendance_records', label: 'Attendance', category: 'HR' },
  { name: 'leave_requests', label: 'Leave requests', category: 'HR' },
  { name: 'leave_balances', label: 'Leave balances', category: 'HR' },
  { name: 'training_records', label: 'Training records', category: 'HR' },
  { name: 'disciplinary_records', label: 'Disciplinary records', category: 'HR' },
  { name: 'performance_reviews', label: 'Performance reviews', category: 'HR' },
  { name: 'onboarding_checklists', label: 'Onboarding', category: 'HR' },
  { name: 'terminations', label: 'Terminations', category: 'HR' },
  { name: 'salary_history', label: 'Salary history', category: 'HR' },
  { name: 'contractors', label: 'Contractors', category: 'HR' },
  { name: 'job_openings', label: 'Job openings', category: 'HR' },
  { name: 'job_applicants', label: 'Job applicants', category: 'HR' },

  { name: 'expenses', label: 'Expenses', category: 'Finance' },
  { name: 'invoices', label: 'Invoices', category: 'Finance' },
  { name: 'revenue_entries', label: 'Revenue', category: 'Finance' },
  { name: 'budgets', label: 'Budgets', category: 'Finance' },
  { name: 'budget_items', label: 'Budget items', category: 'Finance' },
  { name: 'payment_batches', label: 'Payment batches', category: 'Finance' },
  { name: 'batch_items', label: 'Batch items', category: 'Finance' },
  { name: 'petty_cash_funds', label: 'Petty cash funds', category: 'Finance' },
  { name: 'petty_cash_entries', label: 'Petty cash entries', category: 'Finance' },
  { name: 'vendors', label: 'Vendors', category: 'Finance' },

  { name: 'payroll_runs', label: 'Payroll runs', category: 'Payroll' },
  { name: 'payroll_run_items', label: 'Payroll items', category: 'Payroll' },
  { name: 'payslips', label: 'Payslips', category: 'Payroll' },
  { name: 'employee_benefits', label: 'Benefits', category: 'Payroll' },
  { name: 'employee_deductions', label: 'Deductions', category: 'Payroll' },
  { name: 'employee_loans', label: 'Loans', category: 'Payroll' },
  { name: 'loan_repayments', label: 'Loan repayments', category: 'Payroll' },

  { name: 'vehicles', label: 'Vehicles', category: 'Fleet' },
  { name: 'trip_logs', label: 'Trip logs', category: 'Fleet' },
  { name: 'fuel_requests', label: 'Fuel requests', category: 'Fleet' },
  { name: 'vehicle_maintenance', label: 'Maintenance', category: 'Fleet' },
  { name: 'vehicle_inspections', label: 'Inspections', category: 'Fleet' },
  { name: 'fleet_incidents', label: 'Incidents', category: 'Fleet' },
  { name: 'driver_assignments', label: 'Driver assignments', category: 'Fleet' },
  { name: 'geofences', label: 'Geofences', category: 'Fleet' },

  { name: 'tasks', label: 'Tasks', category: 'Operations' },
  { name: 'projects', label: 'Projects', category: 'Operations' },
  { name: 'documents', label: 'Documents', category: 'Operations' },
  { name: 'assets', label: 'Assets', category: 'Operations' },

  { name: 'clients', label: 'Clients', category: 'CRM' },
  { name: 'contacts', label: 'Contacts', category: 'CRM' },
  { name: 'referral_partners', label: 'Referral partners', category: 'CRM' },

  { name: 'compliance_filings', label: 'Compliance filings', category: 'Compliance' },
  { name: 'audit_logs', label: 'Audit log', category: 'Compliance' },
] as const;

function PlatformExportCard() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [tablesDone, setTablesDone] = useState(0);

  const isSuperAdmin = profile?.role === 'super_admin';

  const runExport = async () => {
    if (!isSuperAdmin) return;
    setExporting(true);
    setTablesDone(0);
    setProgress('Preparing export…');

    try {
      const zip = new JSZip();
      let totalRows = 0;
      const errors: string[] = [];

      for (let i = 0; i < EXPORT_TABLES.length; i++) {
        const t = EXPORT_TABLES[i];
        setProgress(`Exporting ${t.label}… (${i + 1}/${EXPORT_TABLES.length})`);
        setTablesDone(i);

        try {
          const allRows: Record<string, unknown>[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from(t.name as any)
              .select('*')
              .range(from, from + pageSize - 1)
              .order('created_at' as any, { ascending: false });

            if (error) throw error;
            if (!data || data.length === 0) {
              hasMore = false;
            } else {
              allRows.push(...(data as Record<string, unknown>[]));
              from += pageSize;
              if (data.length < pageSize) hasMore = false;
            }
          }

          if (allRows.length > 0) {
            const headers = Object.keys(allRows[0]);
            const csvRows = allRows.map((row) =>
              headers.map((h) => {
                const v = row[h];
                if (v === null || v === undefined) return '';
                const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
                if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
                return s;
              }).join(','),
            );
            const csv = [headers.join(','), ...csvRows].join('\n');
            zip.file(`${t.category}/${t.name}.csv`, csv);
            totalRows += allRows.length;
          }
        } catch (err: any) {
          errors.push(`${t.name}: ${err?.message || 'Unknown error'}`);
        }
      }

      setProgress('Building ZIP file…');

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const manifest = [
        `KD Ops Hub — Full Platform Export`,
        `Date: ${stamp}`,
        `Exported by: ${profile?.full_name || profile?.email || 'admin'}`,
        `Tables: ${EXPORT_TABLES.length}`,
        `Total rows: ${totalRows.toLocaleString()}`,
        ``,
        errors.length ? `Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}` : 'No errors.',
      ].join('\n');
      zip.file('_manifest.txt', manifest);

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kd-ops-hub-export-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logAudit(
        'platform_export',
        `Full platform export: ${EXPORT_TABLES.length} tables, ${totalRows.toLocaleString()} rows`,
        profile,
      );

      toast({
        title: 'Export complete',
        description: `${totalRows.toLocaleString()} rows across ${EXPORT_TABLES.length} tables downloaded as ZIP.${errors.length ? ` ${errors.length} table(s) had errors.` : ''}`,
      });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message, variant: 'destructive' });
    } finally {
      setExporting(false);
      setProgress('');
      setTablesDone(0);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Full platform export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Download <strong>all business data</strong> as a ZIP file containing one
          CSV per table, organized by category (HR, Finance, Payroll, Fleet,
          Operations, CRM, Compliance). Includes{' '}
          <strong>{EXPORT_TABLES.length} tables</strong>.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {['HR', 'Finance', 'Payroll', 'Fleet', 'Operations', 'CRM', 'Compliance'].map((cat) => {
            const count = EXPORT_TABLES.filter((t) => t.category === cat).length;
            if (!count) return null;
            return (
              <div key={cat} className="rounded-lg border bg-card px-3 py-2">
                <p className="text-muted-foreground">{cat}</p>
                <p className="font-semibold mt-0.5">{count} table{count > 1 ? 's' : ''}</p>
              </div>
            );
          })}
        </div>

        {exporting && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress}
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((tablesDone / EXPORT_TABLES.length) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t pt-3">
          <Button
            onClick={runExport}
            disabled={exporting || !isSuperAdmin}
            size="sm"
          >
            {exporting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-2 h-3.5 w-3.5" />
            )}
            {exporting ? 'Exporting…' : 'Download full backup'}
          </Button>
          {!isSuperAdmin && (
            <p className="text-xs text-muted-foreground">Super admin access required.</p>
          )}
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            This exports database records only — not uploaded files (receipts,
            documents, photos). Those are stored in Supabase Storage and can be
            downloaded from the Supabase dashboard. A daily automated{' '}
            <code className="text-[11px] bg-muted px-1 rounded">pg_dump</code>{' '}
            backup also runs via GitHub Actions (retained 30 days).
          </p>
        </div>
      </CardContent>
    </Card>
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
      'data_retention_action',
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
    if (!(await confirm({ title: 'Disable policy?', description: 'Disable this retention policy? Future scheduled runs will not execute.', variant: 'destructive' }))) return;
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
                <Label htmlFor="archive_mode" className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger id="archive_mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="archive">Archive only (recommended)</SelectItem>
                    <SelectItem value="archive_delete">Archive + delete (advanced)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="archive_retention_days" className="text-xs">Retention period</Label>
                <Select value={String(retentionDays)} onValueChange={(v) => setRetentionDays(Number(v))}>
                  <SelectTrigger id="archive_retention_days"><SelectValue /></SelectTrigger>
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
      supabase.from('profiles_directory').select('id, full_name').order('full_name'),
      supabase.from('profiles_directory').select('department_id').not('department_id', 'is', null),
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
      .eq('department_id', d.id)
      .is('deleted_at', null);
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
            <div className="overflow-x-auto">
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
            </div>
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
              <Label htmlFor="department_name">Name</Label>
              <Input id="department_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operations" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="department_description">Description</Label>
              <Input id="department_description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="department_head">Head of department</Label>
              <Select value={headId || '__none__'} onValueChange={(v) => setHeadId(v === '__none__' ? '' : v)}>
                <SelectTrigger id="department_head">
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
              <Label htmlFor="tag_name">Name</Label>
              <Input id="tag_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP, Priority, Lagos" />
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
              <Label htmlFor="tag_module">Module</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger id="tag_module"><SelectValue /></SelectTrigger>
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
