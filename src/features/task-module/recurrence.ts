import type { Recurrence, RecurrenceUnit } from '@/queries/useTaskModule';

// How a repeat rule reads and is chosen. The database does the repeating
// (the next task is created the moment this one is completed); this is only
// the wording and the presets for picking a rule.

export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

const UNIT_WORDS: Record<RecurrenceUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
};

export function presetOf(r: Recurrence | null | undefined): RepeatPreset {
  if (!r) return 'none';
  if (r.every === 1 && r.unit === 'day') return 'daily';
  if (r.every === 1 && r.unit === 'week') return 'weekly';
  if (r.every === 1 && r.unit === 'month') return 'monthly';
  return 'custom';
}

export function ruleFor(preset: Exclude<RepeatPreset, 'none' | 'custom'>): Recurrence {
  return { unit: preset === 'daily' ? 'day' : preset === 'weekly' ? 'week' : 'month', every: 1 };
}

/** "Daily", "Weekly", "Monthly", "Every 2 weeks" (+ " until 30 Jun 2027"). */
export function recurrenceLabel(r: Recurrence | null | undefined, formatDate?: (iso: string) => string): string {
  if (!r) return 'Does not repeat';
  const p = presetOf(r);
  const base = p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : p === 'monthly' ? 'Monthly'
    : `Every ${r.every} ${UNIT_WORDS[r.unit][r.every === 1 ? 0 : 1]}`;
  return r.until ? `${base} until ${formatDate ? formatDate(r.until) : r.until}` : base;
}

export const MAX_EVERY = 365;

/** A rule from what was typed in the Custom box; null when it isn't usable. */
export function customRule(unit: RecurrenceUnit, every: number, until: string | null): Recurrence | null {
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY) return null;
  return { unit, every, ...(until ? { until } : {}) };
}

/** Changing the preset keeps an "ends on" date that was already chosen. */
export function withUntil(r: Recurrence, until: string | null | undefined): Recurrence {
  const { until: _drop, ...rest } = r;
  return until ? { ...rest, until } : rest;
}
