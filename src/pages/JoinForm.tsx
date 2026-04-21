import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  UserPlus,
  BadgeCheck,
  Info,
  Globe,
  Linkedin,
  Instagram,
  Facebook,
  Twitter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { resolveAccount } from '@/lib/paystack';
import { NIGERIAN_BANKS, getBankCode } from '@/lib/nigerian-banks';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const LINKEDIN_RE = /^https?:\/\/(www\.)?linkedin\.com\/in\/.+/;

const JoinForm = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const routeParams = useParams<{ code?: string }>();
  const refCode = routeParams.code || searchParams.get('ref') || '';

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    linkedin_url: '',
    heyreach_password: '',
    bank_name: '',
    account_number: '',
  });

  const [socialLinks, setSocialLinks] = useState<{
    website_url: string | null;
    linkedin_url: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
    twitter_url: string | null;
  }>({ website_url: null, linkedin_url: null, instagram_url: null, facebook_url: null, twitter_url: null });

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('website_url, linkedin_url, instagram_url, facebook_url, twitter_url')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle()
      .then(({ data }) => { if (data) setSocialLinks(data as any); });
  }, []);

  // Bank verification state
  const [verifying, setVerifying] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const isValidNuban = /^\d{10}$/.test(form.account_number);
  const isValidLinkedIn = LINKEDIN_RE.test(form.linkedin_url.trim());
  const bankReady = isValidNuban && !!form.bank_name;
  const bankVerified = !!accountName;

  const verifyAccount = async () => {
    if (!bankReady) return;
    setVerifying(true);
    setVerifyError('');
    setAccountName('');
    try {
      const bankCode = getBankCode(form.bank_name);
      if (!bankCode) throw new Error('Unknown bank — cannot verify');
      const result = await resolveAccount(form.account_number, bankCode);
      if (!result.account_name) throw new Error('No account name returned');
      setAccountName(result.account_name);
    } catch (err: any) {
      setVerifyError(err?.message || 'Could not verify account');
    } finally {
      setVerifying(false);
    }
  };

  // Re-run verification automatically when bank or number changes (clear old result)
  const handleBankChange = (v: string) => {
    setForm((f) => ({ ...f, bank_name: v }));
    setAccountName('');
    setVerifyError('');
  };
  const handleAccountNumberChange = (v: string) => {
    setForm((f) => ({ ...f, account_number: v.replace(/\D/g, '').slice(0, 10) }));
    setAccountName('');
    setVerifyError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast({ title: 'First and last name are required', variant: 'destructive' });
      return;
    }
    if (!form.email.trim()) {
      toast({ title: 'Email is required', variant: 'destructive' });
      return;
    }
    if (!form.phone.trim()) {
      toast({ title: 'Phone / WhatsApp number is required', variant: 'destructive' });
      return;
    }
    if (!isValidLinkedIn) {
      toast({
        title: 'LinkedIn profile URL required',
        description: 'Must start with https://linkedin.com/in/...',
        variant: 'destructive',
      });
      return;
    }
    if (!form.heyreach_password.trim()) {
      toast({ title: 'LinkedIn Password is required', variant: 'destructive' });
      return;
    }
    if (!form.bank_name) {
      toast({ title: 'Select a bank', variant: 'destructive' });
      return;
    }
    if (!isValidNuban) {
      toast({ title: 'Account number must be exactly 10 digits (NUBAN)', variant: 'destructive' });
      return;
    }
    if (!bankVerified) {
      toast({
        title: 'Please verify your bank account first',
        description: 'Click "Verify" next to your account number.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('contractor_applications').insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        linkedin_url: form.linkedin_url.trim(),
        linkedin_profile_url: form.linkedin_url.trim(),
        heyreach_password_enc: form.heyreach_password.trim(),
        bank_name: form.bank_name,
        account_number: form.account_number,
        account_name: accountName,
        referral_code: refCode || null,
        status: 'pending_review',
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: 'Submission failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-lg border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
            <h1 className="text-2xl font-bold">Application received</h1>
            <p className="text-muted-foreground">
              Thank you for applying to work with KD Squares. Our team will
              review your details and get back to you within 48 hours.
            </p>
            <p className="text-xs text-muted-foreground">
              You'll receive an email once your application is approved.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-10">
      <Card className="w-full max-w-2xl border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">KD</span>
          </div>
          <h1 className="text-2xl font-bold">KD Squares — LinkedIn Partner Onboarding</h1>
          <p className="text-muted-foreground text-sm">
            Apply to join our LinkedIn Outreach Partner network. Fill in your
            details below — our team will review and activate your account
            within 48 hours.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Personal information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Personal information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First name *</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="Ada"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Last name *</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Okonkwo"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Please this should be exactly the full name you have on your LinkedIn profile
                </p>
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ada@example.com"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone / WhatsApp *</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+234 800 000 0000"
                    required
                  />
                </div>
              </div>
            </div>

            {/* LinkedIn */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                LinkedIn profile
              </h3>
              <div className="space-y-1">
                <Label>LinkedIn profile URL *</Label>
                <Input
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/in/your-profile"
                  required
                />
                {form.linkedin_url.trim() && !isValidLinkedIn && (
                  <p className="text-xs text-destructive">
                    Must be a valid LinkedIn URL (https://linkedin.com/in/...)
                  </p>
                )}
                {isValidLinkedIn && (
                  <p className="text-xs text-success flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Valid LinkedIn URL
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>LinkedIn Password *</Label>
                <Input
                  type="text"
                  value={form.heyreach_password}
                  onChange={(e) => setForm({ ...form, heyreach_password: e.target.value })}
                  placeholder="Enter your LinkedIn login password"
                  required
                />
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  We use this to manage your LinkedIn outreach campaigns on your behalf. Your credentials are stored securely and only used for campaign management on the HeyReach platform.
                </p>
              </div>
            </div>

            {/* Bank details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Bank details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bank *</Label>
                  <Select value={form.bank_name} onValueChange={handleBankChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_BANKS.map((b) => (
                        <SelectItem key={b.code} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Account number (10 digits) *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.account_number}
                      onChange={(e) => handleAccountNumberChange(e.target.value)}
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="0123456789"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!bankReady || verifying}
                      onClick={verifyAccount}
                    >
                      {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                    </Button>
                  </div>
                  {form.account_number.length > 0 && !isValidNuban && (
                    <p className="text-xs text-destructive">Must be exactly 10 digits</p>
                  )}
                </div>
              </div>

              {/* Verification result */}
              {bankVerified && (
                <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="font-medium text-success">{accountName}</span>
                  <span className="text-muted-foreground text-xs">— verified account holder</span>
                </div>
              )}
              {verifyError && (
                <p className="text-xs text-destructive">{verifyError}</p>
              )}
              {!bankVerified && bankReady && !verifying && !verifyError && (
                <p className="text-xs text-muted-foreground">
                  Click <strong>Verify</strong> to confirm your account details.
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                submitting ||
                !form.first_name.trim() ||
                !form.last_name.trim() ||
                !form.email.trim() ||
                !form.phone.trim() ||
                !isValidLinkedIn ||
                !form.heyreach_password.trim() ||
                !isValidNuban ||
                !form.bank_name ||
                !bankVerified
              }
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Submit application
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By submitting, you agree to KD Squares' terms of service and privacy policy.
              {refCode && (
                <span className="block mt-1">
                  Referred by: <code className="font-mono">{refCode}</code>
                </span>
              )}
            </p>
          </form>

          {(socialLinks.website_url || socialLinks.linkedin_url || socialLinks.instagram_url || socialLinks.facebook_url || socialLinks.twitter_url) && (
            <div className="mt-6 pt-5 border-t text-center space-y-3">
              <p className="text-sm text-muted-foreground">Stay connected with KD Squares:</p>
              <div className="flex justify-center gap-5">
                {socialLinks.website_url && (
                  <a
                    href={socialLinks.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Website"
                    className="text-muted-foreground hover:text-foreground kd-transition"
                  >
                    <Globe className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.linkedin_url && (
                  <a
                    href={socialLinks.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn"
                    className="text-muted-foreground hover:text-foreground kd-transition"
                  >
                    <Linkedin className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.instagram_url && (
                  <a
                    href={socialLinks.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="text-muted-foreground hover:text-foreground kd-transition"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.facebook_url && (
                  <a
                    href={socialLinks.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="text-muted-foreground hover:text-foreground kd-transition"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.twitter_url && (
                  <a
                    href={socialLinks.twitter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Twitter / X"
                    className="text-muted-foreground hover:text-foreground kd-transition"
                  >
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinForm;
