import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, KeyRound, Mail, Phone, CalendarDays, Download, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { openPayslipPrintWindow } from '@/lib/payslip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { cn } from '@/lib/utils';

const initialsOf = (name?: string | null, email?: string | null): string => {
  const source = (name || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return source.charAt(0).toUpperCase();
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || 'U';
};

interface Payslip {
  id: string;
  period: string;
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  net_ngn: number;
  storage_path: string | null;
  created_at: string;
}

const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString(
    'en-GB',
    { month: 'long', year: 'numeric' },
  );
};

const ProfilePage = () => {
  const { toast } = useToast();
  const profile = useAuthStore((s) => s.profile);

  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(true);

  const loadPayslips = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingPayslips(true);
    const { data } = await supabase
      .from('payslips')
      .select('*')
      .eq('employee_id', profile.id)
      .order('period', { ascending: false });
    setPayslips((data as Payslip[]) || []);
    setLoadingPayslips(false);
  }, [profile?.id]);

  useEffect(() => {
    loadPayslips();
  }, [loadPayslips]);

  const downloadPayslip = async (p: Payslip) => {
    // Prefer the stored HTML in Supabase Storage; fall back to regenerating.
    if (p.storage_path) {
      const { data, error } = await supabase.storage
        .from('payslips')
        .createSignedUrl(p.storage_path, 60);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
        return;
      }
    }
    openPayslipPrintWindow({
      company_name: 'KD Squares Ltd',
      employee_name: profile?.full_name || profile?.email || '',
      employee_email: profile?.email,
      employee_role: profile?.role,
      period: p.period,
      gross_ngn: p.gross_ngn,
      paye_ngn: p.paye_ngn,
      pension_ngn: p.pension_ngn,
      nhf_ngn: p.nhf_ngn,
      net_ngn: p.net_ngn,
      generated_by: profile?.full_name || profile?.email,
    });
  };

  const setProfile = useAuthStore((s) => s.setProfile);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState(profile?.email || '');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  if (!profile) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading profile...
      </div>
    );
  }

  const saveProfile = async () => {
    if (!fullName.trim()) {
      toast({ title: 'Full name is required', variant: 'destructive' });
      return;
    }
    setSavingProfile(true);
    try {
      const changes: string[] = [];
      if (fullName !== profile.full_name) changes.push(`name → "${fullName}"`);
      if ((phone || null) !== (profile.phone || null)) {
        changes.push(`phone → "${phone || '—'}"`);
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;

      if (data) {
        setProfile({ ...profile, ...data });
      }

      if (changes.length > 0) {
        await logAudit(
          'profile_updated',
          `Profile updated (${changes.join(', ')})`,
          profile,
        );
      }
      toast({ title: 'Profile updated' });
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const updateEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed === profile.email) return;
    setUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast({
        title: 'Verification email sent',
        description: `A confirmation link has been sent to ${trimmed}. Click it to confirm the change.`,
      });
    } catch (err: any) {
      toast({
        title: 'Email update failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingEmail(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast({
        title: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await logAudit('profile_password_changed', 'Password changed', profile);
      toast({ title: 'Password updated' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({
        title: 'Password update failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const dirty =
    fullName !== (profile.full_name || '') ||
    (phone || '') !== (profile.phone || '');
  const initials = initialsOf(profile.full_name, profile.email);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="My Profile"
        description="Your KDOps account details and security."
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <span className="text-2xl font-bold text-primary-foreground">
                {initials}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold truncate">
                {profile.full_name || '—'}
              </h2>
              <div className="text-sm text-muted-foreground space-y-1 mt-1">
                <p className="flex items-center gap-2 truncate">
                  <Mail className="h-3.5 w-3.5" /> {profile.email}
                </p>
                {profile.phone && (
                  <p className="flex items-center gap-2 truncate">
                    <Phone className="h-3.5 w-3.5" /> {profile.phone}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" /> Joined{' '}
                  {formatDate(profile.created_at)}
                </p>
              </div>
              <div className="mt-3">
                <Badge
                  variant="outline"
                  className={cn('font-medium', roleBadgeClass(profile.role))}
                >
                  {roleLabel(profile.role)}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234..."
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="newEmail">Email</Label>
              <div className="flex gap-2">
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Button
                  variant="outline"
                  onClick={updateEmail}
                  disabled={
                    updatingEmail ||
                    !newEmail.trim() ||
                    newEmail.trim() === profile.email
                  }
                >
                  {updatingEmail ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Update Email
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A confirmation link will be sent to the new address. The change only takes effect after you click it.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Input value={roleLabel(profile.role)} disabled />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={saveProfile}
              disabled={savingProfile || !dirty || !fullName.trim()}
            >
              {savingProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> My Payslips
          </CardTitle>
          {payslips.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {payslips.length} payslip{payslips.length === 1 ? '' : 's'} on file
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-2">
          {loadingPayslips ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payslips generated yet. Finance will produce them at the end of
              each month.
            </p>
          ) : (
            <div className="space-y-2">
              {payslips.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border rounded-lg p-3 kd-transition hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{monthLabel(p.period)}</p>
                    <p className="text-xs text-muted-foreground">
                      Gross {formatNaira(p.gross_ngn)} · PAYE {formatNaira(p.paye_ngn)} · Pension {formatNaira(p.pension_ngn)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Net pay</p>
                      <p className="font-semibold currency">
                        {formatNaira(p.net_ngn)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadPayslip(p)}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Retype new password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={changePassword}
              disabled={
                changingPassword ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword
              }
            >
              {changingPassword ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Update Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
