import { Check, Clock, Lock } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { realStepIndex } from '@/lib/payroll-run';
import { cn } from '@/lib/utils';

export interface RunTimelineInput {
  status: string;
  created_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
}

interface Stage {
  label: string;
  at: string | null | undefined;
  /** What actually happened at this stage, in plain language. */
  hint: string;
}

/**
 * The audit answer to "what happened to this payroll run, and when?".
 *
 * Deliberately honest about missing data. Stage timestamps only started being
 * recorded in migration 20261221000000; every run that reached a stage before
 * that has no timestamp for it, and this renders "time not recorded" rather
 * than silently falling back to updated_at — which would be a different fact
 * (when the row was last touched by anything) dressed up as an approval time.
 * On a payroll record, a plausible-looking wrong timestamp is worse than a
 * visible gap.
 */
export function PayrollRunTimeline({ run, className }: { run: RunTimelineInput; className?: string }) {
  const current = realStepIndex(run.status);
  if (current < 0) return null;

  const stages: Stage[] = [
    { label: 'Draft',    at: run.created_at,   hint: 'Run created' },
    { label: 'Review',   at: run.submitted_at, hint: 'Submitted for checking' },
    { label: 'Approved', at: run.approved_at,  hint: 'Signed off for payment' },
    { label: 'Paid',     at: run.paid_at,      hint: 'Money sent — run locked' },
  ];

  return (
    <div className={className}>
      <ol className="space-y-0">
        {stages.map((s, i) => {
          const reached = i <= current;
          const isLast = i === stages.length - 1;
          const isPaid = s.label === 'Paid';
          return (
            <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[11px] top-6 h-[calc(100%-1rem)] w-0.5',
                    i < current ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  reached
                    ? i < current
                      ? 'bg-success text-success-foreground'
                      : 'bg-primary text-primary-foreground'
                    : 'border border-border bg-muted text-muted-foreground',
                )}
              >
                {reached ? (
                  isPaid && i <= current ? <Lock className="h-3 w-3" /> : <Check className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    'text-xs font-semibold leading-tight',
                    reached ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                  {i === current && (
                    <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                      Current
                    </span>
                  )}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {reached
                    ? s.at
                      ? `${s.hint} · ${formatDateTime(s.at)}`
                      : `${s.hint} · time not recorded`
                    : 'Not yet'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
