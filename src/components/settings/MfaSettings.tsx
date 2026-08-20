// Profile → Security → MFA panel
//
// Opt-in TOTP enrolment for the signed-in user. Available to ALL roles.
//
// Flow:
//   "Enable MFA" → Enrol modal:
//     1. Fetch QR code + secret from supabase.auth.mfa.enroll()
//     2. User scans into authenticator app
//     3. User enters 6-digit code → verify factor
//     4. Show one-time list of 10 backup codes; require user to confirm "saved"
//     5. Done
//   "Disable MFA" → unenroll factor + wipe trusted devices + wipe backup codes
//
// Trusted devices list shows browsers/devices that have skipped the challenge
// recently, with a Revoke button.

import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  KeyRound,
  Copy,
  Loader2,
  Trash2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { confirm } from '@/hooks/use-confirm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  listMfaFactors,
  enrollMfa,
  verifyMfa,
  disableMfa,
  generateBackupCodes,
  countUnusedBackupCodes,
  listTrustedDevices,
  revokeTrustedDevice,
} from '@/lib/mfa';

type EnrolStep = 'idle' | 'qr' | 'verify' | 'backup' | 'done';

export default function MfaSettings() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [unusedCodes, setUnusedCodes] = useState(0);
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof listTrustedDevices>>>([]);

  // Enrol modal state
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [step, setStep] = useState<EnrolStep>('idle');
  const [qrSvg, setQrSvg] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [acked, setAcked] = useState(false);
  const [busy, setBusy] = useState(false);

  // Disable modal
  const [disableOpen, setDisableOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [f, c, d] = await Promise.all([
        listMfaFactors(),
        countUnusedBackupCodes(),
        listTrustedDevices(),
      ]);
      setEnabled(f.totpEnrolled);
      setFactorId(f.factorId);
      setUnusedCodes(c);
      setDevices(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  // ── Enrolment ───────────────────────────────────────────────────────────
  const startEnrolment = async () => {
    setEnrolOpen(true);
    setStep('qr');
    setBusy(true);
    setCode('');
    try {
      const { factorId: fid, qrCodeSvg, secret: s } = await enrollMfa();
      setPendingFactorId(fid);
      setQrSvg(qrCodeSvg);
      setSecret(s);
    } catch (e: any) {
      toast({ title: 'Enrolment failed', description: e?.message, variant: 'destructive' });
      setEnrolOpen(false);
      setStep('idle');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingFactorId || code.length < 6) return;
    setBusy(true);
    try {
      await verifyMfa(pendingFactorId, code);
      // Generate backup codes immediately so the user gets them now.
      const fresh = await generateBackupCodes();
      setCodes(fresh);
      setStep('backup');
    } catch (e: any) {
      toast({ title: 'Verification failed', description: e?.message ?? 'Wrong code', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const finishEnrolment = async () => {
    setEnrolOpen(false);
    setStep('idle');
    setQrSvg('');
    setSecret('');
    setCode('');
    setCodes([]);
    setAcked(false);
    setShowSecret(false);
    setPendingFactorId(null);
    await reload();
    toast({ title: 'MFA enabled', description: 'You\'ll be prompted for a code on your next sign-in.' });
  };

  // ── Disable ─────────────────────────────────────────────────────────────
  // Supabase requires AAL2 to unenroll a verified factor. If the session
  // is only AAL1, disableMfa throws 'NEEDS_CODE' and we reveal a code
  // input so the user can prove possession of the authenticator, which
  // elevates the session before the unenroll retries.
  const [disableCode, setDisableCode] = useState('');
  const [disableNeedsCode, setDisableNeedsCode] = useState(false);

  const handleDisable = async () => {
    if (!factorId) return;
    setBusy(true);
    try {
      await disableMfa(factorId, disableNeedsCode ? disableCode : undefined);
      toast({ title: 'MFA disabled' });
      setDisableOpen(false);
      setDisableNeedsCode(false);
      setDisableCode('');
      await reload();
    } catch (e: any) {
      if (e?.message === 'NEEDS_CODE') {
        // First click while only AAL1 — reveal the code field and ask
        // the user to enter their current authenticator code.
        setDisableNeedsCode(true);
        toast({
          title: 'Confirm with your authenticator',
          description: 'Enter the current 6-digit code to disable MFA.',
        });
      } else {
        toast({ title: 'Could not disable MFA', description: e?.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Backup codes regen (already enrolled) ──────────────────────────────
  const regenerateCodes = async () => {
    if (!(await confirm({ title: 'Regenerate codes?', description: 'Generate a fresh set of backup codes? Existing codes will be invalidated.' }))) return;
    setBusy(true);
    try {
      const fresh = await generateBackupCodes();
      setCodes(fresh);
      setStep('backup');
      setEnrolOpen(true);
      await reload();
    } catch (e: any) {
      toast({ title: 'Could not regenerate', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = () => {
    void navigator.clipboard.writeText(codes.join('\n'));
    toast({ title: 'Backup codes copied' });
  };

  const downloadCodes = () => {
    const blob = new Blob(
      [`KD Ops · MFA backup codes\nGenerated ${new Date().toLocaleString()}\n\n${codes.join('\n')}\n\nKeep these somewhere safe. Each code can be used only once.\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kdops-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {enabled
              ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
              : <ShieldAlert className="h-4 w-4 text-amber-500" />}
            Two-factor authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : enabled ? (
            <>
              <p className="text-sm">
                MFA is <strong>enabled</strong>. New sign-ins ask for a code from your authenticator app
                unless you've trusted the device.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={regenerateCodes}>
                  <KeyRound className="h-3 w-3 mr-1" /> Regenerate backup codes ({unusedCodes} unused)
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDisableOpen(true)}>
                  Disable MFA
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Add a second sign-in step using an authenticator app (Google Authenticator, 1Password,
                Authy, etc.). Optional — KD Ops never requires it. Trusted devices skip the prompt for
                30 days.
              </p>
              <Button onClick={startEnrolment}>
                <Smartphone className="h-4 w-4 mr-2" /> Enable two-factor authentication
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {enabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trusted devices</CardTitle>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No trusted devices yet. Tick "Trust this device" on the next sign-in to add one.
              </p>
            ) : (
              <div className="divide-y">
                {devices.map((d) => (
                  <div key={d.id} className="py-2 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.label || 'Unknown device'}</div>
                      <div className="text-xs text-muted-foreground">
                        Trusted until {new Date(d.trusted_until).toLocaleDateString()} · last seen {new Date(d.last_seen_at).toLocaleString()}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Revoke device" onClick={async () => { await revokeTrustedDevice(d.id); await reload(); }}>
                      <Trash2 className="h-3 w-3 text-rose-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrolment dialog */}
      <Dialog open={enrolOpen} onOpenChange={(o) => { if (!o && step !== 'backup') { setEnrolOpen(false); setStep('idle'); } }}>
        <DialogContent className="max-w-md">
          {step === 'qr' && (
            <>
              <DialogHeader>
                <DialogTitle>Scan with your authenticator</DialogTitle>
                <DialogDescription>
                  Open Google Authenticator, 1Password, Authy, or similar and scan this QR code.
                </DialogDescription>
              </DialogHeader>
              {busy ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="flex justify-center bg-white rounded-md p-4">
                    <img src={`data:image/svg+xml;base64,${btoa(qrSvg)}`} alt="MFA QR code" className="w-48 h-48" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between">
                      Or enter this secret manually
                      <button
                        onClick={() => setShowSecret((s) => !s)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </Label>
                    <div className="flex gap-1">
                      <Input
                        readOnly
                        type={showSecret ? 'text' : 'password'}
                        value={secret}
                        className="font-mono text-xs"
                      />
                      <Button size="icon" variant="outline" aria-label="Copy secret" onClick={() => { void navigator.clipboard.writeText(secret); toast({ title: 'Copied' }); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setEnrolOpen(false); setStep('idle'); }}>Cancel</Button>
                    <Button onClick={() => setStep('verify')}>I've added it · Next</Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}

          {step === 'verify' && (
            <>
              <DialogHeader>
                <DialogTitle>Verify the 6-digit code</DialogTitle>
                <DialogDescription>
                  Enter the current code from your authenticator app to confirm enrolment.
                </DialogDescription>
              </DialogHeader>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="123 456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-center text-lg tracking-widest"
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 6) void handleVerify(); }}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep('qr')}>Back</Button>
                <Button onClick={handleVerify} disabled={code.length < 6 || busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Verify
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'backup' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Save your backup codes</DialogTitle>
                <DialogDescription>
                  Each code can be used <strong>once</strong> if you lose your authenticator. Store them somewhere safe.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md bg-muted/40 p-3 grid grid-cols-2 gap-1.5 font-mono text-xs">
                {codes.map((c) => <div key={c} className="select-all">{c}</div>)}
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                These codes won't be shown again. Copy or download them now.
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyCodes}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                <Button size="sm" variant="outline" onClick={downloadCodes}><Download className="h-3 w-3 mr-1" /> Download</Button>
              </div>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={acked}
                  onChange={(e) => setAcked(e.target.checked)}
                  className="mt-0.5"
                />
                I've saved these codes somewhere safe.
              </label>
              <DialogFooter>
                <Button onClick={finishEnrolment} disabled={!acked}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable confirmation */}
      <Dialog
        open={disableOpen}
        onOpenChange={(o) => {
          setDisableOpen(o);
          if (!o) { setDisableNeedsCode(false); setDisableCode(''); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable MFA?</DialogTitle>
            <DialogDescription>
              Your account will rely on the password alone. Trusted devices and unused backup codes are
              wiped. You can re-enable any time.
            </DialogDescription>
          </DialogHeader>

          {disableNeedsCode && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Enter your current 6-digit authenticator code to confirm
              </Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="123 456"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-center text-lg tracking-widest"
                onKeyDown={(e) => { if (e.key === 'Enter' && disableCode.length >= 6) void handleDisable(); }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Security requires you to prove you still have your authenticator before removing it.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDisableOpen(false); setDisableNeedsCode(false); setDisableCode(''); }}>
              Keep MFA
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={busy || (disableNeedsCode && disableCode.length < 6)}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Disable MFA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" /> MFA is opt-in for every role. Disable any time.
      </p>
    </div>
  );
}
