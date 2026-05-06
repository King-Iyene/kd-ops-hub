/**
 * Settings → Integrations → Notifications card.
 *
 * One-click VAPID keypair generation so admins never need to touch the CLI.
 * The "Generate keys" button calls the vapid-keys edge function which mints
 * a fresh keypair server-side, stores both halves on company_settings, and
 * invalidates every existing push subscription so subscribers re-link with
 * the new public key.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function NotificationsCard() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('mailto:code@kdsquares.com');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vapid-keys', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setPublicKey((data as any)?.public_key ?? null);
      if ((data as any)?.subject) setSubject((data as any).subject);
    } catch (err: any) {
      toast({ title: 'Could not check notification status', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleGenerate = async () => {
    setConfirmOpen(false);
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('vapid-keys', {
        body: { action: 'generate', subject },
      });
      if (error) throw error;
      setPublicKey((data as any)?.public_key ?? null);
      toast({
        title: 'Notification keys generated',
        description: 'Push notifications are now active. Existing subscribers will be asked to re-enable.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not generate keys',
        description: err?.message || 'Try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </div>
        ) : publicKey ? (
          <>
            <div className="flex items-start gap-2 rounded-md border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">Notifications are active</p>
                <p className="text-muted-foreground mt-0.5">
                  Operators can subscribe from the Dashboard. Notifications fire for approvals, transfers, and anomalies.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Public key (shared with browsers)</Label>
              <Input
                readOnly
                value={publicKey}
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Contact (RFC 8292)</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="mailto:code@kdsquares.com"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                A mailto: or https URL push services use to reach you if a subscription misbehaves.
              </p>
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={() => setConfirmOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1.5" />}
                  Rotate keys
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Rotating invalidates all current subscribers. Only do this if a key was leaked.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-3">
              <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Notifications not yet configured</p>
                <p className="text-muted-foreground mt-0.5">
                  {isAdmin
                    ? 'Click "Generate keys" below to enable push notifications across the platform. Takes about 2 seconds — no CLI needed.'
                    : 'Ask an Admin to enable push notifications. They will see a "Generate keys" button here.'}
                </p>
              </div>
            </div>

            {isAdmin && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Contact (RFC 8292)</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="mailto:code@kdsquares.com"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A mailto: or https URL the push service uses to reach you. Default is fine.
                  </p>
                </div>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1.5" />}
                  Generate keys
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate notification keys?</AlertDialogTitle>
            <AlertDialogDescription>
              This generates a new VAPID keypair and clears every existing push subscription.
              All currently-subscribed operators will need to click "Turn on" again on the dashboard.
              Only rotate if you suspect a key leak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerate}>Yes, rotate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
