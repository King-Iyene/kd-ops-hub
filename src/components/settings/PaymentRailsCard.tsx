// src/components/settings/PaymentRailsCard.tsx
//
// The Settings → Payment Rails section. Super_admin only.
//
// Renders:
//   1. Two provider cards side-by-side: ACTIVE (full colour) and STANDBY
//      (greyscale + dimmed) — the visual "who's live right now" indicator.
//   2. Flutterwave Mode sub-toggle (test | live) — only visible when
//      Flutterwave is (or is about to become) the active provider.
//   3. Switch dialog with a live preflight check + typed confirmation.
//   4. Provider-switch history (last 10 flips), sortable, readable.
//
// The Preflight step calls the provider-switch edge function with
// { action: 'preflight' } BEFORE the confirm button becomes enabled.
// If the target provider is unreachable or its secret is missing, the
// switch cannot proceed. This is the single most important safety
// mechanism in the whole flip flow — we never trust the toggle to
// enable something the target provider hasn't proven itself for.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ArrowRightLeft, Check, AlertTriangle, X } from 'lucide-react';
import { ProviderPill } from '@/components/payments/ProviderPill';
import { getProviderBalance, providerLabel, type Provider } from '@/lib/payments/item-facade';

// supabase.functions.invoke() collapses any non-2xx response into a generic
// FunctionsHttpError whose .message is just "Edge Function returned a
// non-2xx status code" — the real reason lives in the response body
// (error.context), which we have to read and parse ourselves.
async function extractEdgeError(error: any, fallback: string): Promise<string> {
  try {
    const response = error?.context;
    if (response && typeof response.text === 'function') {
      const raw = await response.text();
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.error || parsed.message || fallback;
      }
    }
  } catch {
    // fall through to fallback
  }
  return error?.message || fallback;
}

interface PaymentRailsSettings {
  active_payment_provider: Provider;
  flutterwave_mode: 'test' | 'live';
  paystack_mode: 'test' | 'live';
  provider_switched_at: string | null;
  provider_switched_by: string | null;
}

interface ProviderSwitchRow {
  id: string;
  switched_at: string;
  switched_by: string | null;
  from_provider: string;
  to_provider: string;
  reason: string | null;
  actor_name?: string | null;
}

interface PreflightResult {
  ok: boolean;
  target_provider: Provider;
  target_mode: 'test' | 'live' | null;
  balance: number | null;
  error: string | null;
  current: { provider: Provider; mode: 'test' | 'live' };
}

const formatNaira = (n: number | null | undefined) =>
  n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDateTime = (iso: string | null | undefined) =>
  !iso ? '—' : new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function PaymentRailsCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [settings, setSettings] = useState<PaymentRailsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<{ paystack: number | null; flutterwave: number | null }>({
    paystack: null,
    flutterwave: null,
  });
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [switchHistory, setSwitchHistory] = useState<ProviderSwitchRow[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTargetProvider, setDialogTargetProvider] = useState<Provider>('paystack');
  const [dialogTargetMode, setDialogTargetMode] = useState<'test' | 'live'>('test');
  const [dialogModeOnly, setDialogModeOnly] = useState(false);  // switching FW mode, not provider
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [reason, setReason] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [settingsRes, historyRes] = await Promise.all([
        supabase.from('company_settings')
          .select('active_payment_provider, flutterwave_mode, paystack_mode, provider_switched_at, provider_switched_by')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
        supabase.from('provider_switches')
          .select('id, switched_at, switched_by, from_provider, to_provider, reason')
          .order('switched_at', { ascending: false })
          .limit(10),
      ]);
      if (settingsRes.data) {
        setSettings({
          active_payment_provider: (settingsRes.data as any).active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack',
          flutterwave_mode: (settingsRes.data as any).flutterwave_mode === 'live' ? 'live' : 'test',
          paystack_mode: (settingsRes.data as any).paystack_mode === 'test' ? 'test' : 'live',
          provider_switched_at: (settingsRes.data as any).provider_switched_at,
          provider_switched_by: (settingsRes.data as any).provider_switched_by,
        });
      }
      if (historyRes.data) setSwitchHistory(historyRes.data as any);
      await refreshBalances();
    } catch (e) {
      console.error('[PaymentRails] load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshBalances() {
    setBalancesLoading(true);
    try {
      const [ps, fw] = await Promise.all([
        getProviderBalance('paystack').catch(() => ({ available: null })),
        getProviderBalance('flutterwave').catch(() => ({ available: null })),
      ]);
      setBalances({ paystack: ps.available, flutterwave: fw.available });
    } finally {
      setBalancesLoading(false);
    }
  }

  function openSwitchDialog(toProvider: Provider) {
    setDialogTargetProvider(toProvider);
    const currentMode = toProvider === 'flutterwave'
      ? (settings?.flutterwave_mode || 'test')
      : (settings?.paystack_mode || 'live');
    setDialogTargetMode(currentMode);
    setDialogModeOnly(false);
    setPreflight(null);
    setConfirmationText('');
    setReason('');
    setDialogOpen(true);
    void runPreflight(toProvider, currentMode);
  }

  function openModeSwitchDialog(provider: Provider, toMode: 'test' | 'live') {
    setDialogTargetProvider(provider);
    setDialogTargetMode(toMode);
    setDialogModeOnly(true);
    setPreflight(null);
    setConfirmationText('');
    setReason('');
    setDialogOpen(true);
    void runPreflight(provider, toMode);
  }

  async function runPreflight(to: Provider, mode: 'test' | 'live') {
    setPreflightLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-switch', {
        body: { action: 'preflight', to_provider: to, to_mode: mode },
      });
      if (error) {
        const message = await extractEdgeError(error, 'Preflight failed');
        setPreflight({
          ok: false, target_provider: to, target_mode: to === 'flutterwave' ? mode : null,
          balance: null, error: message,
          current: { provider: settings?.active_payment_provider || 'paystack', mode: settings?.flutterwave_mode || 'test' },
        });
      } else {
        setPreflight(data as PreflightResult);
      }
    } finally {
      setPreflightLoading(false);
    }
  }

  async function applySwitch() {
    if (!preflight?.ok) return;
    const expected = dialogModeOnly ? dialogTargetMode.toUpperCase() : dialogTargetProvider.toUpperCase();
    if (confirmationText !== expected) return;
    if (!reason.trim()) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-switch', {
        body: {
          action: 'switch',
          to_provider: dialogTargetProvider,
          to_mode: dialogTargetMode,
          reason: reason.trim(),
          confirmation: confirmationText,
        },
      });
      if (error) {
        const message = await extractEdgeError(error, 'Try again');
        toast({ variant: 'destructive', title: 'Switch failed', description: message });
      } else if ((data as any)?.error) {
        toast({ variant: 'destructive', title: 'Switch rejected', description: (data as any).error });
      } else {
        toast({ title: 'Switch applied', description: `Now paying through ${providerLabel(dialogTargetProvider)} (${dialogTargetMode})` });
        setDialogOpen(false);
        await loadAll();
      }
    } finally {
      setApplying(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Payment rails</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only a super_admin can change which payment provider handles disbursements.
          </p>
          {settings && (
            <p className="text-sm mt-2">
              Currently paying through <ProviderPill provider={settings.active_payment_provider} size="sm" />
              {settings.active_payment_provider === 'flutterwave' && (
                <> (mode: <strong className={settings.flutterwave_mode === 'live' ? 'text-red-600' : 'text-amber-600'}>
                  {settings.flutterwave_mode.toUpperCase()}
                </strong>)</>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading || !settings) {
    return (
      <Card><CardHeader><CardTitle className="text-base">Payment rails</CardTitle></CardHeader>
      <CardContent><Loader2 className="animate-spin h-4 w-4" /></CardContent></Card>
    );
  }

  const active = settings.active_payment_provider;

  return (
    <>
      <Card id="payment-rails" className="scroll-mt-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Payment rails</span>
            <Button variant="ghost" size="sm" onClick={refreshBalances} disabled={balancesLoading}>
              {balancesLoading ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Currently paying through <ProviderPill provider={active} size="md" />
            {active === 'flutterwave' && (
              <> — mode: <strong className={settings.flutterwave_mode === 'live' ? 'text-red-600' : 'text-amber-600'}>
                {settings.flutterwave_mode.toUpperCase()}
              </strong></>
            )}
            {active === 'paystack' && (
              <> — mode: <strong className={settings.paystack_mode === 'live' ? 'text-red-600' : 'text-amber-600'}>
                {settings.paystack_mode.toUpperCase()}
              </strong></>
            )}
            {settings.provider_switched_at && (
              <span className="block text-xs mt-1">Last switched {formatDateTime(settings.provider_switched_at)}</span>
            )}
          </div>

          {/* Two provider cards side-by-side */}
          <div className="grid gap-3 md:grid-cols-2">
            <ProviderCard
              provider="paystack"
              isActive={active === 'paystack'}
              balance={balances.paystack}
              mode={settings.paystack_mode}
              onSwitchTo={() => openSwitchDialog('paystack')}
              onSwitchMode={(m) => openModeSwitchDialog('paystack', m)}
            />
            <ProviderCard
              provider="flutterwave"
              isActive={active === 'flutterwave'}
              balance={balances.flutterwave}
              mode={settings.flutterwave_mode}
              onSwitchTo={() => openSwitchDialog('flutterwave')}
              onSwitchMode={(m) => openModeSwitchDialog('flutterwave', m)}
            />
          </div>

          {/* Switch history */}
          {switchHistory.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent switches</p>
              <div className="space-y-1 text-xs">
                {switchHistory.map((h) => (
                  <div key={h.id} className="flex items-baseline gap-2">
                    <span className="text-muted-foreground w-32 flex-shrink-0">{formatDateTime(h.switched_at)}</span>
                    <ProviderPill provider={h.from_provider} size="xs" variant="short" />
                    <span className="text-muted-foreground">→</span>
                    <ProviderPill provider={h.to_provider} size="xs" variant="short" />
                    {h.reason && <span className="text-muted-foreground truncate">— {h.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {dialogModeOnly
                ? <>Switch {providerLabel(dialogTargetProvider)} mode to <span className={dialogTargetMode === 'live' ? 'text-red-600' : 'text-amber-600'}>{dialogTargetMode.toUpperCase()}</span></>
                : <>Switch payment provider to <ProviderPill provider={dialogTargetProvider} size="sm" /></>
              }
            </DialogTitle>
            <DialogDescription>
              This affects only NEW batches. In-flight batches finish on their existing provider.
            </DialogDescription>
          </DialogHeader>

          {/* Preflight status */}
          <div className="rounded-md border p-3 text-sm space-y-2 bg-muted/30">
            <p className="font-medium">Preflight check</p>
            {preflightLoading ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying target provider is reachable…</p>
            ) : preflight?.ok ? (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> {providerLabel(dialogTargetProvider)} is reachable</p>
                <p className="text-muted-foreground">Balance: <strong>{formatNaira(preflight.balance)}</strong></p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-red-700 dark:text-red-400"><X className="h-3.5 w-3.5" /> {preflight?.error || 'Preflight failed'}</p>
                <p className="text-muted-foreground text-xs">Fix the underlying issue (missing secret, wrong key, network) before switching.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="switch-reason">Reason for switch <span className="text-red-500">*</span></Label>
              <Textarea
                id="switch-reason"
                placeholder="e.g. Paystack balance low, testing Flutterwave, monthly rotation…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">Written to the append-only audit trail.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="switch-confirm">
                To confirm, type: <strong className="font-mono">{dialogModeOnly ? dialogTargetMode.toUpperCase() : dialogTargetProvider.toUpperCase()}</strong>
              </Label>
              <Input
                id="switch-confirm"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type here to confirm"
                autoComplete="off"
              />
            </div>
            {dialogTargetMode === 'live' && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-800 dark:text-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Switching to <strong>LIVE</strong> mode on {providerLabel(dialogTargetProvider)}. Real money will move. Test with a small ₦100 batch before running payroll.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={applySwitch}
              disabled={
                !preflight?.ok
                || applying
                || !reason.trim()
                || confirmationText !== (dialogModeOnly ? dialogTargetMode.toUpperCase() : dialogTargetProvider.toUpperCase())
              }
            >
              {applying ? <><Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />Applying…</> : 'Confirm switch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// One of the two side-by-side provider cards.
// Active card: full brand colour. Inactive: grayscale + reduced opacity.
// ─────────────────────────────────────────────────────────────────────────
function ProviderCard({
  provider,
  isActive,
  balance,
  mode,
  onSwitchTo,
  onSwitchMode,
}: {
  provider: Provider;
  isActive: boolean;
  balance: number | null;
  mode?: 'test' | 'live';
  onSwitchTo: () => void;
  onSwitchMode?: (m: 'test' | 'live') => void;
}) {
  const label = providerLabel(provider);
  const style = isActive
    ? 'border-2 shadow-sm ' + (provider === 'flutterwave'
        ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'
        : 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20')
    : 'opacity-60 grayscale border';

  return (
    <div className={`rounded-lg p-3 transition ${style}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ProviderPill provider={provider} size="md" />
          <span className={`text-xs font-semibold ${isActive ? (provider === 'flutterwave' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300') : 'text-muted-foreground'}`}>
            {isActive ? '● LIVE' : '○ Standby'}
          </span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-1">Balance</div>
      <div className="text-lg font-mono font-semibold mb-2">{formatNaira(balance)}</div>

      {mode && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Mode:</span>
          <button
            onClick={() => onSwitchMode?.('test')}
            className={`px-2 py-0.5 rounded border ${mode === 'test' ? 'bg-amber-100 text-amber-800 border-amber-300 font-medium dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-600' : 'text-muted-foreground'}`}
          >TEST</button>
          <button
            onClick={() => onSwitchMode?.('live')}
            className={`px-2 py-0.5 rounded border ${mode === 'live' ? 'bg-red-100 text-red-800 border-red-300 font-medium dark:bg-red-950/40 dark:text-red-200 dark:border-red-600' : 'text-muted-foreground'}`}
          >LIVE</button>
        </div>
      )}

      {!isActive ? (
        <Button size="sm" variant="outline" className="w-full" onClick={onSwitchTo}>
          Switch to {label} →
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground pt-1">
          Currently processing all new payments.
        </p>
      )}
    </div>
  );
}
