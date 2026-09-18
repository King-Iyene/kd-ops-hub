import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, MinusCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceCheck, ComplianceStatus } from '@/lib/payroll-compliance';

const ICON: Record<ComplianceStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  info: Info,
  off: MinusCircle,
};

const TONE: Record<ComplianceStatus, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  info: 'text-muted-foreground',
  off: 'text-muted-foreground/70',
};

/**
 * "Is this run correct?" — the reassurance an approver needs before signing
 * off, in the language of the obligations themselves rather than of the
 * database.
 *
 * Statuses are deliberately not all the same weight. A warning means money
 * will be deducted with nowhere to remit it, which is worth stopping for.
 * Information is context (an employer levy, a lawful opt-out) and is styled
 * to recede, so that the one row that matters is the one that stands out.
 */
export function CompliancePanel({
  checks,
  className,
}: {
  checks: ComplianceCheck[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (checks.length === 0) return null;

  return (
    <div className={cn('rounded-lg border border-border/60 bg-card', className)}>
      <div className="border-b border-border/60 px-3.5 py-2">
        <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          Compliance check
        </p>
      </div>
      <ul className="divide-y divide-border/50">
        {checks.map((c) => {
          const Icon = ICON[c.status];
          const canExpand = c.names.length > 0;
          const isOpen = expanded === c.key;
          return (
            <li key={c.key} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[c.status])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{c.label}</p>
                  <p className="text-2xs leading-relaxed text-muted-foreground">{c.summary}</p>

                  {canExpand && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : c.key)}
                      className="mt-1 inline-flex min-h-[28px] items-center gap-1 text-2xs font-semibold text-primary"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Hide' : `Show ${c.names.length} ${c.names.length === 1 ? 'person' : 'people'}`}
                      <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                  )}
                  {canExpand && isOpen && (
                    <ul className="mt-1 space-y-0.5 pl-0.5">
                      {c.names.map((n) => (
                        <li key={n} className="text-2xs text-muted-foreground">{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
