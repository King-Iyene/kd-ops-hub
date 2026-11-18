import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskLanding from '../pages/TaskLanding';
import SpaceOverview from '../pages/SpaceOverview';
import { TaskSidebarPanel } from '../components/TaskSidebarPanel';
import { useCreateSpace } from '../api/spaces';
import { SidebarProvider } from '@/components/ui/sidebar';

const FAKE_USER_ID = '11111111-1111-1111-1111-111111111111';

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: FAKE_USER_ID }, profile: { full_name: 'KD' }, signOut: vi.fn() }),
}));

type TableResult = { data: unknown; error: null };

const insertCalls: Record<string, unknown[]> = {};

function chainable(table: string, result: TableResult) {
  const builder: Record<string, unknown> = {};
  const self = new Proxy(builder, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (r: TableResult) => void) => resolve(result);
      }
      if (prop === 'insert') {
        return (payload: unknown) => {
          (insertCalls[table] ??= []).push(payload);
          return self;
        };
      }
      return () => self;
    },
  });
  return self;
}

let tableResults: Record<string, TableResult> = {};
let rpcResults: Record<string, TableResult> = {};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => chainable(table, tableResults[table] ?? { data: [], error: null }),
    rpc: (fn: string) => Promise.resolve(rpcResults[fn] ?? { data: null, error: null }),
  },
}));

function renderWithProviders(ui: React.ReactElement, initialPath = '/task') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SidebarProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/task" element={ui} />
            <Route path="/task/s/:spaceId" element={ui} />
          </Routes>
        </MemoryRouter>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe('Task Phase 2 — shell and spaces', () => {
  it('TaskLanding shows the exact "No spaces yet." empty state when there are none, with the admin line', async () => {
    tableResults = { tk_spaces: { data: [], error: null } };
    rpcResults = { tk_role_of: { data: 'owner', error: null } };

    renderWithProviders(<TaskLanding />, '/task');

    await waitFor(() => expect(screen.getByText('No spaces yet.')).toBeInTheDocument());
    expect(screen.getByText('Click + to create your first space.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create space/i })).toBeInTheDocument();
  });

  it('TaskLanding shows the member-facing line instead of a create button for a plain member', async () => {
    tableResults = { tk_spaces: { data: [], error: null } };
    rpcResults = { tk_role_of: { data: 'member', error: null } };

    renderWithProviders(<TaskLanding />, '/task');

    await waitFor(() => expect(screen.getByText('No spaces yet.')).toBeInTheDocument());
    expect(screen.getByText('Ask an admin to create one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create space/i })).not.toBeInTheDocument();
  });

  it('SpaceOverview shows the space name, the exact empty-body copy, and no +Add list/+Add table buttons yet', async () => {
    const space = {
      id: 'space-1',
      workspace_id: 'ws-1',
      name: 'Engineering',
      color: '#006994',
      icon: null,
      is_private: false,
      position: 0,
      created_by: FAKE_USER_ID,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    tableResults = {
      tk_spaces: { data: space, error: null },
      tk_space_members: { data: [{ space_id: 'space-1', user_id: FAKE_USER_ID, role: 'editor', created_at: '' }], error: null },
    };
    rpcResults = { tk_role_of: { data: 'member', error: null } };

    renderWithProviders(<SpaceOverview />, '/task/s/space-1');

    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());
    expect(screen.getByText('This space is empty.')).toBeInTheDocument();
    expect(screen.getByText('Create a list to track tasks, or a table to collect structured data.')).toBeInTheDocument();
    expect(screen.queryByText(/Add list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add table/i)).not.toBeInTheDocument();
  });

  it('SpaceOverview shows the archived banner and an Unarchive-only control for a non-editor once archived', async () => {
    const space = {
      id: 'space-2',
      workspace_id: 'ws-1',
      name: 'Old Space',
      color: '#da9a22',
      icon: null,
      is_private: false,
      position: 0,
      created_by: FAKE_USER_ID,
      archived_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    tableResults = {
      tk_spaces: { data: space, error: null },
      tk_space_members: { data: [], error: null },
    };
    rpcResults = { tk_role_of: { data: 'member', error: null } };

    renderWithProviders(<SpaceOverview />, '/task/s/space-2');

    await waitFor(() => expect(screen.getByText('Old Space')).toBeInTheDocument());
    expect(screen.getByText('This space is archived.')).toBeInTheDocument();
    // A plain member with no edit rights gets no menu at all, archived or not.
    expect(screen.queryByRole('button', { name: /Unarchive/i })).not.toBeInTheDocument();
  });

  it('TaskSidebarPanel renders the Task hub header (not the workspace name, no Task/Track switch) and the Spaces section', async () => {
    tableResults = { tk_spaces: { data: [], error: null } };
    rpcResults = { tk_role_of: { data: 'admin', error: null } };

    renderWithProviders(<TaskSidebarPanel onBack={() => {}} onSignOut={() => {}} />, '/task');

    await waitFor(() => expect(screen.getByText('Task')).toBeInTheDocument());
    expect(screen.getByText('Spaces, lists & tasks')).toBeInTheDocument();
    expect(screen.queryByText('KD Squares')).not.toBeInTheDocument();
    expect(screen.queryByText('Track')).not.toBeInTheDocument();
    expect(screen.getByText('Spaces')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No spaces yet.')).toBeInTheDocument());
  });

  it('useCreateSpace sends workspace_id on the insert (regression: the real create-space bug)', async () => {
    tableResults = {
      tk_workspaces: { data: { id: 'ws-1' }, error: null },
      tk_spaces: { data: { id: 'space-9', name: 'Engineering' }, error: null },
    };
    delete insertCalls.tk_spaces;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateSpace(), { wrapper });

    await result.current.mutateAsync({
      name: 'Engineering',
      color: '#006994',
      isPrivate: false,
      createdBy: FAKE_USER_ID,
      members: [],
    });

    expect(insertCalls.tk_spaces).toHaveLength(1);
    expect(insertCalls.tk_spaces[0]).toMatchObject({ workspace_id: 'ws-1', name: 'Engineering' });
  });
});
