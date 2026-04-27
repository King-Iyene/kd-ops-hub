import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
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
    return () => subscription.unsubscribe();
  }, []);

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
      toast({ title: 'Password set', description: 'Welcome! Taking you to your dashboard.' });
      navigate('/dashboard', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <KeyRound className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-muted-foreground text-sm">
            {ready
              ? 'Enter your new password below.'
              : 'Waiting for verification... If you arrived from an email link, this should resolve automatically.'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
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
              <Label htmlFor="confirm">Confirm password</Label>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
