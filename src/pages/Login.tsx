import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTimeOfDay, greetingFor } from '@/hooks/useTimeOfDay';
import { Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
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
    try {
      const { data: gate } = await supabase.functions.invoke('record-failed-login', {
        body: { action: 'check', email },
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
        });
        if (rec?.blocked) {
          setLoginError('Too many failed attempts. Try again in 15 minutes, or use "Forgot password".');
          setLoading(false);
          return;
        }
      } catch { /* best-effort */ }
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
      setLoginError('Incorrect email or password. Please try again.');
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="kd-aurora min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Base deep-space gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(201,100%,8%)] via-[hsl(200,100%,14%)] to-[hsl(186,100%,12%)] -z-10" />

      {/* Hex grid overlay */}
      <div className="pointer-events-none absolute inset-0 kd-hex-grid opacity-[0.18] mix-blend-overlay" />

      {/* Floating particles */}
      <div className="kd-particles">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="kd-particle"
            style={{
              left: `${(i * 11 + 5) % 100}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${8 + (i % 5)}s`,
              ['--drift-x' as any]: `${(i % 2 ? 1 : -1) * (15 + i * 2)}px`,
            }}
          />
        ))}
      </div>

      {/* Glass form */}
      <div className="relative z-10 w-full max-w-md">
        {/* Brand badge — uses the same logo source the rest of the
            platform reads from, so the login screen, sidebar header,
            and receipt all show the same emblem instead of a "KD"
            text glyph here and a real logo there. */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] blur-xl opacity-50 kd-icon-glow" />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl overflow-hidden">
              <BrandLogo size={48} className="h-12 w-12 rounded-lg" />
            </div>
          </div>
          <h1 className="kd-display text-3xl font-bold text-white tracking-tight">KDOps</h1>
          <p className="text-white/60 text-sm mt-1 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            {greeting}. Welcome back.
          </p>
        </div>

        <div className="kd-glass-dark rounded-2xl border border-white/10 p-6 sm:p-7 shadow-2xl kd-animate-scale-in">
          {isInviteOnly && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Access is by invitation only. Contact your KDOps administrator.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80 text-xs uppercase tracking-wider">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kdsquares.com"
                required
                className="bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--tod-glow))] focus-visible:border-[hsl(var(--tod-glow))]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80 text-xs uppercase tracking-wider">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--tod-glow))] focus-visible:border-[hsl(var(--tod-glow))]"
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
              className="w-full bg-gradient-to-r from-[hsl(var(--tod-aurora-1))] to-[hsl(var(--tod-aurora-2))] hover:opacity-90 text-white border-0 shadow-lg kd-tod-glow font-semibold"
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
    </div>
  );
};

export default Login;
