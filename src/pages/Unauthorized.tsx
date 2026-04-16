import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { roleLabel } from '@/lib/roles';

const Unauthorized = () => {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-destructive/30">
        <CardContent className="pt-8 pb-6 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Unauthorized</h1>
            <p className="text-sm text-muted-foreground mt-1">
              You do not have permission to view this page.
            </p>
          </div>
          {profile && (
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium">{profile.email}</span> ·{' '}
              <span className="font-medium">{roleLabel(profile.role)}</span>
            </p>
          )}
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unauthorized;
