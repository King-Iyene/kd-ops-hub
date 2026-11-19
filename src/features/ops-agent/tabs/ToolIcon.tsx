import type { CSSProperties } from 'react';
import { FileText, KanbanSquare, Mail, MessageSquare, Phone, Plug, Send, Table2, Webhook, Workflow, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hueOf } from '../PersonAvatar';
import { CONNECTION_PRESETS, presetById, type ConnectionPreset } from '../connectionPresets';

const ICONS: Record<ConnectionPreset['icon'], LucideIcon> = { MessageSquare, Mail, Send, Webhook, Table2, KanbanSquare, FileText, Plug, Workflow, Phone };

/** The preset a saved connection was made from. Older connections have none, so the kind picks the closest one. */
export function presetForConnection(c: { kind: string; config: { preset?: string } }): ConnectionPreset {
  const byId = c.config.preset ? presetById(c.config.preset) : undefined;
  if (byId) return byId;
  const byKind = CONNECTION_PRESETS.find((p) => p.id === c.kind) ?? CONNECTION_PRESETS.find((p) => p.kind === c.kind && p.id !== 'custom');
  return byKind ?? CONNECTION_PRESETS[CONNECTION_PRESETS.length - 1];
}

/** A small tinted tile with the tool's icon. The tint is stable per tool; the name is always written next to it. */
export function ToolIcon({ preset, size = 'md', className }: { preset: ConnectionPreset; size?: 'sm' | 'md'; className?: string }) {
  const Icon = ICONS[preset.icon] ?? Plug;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--h)_50%_50%_/_0.14)] text-[hsl(var(--h)_60%_36%)] dark:text-[hsl(var(--h)_65%_74%)]', size === 'sm' ? 'h-8 w-8' : 'h-10 w-10', className)}
      style={{ '--h': hueOf(preset.id) } as CSSProperties}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  );
}
