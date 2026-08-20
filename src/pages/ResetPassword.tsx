import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Loader2, KeyRound, TriangleAlert } from 'lucide-react';

/**
 * Reads the error Supabase appends to the redirect URL when an email link
 * (invite, magic-link, or password-recovery) is invalid, expired, or has
 * already been used — e.g. #error=access_denied&error_code=otp_expired&
 * error_description=Email+link+is+invalid+or+has+expired. Checks both the
 * hash (implicit flow, what this app's Supabase client uses) and the query
 * string, since different Supabase versions/paths have used either.
 */
function readAuthLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get('error_code') || query.get('error_code');
  const description = hash.get('error_description') || query.get('error_description');
  if (!code && !description) return null;
  if (code === 'otp_expired') {
    return 'This link has expired or was already used. Links are single-use and only valid for a limited time — ask for a new one below.';
  }
  return description ? description.replace(/\+/g, ' ') : 'This link is invalid. Ask for a new one below.';
}

const ResetPassword = () => {
  usePageTitle('Reset Password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // If Supabase rejected the link outright (expired, already used,
    // malformed), it redirects here with an error in the URL instead of
    // establishing a session — surface that immediately instead of leaving
    // the page stuck on "waiting for verification" forever.
    const urlError = readAuthLinkError();
    if (urlError) {
      setLinkError(urlError);
      return;
    }

    // Supabase puts the access_token in the URL hash after the user clicks
    // the password-reset email link. The JS client picks it up automatically
    // via onAuthStateChange → PASSWORD_RECOVERY event.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // PASSWORD_RECOVERY = forgot-password link; SIGNED_IN = invite magic link.
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });
    // If we're already in a session (e.g. user navigated here manually), allow.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // Belt-and-braces: if neither a session nor an error ever shows up
    // (a malformed link with no recognizable token, or the auth event
    // simply never fires), don't leave the user staring at a spinner
    // indefinitely — after a reasonable wait, treat it as an unusable link.
    const timeout = window.setTimeout(() => {
      setReady((currentlyReady) => {
        if (!currentlyReady) {
          setLinkError('This link didn\'t work. It may have expired or already been used — ask for a new one below.');
        }
        return currentlyReady;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (error) {
      toast({ title: 'Could not send link', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'New link sent', description: `Check ${resendEmail.trim()} for a fresh link.` });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      toast({ title: 'Password must be at least 12 characters', variant: 'destructive' });
      return;
    }
    // Reject obviously weak passwords even if they meet length requirement.
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast({
        title: 'Password too weak',
        description: 'Use at least one letter and one number.',
        variant: 'destructive',
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
    } else {
      // Revoke every other session on this account — if someone else had a
      // hijacked/stale session open before this reset, this is the moment
      // that access should end. Best-effort: a failure here shouldn't block
      // the user from reaching their own freshly-secured account.
      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch (signOutErr) {
        console.warn('[ResetPassword] signOut(others) failed:', signOutErr);
        toast({ title: 'Could not revoke other sessions', description: 'Sign out manually from other devices.', variant: 'destructive' });
      }
      toast({ title: 'Password set', description: 'Welcome! Taking you to your dashboard.' });
      navigate('/dashboard', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="kd-gradient-mesh min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="kd-card-tech w-full max-w-md rounded-2xl border-0 kd-animate-scale-in">
        <CardHeader className="text-center pb-2">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground shadow-md ${linkError ? 'bg-destructive' : 'kd-gradient-brand'}`}>
            {linkError ? <TriangleAlert className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl font-bold kd-text-gradient">{linkError ? 'Link no longer works' : 'Set new password'}</h1>
          {!linkError && (
            <p className="text-muted-foreground text-sm">
              {ready
                ? 'Enter your new password below.'
                : 'Waiting for verification... If you arrived from an email link, this should resolve automatically.'}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {linkError ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">{linkError}</p>
              <form onSubmit={handleResend} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="resend-email" className="kd-label">Your work email</Label>
                  <Input
                    id="resend-email"
                    type="email"
                    autoComplete="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@kdsquares.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resending}>
                  {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send me a new link
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground">
                Still stuck? <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>, or ask an admin
                to resend your invite from Employees.
              </p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="kd-label">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters (letters + numbers)"
                  disabled={!ready}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="kd-label">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Retype new password"
                  disabled={!ready}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
