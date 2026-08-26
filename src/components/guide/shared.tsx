// Shared building blocks for the Platform Guide (src/pages/Guide.tsx and
// src/components/guide/sections/*). One place for the role-badge system,
// step lists, and the reference-table components the technical sections
// use, so every section renders consistently.
import type { ElementType, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { roleBadgeClass, roleLabel } from '@/lib/roles';

// The 5 real roles in src/lib/roles.ts, spelled out literally (not
// imported from that module's role-set constants) so this file's badges
// always show the actual role list regardless of what a constant like
// MANAGER_ROLES happens to resolve to today.
export type Role = 'everyone' | 'super_admin' | 'admin' | 'finance' | 'operations' | 'field_staff';

// Colors come from lib/roles.ts (the same map used on the profile menu and
// top nav) so a role reads as the same color everywhere in the app — this
// file used to keep its own independent amber/rose/violet/sky/emerald set,
// which meant the Guide taught users a different color per role than the
// one they actually saw elsewhere.
export const ROLE_CONFIG: Record<Role, { label: string; className: string }> = {
  everyone: { label: 'Everyone', className: 'bg-primary/10 text-primary border-primary/20' },
  super_admin: { label: roleLabel('super_admin'), className: roleBadgeClass('super_admin') },
  admin: { label: roleLabel('admin'), className: roleBadgeClass('admin') },
  finance: { label: roleLabel('finance'), className: roleBadgeClass('finance') },
  operations: { label: roleLabel('operations'), className: roleBadgeClass('operations') },
  field_staff: { label: 'Field Team', className: roleBadgeClass('field_staff') },
};

export function RoleBadges({ roles }: { roles: Role[] }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {roles.map((r) => (
        <Badge key={r} variant="outline" className={cn('text-[10px] font-medium whitespace-nowrap', ROLE_CONFIG[r].className)}>
          {ROLE_CONFIG[r].label}
        </Badge>
      ))}
    </div>
  );
}

/**
 * `startIndex` lets a walkthrough continue its numbering across multiple
 * StepList calls with a Screenshot interleaved between them — e.g.
 * StepList (steps 1-2) -> Screenshot -> StepList startIndex={2} (steps 3-4)
 * -> Screenshot — instead of every call restarting at "1".
 */
export function StepList({ steps, startIndex = 0 }: { steps: ReactNode[]; startIndex?: number }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span className="flex-shrink-0 w-5 h-5 rounded-md bg-primary/10 text-primary text-[10.5px] font-mono font-semibold flex items-center justify-center mt-0.5">
            {startIndex + i + 1}
          </span>
          <span className="text-muted-foreground leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function ModuleCard({
  title, route, roles, children,
}: { title: string; route?: string; roles: Role[]; children?: ReactNode }) {
  return (
    <Card id={`mod-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="scroll-mt-20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {route && <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{route}</p>}
          </div>
          <RoleBadges roles={roles} />
        </div>
      </CardHeader>
      {children && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

export function Callout({ tone, children }: { tone: 'tip' | 'warn' | 'caution'; children: ReactNode }) {
  const TONE: Record<typeof tone, string> = {
    tip: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    warn: 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300',
    caution: 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300',
  };
  const LABEL: Record<typeof tone, string> = { tip: 'TIP', warn: 'NOTE', caution: 'CAUTION' };
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed', TONE[tone])}>
      <span className="font-mono font-bold text-[10px] mt-0.5 shrink-0">{LABEL[tone]}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * A real in-app screenshot, captured by the guide-screenshots CI workflow.
 * 'wide' captures (full-page, landscape) stretch to the column width like a
 * normal figure. 'contain' captures — phone screenshots (390x844) and
 * cropped dialog shots, both narrower and often taller than they are wide —
 * are capped by height and centered instead of stretched: blowing a narrow
 * crop up to a wide desktop column's full width would inflate its height
 * well past 1000px.
 */
export function Screenshot({
  src, alt, caption, variant = 'wide',
}: { src: string; alt: string; caption?: string; variant?: 'wide' | 'contain' }) {
  return (
    <figure className="rounded-lg border overflow-hidden bg-muted/20 not-prose">
      <div className={cn('bg-muted/10', variant === 'contain' && 'flex justify-center py-4')}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={variant === 'contain' ? 'w-auto max-h-[520px] block' : 'w-full h-auto block'}
        />
      </div>
      {caption && (
        <figcaption className="text-xs text-muted-foreground px-3 py-2 border-t bg-muted/30">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function SectionIntro({ icon: Icon, title, blurb }: { icon: ElementType; title: string; blurb?: string }) {
  return (
    <div className="pb-1">
      <div className="flex items-center gap-2.5 text-xl font-semibold">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </div>
      {blurb && <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl leading-relaxed">{blurb}</p>}
    </div>
  );
}

// ── Reference tables (technical content) ────────────────────────────────
export interface RefRow { a: string; b: string; c?: string; d?: string; e?: string; f?: string; }

export function RefTable({ rows, cols }: { rows: RefRow[]; cols: string[] }) {
  const keys: (keyof RefRow)[] = ['a', 'b', 'c', 'd', 'e', 'f'];
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/20">
              {cols.map((_, ci) => (
                <td key={ci} className={`px-3 py-2 align-top ${ci === 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                  {r[keys[ci]] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RefSection({ icon: Icon, title, children }: { icon: ElementType; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Guide navigation model ───────────────────────────────────────────────
export interface GuideNavItem {
  id: string;
  label: string;
  icon: ElementType;
}
export interface GuideNavGroup {
  group: string;
  items: GuideNavItem[];
}
