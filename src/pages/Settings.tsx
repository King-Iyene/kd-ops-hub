import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Link as LinkIcon,
  ShieldCheck,
  Bell,
  Loader2,
  Save,
  CreditCard,
  ArrowRightLeft,
  Network,
  Tags,
  Info,
  AlertTriangle,
  Activity,
  Database,
  Archive,
  ImageIcon,
  Clock,
  Wallet,
  CalendarDays,
  Download,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/hooks/use-confirm';
import { isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/image-compression';
import JSZip from 'jszip';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { errorMessage } from '@/lib/db-errors';
import { setTimezoneCache } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import TransferAuthSettings from '@/components/settings/TransferAuthSettings';
import EmailTemplatesSettings from '@/components/settings/EmailTemplatesSettings';
import FxRateSettings from '@/components/settings/FxRateSettings';
import LeaveSettings from '@/components/settings/LeaveSettings';
import CompanyTab from '@/components/settings/CompanyTab';
import StatutorySettingsTab from '@/components/settings/StatutorySettingsTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import ExpensePolicyTab from '@/components/settings/ExpensePolicyTab';
import NotificationPrefsTab from '@/components/settings/NotificationPrefsTab';
import SecurityTab from '@/components/settings/SecurityTab';

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
  mfa_required_for_all_users: boolean;
  approval_step_up_required: boolean;
  fuel_weekly_budgets: Record<string, number>;
  website_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  timezone: string;
  state_of_business: string | null;
  pencom_employer_code: string | null;
  nhf_employer_code: string | null;
  nsitf_employer_code: string | null;
  itf_employer_code: string | null;
  pension_enabled: boolean;
  paye_enabled: boolean;
  nhf_enabled: boolean;
  nhis_enabled: boolean;
  nsitf_enabled: boolean;
  itf_enabled: boolean;
  development_levy_enabled: boolean;
  development_levy_annual_ngn: number;
  leave_carryover_max_days: number;
}

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
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [digest, setDigest] = useState<'immediate' | 'hourly' | 'daily' | 'never'>('immediate');

  const [approverMfaStatus, setApproverMfaStatus] = useState<{ total: number; enrolled: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, notifRes, mfaStatusRes] = await Promise.all([
      supabase
        .from('company_settings')
        .select('company_name, rc_number, tin, address, website, logo_url, fiscal_year_preset, currency_code, usd_rate, cash_on_hand_ngn, external_monthly_burn_ngn, monthly_revenue_estimate_ngn, cash_updated_at, expense_limits, dual_approval_threshold_ngn, paystack_secret_configured, airtable_base_id, airtable_income_table_id, airtable_expenses_table_id, airtable_sync_enabled, paystack_funding_bank, paystack_funding_account_name, paystack_funding_account_number, resend_from_address, resend_api_key_configured, termii_sender_id, termii_api_key_configured, whatsapp_enabled, sms_enabled, smtp_host, smtp_port, smtp_username, smtp_from_address, session_timeout_minutes, audit_log_retention_days, mfa_required_for_all_users, approval_step_up_required, fuel_weekly_budgets, website_url, linkedin_url, instagram_url, facebook_url, twitter_url, timezone, state_of_business, pencom_employer_code, nhf_employer_code, nsitf_employer_code, itf_employer_code, pension_enabled, paye_enabled, nhf_enabled, nhis_enabled, nsitf_enabled, itf_enabled, development_levy_enabled, development_levy_annual_ngn, leave_carryover_max_days')
        .eq('id', SINGLETON_ID)
        .maybeSingle(),
      profile?.id
        ? supabase
            .from('notification_preferences')
            .select('email_approvals, email_payments, email_compliance, email_expenses, email_fleet, email_leave, digest_frequency')
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
    if (s?.timezone) setTimezoneCache(s.timezone);
    if ((notifRes as any).data) {
      const d = (notifRes as any).data;
      const prefs: Record<string, boolean> = {};
      for (const e of NOTIF_EVENTS) prefs[e.key] = Boolean(d[e.key]);
      setNotifPrefs(prefs);
      setDigest(d.digest_frequency || 'immediate');
    } else {
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
        paystack_secret_configured: !!(settings as any).paystack_secret_configured,
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
        state_of_business: settings.state_of_business?.trim() || null,
        pencom_employer_code: settings.pencom_employer_code?.trim() || null,
        nhf_employer_code: settings.nhf_employer_code?.trim() || null,
        nsitf_employer_code: settings.nsitf_employer_code?.trim() || null,
        itf_employer_code: settings.itf_employer_code?.trim() || null,
        leave_carryover_max_days: settings.leave_carryover_max_days,
        pension_enabled: settings.pension_enabled ?? true,
        paye_enabled: settings.paye_enabled ?? true,
        nhf_enabled: settings.nhf_enabled ?? false,
        nhis_enabled: settings.nhis_enabled ?? false,
        nsitf_enabled: settings.nsitf_enabled ?? false,
        itf_enabled: settings.itf_enabled ?? false,
        development_levy_enabled: settings.development_levy_enabled ?? false,
        development_levy_annual_ngn: settings.development_levy_annual_ngn ?? 0,
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
    if (!validateFile(file, toast, 5)) {
      e.target.value = '';
      return;
    }
    const { compressImage } = await import('@/lib/image-compression');
    const compressed = await compressImage(file);
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
          {profile?.role === 'super_admin' && (
            <TabsTrigger value="integrations" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><LinkIcon className="mr-2 h-4 w-4" /> Integrations</TabsTrigger>
          )}
          <TabsTrigger value="policy" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><CreditCard className="mr-2 h-4 w-4" /> Expense policy</TabsTrigger>
          <TabsTrigger value="leave" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><CalendarDays className="mr-2 h-4 w-4" /> Leave</TabsTrigger>
          {['super_admin', 'admin', 'finance'].includes(profile?.role ?? '') && (
            <TabsTrigger value="statutory" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Activity className="mr-2 h-4 w-4" /> Statutory</TabsTrigger>
          )}
          <TabsTrigger value="exchange_rate" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><ArrowRightLeft className="mr-2 h-4 w-4" /> Exchange rate</TabsTrigger>
          <TabsTrigger value="notifications" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Bell className="mr-2 h-4 w-4" /> Notifications</TabsTrigger>
          {profile?.role === 'super_admin' && (
            <TabsTrigger value="security" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><ShieldCheck className="mr-2 h-4 w-4" /> Security</TabsTrigger>
          )}
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
          {profile?.role === 'super_admin' && (
            <TabsTrigger value="retention" className="md:w-full md:justify-start md:rounded-md md:px-3 md:py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-l-2 data-[state=active]:border-primary"><Database className="mr-2 h-4 w-4" /> Data Retention</TabsTrigger>
          )}
        </TabsList>
        <div className="md:min-w-0">


        {/* COMPANY ------------------------------------------------------- */}
        <TabsContent value="company" className="mt-4 space-y-4">
          <CompanyTab settings={settings} patch={patch} uploadLogo={uploadLogo} />
        </TabsContent>

        {/* INTEGRATIONS (super_admin only) --------------------------------- */}
        {profile?.role === 'super_admin' && (
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <IntegrationsTab settings={settings as any} patch={patch as any} isSuperAdmin={profile?.role === 'super_admin'} />
        </TabsContent>
        )}

        {/* POLICY -------------------------------------------------------- */}
        <TabsContent value="policy" className="mt-4 space-y-4">
          <ExpensePolicyTab settings={settings as any} patch={patch as any} profileName={profile?.full_name || profile?.email || undefined} />
        </TabsContent>

        {/* EXCHANGE RATE -------------------------------------------------- */}
        <TabsContent value="exchange_rate" className="mt-4 space-y-4">
          <FxRateSettings />
        </TabsContent>

        {/* LEAVE --------------------------------------------------------- */}
        <TabsContent value="leave" className="mt-4 space-y-4">
          <LeaveSettings />
        </TabsContent>

        {/* STATUTORY ------------------------------------------------------ */}
        {['super_admin', 'admin', 'finance'].includes(profile?.role ?? '') && (
        <TabsContent value="statutory" className="mt-4 space-y-4">
          <StatutorySettingsTab settings={settings as any} patch={patch as any} />
        </TabsContent>
        )}

        {/* NOTIFICATIONS ------------------------------------------------- */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <NotificationPrefsTab
            notifPrefs={notifPrefs}
            setNotifPrefs={setNotifPrefs}
            digest={digest}
            setDigest={setDigest}
            saveNotifPrefs={saveNotifPrefs}
          />
        </TabsContent>

        {/* TRANSFER AUTHORIZATION (super admin only) -------------------- */}
        <TabsContent value="transfer_auth" className="mt-4 space-y-4">
          {profile?.role === 'super_admin' ? (
            <TransferAuthSettings />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Transfer Authorization is only visible to Super Admins.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EMAIL TEMPLATES (super admin only) ----------------------------- */}
        <TabsContent value="email_templates" className="mt-4 space-y-4">
          {profile?.role === 'super_admin' ? (
            <EmailTemplatesSettings />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Email Templates is only visible to Super Admins.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SECURITY (super_admin only) ------------------------------------- */}
        {profile?.role === 'super_admin' && (
        <TabsContent value="security" className="mt-4 space-y-4">
          <SecurityTab
            settings={settings as any}
            patch={patch as any}
            approverMfaStatus={approverMfaStatus}
            exportLoading={exportLoading}
            setExportLoading={setExportLoading}
          />
        </TabsContent>
        )}

        {/* DEPARTMENTS -------------------------------------------------- */}
        <TabsContent value="departments" className="mt-4 space-y-4">
          <DepartmentsManager />
        </TabsContent>

        {/* TAGS --------------------------------------------------------- */}
        <TabsContent value="tags" className="mt-4 space-y-4">
          <TagsManager />
        </TabsContent>

        {/* DATA RETENTION (super_admin only) ------------------------------- */}
        {profile?.role === 'super_admin' && (
        <TabsContent value="retention" className="mt-4 space-y-4">
          <DataRetentionPanel />
        </TabsContent>
        )}

        {/* SYSTEM REFERENCE -------------------------------------------- */}
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
      .select('id, data_type, mode, retention_days, scheduled_first_run_at, last_run_at, last_run_count, all_paused')
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
    } catch (err: unknown) {
      toast({ title: 'Cleanup failed', description: errorMessage(err), variant: 'destructive' });
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
        } catch (err: unknown) {
          errors.push(`${t.name}: ${errorMessage(err)}`);
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
    } catch (err: unknown) {
      toast({ title: 'Export failed', description: errorMessage(err), variant: 'destructive' });
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
      .select('id', { count: 'exact', head: true })
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
      .select('id, name, color, module')
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
    } catch (err: unknown) {
      toast({ title: 'Error', description: errorMessage(err), variant: 'destructive' });
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
