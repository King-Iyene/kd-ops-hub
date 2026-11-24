import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  projects: [] as Record<string, unknown>[], tasks: [] as Record<string, unknown>[],
  mine: { data: null as unknown, error: null as unknown },
  members: [] as string[], recent: [] as string[], rpcCalls: [] as { fn: string; args: unknown }[], toast: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const chain = (rows: () => unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok);
    return q;
  };
  return {
    supabase: {
      from: (t: string) => (t === 'time_projects' ? chain(() => h.projects) : t === 'time_tasks' ? chain(() => h.tasks) : chain(() => h.members.map((employee_id) => ({ employee_id })))),
      rpc: (fn: string, args?: unknown) => {
        h.rpcCalls.push({ fn, args });
        if (fn === 'time_my_project_ids') return Promise.resolve(h.mine);
        if (fn === 'time_project_recent_trackers') return Promise.resolve({ data: h.recent, error: null });
        return Promise.resolve({ data: { ok: true }, error: null });
      },
    },
  };
});
vi.mock('@/queries/useEmployees', () => ({
  useActiveEmployees: () => ({ data: [{ id: 'u1', full_name: 'Ann Assigned' }, { id: 'u2', full_name: 'Ben Other' }, { id: 'u3', full_name: 'Cy Recent' }] }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { fetchMyProjectIds, fetchTrackableProjects, fetchTrackableTasks } from '../lib/queries';
import { ProjectAccessDialog } from '../pages/ProjectAccessDialog';

const P = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, is_archived: false, ...extra });

describe('what the tracker offers', () => {
  beforeEach(() => {
    h.projects = [P('p1', 'Open project'), P('p2', 'Assigned only', { assigned_only: true })];
    h.tasks = [{ id: 't1', project_id: 'p1', name: 'General' }, { id: 't2', project_id: 'p2', name: 'General' }];
  });

  it('offers only the projects the database says the person may track on', async () => {
    h.mine = { data: ['p1'], error: null };
    expect((await fetchTrackableProjects()).map((p) => p.id)).toEqual(['p1']);
    expect((await fetchTrackableTasks()).map((t) => t.id)).toEqual(['t1']);
  });

  it('offers a project that is assigned to the person', async () => {
    h.mine = { data: ['p1', 'p2'], error: null };
    expect((await fetchTrackableProjects()).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('hides nothing when it cannot be worked out (a blank tracker is worse; the database still refuses time on a project that is not theirs)', async () => {
    h.mine = { data: null, error: { message: 'function does not exist' } };
    expect(await fetchMyProjectIds()).toBeNull();
    expect((await fetchTrackableProjects()).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect((await fetchTrackableTasks()).map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('assigning people to a project', () => {
  const renderDialog = (project: Record<string, unknown>) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ProjectAccessDialog project={project as never} open onOpenChange={() => undefined} />
      </QueryClientProvider>,
    );
  };
  beforeEach(() => { h.members = ['u1']; h.recent = ['u2', 'u3']; h.rpcCalls = []; h.toast.mockReset(); });

  it('shows who is assigned and saves the new list in one call', async () => {
    renderDialog({ id: 'p2', name: 'Assigned only', assigned_only: true, manager_id: null });
    await waitFor(() => expect(screen.getByLabelText('Ann Assigned')).toHaveAttribute('data-state', 'checked'));
    expect(screen.getByLabelText('Ben Other')).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(screen.getByLabelText('Ben Other'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(h.rpcCalls.some((c) => c.fn === 'time_project_set_access')).toBe(true));
    const call = h.rpcCalls.find((c) => c.fn === 'time_project_set_access')!;
    expect(call.args).toEqual({ p_project: 'p2', p_assigned_only: true, p_employee_ids: ['u1', 'u2'] });
  });

  it('writes nothing just by opening', async () => {
    renderDialog({ id: 'p2', name: 'Assigned only', assigned_only: true });
    await waitFor(() => expect(screen.getByLabelText('Ann Assigned')).toBeInTheDocument());
    expect(h.rpcCalls.filter((c) => c.fn === 'time_project_set_access')).toHaveLength(0);
  });

  it('switching it on for a project people already use starts from the people who tracked on it', async () => {
    h.members = [];
    renderDialog({ id: 'p1', name: 'Open project', assigned_only: false });
    await waitFor(() => expect(screen.getByTestId('assigned-only-switch')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('assigned-only-switch'));
    await waitFor(() => expect(screen.getByTestId('access-note')).toHaveTextContent('Added the 2 people'));
    expect(screen.getByLabelText('Ben Other')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByLabelText('Cy Recent')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByLabelText('Ann Assigned')).toHaveAttribute('data-state', 'unchecked');
  });

  it('warns when it is on and nobody is assigned', async () => {
    h.members = [];
    renderDialog({ id: 'p2', name: 'New project', assigned_only: true });
    await waitFor(() => expect(screen.getByTestId('nobody-assigned')).toHaveTextContent('only the project manager and admins'));
  });
});
