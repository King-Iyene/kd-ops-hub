import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { dueLabel, isOverdue } from '../taskDates';
import { SummaryCard, MyWorkCard, DelegatedCard, ThisWeekCard } from '../home/HomeCards';
import type { TaskRow, TaskStatus } from '@/queries/useTaskModule';

// Thursday 19 November 2026, mid-morning, local time.
const NOW = new Date(2026, 10, 19, 10, 0, 0);

let seq = 0;
function task(title: string, status: TaskStatus, due: string | null, extra: Partial<TaskRow> = {}): TaskRow {
  seq += 1;
  return {
    id: `t${seq}`,
    list_id: 'l1',
    title,
    description: null,
    status,
    priority: null,
    assignee_id: 'me',
    due_date: due,
    position: 0,
    created_by: 'me',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    completed_at: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('due date labels', () => {
  it('reads like the reference: Today / Tomorrow / weekday / short date', () => {
    expect(dueLabel('2026-11-19')).toBe('Today');
    expect(dueLabel('2026-11-20')).toBe('Tomorrow');
    expect(dueLabel('2026-11-22')).toBe('Sunday');
    expect(dueLabel('2026-11-15')).toBe('15 Nov');
    expect(dueLabel('2026-11-26')).toBe('26 Nov');
  });

  it('only open tasks with a past due date are overdue', () => {
    expect(isOverdue({ due_date: '2026-11-15', status: 'to_do' })).toBe(true);
    expect(isOverdue({ due_date: '2026-11-15', status: 'done' })).toBe(false);
    expect(isOverdue({ due_date: '2026-11-19', status: 'blocked' })).toBe(false);
    expect(isOverdue({ due_date: null, status: 'to_do' })).toBe(false);
  });
});

// The same mix of tasks as the reference screenshot.
const mine = [
  task('Awaiting client credentials for system integration', 'blocked', '2026-11-15'),
  task('Migrate legacy client database to cloud infrastructure', 'in_progress', '2026-11-16'),
  task('Audit network security for Q4 compliance review', 'to_do', '2026-11-22'),
  task('Review server hardening checklist for client environment', 'in_review', '2026-11-22'),
  task('Completed firewall config for client network', 'done', '2026-11-10', { completed_at: '2026-11-10T09:00:00Z' }),
];

describe('Summary card', () => {
  it('counts overdue, due today, in progress and completed this week', () => {
    render(<SummaryCard mine={[...mine, task('Done this week', 'done', null, { completed_at: '2026-11-18T09:00:00Z' })]} />);
    const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(value('Overdue')).toBe('2');
    expect(value('Due today')).toBe('0');
    expect(value('In progress')).toBe('3');
    expect(value('Completed this week')).toBe('1');
  });
});

describe('My Work card', () => {
  it('groups open tasks into Overdue and Next 7 days, leaving out completed ones', () => {
    const { container } = render(<MyWorkCard mine={mine} onOpen={() => {}} />);
    const text = container.textContent ?? '';
    expect(text.indexOf('Overdue')).toBeLessThan(text.indexOf('Next 7 days'));
    expect(text).not.toContain('Completed firewall');
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});

describe('Delegated card', () => {
  it('lists every delegated task with open ones first and completed last', () => {
    const delegated = [
      task('Done by someone', 'done', '2026-11-12', { assignee_id: 'p2' }),
      task('Set up automated backup', 'to_do', '2026-11-15', { assignee_id: 'p2' }),
    ];
    render(<DelegatedCard delegated={delegated} onOpen={() => {}} peopleById={new Map()} />);
    expect(screen.getByText('All tasks').nextElementSibling?.textContent).toBe('2');
    const rows = screen.getAllByRole('button');
    expect(rows[0].textContent).toContain('Set up automated backup');
    expect(rows[1].textContent).toContain('Complete');
  });
});

describe('This Week card', () => {
  it('shows Monday to Sunday and puts tasks on their due day', () => {
    const { container } = render(<ThisWeekCard mine={mine} onOpen={() => {}} />);
    const columns = Array.from(container.querySelectorAll('.grid > div'));
    expect(columns.map((c) => c.firstElementChild?.textContent)).toEqual([
      'Mon 16', 'Tue 17', 'Wed 18', 'Thu 19', 'Fri 20', 'Sat 21', 'Sun 22',
    ]);
    expect(within(columns[0] as HTMLElement).getByText(/Migrate legacy/)).toBeTruthy();
    expect(within(columns[6] as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });
});
