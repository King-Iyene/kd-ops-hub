// src/components/payments/ProviderPill.tsx
//
// Compact provider indicator used across batch cards, receipts, item rows,
// and anywhere else the UI needs to say "this went through Paystack" or
// "this went through Flutterwave" at a glance.
//
// Colour convention:
//   Paystack     → emerald/green (KDOps has always shown Paystack as green)
//   Flutterwave  → amber/orange   (Flutterwave's brand colour)
//
// Sizes:
//   'xs'  — small inline pill for item rows
//   'sm'  — default; batch cards, receipts
//   'md'  — Settings page headers

import { providerLabel, providerShort, type Provider } from '@/lib/payments/item-facade';

interface ProviderPillProps {
  provider: Provider | string | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'full' | 'short';   // 'full' = "Paystack"; 'short' = "PS"
  className?: string;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-1',
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
};

export function ProviderPill({
  provider,
  size = 'sm',
  variant = 'full',
  className = '',
}: ProviderPillProps) {
  const norm: Provider = provider === 'flutterwave' ? 'flutterwave' : 'paystack';
  const label = variant === 'short' ? providerShort(norm) : providerLabel(norm);

  // Tailwind classes chosen so the pill is legible in both light and dark mode.
  const colour = norm === 'flutterwave'
    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/50'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700/50';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium leading-none ${SIZE_CLASSES[size]} ${colour} ${className}`}
      title={`Paid via ${providerLabel(norm)}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${norm === 'flutterwave' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {label}
    </span>
  );
}
