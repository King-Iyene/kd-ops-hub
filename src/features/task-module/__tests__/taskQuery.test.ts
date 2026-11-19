import { describe, expect, it } from 'vitest';
import type { TaskRow, TaskStatus } from '@/queries/useTaskModule';
import { matchesFilters, planMove, sortTasks, type FilterCond } from '../taskQuery';
import { computeDashboard, daysOverdue } from '../dashboardStats';
import { subDays } from 'date-fns';

// Thursday 19 November 2026, mid-morning.
const NOW = new Date(2026, 10, 19, 10, 0, 0);
let n = 0;
function task(title: string, extra: Partial<TaskRow> = {}): TaskRow {
  n += 1;
  return {
    id: `t${n}`, list_id: 'L1', title, description: null, status: 'to_do' as TaskStatus, priority: null,
    assignee_id: null, due_date: null, position: n * 1024, created_by: 'me',
    created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T09:00:00Z', completed_at: null,
    parent_id: null, tags: [], custom: {}, ...extra,
  };
}
const cond = (field: FilterCond['field'], values: string[], extra: Partial<FilterCond> = {}): FilterCond =>
  ({ id: field, field, negate: false, values, text: '', ...extra });

describe('task filters', () => {
  const a = task('Alpha', { status: 'in_progress', assignee_id: 'me', priority: 'high', tags: ['ops'], due_date: '2026-11-18' });
  const b = task('Beta', { status: 'blocked', assignee_id: 'u2', due_date: '2026-11-20' });
  const c = task('Gamma', { status: 'done', completed_at: '2026-11-19T08:00:00Z', list_id: 'L2' });
  const all = [a, b, c];
  const run = (conds: FilterCond[]) => all.filter((t) => matchesFilters(t, conds, 'me', NOW)).map((t) => t.title);

  it('a condition with nothing picked filters nothing', () => {
    expect(run([cond('status', [])])).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
  it('is any of / is none of', () => {
    expect(run([cond('status', ['blocked', 'done'])])).toEqual(['Beta', 'Gamma']);
    expect(run([cond('status', ['blocked'], { negate: true })])).toEqual(['Alpha', 'Gamma']);
  });
  it('conditions are joined with AND', () => {
    expect(run([cond('status', ['in_progress', 'blocked']), cond('assignee', ['me'])])).toEqual(['Alpha']);
  });
  it('assignee Me and Unassigned', () => {
    expect(run([cond('assignee', ['none'])])).toEqual(['Gamma']);
  });
  it('priority, tag, list and title', () => {
    expect(run([cond('priority', ['none'])])).toEqual(['Beta', 'Gamma']);
    expect(run([cond('tag', ['ops'])])).toEqual(['Alpha']);
    expect(run([cond('list', ['L2'])])).toEqual(['Gamma']);
    expect(run([cond('title', [], { text: 'ET' })])).toEqual(['Beta']);
    expect(run([cond('title', [], { text: 'a', negate: true })])).toEqual([]);
  });
  it('due date buckets', () => {
    expect(run([cond('due', ['overdue'])])).toEqual(['Alpha']);
    expect(run([cond('due', ['tomorrow'])])).toEqual(['Beta']);
    expect(run([cond('due', ['none'])])).toEqual(['Gamma']);
  });
  it('completed / created windows', () => {
    expect(run([cond('completed', ['today'])])).toEqual(['Gamma']);
    expect(run([cond('completed', ['not'])])).toEqual(['Alpha', 'Beta']);
    expect(run([cond('created', ['last7'])])).toEqual([]);
    expect(run([cond('created', ['last30'])])).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('sorting', () => {
  const x = task('banana', { due_date: '2026-11-25', priority: 'low', created_at: '2026-11-01T00:00:00Z', position: 3 });
  const y = task('Apple', { due_date: null, priority: 'urgent', created_at: '2026-11-03T00:00:00Z', position: 1 });
  const z = task('cherry', { due_date: '2026-11-20', priority: null, created_at: '2026-11-02T00:00:00Z', position: 2 });
  const titles = (rows: TaskRow[]) => rows.map((t) => t.title);

  it('manual order follows position', () => {
    expect(titles(sortTasks([x, y, z], 'manual', 'asc'))).toEqual(['Apple', 'cherry', 'banana']);
  });
  it('due date both ways, no date always last', () => {
    expect(titles(sortTasks([x, y, z], 'due', 'asc'))).toEqual(['cherry', 'banana', 'Apple']);
    expect(titles(sortTasks([x, y, z], 'due', 'desc'))).toEqual(['banana', 'cherry', 'Apple']);
  });
  it('priority both ways, none always last', () => {
    expect(titles(sortTasks([x, y, z], 'priority', 'asc'))).toEqual(['Apple', 'banana', 'cherry']);
    expect(titles(sortTasks([x, y, z], 'priority', 'desc'))).toEqual(['banana', 'Apple', 'cherry']);
  });
  it('name ignores case; created newest first by default', () => {
    expect(titles(sortTasks([x, y, z], 'title', 'asc'))).toEqual(['Apple', 'banana', 'cherry']);
    expect(titles(sortTasks([x, y, z], 'title', 'desc'))).toEqual(['cherry', 'banana', 'Apple']);
    expect(titles(sortTasks([x, y, z], 'created', 'asc'))).toEqual(['Apple', 'cherry', 'banana']);
  });
});

describe('drag-to-reorder placement', () => {
  const g = [task('A', { position: 1024 }), task('B', { position: 2048 }), task('C', { position: 3072 })];
  const d = task('D', { position: 9999 });
  it('drops between neighbours using the gap', () => {
    expect(planMove(g, d, 1).map((m) => [m.task.title, m.position])).toEqual([['D', 1536]]);
  });
  it('drops at the top and at the end', () => {
    expect(planMove(g, d, 0)[0].position).toBe(0);
    expect(planMove(g, d, 3)[0].position).toBe(4096);
    expect(planMove([], d, 0)[0].position).toBe(1024);
  });
  it('renumbers the group when there is no gap left', () => {
    const tight = [task('P', { position: 5 }), task('Q', { position: 6 })];
    const moves = planMove(tight, d, 1, 'blocked');
    expect(moves.map((m) => [m.task.title, m.position, m.status])).toEqual([
      ['P', 1024, undefined], ['D', 2048, 'blocked'], ['Q', 3072, undefined],
    ]);
  });
  it('carries the new status when dropped in another status group', () => {
    expect(planMove(g, d, 1, 'in_review')[0].status).toBe('in_review');
  });
});

describe('company dashboard numbers', () => {
  const rows = [
    task('late', { assignee_id: 'u1', due_date: '2026-11-15', status: 'in_progress' }),
    task('soon', { assignee_id: 'u1', due_date: '2026-11-21' }),
    task('free', {}),
    task('done this week', { status: 'done', assignee_id: 'u2', completed_at: '2026-11-17T10:00:00Z', created_at: '2026-11-16T10:00:00Z' }),
    task('done long ago', { status: 'done', assignee_id: 'u2', completed_at: '2026-08-01T10:00:00Z', created_at: '2026-07-01T10:00:00Z', list_id: 'L2' }),
  ];
  const s = computeDashboard(rows, { from: subDays(NOW, 29), to: NOW }, NOW);

  it('headline numbers', () => {
    expect(s).toMatchObject({ total: 5, open: 3, overdue: 1, dueSoon: 1, unassignedOpen: 1, completedInRange: 1, createdInRange: 4 });
  });
  it('status breakdown covers every status', () => {
    expect(s.byStatus.find((x) => x.status === 'done')?.count).toBe(2);
    expect(s.byStatus.reduce((a, x) => a + x.count, 0)).toBe(5);
  });
  it('workload is busiest first with Unassigned last', () => {
    expect(s.people.map((p) => [p.id, p.open, p.overdue, p.completed])).toEqual([['u1', 2, 1, 0], ['u2', 0, 0, 1], [null, 1, 0, 0]]);
  });
  it('weekly completions land in the right week; old ones fall outside', () => {
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly[7].completed).toBe(1);
    expect(s.weekly.reduce((a, w) => a + w.completed, 0)).toBe(1);
  });
  it('a custom range counts only inside it', () => {
    const r = computeDashboard(rows, { from: new Date(2026, 6, 1), to: new Date(2026, 7, 31) }, NOW);
    expect(r).toMatchObject({ completedInRange: 1, createdInRange: 1 });
    expect(r.weekly.reduce((a, w) => a + w.completed, 0)).toBe(1);
    expect(r.open).toBe(3);
  });
  it('per-list progress and overdue list', () => {
    expect(s.lists.find((l) => l.listId === 'L2')).toMatchObject({ total: 1, done: 1, open: 0 });
    expect(s.overdueTasks.map((t) => t.title)).toEqual(['late']);
    expect(daysOverdue(rows[0], NOW)).toBe(4);
  });
});
