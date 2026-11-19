import { cn } from '@/lib/utils';
import type { AgentFlag } from '../agentDb';

export type Severity = AgentFlag['severity'];

export const STRIPE: Record<Severity, string> = {
  critical: 'bg-destructive', high: 'bg-orange-500', medium: 'bg-warning', low: 'bg-sky-500', info: 'bg-muted-foreground/40',
};
export const PILL: Record<Severity, string> = {
  critical: 'bg-destructive/10 text-destructive',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  info: 'bg-muted text-muted-foreground',
};
export const LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
export const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** The severity as a word in a tinted pill (colour is never the only signal). */
export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold', PILL[severity], className)}>{LABEL[severity]}</span>;
}
