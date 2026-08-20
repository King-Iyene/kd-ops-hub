import { Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { PaymentRailsCard } from '@/components/settings/PaymentRailsCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { PaymentEmailAudienceCard } from '@/components/settings/PaymentEmailAudienceCard';

interface Props {
  settings: Record<string, any>;
  patch: (p: Record<string, any>) => void;
  isSuperAdmin: boolean;
}

export default function IntegrationsTab({ settings, patch, isSuperAdmin }: Props) {
  return (
    <div className="space-y-4">
      <PaymentRailsCard isSuperAdmin={isSuperAdmin} />
      <Card id="paystack" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Paystack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="flex items-center gap-3">
              <Switch
                checked={!!settings.paystack_secret_configured}
                onCheckedChange={(v) => patch({ paystack_secret_configured: v })}
              />
              <span className="text-sm">Secret key configured</span>
            </label>
            <p className="text-[11px] text-muted-foreground">
              The secret key itself lives only in Supabase's edge function environment variables
              (<code className="text-[11px] bg-muted px-1 py-0.5 rounded">PAYSTACK_SECRET_KEY_LIVE</code> /{' '}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">_TEST</code>) — it is never stored in
              the database or sent to the browser. Set or rotate it via <code className="text-[11px] bg-muted px-1 py-0.5 rounded">supabase secrets set</code>,
              then flip this toggle so the team can see at a glance that it's set up.
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
                value={settings.resend_from_address || ''}
                onChange={(e) => patch({ resend_from_address: e.target.value })}
                placeholder="ops@kdsquares.com"
              />
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-3">
                <Switch
                  checked={!!settings.resend_api_key_configured}
                  onCheckedChange={(v) => patch({ resend_api_key_configured: v })}
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
                value={settings.termii_sender_id || ''}
                onChange={(e) => patch({ termii_sender_id: e.target.value })}
                placeholder="KDOps"
              />
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-3">
                <Switch
                  checked={!!settings.termii_api_key_configured}
                  onCheckedChange={(v) => patch({ termii_api_key_configured: v })}
                />
                <span className="text-sm">API key configured</span>
              </label>
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-3">
                <Switch
                  checked={!!settings.whatsapp_enabled}
                  onCheckedChange={(v) => patch({ whatsapp_enabled: v })}
                />
                <span className="text-sm">WhatsApp notifications</span>
              </label>
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-3">
                <Switch
                  checked={!!settings.sms_enabled}
                  onCheckedChange={(v) => patch({ sms_enabled: v })}
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
    </div>
  );
}
