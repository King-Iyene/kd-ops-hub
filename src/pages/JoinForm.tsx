import { useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { NIGERIAN_BANKS } from '@/lib/nigerian-banks';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const JoinForm = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const routeParams = useParams<{ code?: string }>();
  const refCode = routeParams.code || searchParams.get('ref') || '';

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    linkedin_full_name: '',
    linkedin_email: '',
    linkedin_profile_url: '',
    bank_name: '',
    account_name: '',
    account_number: '',
  });

  const isValidNuban = /^\d{10}$/.test(form.account_number);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' });
      return;
    }
    if (!form.bank_name) {
      toast({ title: 'Select a bank', variant: 'destructive' });
      return;
    }
    if (!isValidNuban) {
      toast({
        title: 'Account number must be exactly 10 digits (NUBAN)',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('contractor_applications').insert({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone || null,
        linkedin_full_name: form.linkedin_full_name || null,
        linkedin_email: form.linkedin_email || null,
        linkedin_profile_url: form.linkedin_profile_url || null,
        bank_name: form.bank_name,
        account_name: form.account_name || null,
        account_number: form.account_number,
        referral_code: refCode || null,
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
          <h1 className="text-2xl font-bold">Join KD Squares</h1>
          <p className="text-muted-foreground text-sm">
            Apply to become a contractor. Fill in your details below — our team
            will review and activate your account.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Personal information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Full Name *</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Ada Okonkwo"
                    required
                  />
                </div>
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
                <div className="space-y-1 sm:col-span-2">
                  <Label>Phone / WhatsApp</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+234..."
                  />
                </div>
              </div>
            </div>

            {/* LinkedIn */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                LinkedIn details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>LinkedIn full name</Label>
                  <Input
                    value={form.linkedin_full_name}
                    onChange={(e) =>
                      setForm({ ...form, linkedin_full_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn email</Label>
                  <Input
                    type="email"
                    value={form.linkedin_email}
                    onChange={(e) =>
                      setForm({ ...form, linkedin_email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>LinkedIn profile URL</Label>
                  <Input
                    value={form.linkedin_profile_url}
                    onChange={(e) =>
                      setForm({ ...form, linkedin_profile_url: e.target.value })
                    }
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
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
                  <Select
                    value={form.bank_name}
                    onValueChange={(v) => setForm({ ...form, bank_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_BANKS.map((b) => (
                        <SelectItem key={b.code} value={b.name}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Account number (10 digits) *</Label>
                  <Input
                    value={form.account_number}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        account_number: e.target.value.replace(/\D/g, '').slice(0, 10),
                      })
                    }
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="0123456789"
                    required
                  />
                  {form.account_number.length > 0 && !isValidNuban && (
                    <p className="text-xs text-destructive">Must be exactly 10 digits</p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Account name</Label>
                  <Input
                    value={form.account_name}
                    onChange={(e) =>
                      setForm({ ...form, account_name: e.target.value })
                    }
                    placeholder="Name as it appears on the account"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !form.full_name || !form.email || !isValidNuban || !form.bank_name}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Submit application
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By submitting, you agree to KD Squares' terms of service and
              privacy policy.
              {refCode && (
                <span className="block mt-1">
                  Referred by code: <code className="font-mono">{refCode}</code>
                </span>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinForm;
