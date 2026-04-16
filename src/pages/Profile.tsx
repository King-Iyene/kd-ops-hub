import { useState } from 'react';
import { Loader2, Save, KeyRound, Mail, Phone, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate } from '@/lib/format';
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

const ProfilePage = () => {
  const { toast } = useToast();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

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
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={profile.email} disabled />
              <p className="text-xs text-muted-foreground">
                Email can't be changed from here — contact an admin if it needs updating.
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
