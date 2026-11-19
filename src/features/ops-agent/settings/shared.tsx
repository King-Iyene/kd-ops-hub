import type { HTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** One card in a settings section. Every card has the same padding, title size and spacing. */
export function Section({ title, description, children, footer, className }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-sm font-semibold leading-tight tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">{children}</div>
      {footer}
    </Card>
  );
}

export function Field({ label, hint, children, htmlFor, className }: { label: string; hint?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The save bar sits at the bottom of its card and sticks to the bottom of the screen while there are unsaved edits.
 * With nothing to save it takes no space at all.
 */
export function SaveBar({ dirty, saving, onSave, onCancel, readOnly }: { dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void; readOnly?: boolean }) {
  if (readOnly || (!dirty && !saving)) return null;
  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-5" data-testid="save-bar">
      <span className="mr-auto text-xs text-muted-foreground" role="status">Unsaved changes</span>
      {!saving && <Button size="sm" variant="ghost" onClick={onCancel}>Discard</Button>}
      <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
        {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Save
      </Button>
    </div>
  );
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
const DOT: Record<Tone, string> = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', neutral: 'bg-muted-foreground/60' };
const PILL: Record<Tone, string> = {
  good: 'bg-success/10 text-success', warn: 'bg-warning/10 text-warning', bad: 'bg-destructive/10 text-destructive', neutral: 'bg-muted text-muted-foreground',
};

/** A status in form as well as words: a coloured dot and a tinted pill. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', PILL[tone], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A compact figure with a label, for the summary strip at the top of a section. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The row of figures under a section's title. One border, no nested cards. */
export function SummaryStrip({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card/60 px-4 py-3 sm:px-5', className)} {...rest}>{children}</div>
  );
}

/** A ring that fills as a budget is used. Green under 80%, amber to 100%, red when spent. */
export function Ring({ pct, label, size = 64 }: { pct: number; label: string; size?: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tone = pct >= 100 ? 'stroke-destructive' : pct >= 80 ? 'stroke-warning' : 'stroke-success';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)}
          className={cn(tone, 'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700')}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}
