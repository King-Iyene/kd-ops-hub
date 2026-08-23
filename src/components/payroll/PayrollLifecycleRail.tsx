import { Check, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// The 4 real backend states a payroll_run can actually be in, in order.
// Matches runStepIndex()'s mapping: approved and processing share a step
// since "Approve" is the human action — processing is what happens right
// after, not a separate stage a person waits in.
const REAL_STEPS = ['Draft', 'Review', 'Approve', 'Paid'] as const;

function realStepIndex(status: string): number {
  if (status === 'draft') return 0;
  if (status === 'pending_approval') return 1;
  if (status === 'approved' || status === 'processing') return 2;
  if (status === 'paid') return 3;
  return -1; // rejected/cancelled/unknown — no rail, a badge alone is enough
}

type RailPosition =
  | { kind: 'real'; label: string; state: 'done' | 'current' | 'todo' }
  | { kind: 'planned'; label: string };

/**
 * Full target-state lifecycle: Draft → Calculated → Review → Approve →
 * Paid → Locked. Only 4 of these 6 positions exist in the database today
 * (Draft/Review/Approve/Paid) — Calculated and Locked are shown as
 * permanently dashed, non-interactive "planned" markers so the rail is
 * honest about what a run can actually be "at" right now, while still
 * showing where this is headed. Never render Calculated/Locked as done
 * or current — they cannot be true for any real run.
 */
function buildPositions(status: string): RailPosition[] {
  const current = realStepIndex(status);
  const real = (label: string, i: number): RailPosition =>
    current < 0
      ? { kind: 'real', label, state: 'todo' }
      : { kind: 'real', label, state: i < current ? 'done' : i === current ? 'current' : 'todo' };

  return [
    real(REAL_STEPS[0], 0),
    { kind: 'planned', label: 'Calculated' },
    real(REAL_STEPS[1], 1),
    real(REAL_STEPS[2], 2),
    real(REAL_STEPS[3], 3),
    { kind: 'planned', label: 'Locked' },
  ];
}

export function PayrollLifecycleRail({ status, className }: { status: string; className?: string }) {
  const current = realStepIndex(status);
  if (current < 0) return null;
  const positions = buildPositions(status);

  return (
    <div className={className}>
      <div className="flex items-start">
        {positions.map((p, i) => (
          <div key={p.label} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i > 0 && (
              <div
                className={cn(
                  'absolute top-[11px] right-1/2 h-0.5 w-full -z-0',
                  p.kind === 'planned' || positions[i - 1].kind === 'planned'
                    ? 'bg-[repeating-linear-gradient(90deg,hsl(var(--border))_0_5px,transparent_5px_8px)]'
                    : (p.kind === 'real' && p.state !== 'todo') ? 'bg-success' : 'bg-border',
                )}
              />
            )}
            {p.kind === 'planned' ? (
              <span
                className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground"
                title={`${p.label} — design-only, not a state a run can be in today`}
              >
                {p.label === 'Locked' ? <Lock className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              </span>
            ) : (
              <span
                className={cn(
                  'relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  p.state === 'done' ? 'bg-success text-success-foreground'
                    : p.state === 'current' ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {p.state === 'done' ? <Check className="h-3 w-3" /> : null}
              </span>
            )}
            <span
              className={cn(
                'text-center text-[9.5px] font-medium leading-tight',
                p.kind === 'planned' ? 'text-muted-foreground/60'
                  : p.state !== 'todo' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
