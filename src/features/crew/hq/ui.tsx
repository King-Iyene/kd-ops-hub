// Crew HQ's building blocks: the status-ring face, chips, cards and the loading / empty / error states every list uses.
import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AvatarFace } from '@/features/office/AvatarFace';
import { agentAvatar } from '@/features/office/world/agents';
import type { CrewAgent, Risk } from '../crewDb';
import { STATUS_LABEL } from '../orgChart';
import './hq.css';

import { statusTone, type Tone } from './tones';

export function Chip({ tone = 'neutral', className, children, ...p }: { tone?: Tone } & HTMLAttributes<HTMLSpanElement>) {
  return <span data-tone={tone} className={cn('hq-chip', className)} {...p}>{children}</span>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('hq-eyebrow', className)}>{children}</p>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="hq-kbd">{children}</kbd>;
}

export function HqCard({ risk, glow, interactive, flat, className, children, ...p }: { risk?: Risk | 'none'; glow?: boolean; interactive?: boolean; flat?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return <div data-risk={risk} className={cn('hq-card', glow && 'hq-glow', interactive && 'hq-interactive', flat && 'hq-card-flat', className)} {...p}>{children}</div>;
}


/** An agent's face inside a ring that shows what they are doing: a turning arc while working, a steady ring otherwise, dimmed when paused. */
export function Face({ agent, size = 40, paused = false, className }: { agent: Pick<CrewAgent, 'slug' | 'color' | 'status' | 'name'>; size?: number; paused?: boolean; className?: string }) {
  return (
    <span className={cn('hq-face', className)} data-status={paused ? 'paused' : agent.status} role="img" aria-label={`${agent.name}, ${paused ? 'paused' : STATUS_LABEL[agent.status] ?? agent.status}`}>
      <AvatarFace avatar={agentAvatar(agent)} size={size} dim={paused} />
    </span>
  );
}

export function StatusLine({ agent, paused }: { agent: Pick<CrewAgent, 'status' | 'activity'>; paused?: boolean }) {
  const tone = paused ? 'neutral' : statusTone(agent.status);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hq-dot" data-tone={tone} data-live={!paused && (agent.status === 'working' || agent.status === 'thinking')} aria-hidden />
      <span className="shrink-0 font-medium text-foreground/80">{paused ? 'Paused' : STATUS_LABEL[agent.status] ?? agent.status}</span>
      {!paused && agent.activity ? <span className="min-w-0 truncate">{agent.activity}</span> : null}
    </span>
  );
}

/** A long text: wraps at any width (never cut off), shows a few lines, and expands. */
export function Prose({ text, lines = 4, className }: { text: string; lines?: number; className?: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > lines * 80 || text.split('\n').length > lines;
  return (
    <div className={className}>
      <p className={cn('whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]', long && !more && 'line-clamp-4')}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="hq-focus mt-1 inline-flex items-center gap-1 rounded text-xs font-semibold text-[hsl(var(--hq-signal-ink))] hover:underline">
          {more ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show more</>}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--hq-risk)/0.4)] bg-[hsl(var(--hq-risk)/0.07)] p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--hq-risk))]" aria-hidden />
      <div className="min-w-0 flex-1"><p className="font-semibold">Could not load this</p><p className="text-muted-foreground [overflow-wrap:anywhere]">{message}</p></div>
      {onRetry ? <button type="button" onClick={onRetry} className="hq-focus shrink-0 rounded-lg px-3 py-1 text-xs font-bold ring-1 ring-border hover:bg-muted">Retry</button> : null}
    </div>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--hq-signal)/0.12)] text-[hsl(var(--hq-signal-ink))]"><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="font-semibold">{title}</p>
      {children ? <p className="max-w-md text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export function Section({ title, hint, action, children, className }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0"><Eyebrow>{title}</Eyebrow>{hint ? <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Btn({ tone = 'ghost', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'go' | 'soft' | 'ghost' | 'danger' }) {
  return (
    <button
      type="button" {...p}
      className={cn('hq-focus inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'go' && 'hq-signal-btn shadow-sm', tone === 'soft' && 'bg-muted text-foreground hover:bg-muted/70', tone === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        tone === 'danger' && 'bg-[hsl(var(--hq-risk)/0.12)] text-[hsl(var(--hq-risk))] hover:bg-[hsl(var(--hq-risk)/0.2)]', className)}
    />
  );
}

