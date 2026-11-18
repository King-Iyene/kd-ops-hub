/**
 * Semantic colour roles for the Task module, mapped onto KD Ops's own
 * design tokens (master prompt section 5). Every Task component reads
 * colour from here, never from a hard-coded hex value and never from the
 * reference screenshots' dark/pink palette.
 */

export const taskTheme = {
  primary: 'hsl(var(--primary))',
  background: 'hsl(var(--background))',
  surface: 'hsl(var(--card))',
  surfaceRaised: 'hsl(var(--popover))',
  border: 'hsl(var(--border))',
  borderSubtle: 'hsl(var(--border) / 0.5)',
  foreground: 'hsl(var(--foreground))',
  mutedForeground: 'hsl(var(--muted-foreground))',
  danger: 'hsl(var(--destructive))',
  status: {
    notStarted: 'hsl(var(--muted-foreground))',
    active: 'hsl(var(--info))',
    review: 'hsl(var(--warning))',
    blocked: 'hsl(var(--destructive))',
    done: 'hsl(var(--success))',
  },
  priority: {
    urgent: 'hsl(var(--destructive))',
    high: 'hsl(var(--warning))',
    normal: 'hsl(var(--info))',
    low: 'hsl(var(--muted-foreground))',
    none: 'hsl(var(--border))',
  },
  chart: {
    complete: 'hsl(var(--success))',
    inProgress: 'hsl(var(--info))',
    notStarted: 'hsl(var(--muted-foreground))',
    overdue: 'hsl(var(--destructive))',
    today: 'hsl(var(--warning))',
    thisWeek: 'hsl(var(--primary))',
    later: 'hsl(var(--border))',
    age: 'hsl(var(--accent))',
  },
} as const;

/**
 * Colour swatches offered when a person picks a space or tag colour.
 * Every value is the resolved hex of an existing KD Ops token (primary,
 * accent, success, warning, info, destructive, and a neutral grey), never a
 * colour copied from the reference screenshots. Stored as a literal hex
 * string per row (same approach Phase 1 used for the five default status
 * colours) since tk_spaces.color / tk_tags.color / tk_statuses.color are
 * plain text columns, not theme-reactive.
 */
export const TASK_COLOR_SWATCHES: { id: string; label: string; hex: string }[] = [
  { id: 'primary', label: 'Teal', hex: '#006994' },
  { id: 'cyan', label: 'Cyan', hex: '#4d9eaa' },
  { id: 'gold', label: 'Gold', hex: '#d6ac50' },
  { id: 'info', label: 'Blue', hex: '#0073b8' },
  { id: 'success', label: 'Green', hex: '#1f9d6b' },
  { id: 'warning', label: 'Amber', hex: '#da9a22' },
  { id: 'destructive', label: 'Red', hex: '#e23f3f' },
  { id: 'neutral', label: 'Grey', hex: '#64748b' },
];

export const TASK_DEFAULT_COLOR = TASK_COLOR_SWATCHES[0].hex;

/** Stable per-person avatar tint, hashed from the user id, section 5.6. */
const AVATAR_TINTS = [
  '#006994', '#4d9eaa', '#d6ac50', '#0073b8', '#1f9d6b', '#da9a22', '#8b5cf6', '#e2607f',
];

export function avatarTintFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
