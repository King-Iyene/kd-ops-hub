import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// The four stages a payroll run actually moves through, in order.
//
// The backend has more statuses than this (`pending_approval`, `processing`)
// but those are plumbing, not stages a person waits in:
//   • "Calculated" is not a stage — totals are computed on the way from Draft
//     to Review, automatically. There is nothing for a user to do about it, so
//     showing it as a step only invites the question "why is it stuck there?"
//   • "Locked" is not a stage either — a paid run is immutable the instant it
//     hits 'paid' (trg_fn_lock_paid_payroll_run enforces that in the database).
//     It is a property of Paid, shown as the padlock on the final step, not a
//     fifth thing to wait for.
// Keeping the rail to the four states a person can actually act on is what
// makes it readable at a glance. This matches the compact 4-dot indicator in
// PayrollRunsTab, which already described runs as "Stage N of 4".
const STEPS = ['Draft', 'Review', 'Approved', 'Paid'] as const;

import { realStepIndex } from '@/lib/payroll-run';

/** What each stage means, surfaced on hover so the rail teaches as it shows. */
const STEP_HINT: Record<(typeof STEPS)[number], string> = {
  Draft: 'Being prepared. Figures can still change and nobody has been paid.',
  Review: 'Submitted for checking. Totals are calculated and waiting on a reviewer.',
  Approved: 'Signed off and cleared for payment. Not disbursed yet.',
  Paid: 'Money has gone out. The run is locked — corrections go through a new adjustment run.',
};

export function PayrollLifecycleRail({
  status,
  className,
  variant = 'light',
  size = 'sm',
}: {
  status: string;
  className?: string;
  /** 'dark' swaps text/border colors for legibility on a dark hero card —
      the default light-mode tokens (text-muted-foreground etc.) are tuned
      against a light card background and go low-contrast on a dark one. */
  variant?: 'light' | 'dark';
  /** 'lg' is for the top of a run's own page, where this is the primary
      wayfinding element and needs to be readable across the room. */
  size?: 'sm' | 'lg';
}) {
  const current = realStepIndex(status);
  if (current < 0) return null;

  const dark = variant === 'dark';
  const lg = size === 'lg';

  return (
    <div className={className}>
      <ol className="flex items-start">
        {STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          const isPaidStep = label === 'Paid';
          return (
            <li
              key={label}
              className="relative flex flex-1 flex-col items-center gap-1.5"
              aria-current={state === 'current' ? 'step' : undefined}
              title={STEP_HINT[label]}
            >
              {i > 0 && (
                <div
                  className={cn(
                    'absolute right-1/2 -z-0 w-full',
                    lg ? 'top-[15px] h-1' : 'top-[11px] h-0.5',
                    state !== 'todo' ? 'bg-success' : dark ? 'bg-white/15' : 'bg-border',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex items-center justify-center rounded-full font-bold',
                  lg ? 'h-8 w-8 text-2xs' : 'h-6 w-6 text-3xs',
                  state === 'done'
                    ? 'bg-success text-success-foreground'
                    : state === 'current'
                      ? dark
                        ? 'bg-secondary text-[#00283d]'
                        : 'bg-primary text-primary-foreground'
                      : dark
                        ? 'bg-white/10 text-white/40'
                        : 'bg-muted text-muted-foreground',
                )}
              >
                {state === 'done' ? (
                  isPaidStep ? (
                    <Lock className={lg ? 'h-4 w-4' : 'h-3 w-3'} />
                  ) : (
                    <Check className={lg ? 'h-4 w-4' : 'h-3 w-3'} />
                  )
                ) : state === 'current' ? (
                  <span className={cn('rounded-full bg-current animate-pulse', lg ? 'h-2 w-2' : 'h-1.5 w-1.5')} />
                ) : null}
              </span>
              <span
                className={cn(
                  'text-center font-medium leading-tight',
                  lg ? 'text-xs' : 'text-3xs',
                  state !== 'todo'
                    ? dark
                      ? 'text-white'
                      : 'text-foreground'
                    : dark
                      ? 'text-white/45'
                      : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
