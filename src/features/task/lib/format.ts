/**
 * Task module formatting helpers (master prompt section 8). Kept separate
 * from the app-wide src/lib/utils.ts initials() because the PRD's rule for
 * a single-word name differs: one letter, not two (section 5.6 — "K" for
 * "KD", not "KD").
 */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type DueVariant = 'overdue' | 'today' | 'soon' | 'later';

export interface FormattedDue {
  text: string;
  variant: DueVariant;
}

/**
 * The exact due-date display rule from section 7.3: overdue is "d Mon" in
 * danger red; today is "Today"; tomorrow is "Tomorrow"; the next six days
 * show the weekday name; anything later is "d Mon" (plus the year when it
 * is not the current year). A time, when the task carries one, is appended
 * as ", HH:mm".
 */
export function formatDue(dueDateIso: string, now: Date, hasTime: boolean): FormattedDue {
  const due = new Date(dueDateIso);
  const dueDay = startOfDay(due);
  const today = startOfDay(now);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  const timeSuffix = hasTime
    ? `, ${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
    : '';
  const dateText = `${due.getDate()} ${MONTH_NAMES[due.getMonth()]}${due.getFullYear() !== now.getFullYear() ? ` ${due.getFullYear()}` : ''}`;

  if (diffDays < 0) return { text: `${dateText}${timeSuffix}`, variant: 'overdue' };
  if (diffDays === 0) return { text: `Today${timeSuffix}`, variant: 'today' };
  if (diffDays === 1) return { text: `Tomorrow${timeSuffix}`, variant: 'soon' };
  if (diffDays <= 6) return { text: `${WEEKDAY_NAMES[due.getDay()]}${timeSuffix}`, variant: 'soon' };
  return { text: `${dateText}${timeSuffix}`, variant: 'later' };
}
