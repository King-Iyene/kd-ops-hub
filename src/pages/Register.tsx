import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak', color: 'bg-destructive' };
  if (score <= 3) return { score, label: 'Fair', color: 'bg-warning' };
  return { score, label: 'Strong', color: 'bg-success' };
}

const Register = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 12) {
      toast({ title: 'Password must be at least 12 characters', variant: 'destructive' });
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast({
        title: 'Password too weak',
        description: 'Use at least one letter and one number.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      toast({ title: 'Registration failed', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    toast({ title: 'Account created', description: 'Welcome to KDOps!' });
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="kd-gradient-mesh min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="kd-card-tech w-full max-w-md rounded-2xl border-0 kd-animate-scale-in">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border shadow-md overflow-hidden">
            <BrandLogo size={40} className="h-10 w-10 rounded-lg" />
          </div>
          <h1 className="text-2xl font-bold kd-text-gradient">Create account</h1>
          <p className="text-muted-foreground text-sm">KD Squares Operations Platform</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="kd-label">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ada Okonkwo"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="kd-label">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kdsquares.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="kd-label">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              {password && (() => {
                const { score, label, color } = passwordStrength(password);
                return (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : 'bg-muted'}`}
                        />
                      ))}
                    </div>
                    <p className="kd-field-hint">{label} — use 12+ characters, numbers and symbols for a strong password.</p>
                  </div>
                );
              })()}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="kd-label">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign Up
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
