import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">KD</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
          <p className="text-muted-foreground text-sm">Enter your email to receive a reset link</p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                A password reset link has been sent to <span className="font-medium text-foreground">{email}</span>. Check your inbox.
              </p>
              <Link to="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@kdsquares.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              <p className="text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
