// Shared building blocks for the Company Guide (src/pages/Guide.tsx and
// src/components/guide/sections/*). One place for the role-badge system,
// step lists, and the reference-table components the technical sections
// use, so every section renders consistently.
import type { ElementType, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// The 6 real roles in src/lib/roles.ts, spelled out literally (not
// imported from that module's role-set constants) so this file's badges
// always show the actual role list regardless of what a constant like
// MANAGER_ROLES happens to resolve to today.
export type Role = 'everyone' | 'super_admin' | 'admin' | 'finance' | 'operations' | 'field_staff' | 'driver';

export const ROLE_CONFIG: Record<Role, { label: string; className: string }> = {
  everyone: { label: 'Everyone', className: 'bg-primary/10 text-primary border-primary/20' },
  super_admin: { label: 'Super Admin', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  admin: { label: 'Admin', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
  finance: { label: 'Finance', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  operations: { label: 'Operations', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  field_staff: { label: 'Field Staff', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  driver: { label: 'Fleet Staff', className: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20' },
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

export function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span className="flex-shrink-0 w-5 h-5 rounded-md bg-primary/10 text-primary text-[10.5px] font-mono font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
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
