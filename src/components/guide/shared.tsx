import type { ElementType, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { roleBadgeClass, roleLabel } from '@/lib/roles';

export type Role = 'everyone' | 'super_admin' | 'admin' | 'finance' | 'operations' | 'field_staff';

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

export function StepList({ steps, startIndex = 0 }: { steps: ReactNode[]; startIndex?: number }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center mt-0.5">
            {startIndex + i + 1}
          </span>
          <span className="text-muted-foreground/90 leading-relaxed flex-1">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function ModuleCard({
  title, route, roles, children,
}: { title: string; route?: string; roles: Role[]; children?: ReactNode }) {
  return (
    <div id={`mod-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="scroll-mt-20 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap border-b border-white/[0.06] pb-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          {route && <p className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">{route}</p>}
        </div>
        <RoleBadges roles={roles} />
      </div>
      {children && <div className="space-y-4">{children}</div>}
    </div>
  );
}

export function Callout({ tone, children }: { tone: 'tip' | 'warn' | 'caution'; children: ReactNode }) {
  const TONE: Record<typeof tone, string> = {
    tip: 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-800 dark:text-emerald-300/90',
    warn: 'bg-amber-500/[0.06] border-amber-500/20 text-amber-800 dark:text-amber-300/90',
    caution: 'bg-rose-500/[0.06] border-rose-500/20 text-rose-800 dark:text-rose-300/90',
  };
  const LABEL: Record<typeof tone, string> = { tip: 'TIP', warn: 'NOTE', caution: 'CAUTION' };
  const DOT: Record<typeof tone, string> = { tip: 'bg-emerald-500', warn: 'bg-amber-500', caution: 'bg-rose-500' };
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed', TONE[tone])}>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} />
        <span className="font-semibold text-[10px] tracking-wide">{LABEL[tone]}</span>
      </div>
      <span>{children}</span>
    </div>
  );
}

export function Screenshot({
  src, alt, caption, variant = 'wide',
}: { src: string; alt: string; caption?: string; variant?: 'wide' | 'contain' }) {
  return (
    <figure className="rounded-xl border border-white/[0.06] overflow-hidden bg-black/10 not-prose">
      <div className={cn('bg-black/5', variant === 'contain' && 'flex justify-center py-4')}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={variant === 'contain' ? 'w-auto max-h-[520px] block rounded-lg' : 'w-full h-auto block'}
        />
      </div>
      {caption && (
        <figcaption className="text-[11px] text-muted-foreground/60 px-3.5 py-2 border-t border-white/[0.04]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function SectionIntro({ icon: Icon, title, blurb }: { icon: ElementType; title: string; blurb?: string }) {
  return (
    <div className="pb-2">
      <div className="flex items-center gap-2.5">
        <div className="rounded-xl p-2 bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {blurb && <p className="text-[14px] text-muted-foreground/70 mt-2 max-w-3xl leading-relaxed">{blurb}</p>}
    </div>
  );
}

// ── Reference tables (technical content) ────────────────────────────────
export interface RefRow { a: string; b: string; c?: string; d?: string; e?: string; f?: string; }

export function RefTable({ rows, cols }: { rows: RefRow[]; cols: string[] }) {
  const keys: (keyof RefRow)[] = ['a', 'b', 'c', 'd', 'e', 'f'];
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-sm">
        <thead className="border-b border-white/[0.06] bg-white/[0.02]">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 px-3.5 py-2.5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02] kd-transition">
              {cols.map((_, ci) => (
                <td key={ci} className={`px-3.5 py-2.5 align-top ${ci === 0 ? 'font-medium text-foreground/90' : 'text-muted-foreground/70'}`}>
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
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <Icon className="h-4 w-4 text-primary/70" />
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
