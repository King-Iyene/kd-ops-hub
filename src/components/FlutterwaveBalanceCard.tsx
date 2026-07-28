// src/components/FlutterwaveBalanceCard.tsx
//
// Compact Flutterwave wallet card for the Payments page. Mirrors the essential
// display of PaystackBalanceCard (balance + funding info) but keeps the
// chrome smaller — it's the SECONDARY card most of the time and only becomes
// primary when Flutterwave is the active provider.
//
// Displays:
//   • Current Flutterwave NGN wallet balance (hide/show + refresh)
//   • Whether the active provider is Flutterwave (● LIVE pill) or not (○ Standby)
//   • Funding-account details from company_settings.flutterwave_funding_*
//     so an operator can copy-paste into a banking app to top up
//
// Reads its own balance via getProviderBalance('flutterwave') on mount +
// on Refresh click. Deliberately doesn't share state with PaystackBalanceCard
// so a failure fetching one balance never hides the other.

import { useEffect, useState } from 'react';
import { Wallet, RefreshCw, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getProviderBalance } from '@/lib/payments/item-facade';
import { supabase } from '@/lib/supabase';

const LOW_BALANCE_THRESHOLD = 50_000;
const CRITICAL_BALANCE_THRESHOLD = 5_000;

const fmtNaira = (n: number | null | undefined, hidden = false) =>
  hidden ? '••••••' : (n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

interface Funding {
  bank: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

export function FlutterwaveBalanceCard({ balanceHidden, toggleBalanceHidden }: {
  balanceHidden: boolean;
  toggleBalanceHidden: () => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'test' | 'live'>('test');
  const [funding, setFunding] = useState<Funding>({ bank: null, accountName: null, accountNumber: null });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [balRes, settingsRes] = await Promise.all([
        getProviderBalance('flutterwave'),
        supabase.from('company_settings')
          .select('active_payment_provider, flutterwave_mode, flutterwave_funding_bank, flutterwave_funding_account_name, flutterwave_funding_account_number')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      if (balRes.error) setError(balRes.error);
      else setBalance(balRes.available);
      const s = (settingsRes.data as any) || {};
      setIsActive(s.active_payment_provider === 'flutterwave');
      setMode(s.flutterwave_mode === 'live' ? 'live' : 'test');
      setFunding({
        bank: s.flutterwave_funding_bank ?? null,
        accountName: s.flutterwave_funding_account_name ?? null,
        accountNumber: s.flutterwave_funding_account_number ?? null,
      });
    } finally {
      setLoading(false);
    }
  }

  async function copy(label: string, text: string | null) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch { /* ignore */ }
  }

  // Tone by balance — dim when standby, brighter when active.
  const tone: 'critical' | 'low' | 'healthy' | 'unknown' =
    balance == null ? 'unknown'
    : balance < CRITICAL_BALANCE_THRESHOLD ? 'critical'
    : balance < LOW_BALANCE_THRESHOLD ? 'low'
    : 'healthy';

  const activeStyles = isActive
    ? 'border-2 border-amber-300 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm'
    : 'border opacity-70 grayscale-[30%]';

  return (
    <div className={cn('rounded-lg p-3 min-w-[220px]', activeStyles)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className={cn(
            'p-1 rounded',
            isActive ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-muted',
          )}>
            <Wallet className={cn('h-3.5 w-3.5', isActive ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground">Flutterwave</span>
          {isActive ? (
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">● LIVE</span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground">○ Standby</span>
          )}
          <span className={cn(
            'text-[9px] px-1 py-0.5 rounded font-bold',
            mode === 'live' ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
          )}>
            {mode.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleBalanceHidden}
            className="p-1 rounded hover:bg-muted"
            title={balanceHidden ? 'Show balance' : 'Hide balance'}
          >
            {balanceHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
          <button
            onClick={loadAll}
            className="p-1 rounded hover:bg-muted"
            disabled={loading}
            title="Refresh balance"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="mb-1">
        <div className="text-[10px] uppercase text-muted-foreground font-medium tracking-wide">Available</div>
        <div className={cn(
          'text-lg font-mono font-semibold tabular-nums',
          tone === 'critical' && 'text-red-600',
          tone === 'low' && 'text-amber-700',
        )}>
          {loading ? '…' : fmtNaira(balance, balanceHidden)}
        </div>
        {error && <div className="text-[10px] text-red-600">{error}</div>}
      </div>

      {(funding.accountNumber || funding.bank) && (
        <div className="pt-2 border-t border-border/60 space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground font-medium tracking-wide mb-0.5">Fund via bank transfer</div>
          {funding.bank && (
            <div className="text-xs flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Bank</span>
              <span className="font-medium truncate">{funding.bank}</span>
            </div>
          )}
          {funding.accountName && (
            <div className="text-xs flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium truncate">{funding.accountName}</span>
            </div>
          )}
          {funding.accountNumber && (
            <div className="text-xs flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Acct #</span>
              <button
                onClick={() => copy('acct', funding.accountNumber)}
                className="font-mono font-medium flex items-center gap-1 hover:text-primary"
              >
                {funding.accountNumber}
                {copied === 'acct' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
