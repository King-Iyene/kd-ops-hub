/**
 * Signup — public self-serve tenant creation flow.
 *
 * Wires the new handle_new_user_signup() trigger from the Phase 1A
 * migration. The user enters company name + their name + email +
 * password; we call supabase.auth.signUp() with the company name
 * carried in `raw_user_meta_data.signup_company_name`. The
 * Postgres trigger then creates the tenant + super_admin profile +
 * company_settings row server-side.
 *
 * IMPORTANT: this is the Phase 1A foundation. Until Phase 1B adds
 * tenant_id to every business table and tenant-scoped RLS, new
 * tenants share a database with the seed tenant. The code path
 * works end-to-end (auth user → trigger → tenant + profile rows)
 * but admins should leave self-signup OFF in production until
 * Phase 1B ships. The existing /register page (admin-driven invite
 * flow) stays the primary onboarding path for now.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Eye, EyeOff, AlertTriangle, Building2, Mail, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTimeOfDay, greetingFor } from '@/hooks/useTimeOfDay';
import { BrandLogo } from '@/components/BrandLogo';

function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: '', tone: '' };
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: 'Weak',   tone: 'bg-red-500' };
  if (s <= 3) return { score: s, label: 'Fair',   tone: 'bg-amber-500' };
  return        { score: s, label: 'Strong', tone: 'bg-emerald-500' };
}

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const tod = useTimeOfDay();
  const greeting = greetingFor(tod);

  const [companyName, setCompanyName] = useState('');
  const [fullName,    setFullName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

  const strength = passwordStrength(password);
  const canSubmit = (
    companyName.trim().length >= 2
    && fullName.trim().length >= 2
    && /\S+@\S+\.\S+/.test(email)
    && password.length >= 12
  );

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // The Phase 1A trigger reads these two fields from
          // raw_user_meta_data and creates the tenant + profile
          // pair when both are present.
          data: {
            full_name:            fullName.trim(),
            signup_company_name:  companyName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      toast({
        title: 'Sign-up failed',
        description: err?.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center kd-aurora p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-2xl border border-border p-8 text-center space-y-4 kd-animate-scale-in">
          <div className="mx-auto h-14 w-14 rounded-full bg-success/15 flex items-center justify-center">
            <Mail className="h-6 w-6 text-success" />
          </div>
          <h1 className="text-xl font-bold">Almost there — check your email</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We've sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
            Click it to activate your account, then sign in to set up <span className="font-medium text-foreground">{companyName}</span>.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Go to sign-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center kd-aurora p-4">
      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] blur-xl opacity-50 kd-icon-glow" />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl overflow-hidden">
              <BrandLogo size={48} className="h-12 w-12 rounded-lg" />
            </div>
          </div>
          <h1 className="kd-display text-3xl font-bold text-white tracking-tight">Start with KDOps</h1>
          <p className="text-white/60 text-sm mt-1 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            {greeting} — set up your company in a minute.
          </p>
        </div>

        <div className="kd-glass-dark rounded-2xl border border-white/10 p-6 sm:p-7 shadow-2xl kd-animate-scale-in">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-white/80 text-xs uppercase tracking-wider">Company name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Logistics Ltd"
                  required
                  autoComplete="organization"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-white/80 text-xs uppercase tracking-wider">Your name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Adaeze Okonkwo"
                required
                autoComplete="name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/80 text-xs uppercase tracking-wider">Work email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/80 text-xs uppercase tracking-wider">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="pl-9 pr-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full ${strength.tone} kd-transition`} style={{ width: `${(strength.score / 5) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-white/60 w-10">{strength.label}</span>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Creating account…' : `Create ${companyName || 'account'}`}
            </Button>
          </form>

          <p className="text-[11px] text-white/50 mt-4 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-white/80 hover:text-white underline underline-offset-2">Sign in</Link>
          </p>
        </div>

        {/* Phase 1A early-access notice — be honest about what's
            shipped. Removed automatically once Phase 1B lands. */}
        <div className="mt-4 mx-auto max-w-md rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p className="leading-snug">
            <span className="font-semibold">Early access —</span>{' '}
            tenant data isolation is rolling out across business
            tables. Until then, please contact us to request signup
            access for your organisation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
