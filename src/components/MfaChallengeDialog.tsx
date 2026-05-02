// MFA challenge dialog — shown on sign-in when:
//   1. The user has a verified TOTP factor, AND
//   2. The current device isn't trusted.
//
// Two paths:
//   - Enter the 6-digit code from the authenticator app, OR
//   - Use a backup code (xxxx-xxxx).
//
// On success: optionally trust this device for 30 days, then resolve.
// On failure: counts attempts; after 5 wrong attempts, force sign-out.

import { useState } from 'react';
import { Loader2, Shield, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  verifyMfa,
  consumeBackupCode,
  registerTrustedDevice,
} from '@/lib/mfa';

export function MfaChallengeDialog(props: {
  open: boolean;
  factorId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const submit = async () => {
    setBusy(true);
    try {
      let ok = false;
      if (mode === 'totp') {
        await verifyMfa(props.factorId, code);
        ok = true;
      } else {
        ok = await consumeBackupCode(code);
        if (!ok) throw new Error('Invalid or already-used backup code');
      }
      if (ok && trust) {
        try { await registerTrustedDevice({ days: 30 }); } catch { /* non-fatal */ }
      }
      props.onSuccess();
    } catch (e: any) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        toast({ title: 'Too many failed attempts', description: 'Signing you out for safety.', variant: 'destructive' });
        await supabase.auth.signOut();
        return;
      }
      toast({
        title: e?.message ?? 'Verification failed',
        description: `Attempt ${next} of 5`,
        variant: 'destructive',
      });
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={() => { /* no close — must verify or sign out */ }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Two-factor verification
          </DialogTitle>
          <DialogDescription>
            {mode === 'totp'
              ? 'Enter the 6-digit code from your authenticator app to finish signing in.'
              : 'Enter one of your saved backup codes (format: xxxx-xxxx).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            inputMode={mode === 'totp' ? 'numeric' : 'text'}
            maxLength={mode === 'totp' ? 6 : 9}
            placeholder={mode === 'totp' ? '123 456' : 'xxxx-xxxx'}
            value={code}
            onChange={(e) => {
              const v = mode === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value.toLowerCase();
              setCode(v);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= (mode === 'totp' ? 6 : 8)) void submit(); }}
            className="font-mono text-center text-lg tracking-widest"
            disabled={busy}
          />

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} disabled={busy} />
            Trust this device for 30 days
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setMode((m) => (m === 'totp' ? 'backup' : 'totp')); setCode(''); }}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <KeyRound className="h-3 w-3" />
              {mode === 'totp' ? 'Use a backup code instead' : 'Use authenticator app instead'}
            </button>
            <Button
              onClick={submit}
              disabled={busy || code.length < (mode === 'totp' ? 6 : 8)}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Verify
            </Button>
          </div>

          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full text-[11px] text-muted-foreground hover:text-foreground"
          >
            Sign out instead
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
