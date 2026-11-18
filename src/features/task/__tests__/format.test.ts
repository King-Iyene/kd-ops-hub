import { describe, expect, it } from 'vitest';
import { formatDue, initials } from '../lib/format';
import { parseTitleDate } from '../lib/naturalLanguageDate';

describe('initials (section 5.6 — one letter for a single-word name)', () => {
  it('gives one letter for a single-word name', () => {
    expect(initials('KD')).toBe('K');
  });
  it('gives first+last initial for a two-word name', () => {
    expect(initials('Denzel Iyene')).toBe('DI');
    expect(initials('King Iyene')).toBe('KI');
  });
  it('falls back to ? for an empty name', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('formatDue (section 7.3 display rule)', () => {
  const now = new Date(2026, 10, 18); // Wed 18 Nov 2026

  it('shows Today for the due date', () => {
    expect(formatDue(new Date(2026, 10, 18).toISOString(), now, false)).toEqual({ text: 'Today', variant: 'today' });
  });

  it('shows Tomorrow for the next day', () => {
    expect(formatDue(new Date(2026, 10, 19).toISOString(), now, false)).toEqual({ text: 'Tomorrow', variant: 'soon' });
  });

  it('shows the weekday name within the next six days', () => {
    // 22 Nov 2026 is a Sunday, 4 days out.
    expect(formatDue(new Date(2026, 10, 22).toISOString(), now, false)).toEqual({ text: 'Sunday', variant: 'soon' });
  });

  it('shows "d Mon" for a date more than six days out', () => {
    expect(formatDue(new Date(2026, 11, 1).toISOString(), now, false)).toEqual({ text: '1 Dec', variant: 'later' });
  });

  it('marks a past date overdue and formats it as "d Mon"', () => {
    expect(formatDue(new Date(2026, 10, 16).toISOString(), now, false)).toEqual({ text: '16 Nov', variant: 'overdue' });
  });

  it('adds the year only when it is not the current year', () => {
    expect(formatDue(new Date(2027, 0, 5).toISOString(), now, false).text).toBe('5 Jan 2027');
  });

  it('appends the time when the task carries one', () => {
    const due = new Date(2026, 10, 18, 15, 5);
    expect(formatDue(due.toISOString(), now, true).text).toBe('Today, 15:05');
  });
});

describe('parseTitleDate (quick create natural language dates, section 7.7/7.8)', () => {
  it('extracts "tomorrow 3pm" and strips it from the title', () => {
    const now = new Date(2026, 10, 18);
    const result = parseTitleDate('Call the client tomorrow 3pm', now);
    expect(result.cleanTitle).toBe('Call the client');
    expect(result.hasTime).toBe(true);
    expect(result.dueDate?.getDate()).toBe(19);
    expect(result.dueDate?.getHours()).toBe(15);
  });

  it('leaves the title untouched when there is no date phrase', () => {
    const result = parseTitleDate('Just a plain title', new Date(2026, 10, 18));
    expect(result.cleanTitle).toBe('Just a plain title');
    expect(result.dueDate).toBeNull();
    expect(result.hasTime).toBe(false);
  });
});
