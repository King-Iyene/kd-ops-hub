import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { usePageTitle } from '@/hooks/usePageTitle';
import { roleLabel } from '@/lib/roles';

const Unauthorized = () => {
  usePageTitle('Unauthorized');
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuthStore();

  const isPending = !profile || profile.status !== 'active';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="kd-gradient-mesh min-h-screen flex items-center justify-center p-6">
      <Card className="kd-card-tech max-w-lg w-full rounded-2xl border-0 kd-animate-scale-in">
        <CardContent className="pt-8 pb-6 text-center space-y-5">
          <div
            className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${
              isPending ? 'bg-warning/10' : 'bg-destructive/10'
            }`}
          >
            {isPending ? (
              <Clock className="h-7 w-7 text-warning" />
            ) : (
              <ShieldAlert className="h-7 w-7 text-destructive" />
            )}
          </div>

          {isPending ? (
            <div>
              <h1 className="text-xl font-semibold">Account Pending Approval</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Your account is pending approval. You'll receive an email when
                activated by an administrator.
              </p>
              {user?.email && (
                <p className="text-xs text-muted-foreground mt-3">
                  Signed in as <span className="font-medium">{user.email}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-semibold">Unauthorized</h1>
              <p className="text-sm text-muted-foreground mt-1">
                You do not have permission to view this page.
              </p>
              {profile && (
                <p className="text-xs text-muted-foreground mt-3">
                  Signed in as <span className="font-medium">{profile.email}</span> ·{' '}
                  <span className="font-medium">{roleLabel(profile.role)}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            {isPending ? (
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate(-1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
                <Button variant="outline" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unauthorized;
