import { describe, expect, it } from 'vitest';
import { matchesFilter, type FilterableTask } from '../filter/evaluate';
import { ME_VALUE, type FilterTree } from '../filter/types';
import { groupTasks } from '../tasks/grouping';
import { sortTasks } from '../tasks/sorting';
import type { TaskRow } from '../api/tasks';
import type { TaskStatus } from '../api/statuses';

const VIEWER_ID = 'viewer-1';
const ctx = { now: new Date(2026, 10, 18), viewerId: VIEWER_ID }; // Wed 18 Nov 2026

function task(overrides: Partial<FilterableTask> = {}): FilterableTask {
  return {
    title: 'Ship the feature',
    status: 'status-todo',
    priority: 'normal',
    assignees: [],
    due_date: null,
    start_date: null,
    created_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('matchesFilter — AND across top-level nodes, one level of OR nesting', () => {
  it('text contains / does not contain', () => {
    const tree: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'title', operator: 'contains', value: 'feature' } }];
    expect(matchesFilter(task(), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ title: 'Fix the bug' }), tree, ctx)).toBe(false);
  });

  it('select is_any_of / is_none_of', () => {
    const tree: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'priority', operator: 'is_any_of', value: ['urgent', 'high'] } }];
    expect(matchesFilter(task({ priority: 'high' }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ priority: 'low' }), tree, ctx)).toBe(false);
  });

  it('person "is" resolves the Me sentinel to the viewer', () => {
    const tree: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'assignees', operator: 'is', value: ME_VALUE } }];
    expect(matchesFilter(task({ assignees: [VIEWER_ID] }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ assignees: ['someone-else'] }), tree, ctx)).toBe(false);
  });

  it('is_set / is_not_set', () => {
    const isSet: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'due_date', operator: 'is_set', value: null } }];
    expect(matchesFilter(task({ due_date: '2026-11-20' }), isSet, ctx)).toBe(true);
    expect(matchesFilter(task({ due_date: null }), isSet, ctx)).toBe(false);
  });

  it('relative date "this_week" (Monday-first) matches a due date in the current week', () => {
    const tree: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'due_date', operator: 'is_within', value: { kind: 'relative', key: 'this_week' } } }];
    // 18 Nov 2026 is a Wednesday; the Monday-first week runs 16-22 Nov.
    expect(matchesFilter(task({ due_date: '2026-11-22' }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ due_date: '2026-11-23' }), tree, ctx)).toBe(false);
    expect(matchesFilter(task({ due_date: '2026-11-15' }), tree, ctx)).toBe(false);
  });

  it('is_before / is_after against an exact date', () => {
    const before: FilterTree = [{ kind: 'condition', condition: { id: '1', field: 'due_date', operator: 'is_before', value: '2026-11-18' } }];
    expect(matchesFilter(task({ due_date: '2026-11-17' }), before, ctx)).toBe(true);
    expect(matchesFilter(task({ due_date: '2026-11-18' }), before, ctx)).toBe(false);
  });

  it('two top-level conditions are AND-ed', () => {
    const tree: FilterTree = [
      { kind: 'condition', condition: { id: '1', field: 'priority', operator: 'is', value: 'high' } },
      { kind: 'condition', condition: { id: '2', field: 'title', operator: 'contains', value: 'feature' } },
    ];
    expect(matchesFilter(task({ priority: 'high', title: 'Ship the feature' }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ priority: 'high', title: 'Fix the bug' }), tree, ctx)).toBe(false);
  });

  it('an or_group matches if any one of its conditions matches', () => {
    const tree: FilterTree = [
      {
        kind: 'or_group',
        id: 'g1',
        conditions: [
          { id: '1', field: 'priority', operator: 'is', value: 'urgent' },
          { id: '2', field: 'priority', operator: 'is', value: 'high' },
        ],
      },
    ];
    expect(matchesFilter(task({ priority: 'high' }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ priority: 'low' }), tree, ctx)).toBe(false);
  });

  it('an AND condition alongside an OR group — both must hold', () => {
    const tree: FilterTree = [
      { kind: 'condition', condition: { id: '1', field: 'title', operator: 'contains', value: 'feature' } },
      {
        kind: 'or_group',
        id: 'g1',
        conditions: [
          { id: '2', field: 'priority', operator: 'is', value: 'urgent' },
          { id: '3', field: 'priority', operator: 'is', value: 'high' },
        ],
      },
    ];
    expect(matchesFilter(task({ title: 'Ship the feature', priority: 'high' }), tree, ctx)).toBe(true);
    expect(matchesFilter(task({ title: 'Ship the feature', priority: 'low' }), tree, ctx)).toBe(false);
    expect(matchesFilter(task({ title: 'Fix the bug', priority: 'high' }), tree, ctx)).toBe(false);
  });
});

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    list_id: 'list-1',
    parent_task_id: null,
    title: 'Task',
    description: null,
    description_text: null,
    status_id: 'status-a',
    priority: 'normal',
    start_date: null,
    due_date: null,
    due_has_time: false,
    completed_at: null,
    position: 0,
    created_by: null,
    archived_at: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    assignees: [],
    ...overrides,
  };
}

const STATUS_A: TaskStatus = { id: 'status-a', space_id: 's1', name: 'To Do', color: '#000', category: 'not_started', position: 0 };
const STATUS_B: TaskStatus = { id: 'status-b', space_id: 's1', name: 'Done', color: '#0f0', category: 'done', position: 1 };

describe('groupTasks', () => {
  it('groups by status, one bucket per space status', () => {
    const tasks = [makeTask({ status_id: 'status-a' }), makeTask({ status_id: 'status-b' }), makeTask({ status_id: 'status-a' })];
    const { groups, byGroup } = groupTasks(tasks, 'status', [STATUS_A, STATUS_B], new Date());
    expect(groups.map((g) => g.key)).toEqual(['status-a', 'status-b']);
    expect(byGroup.get('status-a')).toHaveLength(2);
    expect(byGroup.get('status-b')).toHaveLength(1);
  });

  it('groups by priority into the four fixed buckets', () => {
    const tasks = [makeTask({ priority: 'urgent' }), makeTask({ priority: 'low' })];
    const { byGroup } = groupTasks(tasks, 'priority', [], new Date());
    expect(byGroup.get('urgent')).toHaveLength(1);
    expect(byGroup.get('low')).toHaveLength(1);
    expect(byGroup.get('normal')).toHaveLength(0);
  });

  it('groups by due date into overdue / today / this week / later / no date', () => {
    const now = new Date(2026, 10, 18);
    const tasks = [
      makeTask({ id: 'overdue', due_date: '2026-11-16' }),
      makeTask({ id: 'today', due_date: '2026-11-18' }),
      makeTask({ id: 'week', due_date: '2026-11-22' }),
      makeTask({ id: 'later', due_date: '2026-12-05' }),
      makeTask({ id: 'none', due_date: null }),
    ];
    const { byGroup } = groupTasks(tasks, 'due_date', [], now);
    expect(byGroup.get('overdue')?.[0].id).toBe('overdue');
    expect(byGroup.get('today')?.[0].id).toBe('today');
    expect(byGroup.get('this_week')?.[0].id).toBe('week');
    expect(byGroup.get('later')?.[0].id).toBe('later');
    expect(byGroup.get('no_date')?.[0].id).toBe('none');
  });
});

describe('sortTasks', () => {
  it('"manual" leaves the given order untouched', () => {
    const tasks = [makeTask({ id: 'b', position: 2 }), makeTask({ id: 'a', position: 1 })];
    expect(sortTasks(tasks, 'manual').map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('sorts by due date, nulls last', () => {
    const tasks = [makeTask({ id: 'none', due_date: null }), makeTask({ id: 'later', due_date: '2026-12-01' }), makeTask({ id: 'soon', due_date: '2026-11-20' })];
    expect(sortTasks(tasks, 'due_date').map((t) => t.id)).toEqual(['soon', 'later', 'none']);
  });

  it('sorts by priority, urgent first', () => {
    const tasks = [makeTask({ id: 'low', priority: 'low' }), makeTask({ id: 'urgent', priority: 'urgent' })];
    expect(sortTasks(tasks, 'priority').map((t) => t.id)).toEqual(['urgent', 'low']);
  });

  it('sorts by title alphabetically', () => {
    const tasks = [makeTask({ id: 'z', title: 'Zebra' }), makeTask({ id: 'a', title: 'Apple' })];
    expect(sortTasks(tasks, 'title').map((t) => t.id)).toEqual(['a', 'z']);
  });
});
