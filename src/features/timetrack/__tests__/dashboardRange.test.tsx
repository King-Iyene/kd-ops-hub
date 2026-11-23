import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeSelect, datePresets } from '@/components/ui-kit/DateRangeSelect';
import { DASHBOARD_RANGES, bucketHours, bucketKind, bucketLabel, rangeText } from '../lib/dashboardRange';

describe('the ranges the Real-time Dashboard offers', () => {
  const p = Object.fromEntries(datePresets(new Date('2026-11-18T12:00:00')).map((x) => [x.key, [x.start, x.end]]));

  it('are this month, last month, this week, last week, this year and last year, in that order', () => {
    expect([...DASHBOARD_RANGES]).toEqual(['month', 'lastmonth', 'week', 'lastweek', 'year', 'lastyear']);
  });
  it('work out to the right dates (weeks start on Monday)', () => {
    expect(p.month).toEqual(['2026-11-01', '2026-11-18']);
    expect(p.lastmonth).toEqual(['2026-10-01', '2026-10-31']);
    expect(p.week).toEqual(['2026-11-16', '2026-11-18']);
    expect(p.lastweek).toEqual(['2026-11-09', '2026-11-15']);
    expect(p.year).toEqual(['2026-01-01', '2026-11-18']);
    expect(p.lastyear).toEqual(['2025-01-01', '2025-12-31']);
  });
});

describe('the picker with only some ranges', () => {
  it('lists just those, then Custom range, and none of the old month names', () => {
    render(<DateRangeSelect start="2026-11-01" end="2026-11-18" setStart={() => undefined} setEnd={() => undefined} only={[...DASHBOARD_RANGES]} />);
    fireEvent.click(screen.getByRole('combobox'));
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['This month', 'Last month', 'This week', 'Last week', 'This year', 'Last year', 'Custom range…']);
  });

  it('without the option it keeps every range, as the other reports use it', () => {
    render(<DateRangeSelect start="2026-11-01" end="2026-11-18" setStart={() => undefined} setEnd={() => undefined} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Today');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('All time');
  });

  it('Custom range shows the two date boxes, and a quick range sets both dates', () => {
    const setStart = vi.fn(); const setEnd = vi.fn();
    const { container } = render(<DateRangeSelect start="2026-03-03" end="2026-03-09" setStart={setStart} setEnd={setEnd} only={[...DASHBOARD_RANGES]} />);
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2); // a range that matches no quick one is a custom one
  });
});

describe('the chart buckets', () => {
  it('a month or a week is shown day by day; a year month by month', () => {
    expect(bucketKind('2026-11-01', '2026-11-30')).toBe('day');
    expect(bucketKind('2026-11-16', '2026-11-22')).toBe('day');
    expect(bucketKind('2026-08-01', '2026-10-31')).toBe('day');      // 92 days
    expect(bucketKind('2026-07-01', '2026-10-31')).toBe('month');    // 123 days
    expect(bucketKind('2025-01-01', '2025-12-31')).toBe('month');
  });
  it('adds hours per day in time order, and per month for a long range', () => {
    const rows = [
      { start_time: '2026-11-18T10:00:00', duration_minutes: 90 },
      { start_time: '2026-11-02T10:00:00', duration_minutes: 60 },
      { start_time: '2026-11-18T15:00:00', duration_minutes: 30 },
      { start_time: '2026-10-05T10:00:00', duration_minutes: 120 },
    ];
    expect(bucketHours(rows, 'day')).toEqual([{ label: '5 Oct', hours: 2 }, { label: '2 Nov', hours: 1 }, { label: '18 Nov', hours: 2 }]);
    expect(bucketHours(rows, 'month')).toEqual([{ label: 'Oct 2026', hours: 2 }, { label: 'Nov 2026', hours: 3 }]);
    expect(bucketLabel('2026-11', 'month')).toBe('Nov 2026');
  });
  it('writes the range for the header', () => {
    expect(rangeText('2026-11-01', '2026-11-18')).toBe('1 Nov 2026 to 18 Nov 2026');
    expect(rangeText('2026-11-18', '2026-11-18')).toBe('18 Nov 2026');
  });
});
