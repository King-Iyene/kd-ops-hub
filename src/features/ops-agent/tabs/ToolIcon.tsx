import type { CSSProperties } from 'react';
import { FileText, KanbanSquare, Mail, MessageSquare, Phone, Plug, Send, Table2, Webhook, Workflow, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hueOf } from '../PersonAvatar';
import { BRAND_ICONS } from '../brandIcons';
import { CONNECTION_PRESETS, presetById, type ConnectionPreset } from '../connectionPresets';

const ICONS: Record<ConnectionPreset['icon'], LucideIcon> = { MessageSquare, Mail, Send, Webhook, Table2, KanbanSquare, FileText, Plug, Workflow, Phone };

/** The preset a saved connection was made from. Older connections have none, so the kind picks the closest one. */
export function presetForConnection(c: { kind: string; config: { preset?: string; mode?: string } }): ConnectionPreset {
  // A Cliq connection that posts through the API is its own preset, even when an older save did not record which one it came from.
  if (c.kind === 'cliq' && c.config.mode === 'api') return presetById('cliq-api') ?? CONNECTION_PRESETS[0];
  const byId = c.config.preset ? presetById(c.config.preset) : undefined;
  if (byId) return byId;
  const byKind = CONNECTION_PRESETS.find((p) => p.id === c.kind) ?? CONNECTION_PRESETS.find((p) => p.kind === c.kind && p.id !== 'custom');
  return byKind ?? CONNECTION_PRESETS[CONNECTION_PRESETS.length - 1];
}

/**
 * The tool's own logo on a light tile (so every brand colour reads in light and dark mode). Tools without a brand mark of their own
 * (email, a generic webhook, any other API) get a tinted tile with a plain icon. The name is always written next to it.
 */
export function ToolIcon({ preset, size = 'md', className }: { preset: ConnectionPreset; size?: 'sm' | 'md'; className?: string }) {
  const brandId = preset.brand ?? preset.id;
  const brand = BRAND_ICONS[brandId];
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  if (brand) {
    return (
      <span aria-hidden="true" data-testid={`logo-${brandId}`} className={cn('inline-flex shrink-0 items-center justify-center rounded-lg border border-black/5 bg-white shadow-sm', box, className)}>
        <svg viewBox="0 0 24 24" role="img" className={size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'} fill={brand.hex}><title>{brand.title}</title><path d={brand.path} /></svg>
      </span>
    );
  }
  const Icon = ICONS[preset.icon] ?? Plug;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--h)_50%_50%_/_0.14)] text-[hsl(var(--h)_60%_36%)] dark:text-[hsl(var(--h)_65%_74%)]', box, className)}
      style={{ '--h': hueOf(preset.id) } as CSSProperties}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  );
}
