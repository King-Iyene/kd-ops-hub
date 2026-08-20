import { Activity, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTip } from '@/components/ui-kit/InfoTip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import OfferLetterTemplatesAdmin from '@/components/hr/OfferLetterTemplatesAdmin';

interface CompanySettings {
  company_name: string;
  rc_number: string | null;
  tin: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  fiscal_year_preset: 'jan_dec' | 'apr_mar';
  timezone: string;
  cash_on_hand_ngn: number;
  cash_updated_at: string | null;
  external_monthly_burn_ngn: number;
  monthly_revenue_estimate_ngn: number;
  state_of_business: string | null;
  pencom_employer_code: string | null;
  nhf_employer_code: string | null;
  nsitf_employer_code: string | null;
  itf_employer_code: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  [key: string]: any;
}

interface Props {
  settings: CompanySettings;
  patch: (p: Partial<CompanySettings>) => void;
  uploadLogo: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function CompanyTab({ settings, patch, uploadLogo }: Props) {
  return (
    <div className="space-y-4">
      {/* Company profile card */}
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

          {/* Runway tracking */}
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

      {/* Statutory filing identifiers */}
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

      {/* Social media */}
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
    </div>
  );
}
