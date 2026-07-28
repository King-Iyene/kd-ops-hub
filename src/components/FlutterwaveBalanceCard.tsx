/**
 * FlutterwaveBalanceCard
 *
 * Mirrors PaystackBalanceCard's structure exactly so the two wallets sit
 * side-by-side without visual drift — same rounded-2xl chrome, same
 * accent-strip, same tone-based colour bands, same funding-rows and
 * action grid.
 *
 * Additions unique to Flutterwave:
 *   - "● LIVE" vs "○ Standby" indicator so operators can tell at a glance
 *     which rail is currently paying (mirrored on both cards; only one
 *     card shows LIVE at any moment).
 *   - TEST / LIVE mode pill in the header row — Flutterwave lets us hold
 *     both key sets and switch modes, so this is the source-of-truth
 *     indicator for whether the wallet you're looking at is play-money
 *     or real-money.
 *
 * Self-fetches balance + mode + funding + active-provider on mount so it
 * doesn't have to receive them as props — this keeps Payments.tsx
 * changes minimal and lets the card stand alone anywhere it's dropped.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, RefreshCw, AlertTriangle, Eye, EyeOff, Copy, Check,
  Plus, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getProviderBalance } from '@/lib/payments/item-facade';
import { supabase } from '@/lib/supabase';

const LOW_BALANCE_THRESHOLD = 50_000;
const CRITICAL_BALANCE_THRESHOLD = 5_000;

type Tone = 'healthy' | 'low' | 'critical' | 'unknown';

const toneFor = (available: number | null): Tone => {
  if (available === null) return 'unknown';
  if (available < CRITICAL_BALANCE_THRESHOLD) return 'critical';
  if (available < LOW_BALANCE_THRESHOLD) return 'low';
  return 'healthy';
};

// Same tone table as PaystackBalanceCard so the two cards read as one
// system. The only place we deviate from Paystack is the DEFAULT 'healthy'
// tone when Flutterwave is the ACTIVE provider — we swap the emerald
// accent for amber so the active card visually announces "Flutterwave is
// paying right now" without needing to read the pill. When Flutterwave is
// standby, we keep the neutral tone so it doesn't compete with Paystack.
const TONE: Record<Tone, {
  accentBar:  string;
  iconWrap:   string;
  icon:       string;
  dot:        string;
  dotPulse:   string;
  amount:     string;
  banner?:    string;
  bannerText?: string;
  caption:    string;
}> = {
  healthy: {
    accentBar:  'bg-gradient-to-r from-amber-400/40 via-amber-500 to-orange-400/40',
    iconWrap:   'bg-amber-500/10 dark:bg-amber-400/10',
    icon:       'text-amber-600 dark:text-amber-400',
    dot:        'bg-amber-500',
    dotPulse:   'kd-status-live-warning',
    amount:     'text-foreground',
    caption:    'text-muted-foreground',
  },
  low: {
    accentBar:  'bg-gradient-to-r from-amber-500/50 via-amber-600 to-amber-400/40',
    iconWrap:   'bg-amber-500/10 dark:bg-amber-400/10',
    icon:       'text-amber-700 dark:text-amber-300',
    dot:        'bg-amber-500',
    dotPulse:   'kd-status-live-warning',
    amount:     'text-foreground',
    banner:     'bg-amber-500/10 border border-amber-500/20 dark:bg-amber-400/10 dark:border-amber-400/20',
    bannerText: 'text-amber-700 dark:text-amber-300',
    caption:    'text-amber-700 dark:text-amber-300/90',
  },
  critical: {
    accentBar:  'bg-gradient-to-r from-red-500/40 via-red-500 to-rose-400/40',
    iconWrap:   'bg-red-500/10 dark:bg-red-400/10',
    icon:       'text-red-600 dark:text-red-400',
    dot:        'bg-red-500',
    dotPulse:   'kd-status-live-danger',
    amount:     'text-red-600 dark:text-red-400',
    banner:     'bg-red-500/10 border border-red-500/20 dark:bg-red-400/10 dark:border-red-400/20',
    bannerText: 'text-red-700 dark:text-red-300',
    caption:    'text-red-700 dark:text-red-300/90',
  },
  unknown: {
    accentBar:  'bg-gradient-to-r from-slate-400/30 via-slate-500/40 to-slate-400/30',
    iconWrap:   'bg-muted',
    icon:       'text-muted-foreground',
    dot:        'bg-muted-foreground',
    dotPulse:   '',
    amount:     'text-foreground',
    caption:    'text-muted-foreground',
  },
};

const fmtCompactNgn = (n: number) =>
  n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Funding {
  bank: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

interface Props {
  balanceHidden: boolean;
  toggleBalanceHidden: () => void;
}

export function FlutterwaveBalanceCard({ balanceHidden, toggleBalanceHidden }: Props) {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'test' | 'live'>('test');
  const [funding, setFunding] = useState<Funding>({ bank: null, accountName: null, accountNumber: null });

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      const [balRes, settingsRes] = await Promise.all([
        getProviderBalance('flutterwave').catch(() => ({ available: null, error: 'fetch-failed' } as any)),
        supabase.from('company_settings')
          .select('active_payment_provider, flutterwave_mode, flutterwave_funding_bank, flutterwave_funding_account_name, flutterwave_funding_account_number')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      if ((balRes as any).error) {
        setBalanceError(true);
      } else {
        setBalance((balRes as any).available);
        setBalanceError(false);
      }
      setBalanceUpdatedAt(new Date().toISOString());
      const s = (settingsRes.data as any) || {};
      setIsActive(s.active_payment_provider === 'flutterwave');
      setMode(s.flutterwave_mode === 'live' ? 'live' : 'test');
      setFunding({
        bank: s.flutterwave_funding_bank ?? null,
        accountName: s.flutterwave_funding_account_name ?? null,
        accountNumber: s.flutterwave_funding_account_number ?? null,
      });
    } finally {
      setBalanceLoading(false);
    }
  }

  async function refreshBalance() {
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      const balRes = await getProviderBalance('flutterwave').catch(() => ({ available: null, error: 'fetch-failed' } as any));
      if ((balRes as any).error) setBalanceError(true);
      else { setBalance((balRes as any).available); setBalanceError(false); }
      setBalanceUpdatedAt(new Date().toISOString());
    } finally {
      setBalanceLoading(false);
    }
  }

  const tone = toneFor(balance);
  const t = TONE[tone];
  const hasFunding = !!funding && (!!funding.bank || !!funding.accountName || !!funding.accountNumber);

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card overflow-hidden kd-transition',
        'w-full sm:w-auto sm:min-w-[300px] sm:max-w-[340px]',
        // Two visual states — dramatically different so operators never
        // mistake which rail is active. Mercury / Ramp / Brex do exactly
        // this: active card sits forward with a subtle brand halo, standby
        // recedes with heavy grayscale + reduced opacity + slight scale-down.
        isActive
          ? [
              'shadow-[0_2px_16px_-4px_rgba(245,158,11,0.20)]',
              'hover:shadow-[0_4px_24px_-4px_rgba(245,158,11,0.30)]',
              'ring-1 ring-amber-500/25 dark:ring-amber-400/25',
            ]
          : [
              'opacity-55 saturate-[0.35] scale-[0.97] hover:opacity-70 hover:saturate-100 hover:scale-100',
              'shadow-none border-border/50',
            ],
      )}
    >
      {/* Top accent strip */}
      <div className={cn('h-[3px] w-full', t.accentBar)} />

      <div className="p-4">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', t.iconWrap)}>
              <Wallet className={cn('h-3.5 w-3.5', t.icon)} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Flutterwave Wallet
              </p>
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <span>NGN</span>
                {/* Mode pill — TEST (amber gradient) vs LIVE (red gradient).
                    Instantly readable so operators can never confuse test-mode
                    balance with real money. */}
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wider leading-[1.4]',
                    mode === 'live'
                      ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
                      : 'bg-gradient-to-r from-amber-500 to-orange-400 text-white',
                  )}
                >
                  {mode}
                </span>
              </p>
            </div>
            {/* LIVE / Standby status badge — full pill with gradient bg when
                active, pulsing dot to draw the eye. When standby, muted
                outlined pill with quiet dot. Same visual grammar as the
                Paystack card so the two feel like one system. */}
            <span
              className={cn(
                'ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none whitespace-nowrap kd-transition',
                isActive
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_2px_8px_-2px_rgba(245,158,11,0.5)]'
                  : 'border border-border/60 text-muted-foreground bg-muted/30',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isActive
                    ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)] kd-status-live-warning'
                    : 'bg-muted-foreground/50',
                )}
              />
              {isActive ? 'LIVE' : 'Standby'}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={toggleBalanceHidden}
              label={balanceHidden ? 'Show balance' : 'Hide balance'}
            >
              {balanceHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton
              onClick={refreshBalance}
              disabled={balanceLoading}
              label="Refresh balance"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', balanceLoading && 'animate-spin')} />
            </IconButton>
          </div>
        </div>

        {/* ── Balance ──────────────────────────────────────────── */}
        {balanceLoading && balance === null ? (
          <div className="space-y-1.5">
            <div className="h-9 w-40 kd-skeleton rounded" />
            <div className="h-3 w-28 kd-skeleton rounded" />
          </div>
        ) : balanceError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
            <p className="text-xs font-medium text-destructive">Could not load balance</p>
            <button
              onClick={refreshBalance}
              className="text-[11px] text-destructive/80 hover:text-destructive underline underline-offset-2 mt-0.5"
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-base font-medium leading-none mt-1', t.amount)}>₦</span>
              <span className={cn('text-3xl font-bold tracking-tight tabular-nums leading-none', t.amount)}>
                {balanceHidden ? '•••••••' : (balance != null ? fmtCompactNgn(balance) : '—')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', t.dot, t.dotPulse)} />
                <span className={cn('text-[11px] truncate', t.caption)}>
                  {tone === 'critical'
                    ? 'Critical — fund now'
                    : tone === 'low'
                      ? 'Low — fund before processing'
                      : 'Available for transfers'}
                </span>
              </div>
              {balanceUpdatedAt && (
                <RelativeAge iso={balanceUpdatedAt} className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0" />
              )}
            </div>
          </div>
        )}

        {/* ── Low / critical banner ────────────────────────────── */}
        {(tone === 'low' || tone === 'critical') && t.banner && (
          <div className={cn('flex items-start gap-2 mt-3 rounded-lg px-2.5 py-2', t.banner)}>
            <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', t.bannerText)} />
            <p className={cn('text-[11px] leading-snug font-medium', t.bannerText)}>
              {tone === 'critical'
                ? 'Wallet is critically low. Fund this account before any new transfers.'
                : 'Top up before your next batch — funded transfers won\'t go out otherwise.'}
            </p>
          </div>
        )}

        {/* ── Funding details ──────────────────────────────────── */}
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              Fund this account
            </p>
            {hasFunding && (
              <button
                onClick={() => navigate('/settings#payment-rails')}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground kd-transition"
                title="Edit funding details in Settings"
              >
                Edit
              </button>
            )}
          </div>

          {hasFunding ? (
            <div className="space-y-0.5">
              {funding.bank && <FundingRow label="Bank" value={funding.bank} />}
              {funding.accountName && <FundingRow label="Name" value={funding.accountName} />}
              {funding.accountNumber && <FundingRow label="Account" value={funding.accountNumber} mono />}
            </div>
          ) : (
            <button
              onClick={() => navigate('/settings#payment-rails')}
              className={cn(
                'group flex w-full items-center justify-between gap-2 rounded-lg',
                'border border-dashed border-border/80 hover:border-primary/40',
                'bg-muted/30 hover:bg-primary/5',
                'px-2.5 py-2 kd-transition',
              )}
              title="Add Flutterwave funding details in Settings"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                <Plus className="h-3 w-3" />
                Add funding account
              </span>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary" />
            </button>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-medium"
            onClick={() => window.open('https://app.flutterwave.com/dashboard/wallets', '_blank')}
          >
            Fund Wallet
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-medium"
            onClick={() => window.open('https://app.flutterwave.com/dashboard/payouts', '_blank')}
          >
            Transfers
            <ArrowUpRight className="ml-0.5 h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components (identical to PaystackBalanceCard so the two feel
// like one system) ────────────────────────────────────────────────────

function IconButton({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md',
        'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
        'kd-transition disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function FundingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* ignore */ }
  };
  return (
    <CopyButton onCopy={onCopy} label={label}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0 w-14">{label}</span>
      <span className={cn(
        'text-[11.5px] font-medium text-foreground truncate flex-1 text-right',
        mono && 'font-mono tracking-tight',
      )}>{value}</span>
    </CopyButton>
  );
}

function CopyButton({
  children, onCopy, label,
}: {
  children: React.ReactNode;
  onCopy: () => void;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={cn(
        'group flex w-full items-center justify-between gap-2 text-left',
        'rounded-md px-1.5 -mx-1.5 py-1 hover:bg-muted/60 kd-transition',
      )}
      title={`Copy ${label.toLowerCase()}`}
    >
      {children}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground shrink-0 kd-transition" />
      )}
    </button>
  );
}

function RelativeAge({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const ageMs = now - new Date(iso).getTime();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = ageMs < 60_000 ? 5_000 : 30_000;
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [ageMs]);

  let label: string;
  if (ageMs < 5_000) label = 'just now';
  else if (ageMs < 60_000) label = `${Math.round(ageMs / 1_000)} sec ago`;
  else if (ageMs < 3_600_000) {
    const m = Math.round(ageMs / 60_000);
    label = `${m} min${m === 1 ? '' : 's'} ago`;
  } else if (ageMs < 86_400_000) {
    const h = Math.round(ageMs / 3_600_000);
    label = `${h}h ago`;
  } else {
    const d = Math.round(ageMs / 86_400_000);
    label = `${d}d ago`;
  }

  return (
    <span className={className} title={new Date(iso).toLocaleString('en-NG')}>
      Updated {label}
    </span>
  );
}
