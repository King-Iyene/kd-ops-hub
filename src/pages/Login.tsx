import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTimeOfDay, greetingFor } from '@/hooks/useTimeOfDay';
import { Loader2, Eye, EyeOff, Sparkles, Mail, Lock } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { AuthAtmosphere } from '@/components/AuthAtmosphere';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const isInviteOnly = searchParams.get('message') === 'invite-only';
  const tod = useTimeOfDay();
  const greeting = greetingFor(tod);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);

    // Pre-flight rate-limit check. Best-effort: if the function is down
    // or unreachable, we still let Supabase's own rate limit do its job.
    // A timeout is required here — without one, a network stall (rather
    // than a fast connection error) never reaches the catch block, and
    // this await blocks the entire login indefinitely.
    try {
      const { data: gate } = await supabase.functions.invoke('record-failed-login', {
        body: { action: 'check', email },
        timeout: 8000,
      });
      if (gate?.blocked) {
        setLoginError(
          `Too many failed attempts. Try again in ${gate.remainingMinutes ?? 15} minutes, or use "Forgot password" to reset.`,
        );
        setLoading(false);
        return;
      }
    } catch { /* don't block login on a check failure */ }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Record this failed attempt (and find out if we just hit the cap).
      try {
        const { data: rec } = await supabase.functions.invoke('record-failed-login', {
          body: { action: 'record', email, reason: error.message },
          timeout: 8000,
        });
        if (rec?.blocked) {
          setLoginError('Too many failed attempts. Try again in 15 minutes, or use "Forgot password".');
          setLoading(false);
          return;
        }
      } catch { /* best-effort */ }
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
      // Network/connectivity failures (offline, DNS, timeout, blocked
      // request) surface here as a Supabase error too — don't tell the
      // user their password is wrong when the real problem is that their
      // browser never reached the server at all.
      const isNetworkError = /fetch|network|timeout|offline/i.test(error.message);
      setLoginError(
        isNetworkError
          ? 'Could not reach the server. Check your internet connection and try again.'
          : 'Incorrect email or password. Please try again.',
      );
      setLoading(false);
      return;
    }
    // Navigation is handled by useAuth's onAuthStateChange listener
    // (mounted at AppRoutes level) — it waits for the profile to load
    // before redirecting, preventing the double-login race.
    setLoading(false);
  };

  return (
    <AuthAtmosphere>
      {/* Glass form */}
      <div className="relative z-10 w-full max-w-md">
        {/* Brand badge — uses the same logo source the rest of the
            platform reads from, so the login screen, sidebar header,
            and receipt all show the same emblem instead of a "KD"
            text glyph here and a real logo there. */}
        <div className="flex flex-col items-center mb-7">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] blur-xl kd-glow-pulse" />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl overflow-hidden">
              <BrandLogo size={48} className="h-12 w-12 rounded-lg" />
            </div>
          </div>
          <h1 className="kd-display text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-[hsl(var(--tod-glow))]">
            KDOps
          </h1>
          <p className="text-white/60 text-sm mt-1.5 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            {greeting}. Welcome back.
          </p>
        </div>

        <div className="kd-glass-dark kd-glass-card-premium rounded-2xl border border-white/10 p-6 sm:p-7 kd-animate-scale-in">
          {isInviteOnly && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Access is by invitation only. Contact your KDOps administrator.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@kdsquares.com"
                  required
                  className="pl-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--tod-glow))] focus-visible:border-[hsl(var(--tod-glow))]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80 text-xs uppercase tracking-wider">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35 pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pl-10 pr-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--tod-glow))] focus-visible:border-[hsl(var(--tod-glow))]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-white/40 hover:text-white/80 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[hsl(var(--tod-aurora-1))] to-[hsl(var(--tod-aurora-2))] hover:opacity-95 text-white border-0 shadow-lg font-semibold kd-shimmer kd-magnetic"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            {loginError && (
              <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 text-center">
                {loginError}
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
              <Link to="/forgot-password" className="text-white/60 hover:text-white kd-transition">
                Forgot password?
              </Link>
              <Link to="/register" className="text-white/80 hover:text-white kd-transition font-medium">
                Create account →
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          KD Squares Operations Platform · Built for the field
        </p>
      </div>
    </AuthAtmosphere>
  );
};

export default Login;
