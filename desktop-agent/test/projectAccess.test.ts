import { describe, expect, it } from 'vitest';
import { fetchAllProjects, fetchMyProjectIds, fetchPickableTasks, fetchSuggestedTasks } from '../src/taskTimer';

// A stand-in for the database client with just the calls these three functions make.
function fakeClient(opts: { mine: { data: unknown; error: unknown } | 'throws'; projects?: unknown[]; tasks?: unknown[]; entries?: unknown[] }) {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'not', 'limit']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
    return q;
  };
  return {
    from: (t: string) => chain(t === 'time_projects' ? opts.projects ?? [] : t === 'time_tasks' ? opts.tasks ?? [] : opts.entries ?? []),
    rpc: () => (opts.mine === 'throws' ? Promise.reject(new Error('offline')) : Promise.resolve(opts.mine)),
  } as never;
}

const proj = (id: string, name: string) => ({ id, name, time_clients: null });
const task = (id: string, project_id: string) => ({ id, name: 'General', project_id, time_projects: { id: project_id, name: project_id, time_clients: null } });

describe('the desktop picker only offers the projects the person may track on', () => {
  it('reads the list from the database', async () => {
    expect([...(await fetchMyProjectIds(fakeClient({ mine: { data: ['a', 'b'], error: null } })) ?? [])]).toEqual(['a', 'b']);
  });

  it('projects: drops the ones that are not theirs', async () => {
    const out = await fetchAllProjects(fakeClient({ mine: { data: ['p1'], error: null }, projects: [proj('p1', 'Mine'), proj('p2', 'Not mine')] }));
    expect(out.map((p) => p.projectId)).toEqual(['p1']);
  });

  it('tasks: drops the tasks of projects that are not theirs', async () => {
    const out = await fetchPickableTasks(fakeClient({ mine: { data: ['p1'], error: null }, tasks: [task('t1', 'p1'), task('t2', 'p2')] }));
    expect(out.map((t) => t.taskId)).toEqual(['t1']);
  });

  it('recently used: a task on a project they were taken off no longer comes back', async () => {
    const entries = [{ task_id: 't2', start_time: '2026-11-20T10:00:00Z', time_tasks: task('t2', 'p2') }, { task_id: 't1', start_time: '2026-11-19T10:00:00Z', time_tasks: task('t1', 'p1') }];
    const out = await fetchSuggestedTasks(fakeClient({ mine: { data: ['p1'], error: null }, entries }), 'u1');
    expect(out.map((t) => t.taskId)).toEqual(['t1']);
  });

  it('hides nothing when the list cannot be read (a blank picker is worse; the database still refuses)', async () => {
    for (const mine of [{ data: null, error: { message: 'no such function' } }, 'throws' as const]) {
      expect(await fetchMyProjectIds(fakeClient({ mine }))).toBeNull();
      const out = await fetchAllProjects(fakeClient({ mine, projects: [proj('p1', 'A'), proj('p2', 'B')] }));
      expect(out.map((p) => p.projectId)).toEqual(['p1', 'p2']);
    }
  });
});
